// Guards the patch of @electric-sql/client: ShapeStream.requestSnapshot moved the stream to the offset of every subset
// snapshot, so the changes of the rows outside that subset logged in between were never delivered
import { isChangeMessage, isVisibleInSnapshot, ShapeStream } from "@electric-sql/client";
import type { Message, Row } from "@electric-sql/client";
import { expect, test } from "@playwright/test";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createCollection, createLiveQueryCollection, eq } from "@tanstack/react-db";
import { Pool } from "pg";

const ELECTRIC_URL = `http://localhost:${process.env.VITE_ELECTRIC_PORT}/v1/shape`;
const SCHEMA = "electric_snapshot_offset";
// Electric replicates the changes with some lag, which grows while other tests write to the database
const ELECTRIC_LAG = { timeout: 30_000 };

type TItem = { id: number; value: string };

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let table: string;

test.beforeAll(async () => {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
});

test.beforeEach(async () => {
  table = `${SCHEMA}.items_${test.info().testId.replace(/\W/g, "")}_${Date.now()}`;
  await pool.query(`CREATE TABLE ${table} (id integer PRIMARY KEY, value text NOT NULL)`);
  await pool.query(`INSERT INTO ${table} VALUES (1, 'initial'), (2, 'initial'), (3, 'initial')`);

  // Electric only replicates a new table once a shape of it has added it to the publication, and the shapes under
  // test have to start fresh, so another shape of the table waits for that
  const response = await fetch(shapeUrl({ where: "id = 3", offset: "-1" }));
  await response.text();
  const from = { handle: response.headers.get("electric-handle")!, offset: response.headers.get("electric-offset")! };
  await pool.query(`UPDATE ${table} SET value = 'replicated' WHERE id = 3`);
  await expect
    .poll(async () => (await fetch(shapeUrl({ where: "id = 3", ...from }))).text(), ELECTRIC_LAG)
    .toContain(`"value":"replicated"`);
});

test.afterEach(async () => {
  await pool.query(`DROP TABLE IF EXISTS ${table}`);
});

test.afterAll(async () => {
  await pool.end();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => (resolve = resolvePromise));
  return { promise, resolve };
}

// Makes the timing deterministic: the live requests wait until released, and the response of one snapshot can be held
// back after the server has taken it
class ControlledFetch {
  private liveGate = deferred();
  private heldSnapshot: {
    where: string;
    received: ReturnType<typeof deferred>;
    release: ReturnType<typeof deferred>;
  } | null = null;
  heldSnapshotResponse: { handle: string; offset: string } | null = null;
  streamRequests: Array<{ handle: string; offset: string }> = [];
  isLiveRequestHeld = false;

  releaseLive() {
    this.liveGate.resolve();
  }

  holdSnapshot(where: string) {
    this.heldSnapshot = { where, received: deferred(), release: deferred() };
    return { received: this.heldSnapshot.received.promise, release: this.heldSnapshot.release.resolve };
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const handle = url.searchParams.get("handle");
    const offset = url.searchParams.get("offset");
    if ((init?.method ?? "GET") === "GET" && handle !== null && offset !== null)
      this.streamRequests.push({ handle, offset });

    if (url.searchParams.get("live") === "true") {
      this.isLiveRequestHeld = true;
      await new Promise<void>((resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        void this.liveGate.promise.then(resolve);
      }).finally(() => (this.isLiveRequestHeld = false));
    }

    const response = await fetch(input, init);
    const heldSnapshot = this.heldSnapshot;
    if (heldSnapshot && typeof init?.body === "string" && init.body.includes(heldSnapshot.where)) {
      this.heldSnapshot = null;
      this.heldSnapshotResponse = {
        handle: response.headers.get("electric-handle")!,
        offset: response.headers.get("electric-offset")!,
      };
      // Electric finishes the snapshot once its body is read, so only its delivery to the stream is held
      const body = await response.arrayBuffer();
      heldSnapshot.received.resolve();
      await heldSnapshot.release.promise;
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    return response;
  };
}

async function updateItem(id: number, value: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE ${table} SET value = $1 WHERE id = $2`, [value, id]);
    const { rows } = await client.query<{ txid: string }>("SELECT pg_current_xact_id()::xid::text AS txid");
    await client.query("COMMIT");
    return Number(rows[0].txid);
  } finally {
    client.release();
  }
}

function shapeUrl(params: Record<string, string>) {
  const url = new URL(ELECTRIC_URL);
  url.searchParams.set("table", table);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

// Reads the shape log straight from Electric, without the stream under test
async function readShapeLog({ handle, offset }: { handle: string; offset: string }) {
  return (await (await fetch(shapeUrl({ handle, offset, log: "changes_only" }))).json()) as Array<Message<Row>>;
}

// A snapshot only reflects the update once Electric has also logged it, otherwise its offset would still be before it
async function waitUntilLogged(from: { handle: string; offset: string }, id: number, value: string) {
  await expect
    .poll(
      async () =>
        (await readShapeLog(from)).some(
          // Without the parser of a ShapeStream every value arrives as text
          (message) => isChangeMessage(message) && message.value.id === String(id) && message.value.value === value,
        ),
      ELECTRIC_LAG,
    )
    .toBe(true);
}

function createStream(controlledFetch: ControlledFetch, signal: AbortSignal) {
  const stream = new ShapeStream<TItem>({
    url: ELECTRIC_URL,
    params: { table },
    offset: "now",
    log: "changes_only",
    subsetMethod: "POST",
    fetchClient: controlledFetch.fetch,
    signal,
  });
  const updates: Array<TItem> = [];
  stream.subscribe((messages) => {
    for (const message of messages) {
      if (isChangeMessage(message) && message.headers.operation === "update") updates.push(message.value);
    }
  });
  return { stream, updates };
}

test("a snapshot of other rows does not skip the changes the running stream has not read yet", async () => {
  const controlledFetch = new ControlledFetch();
  const abortController = new AbortController();
  const { stream, updates } = createStream(controlledFetch, abortController.signal);

  try {
    await stream.requestSnapshot({ where: `id = 1` });
    await expect.poll(() => controlledFetch.isLiveRequestHeld).toBe(true);
    const offsetBeforeUpdate = { handle: stream.shapeHandle!, offset: stream.lastOffset };

    const txid = await updateItem(1, "updated");
    await waitUntilLogged(offsetBeforeUpdate, 1, "updated");

    // The stream has not read the update yet, as its live request is held
    expect(updates).toEqual([]);

    const { metadata } = await stream.requestSnapshot({ where: `id = 2` });

    // The snapshot of the other row was taken after the update, which is how @tanstack/electric-db-collection
    // confirms the txid of a mutation before the stream delivers its row
    expect(isVisibleInSnapshot(txid, metadata)).toBe(true);
    expect(updates).toEqual([]);

    // The bug: the stream jumped to the offset of that snapshot, past the update of the row 1
    expect(stream.lastOffset).toBe(offsetBeforeUpdate.offset);

    controlledFetch.releaseLive();
    await expect.poll(() => updates, ELECTRIC_LAG).toContainEqual(expect.objectContaining({ id: 1, value: "updated" }));
  } finally {
    abortController.abort();
  }
});

test("concurrent snapshots on a cold start resume the stream from the earliest one", async () => {
  const controlledFetch = new ControlledFetch();
  const abortController = new AbortController();
  const { stream, updates } = createStream(controlledFetch, abortController.signal);

  try {
    // The server takes the snapshot of the row 1, but its response arrives last
    const heldSnapshot = controlledFetch.holdSnapshot(`id = 1`);
    const snapshotRow1 = stream.requestSnapshot({ where: `id = 1` });
    await heldSnapshot.received;
    const offsetOfSnapshotRow1 = controlledFetch.heldSnapshotResponse!;
    // The first snapshot of a new shape, as every shape after Electric starts, has no logged offset yet
    expect(offsetOfSnapshotRow1.offset).toBe("0_inf");

    await updateItem(1, "updated");
    await waitUntilLogged(offsetOfSnapshotRow1, 1, "updated");

    await stream.requestSnapshot({ where: `id = 2` });
    heldSnapshot.release();
    const { data } = await snapshotRow1;
    expect(data).toContainEqual(expect.objectContaining({ value: { id: 1, value: "initial" } }));

    // The stream had not read anything yet, so it resumes from the snapshot taken first
    await expect.poll(() => controlledFetch.streamRequests.length).toBeGreaterThan(0);
    expect(controlledFetch.streamRequests[0].offset).toBe(offsetOfSnapshotRow1.offset);

    controlledFetch.releaseLive();
    await expect.poll(() => updates, ELECTRIC_LAG).toContainEqual(expect.objectContaining({ id: 1, value: "updated" }));
  } finally {
    abortController.abort();
  }
});

test("an on-demand collection confirms a txid through a snapshot of other rows before the row changes", async () => {
  const controlledFetch = new ControlledFetch();
  const collection = createCollection(
    electricCollectionOptions({
      id: table,
      shapeOptions: { url: ELECTRIC_URL, params: { table }, subsetMethod: "POST", fetchClient: controlledFetch.fetch },
      syncMode: "on-demand",
      getKey: (item: TItem) => item.id,
    }),
  );
  const queryRow1 = createLiveQueryCollection((q) => q.from({ item: collection }).where(({ item }) => eq(item.id, 1)));
  const queryRow2 = createLiveQueryCollection((q) => q.from({ item: collection }).where(({ item }) => eq(item.id, 2)));

  try {
    await queryRow1.preload();
    expect(collection.get(1)?.value).toBe("initial");
    await expect.poll(() => controlledFetch.isLiveRequestHeld).toBe(true);
    const offsetBeforeUpdate = controlledFetch.streamRequests.at(-1)!;

    const txid = await updateItem(1, "updated");
    await waitUntilLogged(offsetBeforeUpdate, 1, "updated");
    await queryRow2.preload();

    // What a mutation handler awaits resolves, while the row it changed is still the old one, so the optimistic
    // state is dropped and the old row is shown until the stream delivers the change. Once that is fixed, this fails.
    await collection.utils.awaitTxId(txid, 1000);
    expect(collection.get(1)?.value).toBe("initial");

    controlledFetch.releaseLive();
    await expect.poll(() => collection.get(1)?.value, ELECTRIC_LAG).toBe("updated");
  } finally {
    await queryRow1.cleanup();
    await queryRow2.cleanup();
    await collection.cleanup();
  }
});

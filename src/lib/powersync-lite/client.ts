import {
  LocalWriteState,
  PowerSyncClient as StandaloneClient,
  RestartSyncError,
  type RequestedStreamSubscription,
  type StreamDescription
} from '@powersync/shared-internals/standalone';
import { normalizeSubscriptions } from './subscriptions.js';

export interface StreamSubscription {
  name: string;
  parameters?: Record<string, unknown>;
  priority?: number;
}

/** Global status of the sync client. */
export type SyncStatus = Readonly<{
  state: 'idle' | 'connecting' | 'syncing' | 'ready' | 'retrying';
  error?: Error;
}>;

export interface PowerSyncClientOptions {
  endpoint: string;
  getToken: (signal: AbortSignal) => string | Promise<string>;
  fetch?: typeof globalThis.fetch;
  /** Client parameters sent with each sync request. */
  parameters?: Record<string, unknown>;
  /** Whether to sync streams marked as auto-subscribe on the service. Defaults to false. */
  includeDefaultStreams?: boolean;
  /**
   * Initial retry delay, in milliseconds.
   *
   * On errors, the client uses this retry delay (and exponential backoff on subsequent failures) with
   * {@link maxRetryDelayMs} as an upper bound.
   */
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
}

export interface ConfirmWritesOptions {
  /** Controls both the checkpoint HTTP request and the subsequent stream wait. */
  signal?: AbortSignal;
}

/** A row change for one table: a row value, or `null` for deleted rows. */
export type TableChanges = ReadonlyMap<string, Record<string, unknown> | null>;

export interface TableListener {
  /** Called with all currently synced rows when registered, and with changed rows after each applied checkpoint. */
  onChanges: (changes: TableChanges) => void;
  /** Connection errors, and errors thrown by onChanges. */
  onError?: (error: Error) => void;
}

/** A reference to requested streams, keeping them in the sync request until released. */
export interface StreamLease {
  /**
   * Resolves once a complete checkpoint has been applied on a connection including these streams, or rejects with a
   * {@link StreamError} if the service reported errors for them.
   */
  waitForSync: (signal?: AbortSignal) => Promise<void>;
  release: () => void;
}

export interface StreamLeaseOptions {
  /** Called when the service reports errors for one of the leased streams. */
  onError?: (error: StreamError) => void;
}

export class StreamError extends Error {
  constructor(
    readonly stream: StreamSubscription,
    readonly messages: readonly string[]
  ) {
    super(`PowerSync stream "${stream.name}" failed: ${messages.join('; ')}`);
  }
}

type Lease = { keys: Set<string>; options: StreamLeaseOptions };
type SyncWaiter = { generation: number; keys: Set<string>; resolve: () => void; reject: (error: unknown) => void };
type CheckpointWaiter = { resolve: () => void; reject: (error: unknown) => void };

const idle: SyncStatus = Object.freeze({ state: 'idle' });

/**
 * One shared connection per client, requesting the union of all leased streams. Synced rows are reported to every
 * listener of their table, regardless of the stream they came from.
 */
export class PowerSyncClient {
  readonly #options: PowerSyncClientOptions;
  readonly #clientId = crypto.randomUUID();
  readonly #localWrites = new LocalWriteState();
  readonly #client: StandaloneClient;

  readonly #streams = new Map<string, { stream: StreamSubscription; refs: number }>();
  readonly #leases = new Set<Lease>();
  readonly #listeners = new Map<string, Set<TableListener>>();
  readonly #rows = new Map<string, Map<string, Record<string, unknown>>>();

  // Bumped whenever the requested streams change, a connection iteration serves the generation at which it started.
  #generation = 0;
  #syncedGeneration = -1;
  // Errors reported for stream keys by the latest checkpoint.
  #streamErrors = new Map<string, string[]>();
  readonly #syncWaiters = new Set<SyncWaiter>();
  readonly #checkpointWaiters = new Set<CheckpointWaiter>();
  #lastCheckpointRequest = 0n;

  #request?: AbortController;
  #scheduled = false;

  #status: SyncStatus = idle;
  readonly #statusListeners = new Set<() => void>();

  constructor(options: PowerSyncClientOptions) {
    const url = new URL(options.endpoint);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('PowerSync endpoint must be HTTP(S)');
    this.#options = options;
    this.#client = new StandaloneClient({ localWrites: this.#localWrites, fetch: options.fetch });
  }

  get status(): SyncStatus {
    return this.#status;
  }

  /**
   * Invokes the listener every time the status changes.
   */
  subscribeStatus = (listener: () => void): (() => void) => {
    this.#statusListeners.add(listener);
    return () => {
      this.#statusListeners.delete(listener);
    };
  };

  get #active() {
    return this.#leases.size > 0 || this.#listeners.size > 0;
  }

  /** Report synced rows of a table, starting with a snapshot of the current rows. */
  listen(table: string, listener: TableListener): () => void {
    const listeners = this.#listeners.get(table) ?? new Set();
    this.#listeners.set(table, listeners);
    listeners.add(listener);
    this.#notify(listener, new Map(this.#rows.get(table)));
    this.#onActiveChanged();

    return () => {
      if (!listeners.delete(listener)) return;
      if (!listeners.size) this.#listeners.delete(table);
      this.#onActiveChanged();
    };
  }

  /** Add streams to the sync request until the returned lease is released. */
  acquireStreams(streams: readonly StreamSubscription[], options: StreamLeaseOptions = {}): StreamLease {
    const normalized = normalizeSubscriptions(streams);
    const lease: Lease = { keys: new Set(normalized.keys()), options };
    let changed = false;
    for (const [key, stream] of normalized) {
      const entry = this.#streams.get(key);
      if (entry) {
        entry.refs++;
      } else {
        this.#streams.set(key, { stream, refs: 1 });
        changed = true;
      }
    }
    this.#leases.add(lease);
    if (changed) this.#restart();
    else this.#onActiveChanged();

    return {
      waitForSync: (signal) => this.#waitForSync(lease, signal),
      release: () => {
        if (!this.#leases.delete(lease)) return;
        let changed = false;
        for (const key of lease.keys) {
          const entry = this.#streams.get(key)!;
          if (--entry.refs == 0) {
            this.#streams.delete(key);
            changed = true;
            // TODO: Add ttl option in case a stream is re-subscribed shortly afterwards?
          }
        }
        if (changed && this.#active) this.#restart();
        else this.#onActiveChanged();
      }
    };
  }

  /**
   * Call after the app's backend write commits.
   *
   * This requests a checkpoint from the PowerSync service. As this happens _after_ the write has made it into the
   * source database, PowerSync can determine when data including the write has synced back down.
   *
   * This waits for the checkpoint to be requested _and_ to have been downloaded, validated and applied locally.
   * Awaiting this in an `onInsert`, `onUpdate` or `onDelete` callback ensures the optimistic state is replaced with
   * confirmed data without flickering.
   */
  confirmWrites = async ({ signal }: ConfirmWritesOptions = {}): Promise<void> => {
    if (!this.#active) {
      throw new Error('PowerSync client is not syncing. Start a live query (or preload a collection) first.');
    }
    signal?.throwIfAborted();

    const tokenSignal = signal ?? new AbortController().signal;
    const token = await this.#options.getToken(tokenSignal);
    const target = await this.#client.requestCheckpoint({
      endpoint: this.#options.endpoint,
      token,
      clientId: this.#clientId,
      checkpoint: ++this.#lastCheckpointRequest,
      signal
    });
    if (target > this.#lastCheckpointRequest) this.#lastCheckpointRequest = target;
    const current = this.#localWrites.targetCheckpoint;
    if (current == null || target > current) this.#localWrites.targetCheckpoint = target;

    // Complete checkpoints are only applied once their write checkpoint reaches the target, so the next one resolves
    // this.
    const applied = this.#wait(this.#checkpointWaiters, (waiter) => waiter, signal);
    // The sync stream may have received the write checkpoint before the request above completed, in which case there
    // might not be another checkpoint. So re-check the last one against the new target.
    this.#client.retryCheckpoint();
    await applied;
  };

  #waitForSync(lease: Lease, signal?: AbortSignal): Promise<void> {
    if (!this.#leases.has(lease)) return Promise.reject(stoppedError());
    if (!lease.keys.size) return Promise.resolve();
    if (this.#syncedGeneration >= this.#generation) {
      const error = this.#errorFor(lease.keys);
      return error ? Promise.reject(error) : Promise.resolve();
    }

    return this.#wait(
      this.#syncWaiters,
      (waiter) => ({ ...waiter, generation: this.#generation, keys: lease.keys }),
      signal
    );
  }

  #wait<W extends CheckpointWaiter>(
    waiters: Set<W>,
    create: (waiter: CheckpointWaiter) => W,
    signal?: AbortSignal
  ): Promise<void> {
    signal?.throwIfAborted();
    return new Promise<void>((resolve, reject) => {
      const finish = (settle: () => void) => {
        waiters.delete(waiter);
        signal?.removeEventListener('abort', abort);
        settle();
      };
      const waiter = create({
        resolve: () => finish(resolve),
        reject: (error) => finish(() => reject(error))
      });
      const abort = () => waiter.reject(signal!.reason);
      waiters.add(waiter);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }

  #errorFor(keys: Iterable<string>): StreamError | undefined {
    for (const key of keys) {
      const messages = this.#streamErrors.get(key);
      if (messages) return new StreamError(this.#streams.get(key)?.stream ?? { name: key }, messages);
    }
    return undefined;
  }

  #setStatus(status: SyncStatus) {
    if (this.#status.state === status.state && this.#status.error === status.error) return;
    this.#status = Object.freeze({ ...status });
    for (const listener of this.#statusListeners) listener();
  }

  #notify(listener: TableListener, changes: TableChanges) {
    try {
      listener.onChanges(changes);
    } catch (cause) {
      listener.onError?.(toError(cause));
    }
  }

  #onActiveChanged() {
    if (this.#active) {
      if (!this.#request && !this.#scheduled) this.#restart();
      return;
    }

    this.#request?.abort();
    this.#request = undefined;
    for (const waiter of [...this.#syncWaiters, ...this.#checkpointWaiters]) waiter.reject(stoppedError());
    this.#setStatus(idle);
  }

  #restart() {
    // Cancel synchronously, then coalesce changes made in the same turn. HTTP streaming requests cannot change their
    // subscriptions in place.
    this.#request?.abort();
    this.#request = undefined;
    this.#generation++;
    if (this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      if (!this.#active) return;
      const controller = new AbortController();
      this.#request = controller;
      void this.#run(controller.signal);
    });
  }

  async #run(signal: AbortSignal) {
    const generation = this.#generation;
    const requested = [...this.#streams];
    const subscriptions = requested.map(
      ([, { stream }]): RequestedStreamSubscription => ({
        stream: stream.name,
        parameters: stream.parameters ?? {},
        override_priority: stream.priority ?? null
      })
    );

    let failures = 0;
    while (!signal.aborted) {
      const request = new AbortController();
      const abort = () => request.abort();
      signal.addEventListener('abort', abort, { once: true });
      try {
        this.#setStatus({ state: 'connecting' });
        const token = await this.#options.getToken(request.signal);
        if (signal.aborted) break;

        let refreshToken = false;
        for await (const event of this.#client.streamingSync({
          endpoint: this.#options.endpoint,
          token,
          clientId: this.#clientId,
          signal: request.signal,
          parameters: this.#options.parameters,
          streams: { include_defaults: this.#options.includeDefaultStreams ?? false, subscriptions }
        })) {
          if (signal.aborted) break;
          switch (event.type) {
            case 'headersReceived':
              this.#setStatus({ state: 'syncing' });
              break;
            case 'resolvedStreams':
              this.#handleStreamErrors(requested, event.streams);
              break;
            case 'rows':
              this.#applyRows(event.changes.updatedRows);
              if (event.priority == null) {
                failures = 0;
                this.#syncedGeneration = generation;
                for (const waiter of this.#syncWaiters) {
                  if (waiter.generation > generation) continue;
                  const error = this.#errorFor(waiter.keys);
                  if (error) waiter.reject(error);
                  else waiter.resolve();
                }
                for (const waiter of this.#checkpointWaiters) waiter.resolve();
                this.#setStatus({ state: 'ready' });
              }
              break;
            case 'keepalive':
              refreshToken = event.keepalive.token_expires_in <= 30;
              break;
          }
          if (refreshToken) break;
        }
        if (signal.aborted || refreshToken) continue;
        throw new Error('Sync stream ended; reconnecting');
      } catch (cause) {
        if (signal.aborted) break;

        const error = toError(cause);
        for (const listeners of this.#listeners.values()) {
          for (const listener of listeners) listener.onError?.(error);
        }
        this.#setStatus({ state: 'retrying', error });
        const base = this.#options.retryDelayMs ?? 1000;
        const max = this.#options.maxRetryDelayMs ?? 30_000;
        await delay(Math.min(max, base * 2 ** Math.min(failures++, 10)) * (0.8 + Math.random() * 0.4), signal);
      } finally {
        request.abort();
        signal.removeEventListener('abort', abort);
      }
    }
  }

  #handleStreamErrors(
    requested: readonly [string, { stream: StreamSubscription }][],
    descriptions: readonly StreamDescription[]
  ) {
    const errors = new Map<string, string[]>();
    for (const description of descriptions) {
      for (const { subscription, message } of description.errors) {
        if (subscription === 'default') {
          console.warn(`PowerSync default stream "${description.name}" failed: ${message}`);
        } else {
          const key = requested[subscription]?.[0];
          if (key != null) errors.set(key, [...(errors.get(key) ?? []), message]);
        }
      }
    }
    for (const [key, { stream }] of requested) {
      if (!descriptions.some((d) => d.name === stream.name))
        errors.set(key, [`Stream "${stream.name}" was not resolved`]);
    }

    this.#streamErrors = errors;
    for (const lease of this.#leases) {
      const error = this.#errorFor(lease.keys);
      if (error) lease.options.onError?.(error);
    }
  }

  #applyRows(updatedRows: ReadonlyMap<string, TableChanges>) {
    for (const [table, changes] of updatedRows) {
      let rows = this.#rows.get(table);
      if (!rows) this.#rows.set(table, (rows = new Map()));
      for (const [id, row] of changes) {
        if (row == null) rows.delete(id);
        else rows.set(id, row);
      }

      for (const listener of this.#listeners.get(table) ?? []) this.#notify(listener, changes);
    }
  }
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted) done();
  });
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function stoppedError() {
  return new DOMException('PowerSync client stopped', 'AbortError');
}

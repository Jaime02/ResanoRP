import { expect } from "@playwright/test";
import { compileSingleRowExpression, IR, toBooleanPredicate } from "@tanstack/react-db";
import { getTableName } from "drizzle-orm";

import db from "@/db";
import { loadTableSubset, MAX_LOOKUP_KEYS } from "@/db/functions/table-subset";
import { dbTableAuditLog, dbTablePrinter, dbTableSellOrderLine } from "@/db/schema";
import type { TSubsetRequest } from "@/lib/table-subset-fns";
import { toPlainExpression } from "@/lib/table-subset-fns";
import { test } from "@/tests/utils/fixtures";
import {
  getMockPrinterShareCredentials,
  MOCK_LABELS_SHARE_NAME,
  MOCK_PRINTER_SHARE_HOST,
} from "@/tests/utils/mock-printer";
import { MAINTENANCE_PRINTER_URL, workflowCreatePrinter } from "@/tests/workflows/printer";
import { PrinterKind } from "@/types/printer";

type TExpression = IR.BasicExpression;
const ref = (column: string) => new IR.PropRef([column]);
const val = (value: unknown) => new IR.Value(value);
const fn = (name: string, ...args: Array<TExpression>) => new IR.Func(name, args);

const table = getTableName(dbTableSellOrderLine);

test("the rows a query loads from Postgres before PowerSync brings its table, without what PowerSync keeps from a client", async ({
  page,
}) => {
  const rows = await db.select().from(dbTableSellOrderLine);
  // The function returns the rows of whichever table it is asked for
  const load = async (where: TExpression | undefined, request: Partial<TSubsetRequest> = {}) =>
    (await loadTableSubset(
      {
        table,
        where: where === undefined ? undefined : toPlainExpression(where),
        ...request,
      },
      false,
    )) as typeof rows | null;
  const ids = (subset: Array<{ id: number }>) => subset.map(({ id }) => id);
  const sorted = (subset: Array<{ id: number }>) => ids(subset).sort((a, b) => a - b);
  // TanStack DB's own evaluation of the filter over the whole table, as the collection applies it
  const kept = (where: TExpression) => {
    const predicate = compileSingleRowExpression(where);
    return rows.filter((row) => toBooleanPredicate(predicate(row) as boolean | null));
  };

  const withPart = rows.find(({ partReferenceId }) => partReferenceId !== null);
  const withDescription = rows.find(({ description }) => description !== null);
  const withDate = rows.find(({ requestedDeliveryDate }) => requestedDeliveryDate !== null);
  expect(withPart && withDescription && withDate, "the mock lines should cover each kind of value").toBeTruthy();
  expect(
    rows.some(({ deletedAt }) => deletedAt !== null),
    "some mock line should be deleted",
  ).toBe(true);
  const middle = rows[Math.floor(rows.length / 2)].id;

  await test.step("a translated filter keeps exactly the rows TanStack DB keeps", async () => {
    const filters: Array<TExpression> = [
      fn("eq", ref("id"), val(middle)),
      fn("not", fn("eq", ref("partReferenceId"), val(withPart!.partReferenceId))),
      fn("eq", ref("description"), val(withDescription!.description)),
      fn("not", fn("eq", ref("description"), val(withDescription!.description))),
      fn("eq", ref("partReferenceId"), val(null)),
      fn("not", fn("eq", ref("partReferenceId"), val(null))),
      fn("in", ref("id"), val([rows[0].id, middle, null])),
      fn("not", fn("in", ref("id"), val([rows[0].id, middle, null]))),
      fn("in", ref("id"), val([])),
      fn("not", fn("in", ref("id"), val([]))),
      fn("isNull", ref("deletedAt")),
      fn("not", fn("isNull", ref("deletedAt"))),
      fn("isUndefined", ref("deletedAt")),
      fn("not", fn("isUndefined", ref("deletedAt"))),
      fn("gt", ref("requestedDeliveryDate"), val(withDate!.requestedDeliveryDate)),
      fn("not", fn("gte", ref("requestedDeliveryDate"), val(withDate!.requestedDeliveryDate))),
      fn("lte", val(withDate!.requestedDeliveryDate), ref("requestedDeliveryDate")),
      fn(
        "and",
        fn("gt", ref("quantity"), val(1)),
        fn("or", fn("isNull", ref("deletedAt")), fn("eq", ref("pendingQuantity"), val(0))),
      ),
    ];
    for (const where of filters) {
      const subset = await load(where);
      expect(subset, JSON.stringify(toPlainExpression(where))).not.toBeNull();
      expect(sorted(subset!), JSON.stringify(toPlainExpression(where))).toEqual(sorted(kept(where)));
    }
  });

  await test.step("a filter Postgres would compare differently, or a join over many rows, waits for PowerSync", async () => {
    for (const where of [
      fn("eq", ref("partPrice"), val("1.50")),
      fn("gt", ref("description"), val("a")),
      fn("like", ref("description"), val("%a%")),
      fn("in", ref("id"), val(Array.from({ length: MAX_LOOKUP_KEYS + 1 }, (_, index) => index + 1))),
    ]) {
      expect(await load(where), JSON.stringify(toPlainExpression(where))).toBeNull();
    }
  });

  await test.step("a limit keeps the rows TanStack DB keeps, in its order", async () => {
    const where = fn("isNull", ref("deletedAt"));
    const byIdDesc = await load(where, {
      limit: 5,
      offset: 2,
      orderBy: [{ direction: "desc", expression: toPlainExpression(ref("id")), nulls: "last" }],
    });
    expect(ids(byIdDesc!)).toEqual(ids(kept(where).sort((a, b) => b.id - a.id)).slice(2, 7));

    const byDateThenId = await load(where, {
      limit: 7,
      orderBy: [
        { direction: "asc", expression: toPlainExpression(ref("requestedDeliveryDate")), nulls: "first" },
        { direction: "asc", expression: toPlainExpression(ref("id")), nulls: "last" },
      ],
    });
    const time = (date: Date | null) => date?.getTime() ?? Number.NEGATIVE_INFINITY;
    expect(ids(byDateThenId!)).toEqual(
      ids(
        kept(where).sort((a, b) => time(a.requestedDeliveryDate) - time(b.requestedDeliveryDate) || a.id - b.id),
      ).slice(0, 7),
    );

    // Ties of the date could be cut differently, so every matching row is loaded
    const byDate = await load(where, {
      limit: 3,
      orderBy: [{ direction: "asc", expression: toPlainExpression(ref("requestedDeliveryDate")), nulls: "first" }],
    });
    expect(sorted(byDate!)).toEqual(sorted(kept(where)));
  });

  // Only a shared printer keeps a password
  const printer = {
    ...getMockPrinterShareCredentials(),
    address: MOCK_PRINTER_SHARE_HOST,
    kind: PrinterKind.IntermecShare,
    labelLengthMm: 107,
    labelWidthMm: 52,
    name: "Etiquetas",
    shareName: MOCK_LABELS_SHARE_NAME,
  };
  await page.goto(MAINTENANCE_PRINTER_URL);
  // Also writes the audit log
  await workflowCreatePrinter(page, printer);

  await test.step("a Impresora comes without its password, which no filter can read either", async () => {
    const printers = await loadTableSubset({ table: getTableName(dbTablePrinter) }, true);
    expect(printers).toEqual([expect.objectContaining({ name: printer.name })]);
    expect(printers![0]).not.toHaveProperty(dbTablePrinter.password.name);
    const where = toPlainExpression(fn("eq", ref(dbTablePrinter.password.name), val(printer.password)));
    expect(await loadTableSubset({ table: getTableName(dbTablePrinter), where }, true)).toBeNull();
  });

  await test.step("only an admin session gets the audit log", async () => {
    const request = { table: getTableName(dbTableAuditLog) };
    expect(await loadTableSubset(request, false)).toEqual([]);
    expect((await loadTableSubset(request, true))!.length).toBeGreaterThan(0);
  });
});

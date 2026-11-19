// Runs the queries of the slow tables over a copy of the benchmark database, outside the browser, before and after a
// change: old/ holds each query file as it is committed (git show HEAD:src/queries/<name>.ts > old/<name>.ts), and
// every state of a table must give the same rows in both. Only the live queries are timed, with every table already
// in memory, as when a user navigates to the page.
//
//   bun --env-file=benchmark/stacks/lite/.env benchmark/tools/query-bench/run.ts [runs]
//
// ONLY=<text> keeps the states whose name contains it, QUERY=0 or 1 only the count or the rows query of a table.
// On master, where the collections are created by electricCollection, mock that name in setup.ts instead
import { ProductionOrderStatus } from "@/schemas/production-order";
import { SellOrderStatus } from "@/schemas/sell-order";

import { firstDifference } from "./diff";
import { captureQueries, median, tableRows, timeQueries } from "./setup";

type TModule = Record<string, (state?: object) => unknown>;
const firstRow = (table: string) => tableRows.get(table)![0] as Record<string, never>;
const lastRow = (table: string) => tableRows.get(table)!.at(-1) as Record<string, never>;
const statuses = (...values: Array<string>) => ({ id: "statuses", value: values });
const pendingProductionOrders = statuses(ProductionOrderStatus.Pending, ProductionOrderStatus.InProduction);

const suites: Array<{ file: string; hook: string; states: Array<[string, object | undefined]> }> = [
  {
    file: "part",
    hook: "useQueryPartTable",
    states: [
      ["page default", undefined],
      [
        "page 3, by description desc",
        { pagination: { pageIndex: 2, pageSize: 10 }, sorts: [{ desc: true, id: "description" }] },
      ],
      ["reference", { filters: [{ id: "reference", value: "1" }] }],
      ["reference, page 3", { filters: [{ id: "reference", value: "1" }], pagination: { pageIndex: 2, pageSize: 10 } }],
      ["reference, accents", { filters: [{ id: "reference", value: "a" }] }],
      ["client", { filters: [{ id: "clientId", value: lastRow("part_reference").clientId }] }],
      [
        "client + null client",
        {
          filters: [
            { id: "clientId", value: lastRow("part_reference").clientId },
            { id: "includePartReferenceNullClientId", value: true },
          ],
        },
      ],
      [
        "client + reference + deleted",
        {
          filters: [
            { id: "clientId", value: firstRow("part_reference").clientId },
            { id: "reference", value: "1" },
            { id: "deletedAt", value: true },
          ],
        },
      ],
      [
        "reference + material",
        {
          filters: [
            { id: "reference", value: "1" },
            { id: "materialShapeId", value: firstRow("material").shapeId },
          ],
        },
      ],
      ["description", { filters: [{ id: "description", value: "a" }] }],
      ["material width", { filters: [{ id: "materialWidth", value: "10" }] }],
    ],
  },
  {
    file: "production-order",
    hook: "useQueryProductionOrderTable",
    states: [
      ["page default", { filters: [pendingProductionOrders] }],
      ["page default, page 3", { filters: [pendingProductionOrders], pagination: { pageIndex: 2, pageSize: 10 } }],
      ["page default, every row", { filters: [pendingProductionOrders], pagination: null }],
      ["no filters", undefined],
      ["no filters, by id desc", { sorts: [{ desc: true, id: "id" }] }],
      [
        "by delivery date",
        { filters: [pendingProductionOrders], sorts: [{ desc: false, id: "requestedDeliveryDate" }] },
      ],
      ...Object.values(ProductionOrderStatus).map((status): [string, object] => [
        `status ${status}`,
        { filters: [statuses(status)] },
      ]),
      ["every status", { filters: [statuses(...Object.values(ProductionOrderStatus))] }],
      ["completed + deleted", { filters: [statuses(ProductionOrderStatus.Completed, ProductionOrderStatus.Deleted)] }],
      ["pending + deleted", { filters: [statuses(ProductionOrderStatus.Pending, ProductionOrderStatus.Deleted)] }],
      ["part", { filters: [{ id: "partId", value: firstRow("production_order").partId }] }],
      [
        "part + default",
        { filters: [pendingProductionOrders, { id: "partId", value: lastRow("production_order").partId }] },
      ],
      [
        "quantity + default",
        { filters: [pendingProductionOrders, { id: "quantity", value: lastRow("production_order").quantity }] },
      ],
      ["sell order", { filters: [{ id: "sellOrderId", value: lastRow("sell_order_line").sellOrderId }] }],
      ["client name + default", { filters: [pendingProductionOrders, { id: "clientName", value: "a" }] }],
      ["part reference", { filters: [{ id: "partReference", value: "1" }] }],
      ["part description + default", { filters: [pendingProductionOrders, { id: "partDescription", value: "a" }] }],
      ["part width", { filters: [{ id: "partWidth", value: "10" }] }],
      ["delivery note", { filters: [{ id: "deliveryNoteId", value: lastRow("delivery_note_line").deliveryNoteId }] }],
      [
        "raw material + default",
        {
          filters: [
            pendingProductionOrders,
            { id: "materialRawMaterialId", value: firstRow("material").rawMaterialId },
          ],
        },
      ],
      ["machine", { filters: [{ id: "assignedMachineId", value: firstRow("machine").id }] }],
    ],
  },
  {
    file: "sell-order",
    hook: "useQuerySellOrders",
    states: [
      ["page default", undefined],
      ["page 3", { pagination: { pageIndex: 2, pageSize: 10 } }],
      ["by id desc", { sorts: [{ desc: true, id: "id" }] }],
      ["by client name", { sorts: [{ desc: false, id: "clientName" }] }],
      [
        "by client name desc, page 2",
        { pagination: { pageIndex: 1, pageSize: 10 }, sorts: [{ desc: true, id: "clientName" }] },
      ],
      ["by reception date", { sorts: [{ desc: true, id: "receptionDate" }] }],
      ...Object.values(SellOrderStatus).map((status): [string, object] => [
        `status ${status}`,
        { filters: [statuses(status)] },
      ]),
      ["every status", { filters: [statuses(...Object.values(SellOrderStatus))] }],
      [
        "pending + deleted, by client name",
        {
          filters: [statuses(SellOrderStatus.Pending, SellOrderStatus.Deleted)],
          sorts: [{ desc: false, id: "clientName" }],
        },
      ],
      ["id", { filters: [{ id: "id", value: lastRow("sell_order").id }] }],
      ["client name", { filters: [{ id: "clientName", value: "a" }] }],
      ["client name + pending", { filters: [statuses(SellOrderStatus.Pending), { id: "clientName", value: "a" }] }],
      ["part", { filters: [{ id: "partId", value: lastRow("part_reference").partId }] }],
      [
        "part + completed",
        { filters: [statuses(SellOrderStatus.Completed), { id: "partId", value: lastRow("part_reference").partId }] },
      ],
      [
        "reception date",
        {
          filters: [
            { id: "receptionDate", value: { endDate: new Date("2024-12-31"), startDate: new Date("2024-01-01") } },
          ],
        },
      ],
    ],
  },
  {
    file: "delivery-note",
    hook: "useQueryDeliveryNotes",
    states: [
      ["page default", undefined],
      ["page 3", { pagination: { pageIndex: 2, pageSize: 10 } }],
      ["by id asc", { sorts: [{ desc: false, id: "id" }] }],
      ["by client", { sorts: [{ desc: false, id: "client" }] }],
      ["by client desc, page 2", { pagination: { pageIndex: 1, pageSize: 10 }, sorts: [{ desc: true, id: "client" }] }],
      ["client", { filters: [{ id: "clientId", value: lastRow("delivery_note").clientId }] }],
      [
        "client, by client",
        {
          filters: [{ id: "clientId", value: lastRow("delivery_note").clientId }],
          sorts: [{ desc: false, id: "client" }],
        },
      ],
      ["id", { filters: [{ id: "id", value: lastRow("delivery_note").id }] }],
      ["part", { filters: [{ id: "partId", value: lastRow("part_reference").partId }] }],
    ],
  },
];

const [runsArgument = "5"] = process.argv.slice(2);
const queryIndex = process.env.QUERY === undefined ? undefined : Number(process.env.QUERY);
let failed = false;
for (const { file, hook, states } of suites.filter(({ file }) => file.includes(process.env.TABLE ?? ""))) {
  const newModule = (await import(`@/queries/${file}`)) as TModule;
  const oldModule = (await import(`./old/${file}`)) as TModule;
  const queriesOf = (module: TModule, state: object | undefined) =>
    captureQueries(() => module[hook](state)).filter((_, index) => queryIndex === undefined || queryIndex === index);
  console.log(`\n${file}`);
  // Not measured: the first runs compile the code
  await timeQueries(queriesOf(oldModule, states[0][1]));
  await timeQueries(queriesOf(newModule, states[0][1]));
  for (const [name, state] of states.filter(([name]) => name.includes(process.env.ONLY ?? ""))) {
    const oldMs: Array<number> = [];
    const newMs: Array<number> = [];
    let difference: string | undefined;
    let rowCounts = "";
    for (let index = 0; index < Number(runsArgument); index++) {
      const before = await timeQueries(queriesOf(oldModule, state));
      const after = await timeQueries(queriesOf(newModule, state));
      oldMs.push(before.ms);
      newMs.push(after.ms);
      difference ??= firstDifference(before.results, after.results);
      rowCounts = before.results
        .map((rows) => {
          const [first] = rows as Array<{ count?: number }>;
          return rows.length === 1 && first.count !== undefined ? `count ${first.count}` : `${rows.length} rows`;
        })
        .join(", ");
    }
    failed ||= difference !== undefined;
    console.log(
      `${difference === undefined ? "same     " : "DIFFERENT"} ${name.padEnd(34)} ${rowCounts.padEnd(22)} old ${median(oldMs).toFixed(0).padStart(5)} ms  new ${median(newMs).toFixed(0).padStart(5)} ms${difference === undefined ? "" : `  ${difference}`}`,
    );
  }
}
process.exit(failed ? 1 : 0);

// What each piece of a query costs over the benchmark data, to see where a slow one spends its time:
//   bun --env-file=benchmark/stacks/lite/.env benchmark/tools/query-bench/exp.ts
import { count, eq, isNull, not, sum } from "@tanstack/react-db";
import type { InitialQueryBuilder, LiveQueryOptions } from "@tanstack/react-db";

import { median, timeQueries } from "./setup";

const { default: productionOrders } = await import("@/collections/production-order");
const { default: partProductions } = await import("@/collections/part-production");
const { default: machines } = await import("@/collections/machine");
const { default: sellOrderLines } = await import("@/collections/sell-order-line");
const { default: parts } = await import("@/collections/part");

const produced = (q: InitialQueryBuilder) =>
  q
    .from({ partProduction: partProductions })
    .groupBy(({ partProduction }) => partProduction.productionOrderId)
    .select(({ partProduction }) => ({
      producedQuantity: sum(partProduction.quantity),
      productionOrderId: partProduction.productionOrderId,
    }));
const machineCounts = (q: InitialQueryBuilder) =>
  q
    .from({ statusMachine: machines })
    .where(({ statusMachine }) => not(isNull(statusMachine.activeProductionOrderId)))
    .groupBy(({ statusMachine }) => statusMachine.activeProductionOrderId)
    .select(({ statusMachine }) => ({
      activeProductionOrderId: statusMachine.activeProductionOrderId,
      assignedMachineCount: count(statusMachine.id),
    }));

const variants: Record<string, (q: InitialQueryBuilder) => unknown> = {
  "scan production orders, select id": (q) => q.from({ po: productionOrders }).select(({ po }) => ({ id: po.id })),
  "scan + where deletedAt": (q) =>
    q
      .from({ po: productionOrders })
      .where(({ po }) => isNull(po.deletedAt))
      .select(({ po }) => ({ id: po.id })),
  "group part productions alone": (q) => produced(q),
  "left join produced": (q) =>
    q
      .from({ po: productionOrders })
      .join({ pq: produced(q) }, ({ po, pq }) => eq(po.id, pq.productionOrderId))
      .select(({ po }) => ({ id: po.id })),
  "left join produced + machine counts": (q) =>
    q
      .from({ po: productionOrders })
      .join({ pq: produced(q) }, ({ po, pq }) => eq(po.id, pq.productionOrderId))
      .leftJoin({ mc: machineCounts(q) }, ({ po, mc }) => eq(po.id, mc.activeProductionOrderId))
      .select(({ po }) => ({ id: po.id })),
  "left join sell order lines": (q) =>
    q
      .from({ po: productionOrders })
      .leftJoin({ sol: sellOrderLines }, ({ po, sol }) => eq(po.sellOrderLineId, sol.id))
      .select(({ po }) => ({ id: po.id })),
  "inner join parts": (q) =>
    q
      .from({ po: productionOrders })
      .innerJoin({ part: parts }, ({ po, part }) => eq(po.partId, part.id))
      .select(({ po }) => ({ id: po.id })),
  "narrow, left join produced": (q) =>
    q
      .from({ po: q.from({ full: productionOrders }).select(({ full }) => ({ id: full.id, quantity: full.quantity })) })
      .join({ pq: produced(q) }, ({ po, pq }) => eq(po.id, pq.productionOrderId))
      .select(({ po }) => ({ id: po.id })),
  "produced inner join production orders": (q) =>
    q
      .from({ pq: produced(q) })
      .innerJoin({ po: productionOrders }, ({ po, pq }) => eq(po.id, pq.productionOrderId))
      .select(({ po }) => ({ id: po.id })),
};

for (const [name, query] of Object.entries(variants)) {
  const options = { query, queryKey: [name] } as unknown as LiveQueryOptions;
  await timeQueries([options]);
  const times: Array<number> = [];
  let rows = 0;
  for (let index = 0; index < 7; index++) {
    const { ms, results } = await timeQueries([options]);
    times.push(ms);
    rows = results[0].length;
  }
  console.log(`${median(times).toFixed(0).padStart(5)} ms  ${String(rows).padStart(5)} rows  ${name}`);
}
process.exit(0);

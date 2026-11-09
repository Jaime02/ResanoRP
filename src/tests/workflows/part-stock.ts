import { expect } from "@playwright/test";

import type { getLatestPartStockTransactionByPartId } from "@/db/functions/part-stock";

export function assertPartStockConsumption({
  existingPartStocks,
  stagedPartQuantities,
  finalPartStocks,
}: {
  existingPartStocks: Map<number, Awaited<ReturnType<typeof getLatestPartStockTransactionByPartId>>>;
  stagedPartQuantities: Map<number, number>;
  finalPartStocks: Map<number, Awaited<ReturnType<typeof getLatestPartStockTransactionByPartId>>>;
}) {
  for (const [partId, stagedQuantity] of stagedPartQuantities.entries()) {
    const existingStock = existingPartStocks.get(partId)?.finalQuantity ?? 0;
    const finalStock = finalPartStocks.get(partId)?.finalQuantity ?? 0;

    const expectedFinalQuantity = Math.max(0, existingStock - stagedQuantity);
    expect(finalStock).toBe(expectedFinalQuantity);
  }
}

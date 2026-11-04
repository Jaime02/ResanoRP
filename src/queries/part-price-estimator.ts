import { eq, useLiveQuery } from "@tanstack/react-db";

import partPriceEstimatorCollection from "@/collections/part-price-estimator";

export function useQueryPartPriceEstimator({ partId, skip = false }: { partId?: number; skip?: boolean }) {
  return useLiveQuery((q) => {
    if (skip || partId === undefined) return undefined;
    return q
      .from({ partPriceEstimator: partPriceEstimatorCollection })
      .where(({ partPriceEstimator }) => eq(partPriceEstimator.partId, partId))
      .findOne();
  });
}

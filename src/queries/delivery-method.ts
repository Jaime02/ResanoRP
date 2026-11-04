import { eq, isNull, useLiveQuery } from "@tanstack/react-db";

import deliveryMethodCollection from "@/collections/delivery-method";
import { includesIgnoringAccents } from "@/lib/utils";
import type { TNameFilters, TSort } from "@/schemas";
import { getFilterValue } from "@/schemas/utils";
import type { TBaseQueryProps } from "@/types";

const DEFAULT_SORTING: Array<TSort> = [{ id: "id", desc: false }];

export function useQueryDeliveryMethods({ filters, sorts }: TBaseQueryProps<TNameFilters> = {}) {
  return useLiveQuery({
    queryKey: ["deliveryMethods", filters, sorts],
    query: (q) => {
      let query = q.from({ deliveryMethod: deliveryMethodCollection });
      const name = getFilterValue(filters, "name");
      if (name != null) {
        query = query.fn.where(({ deliveryMethod }) => includesIgnoringAccents(deliveryMethod.name, name));
      }
      if (getFilterValue(filters, "deletedAt") !== true) {
        query = query.where(({ deliveryMethod }) => isNull(deliveryMethod.deletedAt));
      }

      for (const sort of sorts ?? DEFAULT_SORTING) {
        query = query.orderBy(
          ({ deliveryMethod }) => deliveryMethod[sort.id as keyof typeof deliveryMethod],
          sort.desc ? "desc" : "asc",
        );
      }

      return query
        .select(({ deliveryMethod }) => ({
          ...deliveryMethod,
        }))
        .distinct();
    },
  });
}

export function useQueryDeliveryMethodById(id?: number) {
  return useLiveQuery((q) => {
    if (id === undefined) {
      return undefined;
    }
    return q
      .from({ deliveryMethod: deliveryMethodCollection })
      .where(({ deliveryMethod }) => eq(deliveryMethod.id, id))
      .findOne();
  });
}

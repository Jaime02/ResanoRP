import { eq, isNull, useLiveQuery } from "@tanstack/react-db";

import paymentMethodCollection from "@/collections/payment-method";
import { includesIgnoringAccents } from "@/lib/utils";
import type { TNameFilters, TSort } from "@/schemas";
import { getFilterValue } from "@/schemas/utils";
import type { TBaseQueryProps } from "@/types";

const DEFAULT_SORTING: Array<TSort> = [{ id: "id", desc: false }];

export function useQueryPaymentMethods({ filters, sorts }: TBaseQueryProps<TNameFilters> = {}) {
  return useLiveQuery({
    queryKey: ["paymentMethods", filters, sorts],
    query: (q) => {
      let query = q.from({ paymentMethod: paymentMethodCollection });
      const name = getFilterValue(filters, "name");
      if (name != null) {
        query = query.fn.where(({ paymentMethod }) => includesIgnoringAccents(paymentMethod.name, name));
      }
      if (getFilterValue(filters, "deletedAt") !== true) {
        query = query.where(({ paymentMethod }) => isNull(paymentMethod.deletedAt));
      }

      for (const sort of sorts ?? DEFAULT_SORTING) {
        query = query.orderBy(
          ({ paymentMethod }) => paymentMethod[sort.id as keyof typeof paymentMethod],
          sort.desc ? "desc" : "asc",
        );
      }

      return query
        .select(({ paymentMethod }) => ({
          ...paymentMethod,
        }))
        .distinct();
    },
  });
}

export function useQueryPaymentMethodById(id?: number) {
  return useLiveQuery((q) => {
    if (id === undefined) {
      return undefined;
    }
    return q
      .from({ paymentMethod: paymentMethodCollection })
      .where(({ paymentMethod }) => eq(paymentMethod.id, id))
      .findOne();
  });
}

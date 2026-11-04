import { eq, isNull, useLiveQuery } from "@tanstack/react-db";

import coatingCollection from "@/collections/coating";
import { includesIgnoringAccents } from "@/lib/utils";
import type { TNameFilters, TSort } from "@/schemas";
import { getFilterValue } from "@/schemas/utils";
import type { TBaseQueryProps } from "@/types";

const DEFAULT_SORTING: Array<TSort> = [{ id: "id", desc: false }];

export function useQueryCoatings({ filters, sorts }: TBaseQueryProps<TNameFilters> = {}) {
  return useLiveQuery({
    queryKey: ["coatings", filters, sorts],
    query: (q) => {
      let query = q.from({ coating: coatingCollection });
      const name = getFilterValue(filters, "name");
      if (name != null) {
        query = query.fn.where(({ coating }) => includesIgnoringAccents(coating.name, name));
      }
      if (getFilterValue(filters, "deletedAt") !== true) {
        query = query.where(({ coating }) => isNull(coating.deletedAt));
      }

      for (const sort of sorts ?? DEFAULT_SORTING) {
        query = query.orderBy(({ coating }) => coating[sort.id as keyof typeof coating], sort.desc ? "desc" : "asc");
      }

      return query
        .select(({ coating }) => ({
          ...coating,
        }))
        .distinct();
    },
  });
}

export function useQueryCoatingById(id?: number) {
  return useLiveQuery((q) => {
    if (id === undefined) {
      return undefined;
    }
    return q
      .from({ coating: coatingCollection })
      .where(({ coating }) => eq(coating.id, id))
      .findOne();
  });
}

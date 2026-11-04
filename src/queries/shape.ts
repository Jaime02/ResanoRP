import { useLiveQuery } from "@tanstack/react-db";

import shapeCollection from "@/collections/shape";
import { includesIgnoringAccents } from "@/lib/utils";
import type { TNameFilters, TSort } from "@/schemas";
import { getFilterValue } from "@/schemas/utils";
import type { TBaseQueryProps } from "@/types";

const DEFAULT_SORTING: Array<TSort> = [{ id: "id", desc: false }];

export function useQueryShapes({ filters, sorts }: TBaseQueryProps<TNameFilters> = {}) {
  return useLiveQuery({
    queryKey: ["shapes", filters, sorts],
    query: (q) => {
      let query = q.from({ shape: shapeCollection });
      const name = getFilterValue(filters, "name");
      if (name != null) {
        query = query.fn.where(({ shape }) => includesIgnoringAccents(shape.name, name));
      }

      for (const sort of sorts ?? DEFAULT_SORTING) {
        query = query.orderBy(({ shape }) => shape[sort.id as keyof typeof shape], sort.desc ? "desc" : "asc");
      }

      return query
        .select(({ shape }) => ({
          ...shape,
        }))
        .distinct();
    },
  });
}

import { eq, isNull, useLiveQuery } from "@tanstack/react-db";

import rawMaterialCollection from "@/collections/raw-material";
import { includesIgnoringAccents } from "@/lib/utils";
import type { TNameFilters, TSort } from "@/schemas";
import { getFilterValue } from "@/schemas/utils";
import type { TBaseQueryProps } from "@/types";

const DEFAULT_SORTING: Array<TSort> = [{ id: "id", desc: false }];

export function useQueryRawMaterials({ filters, sorts }: TBaseQueryProps<TNameFilters> = {}) {
  return useLiveQuery({
    queryKey: ["rawMaterials", filters, sorts],
    query: (q) => {
      let query = q.from({ rawMaterial: rawMaterialCollection });
      const name = getFilterValue(filters, "name");
      if (name != null) {
        query = query.fn.where(({ rawMaterial }) => includesIgnoringAccents(rawMaterial.name, name));
      }
      if (getFilterValue(filters, "deletedAt") !== true) {
        query = query.where(({ rawMaterial }) => isNull(rawMaterial.deletedAt));
      }

      for (const sort of sorts ?? DEFAULT_SORTING) {
        query = query.orderBy(
          ({ rawMaterial }) => rawMaterial[sort.id as keyof typeof rawMaterial],
          sort.desc ? "desc" : "asc",
        );
      }

      return query
        .select(({ rawMaterial }) => ({
          ...rawMaterial,
        }))
        .distinct();
    },
  });
}

export function useQueryRawMaterialById(id?: number) {
  return useLiveQuery((q) => {
    if (id === undefined) {
      return undefined;
    }
    return q
      .from({ rawMaterial: rawMaterialCollection })
      .where(({ rawMaterial }) => eq(rawMaterial.id, id))
      .findOne();
  });
}

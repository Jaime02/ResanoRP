import { eq, useLiveQuery } from "@tanstack/react-db";

import printerCollection from "@/collections/printer";
import { includesIgnoringAccents } from "@/lib/utils";
import type { TNameFilters, TSort } from "@/schemas";
import { getFilterValue } from "@/schemas/utils";
import type { TBaseQueryProps } from "@/types";

const DEFAULT_SORTING: Array<TSort> = [{ id: "name", desc: false }];

interface UseQueryPrintersProps extends TBaseQueryProps<TNameFilters> {
  forTags?: boolean;
}

export function useQueryPrinters({ filters, sorts, forTags }: UseQueryPrintersProps = {}) {
  return useLiveQuery({
    queryKey: ["printers", filters, sorts, forTags],
    query: (q) => {
      let query = q.from({ printer: printerCollection });
      if (forTags !== undefined) {
        query = query.where(({ printer }) => eq(printer.forTags, forTags));
      }
      const name = getFilterValue(filters, "name");
      if (name != null) {
        query = query.fn.where(({ printer }) => includesIgnoringAccents(printer.name, name));
      }

      for (const sort of sorts ?? DEFAULT_SORTING) {
        query = query.orderBy(({ printer }) => printer[sort.id as keyof typeof printer], sort.desc ? "desc" : "asc");
      }

      return query
        .select(({ printer }) => ({
          ...printer,
        }))
        .distinct();
    },
  });
}

export function useQueryPrinterById(id?: number) {
  return useLiveQuery((q) => {
    if (id === undefined) {
      return undefined;
    }
    return q
      .from({ printer: printerCollection })
      .where(({ printer }) => eq(printer.id, id))
      .findOne();
  });
}

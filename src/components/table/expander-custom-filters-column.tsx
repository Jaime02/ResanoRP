import type { ColumnDef } from "@tanstack/react-table";

import type { TBaseTableFeatures } from "@/components/table/base-table";
import ButtonExpanderColumn from "@/components/table/button-expander-column";
import CustomFiltersHeader from "@/components/table/custom-filters-header";
import type { TBaseModel } from "@/schemas";

export const EXPANDER_COLUMN_ID = "expander";

interface ExpanderCustomFiltersColumnProps {
  hasCustomFilters?: boolean;
}

export default function expanderCustomFiltersColumn<TData extends TBaseModel>({
  hasCustomFilters = false,
}: ExpanderCustomFiltersColumnProps = {}): ColumnDef<TBaseTableFeatures, TData> {
  return {
    cell: ({ row }) => (
      <ButtonExpanderColumn isExpanded={row.getIsExpanded()} onClick={row.getToggleExpandedHandler()} />
    ),
    id: EXPANDER_COLUMN_ID,
    meta: { cellClassName: "text-center" },
    ...(hasCustomFilters && { header: CustomFiltersHeader }),
  };
}

import type { ColumnDef, Row } from "@tanstack/react-table";

import type { TBaseTableFeatures } from "@/components/table/base-table";
import { RadioButton } from "@/components/ui/radio";
import type { TBaseModel } from "@/schemas";

export type TOnRadioSelectedRowChange<TData extends TBaseModel> = (row: Row<TBaseTableFeatures, TData>) => void;

export default function radioColumn<TData extends TBaseModel>(
  onRadioSelectedRowChange?: TOnRadioSelectedRowChange<TData>,
): ColumnDef<TBaseTableFeatures, TData> {
  return {
    cell: ({ row }) => (
      <RadioButton testId="button-radio-column" value={row.id} onClick={() => onRadioSelectedRowChange?.(row)} />
    ),
    id: "radio",
  };
}

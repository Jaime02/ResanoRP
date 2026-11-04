import type { TTablePartPriceOnRowSelectParams } from "@/components/table/part-price";
import TablePartPrice from "@/components/table/part-price";
import type { PickerProps } from "@/components/ui/picker";
import Picker from "@/components/ui/picker";
import { SELECT_PRICE_PLACEHOLDER } from "@/messages/combobox";
import { useQueryPartPrices } from "@/queries/part-price";
import { TableMode } from "@/types";

interface PickerPartPriceProps extends Omit<PickerProps<TTablePartPriceOnRowSelectParams>, "children"> {
  id?: string;
  partId?: number;
  currentClientId?: number | null;
}

export default function PickerPartPrice({
  id,
  partId,
  currentClientId,
  label = SELECT_PRICE_PLACEHOLDER,
  onRowSelect,
  ...props
}: PickerPartPriceProps) {
  const { data: partPrices, isLoading } = useQueryPartPrices({ partId, onlyCalculated: true });

  return (
    <Picker
      id={id}
      testId="picker-part-price"
      label={label}
      onRowSelect={onRowSelect}
      {...props}
      children={({ onRowSelect }) => (
        <TablePartPrice
          testId="table-picker-part-prices"
          tableMode={TableMode.Picker}
          partId={partId}
          currentClientId={currentClientId}
          partPrices={partPrices}
          highlightRowOnHover={false}
          onRowSelect={onRowSelect}
          isLoading={isLoading}
        />
      )}
    />
  );
}

import { FunnelIcon, XIcon } from "lucide-react";
import { useCallback } from "react";

import PickerPart from "@/components/picker/picker-part";
import type { TPartTableOnRowSelectParams } from "@/components/table/part";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import FieldLabel from "@/form/components/field-label";
import FieldLayoutContainer from "@/form/components/field-layout-container";
import { useTableStateSearch } from "@/lib/use-table-state-search";
import { PART_LABEL } from "@/messages/common";
import type { TTableState } from "@/schemas";
import type { TDeliveryNoteFilters } from "@/schemas/delivery-note";
import type { TSellOrderFilters } from "@/schemas/sell-order";
import { getFilterValue, replaceFilters } from "@/schemas/utils";
import { TablePartPickerMode } from "@/types";

interface PopoverPartPickerFilterProps {
  testId: string;
  tableName: string;
  filters?: TDeliveryNoteFilters | TSellOrderFilters;
  defaultState?: TTableState;
  onStateChange?: (updater: React.SetStateAction<TTableState | undefined>) => void;
}

export default function PopoverPartPickerFilter({
  testId,
  tableName,
  filters,
  defaultState,
  onStateChange,
}: PopoverPartPickerFilterProps) {
  const navigateOnStateSearch = useTableStateSearch<TTableState>(tableName, defaultState);
  const navigateOnStateChange = onStateChange ?? navigateOnStateSearch;
  const partId = getFilterValue(filters, "partId");
  const partLabel = partId != null ? `Artículo: ${partId}` : undefined;

  const setPartId = useCallback(
    (newPartId: number | null) => {
      navigateOnStateChange((state) => ({
        ...state,
        filters: replaceFilters(state?.filters ?? defaultState?.filters, { partId: newPartId }),
      }));
    },
    [navigateOnStateChange, defaultState],
  );

  const onRowSelect = useCallback(
    (row: TPartTableOnRowSelectParams | null) => setPartId(row?.partId ?? null),
    [setPartId],
  );

  return (
    <div data-testid={testId} className="flex flex-row gap-1">
      <Popover>
        <PopoverTrigger variant="secondary" size="icon">
          <FunnelIcon />
        </PopoverTrigger>
        <PopoverContent>
          <FieldLayoutContainer>
            <FieldLabel>{PART_LABEL}</FieldLabel>
            <PickerPart
              pickerMode={TablePartPickerMode.PickParts}
              onRowSelect={onRowSelect}
              label={partLabel}
              // The popover unmounts the picker when it closes, so it starts from the active filter
              initialValue={partId != null ? { activeItemId: partId, formattedActiveItem: partLabel } : null}
            />
          </FieldLayoutContainer>
        </PopoverContent>
      </Popover>
      {partId != null && (
        <Button testId="button-clear-filters" size="icon" variant="destructive" onClick={() => setPartId(null)}>
          <XIcon />
        </Button>
      )}
    </div>
  );
}

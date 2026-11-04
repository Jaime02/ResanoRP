import { FunnelIcon, XIcon } from "lucide-react";
import { useCallback } from "react";

import ComboboxClient from "@/components/combobox/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import FieldLabel from "@/form/components/field-label";
import FieldLayoutContainer from "@/form/components/field-layout-container";
import { useTableStateSearch } from "@/lib/use-table-state-search";
import { PART_CLIENT_FILTER_LABEL, SHOW_DELETED_PARTS_LABEL } from "@/messages/part";
import type { TFilterValue, TTableState } from "@/schemas";
import type { TPartFilters, TPartPopoverFilterId } from "@/schemas/part";
import { getFilterValue, replaceFilters } from "@/schemas/utils";

interface PopoverPartFiltersProps {
  tableName: string;
  filterIds: ReadonlyArray<TPartPopoverFilterId>;
  filters?: TPartFilters;
  defaultState?: TTableState;
  onStateChange?: (updater: React.SetStateAction<TTableState | undefined>) => void;
}

export default function PopoverPartFilters({
  tableName,
  filterIds,
  filters,
  defaultState,
  onStateChange,
}: PopoverPartFiltersProps) {
  const navigateOnStateSearch = useTableStateSearch<TTableState>(tableName, defaultState);
  const navigateOnStateChange = onStateChange ?? navigateOnStateSearch;
  const clientId = getFilterValue(filters, "clientId");
  const hasActiveFilters = filterIds.some((filterId) => getFilterValue(filters, filterId) != null);

  const setFilterValues = useCallback(
    (filterValues: Partial<Record<TPartPopoverFilterId, TFilterValue>>) => {
      navigateOnStateChange((state) => ({
        ...state,
        filters: replaceFilters(state?.filters ?? defaultState?.filters, filterValues),
      }));
    },
    [navigateOnStateChange, defaultState],
  );

  if (filterIds.length === 0) {
    return null;
  }

  return (
    <div data-testid="popover-part-filters" className="flex flex-row gap-1">
      <Popover>
        <PopoverTrigger variant="secondary" size="icon">
          <FunnelIcon />
        </PopoverTrigger>
        <PopoverContent>
          {filterIds.includes("clientId") && (
            <FieldLayoutContainer>
              <FieldLabel>{PART_CLIENT_FILTER_LABEL}</FieldLabel>
              <ComboboxClient
                testId="combobox-filter-client"
                activeItemId={clientId ?? undefined}
                onValueChange={(client) => setFilterValues({ clientId: client?.id ?? null })}
                nullable
              />
            </FieldLayoutContainer>
          )}
          {filterIds.includes("deletedAt") && (
            <FieldLayoutContainer className="flex-row items-center gap-2">
              <Checkbox
                id="checkbox-filter-deleted-parts"
                testId="checkbox-filter-deleted-parts"
                checked={getFilterValue(filters, "deletedAt") === true}
                onCheckedChange={(checked) => setFilterValues({ deletedAt: checked ? true : null })}
              />
              <FieldLabel labelFor="checkbox-filter-deleted-parts">{SHOW_DELETED_PARTS_LABEL}</FieldLabel>
            </FieldLayoutContainer>
          )}
        </PopoverContent>
      </Popover>
      {hasActiveFilters && (
        <Button
          testId="button-clear-filters"
          size="icon"
          variant="destructive"
          onClick={() => setFilterValues(Object.fromEntries(filterIds.map((filterId) => [filterId, null])))}
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}

import { FunnelIcon } from "lucide-react";
import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import FieldLabel from "@/form/components/field-label";
import FieldLayoutContainer from "@/form/components/field-layout-container";
import { useTableStateSearch } from "@/lib/use-table-state-search";
import type { TTableState } from "@/schemas";
import { replaceFilters } from "@/schemas/utils";

interface PopoverDeletedFilterProps {
  tableName: string;
  label: string;
  filters?: TTableState["filters"];
  defaultState?: TTableState;
  onStateChange?: (updater: React.SetStateAction<TTableState | undefined>) => void;
}

export default function PopoverDeletedFilter({
  tableName,
  label,
  filters,
  defaultState,
  onStateChange,
}: PopoverDeletedFilterProps) {
  const navigateOnStateSearch = useTableStateSearch<TTableState>(tableName, defaultState);
  const navigateOnStateChange = onStateChange ?? navigateOnStateSearch;
  const checkboxId = useId();

  return (
    <div data-testid="popover-deleted-filter">
      <Popover>
        <PopoverTrigger variant="secondary" size="icon">
          <FunnelIcon />
        </PopoverTrigger>
        <PopoverContent>
          <FieldLayoutContainer className="flex-row items-center gap-2">
            <Checkbox
              id={checkboxId}
              testId="checkbox-filter-deleted"
              checked={filters?.some((filter) => filter.id === "deletedAt" && filter.value === true) === true}
              onCheckedChange={(checked) =>
                navigateOnStateChange((state) => ({
                  ...state,
                  filters: replaceFilters(state?.filters ?? defaultState?.filters, {
                    deletedAt: checked ? true : null,
                  }),
                }))
              }
            />
            <FieldLabel labelFor={checkboxId}>{label}</FieldLabel>
          </FieldLayoutContainer>
        </PopoverContent>
      </Popover>
    </div>
  );
}

import { useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import type { ComboboxProps } from "@/components/ui/combobox";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import FieldLayoutContainer from "@/form/components/field-layout-container";
import clientLog from "@/logging/clientLog";
import { LoggerLevels } from "@/logging/types";
import { NO_MACHINES_MESSAGE, SELECT_MACHINE_PLACEHOLDER } from "@/messages/combobox";
import { COMPATIBLE_MACHINES_LABEL } from "@/messages/machine";
import { useQueryMachines } from "@/queries/machine";
import type { BaseMachine } from "@/types/machine";

type ComboboxMachineProps = Omit<
  ComboboxProps<BaseMachine>,
  "items" | "formatItem" | "filter" | "onFilterChange" | "activeItem" | "popupHeader"
> & {
  activeItemId?: number;
  excludeItemIds?: Array<number>;
  partWidth?: string | null;
};

export default function ComboboxMachine({
  activeItemId,
  excludeItemIds,
  partWidth,
  placeholder = SELECT_MACHINE_PLACEHOLDER,
  noItemsMessage = NO_MACHINES_MESSAGE,
  loading,
  ...props
}: ComboboxMachineProps) {
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [onlyCompatible, setOnlyCompatible] = useState(true);

  // The width is free text, parts without a numeric width can't rule out any machine
  const numericPartWidth = partWidth == null ? Number.NaN : Number(partWidth);
  const compatiblePartWidth = onlyCompatible && !Number.isNaN(numericPartWidth) ? numericPartWidth : undefined;

  const queryFilters = useMemo(() => {
    const filters: NonNullable<Parameters<typeof useQueryMachines>[number]>["filters"] = [];
    if (filter !== undefined) {
      filters.push({ id: "name" as const, value: filter });
    }
    if (excludeItemIds !== undefined) {
      filters.push({ id: "excludeItemIds" as const, value: excludeItemIds });
    }
    if (compatiblePartWidth !== undefined) {
      filters.push({ id: "compatiblePartWidth" as const, value: compatiblePartWidth });
    }
    return filters.length > 0 ? { filters } : undefined;
  }, [filter, excludeItemIds, compatiblePartWidth]);

  const { data: machines, isLoading: isLoadingMachines, isLoadingError, isCrashed } = useQueryMachines(queryFilters);

  const activeItem =
    activeItemId !== undefined ? (machines.find((machine) => machine.id === activeItemId) ?? null) : null;

  if (isLoadingError || isCrashed) {
    void clientLog(LoggerLevels.error, "Error fetching machines for ComboboxMachine");
  }

  return (
    <Combobox
      items={machines}
      loading={isLoadingMachines || loading}
      filter={filter}
      onFilterChange={setFilter}
      formatItem={(machine) => machine?.name ?? ""}
      placeholder={placeholder}
      noItemsMessage={noItemsMessage}
      activeItem={activeItem}
      popupHeader={
        partWidth !== undefined && (
          <FieldLayoutContainer className="flex-row items-center gap-2 p-1">
            <Checkbox
              id="checkbox-compatible-machines"
              testId="checkbox-compatible-machines"
              checked={onlyCompatible}
              onCheckedChange={setOnlyCompatible}
            />
            <Label className="cursor-pointer" onClick={() => setOnlyCompatible(!onlyCompatible)}>
              {COMPATIBLE_MACHINES_LABEL}
            </Label>
          </FieldLayoutContainer>
        )
      }
      {...props}
    />
  );
}

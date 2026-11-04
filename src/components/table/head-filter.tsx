import { useSelector } from "@tanstack/react-store";
import type { Header, Table } from "@tanstack/react-table";
import { FunnelIcon, XIcon } from "lucide-react";
import { useCallback, useState } from "react";

import type { TBaseTableFeatures } from "@/components/table/base-table";
import PopupEnumFilter from "@/components/table/popup-enum-filter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import DateInput from "@/components/ui/date-input";
import { DebouncedInput } from "@/components/ui/debounced-input";
import NumberInput from "@/components/ui/number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import PriceInput from "@/components/ui/price-input";
import clientLog from "@/logging/clientLog";
import { LoggerLevels } from "@/logging/types";
import { FROM_LABEL, SEARCH_PLACEHOLDER, TO_LABEL } from "@/messages/common";
import type { DateRangeFilter, TBaseModel, TTableState } from "@/schemas";
import type { TFilterValue } from "@/schemas";
import { replaceFilters } from "@/schemas/utils";
import { CellDataType } from "@/types";

interface TableHeadFilterProps<TRow extends TBaseModel = TBaseModel> {
  testId?: string;
  table: Table<TBaseTableFeatures, TRow>;
  header: Header<TBaseTableFeatures, TRow>;
  disabled?: boolean;
  onStateChange: (updater: React.SetStateAction<TTableState | undefined>) => void;
}

export function TableHeadFilter<TRow extends TBaseModel = TBaseModel>({
  testId,
  table,
  header,
  disabled,
  onStateChange,
}: TableHeadFilterProps<TRow>) {
  const dataType = header.column.columnDef.meta?.dataType;
  const columnFilterId = header.column.columnDef.meta?.filterFieldName ?? header.column.id;
  const columnFilters = useSelector(table.atoms.columnFilters, (filters) => filters);
  const getFilterValue = useCallback(
    (filterId: string) => columnFilters.find((filter) => filter.id === filterId)?.value as TFilterValue | undefined,
    [columnFilters],
  );
  const filterValue = getFilterValue(columnFilterId);

  const [popoverOpen, setPopoverOpen] = useState(false);

  const setFilterValues = useCallback(
    (filterValues: Record<string, TFilterValue>) => {
      // An empty array instead of no filters, so clearing a filter of the defaultState does not bring it back
      onStateChange((state) => ({
        ...state,
        filters: replaceFilters(state?.filters ?? (columnFilters as TTableState["filters"]), filterValues),
      }));
    },
    [onStateChange, columnFilters],
  );

  const handleChange = useCallback(
    (newValue: TFilterValue) => setFilterValues({ [columnFilterId]: newValue }),
    [columnFilterId, setFilterValues],
  );

  if (header.column.getCanFilter() && header.column.columnDef.meta?.dataType === undefined) {
    void clientLog(LoggerLevels.error, `Column ${String(header.column.id)} is filterable but has no dataType defined`);
    return null;
  }

  const renderFilter = header.column.columnDef.meta?.renderFilter;
  if (renderFilter !== undefined) {
    return (
      <>
        {renderFilter({
          value: typeof filterValue === "number" ? filterValue : undefined,
          onChange: handleChange,
          getFilterValue,
          setFilterValues,
        })}
      </>
    );
  }

  if (dataType === CellDataType.Date) {
    const dateRangeFilter = filterValue as DateRangeFilter | undefined;
    const handleDateRangeChange = (dateRange: DateRangeFilter) => {
      handleChange(dateRange.startDate !== undefined || dateRange.endDate !== undefined ? dateRange : null);
    };

    return (
      <div className="flex flex-row gap-1">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger
            render={(props) => (
              <Button
                testId={testId}
                onClick={() => {
                  setPopoverOpen(true);
                }}
                size="icon"
                variant="secondary"
                disabled={disabled}
                {...props}
              >
                <FunnelIcon />
              </Button>
            )}
          />
          <PopoverContent className="flex flex-col gap-2">
            <DateInput
              date={dateRangeFilter?.startDate ?? null}
              onValueChange={(newDate: Date | null) => {
                handleDateRangeChange({ ...dateRangeFilter, startDate: newDate ?? undefined });
              }}
              emptyMessage={FROM_LABEL}
              nullable
            />
            <DateInput
              date={dateRangeFilter?.endDate ?? null}
              onValueChange={(newDate: Date | null) => {
                handleDateRangeChange({ ...dateRangeFilter, endDate: newDate ?? undefined });
              }}
              emptyMessage={TO_LABEL}
              nullable
            />
          </PopoverContent>
        </Popover>
        {dateRangeFilter !== undefined && disabled !== true && (
          <Button
            testId={testId !== undefined ? `${testId}-clear` : undefined}
            size="icon"
            variant="destructive"
            onClick={() => handleChange(null)}
          >
            <XIcon />
          </Button>
        )}
      </div>
    );
  }

  if (dataType === CellDataType.Boolean) {
    return (
      <Checkbox
        testId={testId}
        className="mx-auto"
        checked={filterValue === true}
        indeterminate={filterValue === false}
        disabled={disabled}
        onCheckedChange={() => {
          handleChange(filterValue === true ? false : filterValue === false ? null : true);
        }}
      />
    );
  }

  if (dataType === CellDataType.Number) {
    const numValue = typeof filterValue === "number" ? filterValue : null;
    return (
      <NumberInput
        testId={testId}
        value={numValue !== null ? String(numValue) : null}
        onValueChange={(newValue) => {
          handleChange(newValue !== null ? Number(newValue) : null);
        }}
        readOnly={disabled}
        placeholder={SEARCH_PLACEHOLDER}
        className="w-full"
      />
    );
  }

  if (dataType === CellDataType.Price) {
    const numValue = typeof filterValue === "number" ? filterValue : null;
    return (
      <PriceInput
        testId={testId}
        value={numValue !== null ? String(numValue) : null}
        onValueChange={(newValue) => {
          handleChange(newValue !== null ? Number(newValue) : null);
        }}
        readOnly={disabled}
        placeholder={SEARCH_PLACEHOLDER}
      />
    );
  }

  if (dataType === CellDataType.Enum) {
    if (!header.column.columnDef.meta?.enumName) {
      void clientLog(
        LoggerLevels.error,
        `Column ${String(header.column.id)} is of type Enum but has no enumName defined`,
      );
      return null;
    }
    if (header.column.columnDef.meta.filterFieldName === undefined) {
      void clientLog(
        LoggerLevels.error,
        `Column ${String(header.column.id)} is of type Enum but has no filterFieldName defined`,
      );
      return null;
    }

    const { filterFieldName } = header.column.columnDef.meta;
    return (
      <PopupEnumFilter
        enumName={header.column.columnDef.meta.enumName}
        filterFieldName={filterFieldName}
        activeEnumValues={filterValue as Array<string> | undefined}
        handleChange={handleChange}
      />
    );
  }

  if (dataType === CellDataType.Combobox) {
    void clientLog(
      LoggerLevels.error,
      `Column ${String(header.column.id)} is of type Combobox but has no renderFilter defined in column meta`,
    );
    return null;
  }

  return (
    <DebouncedInput
      testId={testId}
      readOnly={disabled}
      onChange={handleChange}
      placeholder={SEARCH_PLACEHOLDER}
      type="text"
      value={(filterValue as string | null) ?? ""}
      className="field-sizing-content w-full"
    />
  );
}

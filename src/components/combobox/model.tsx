import { useMemo, useState } from "react";

import type { ComboboxProps } from "@/components/ui/combobox";
import { Combobox } from "@/components/ui/combobox";
import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";
import type { TBaseModel } from "@/schemas";

export type ComboboxModelProps<TItem extends TBaseModel> = Omit<
  ComboboxProps<TItem>,
  "items" | "formatItem" | "filter" | "onFilterChange" | "activeItem"
> & {
  activeItemId?: number;
};

interface TComboboxModelQuery<TItem> {
  data: Array<TItem>;
  isLoading: boolean;
  isLoadingError: boolean;
  isCrashed: boolean;
}

export default function ComboboxModel<TItem extends TBaseModel & { name: string }>({
  modelName,
  useQueryItems,
  activeItemId,
  activeItem,
  loading,
  ...props
}: ComboboxModelProps<TItem> & {
  modelName: string;
  useQueryItems: (query?: { filters: Array<{ id: "name"; value: string }> }) => TComboboxModelQuery<TItem>;
  activeItem?: TItem | null;
}) {
  const [filter, setFilter] = useState<string | undefined>(undefined);

  const queryFilters = useMemo(
    () => (filter !== undefined ? { filters: [{ id: "name" as const, value: filter }] } : undefined),
    [filter],
  );

  const { data: items, isLoading, isLoadingError, isCrashed } = useQueryItems(queryFilters);

  if (isLoadingError || isCrashed) {
    void log(LoggerLevels.error, LogMessages.comboboxFetchFailed(modelName, "ComboboxModel"));
  }

  return (
    <Combobox
      items={items}
      loading={isLoading || loading}
      filter={filter}
      onFilterChange={setFilter}
      formatItem={(item) => item?.name ?? ""}
      activeItem={activeItem !== undefined ? activeItem : (items.find((item) => item.id === activeItemId) ?? null)}
      {...props}
    />
  );
}

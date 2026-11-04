import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { ChevronDownIcon, XIcon } from "lucide-react";

import TooltipDeleted from "@/components/tooltip/deleted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SELECT_OPTION_PLACEHOLDER } from "@/messages/combobox";
import { CLEAR_SELECTION_LABEL, FILTER_PLACEHOLDER, NO_RESULTS_MESSAGE, STATUS_DELETED_LABEL } from "@/messages/common";
import type { TBaseModel } from "@/schemas";

export interface ComboboxProps<TItem extends TBaseModel> {
  testId?: string;
  id?: string;
  className?: string;
  triggerProps?: React.ComponentProps<typeof Button>;
  items: Array<TItem>;
  activeItem: TItem | null;
  formatItem: (item: TItem | null) => string;
  onValueChange?: (value: TItem | null) => void;
  loading?: boolean;
  readOnly?: boolean;
  filter?: string;
  onFilterChange?: (value: string | undefined) => void;
  take?: number;
  nullable?: boolean;
  showChevron?: boolean;
  placeholder?: string | React.ReactNode;
  noItemsMessage?: string;
  noResultsMessage?: string;
  deletedItemLink?: React.ReactNode;
  popupHeader?: React.ReactNode;
}

export function Combobox<TItem extends TBaseModel>({
  testId,
  id,
  className,
  triggerProps,
  items,
  activeItem,
  formatItem,
  onValueChange,
  loading = false,
  readOnly = false,
  filter,
  onFilterChange,
  take = 10,
  nullable = true,
  showChevron = true,
  placeholder = SELECT_OPTION_PLACEHOLDER,
  noResultsMessage = NO_RESULTS_MESSAGE,
  noItemsMessage = noResultsMessage,
  deletedItemLink,
  popupHeader,
}: ComboboxProps<TItem>) {
  const hiddenItemsCount = Math.max(items.length - take, 0);
  const visibleItems = items.slice(0, take);

  return (
    <BaseCombobox.Root
      items={visibleItems}
      itemToStringLabel={formatItem}
      value={activeItem}
      itemToStringValue={(item) => (item !== null ? String(item.id) : "")}
      isItemEqualToValue={(itemValue, selectedValue) =>
        itemValue !== null && selectedValue !== null && itemValue.id === selectedValue.id
      }
      onValueChange={onValueChange}
      disabled={loading}
      readOnly={readOnly}
    >
      <div
        data-testid={testId}
        data-value={activeItem?.id}
        data-loading={loading || undefined}
        data-input-type="combobox"
        className={cn("flex w-base-input max-w-full flex-row items-center gap-1", className)}
      >
        <BaseCombobox.Trigger
          disabled={readOnly}
          render={(props, state) => (
            <Button
              testId="button-trigger"
              data-open={state.open || undefined}
              {...triggerProps}
              {...props}
              className={cn("min-w-0 grow", !showChevron && !activeItem && "px-2")}
            >
              {activeItem ? (
                <span className="truncate">
                  <BaseCombobox.Value />
                </span>
              ) : (
                placeholder
              )}
              {showChevron && (
                <ChevronDownIcon
                  className={cn(
                    "rotate-0 transition-transform duration-300 ease-in-out [[data-open]>&]:rotate-180",
                    triggerProps?.size === "icon" ? undefined : "ml-auto",
                    readOnly && "invisible",
                  )}
                />
              )}
            </Button>
          )}
        />
        {activeItem?.deletedAt != null && (
          <TooltipDeleted>
            {STATUS_DELETED_LABEL}
            {deletedItemLink}
          </TooltipDeleted>
        )}
        {nullable && activeItem && !readOnly && (
          <BaseCombobox.Clear
            render={
              <Button testId="button-clear" aria-label={CLEAR_SELECTION_LABEL} variant="destructive" size="icon">
                <XIcon />
              </Button>
            }
          />
        )}
      </div>
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner className="outline-none" sideOffset={4}>
          <BaseCombobox.Popup className="flex max-h-(--available-height) w-fit max-w-(--available-width) origin-(--transform-origin) flex-col gap-1 rounded-lg bg-background p-2 shadow-dialog transition-[transform,scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {popupHeader}
            {(items.length > 0 || (filter !== undefined && filter !== "")) && (
              <BaseCombobox.Input
                render={
                  <Input
                    id={id}
                    testId="combobox-input-filter"
                    className="w-full"
                    placeholder={FILTER_PLACEHOLDER}
                    {...(filter !== undefined && { value: filter })}
                    onChange={(e) => {
                      onFilterChange?.(e.target.value);
                    }}
                    isValid={filter === undefined || items.length !== 0}
                    readOnly={readOnly}
                  />
                }
              />
            )}
            <BaseCombobox.Empty className="px-4 py-3 text-center leading-4 text-red-500 empty:m-0 empty:p-0">
              {items.length === 0 ? noItemsMessage : noResultsMessage}
            </BaseCombobox.Empty>
            <BaseCombobox.List
              data-testid="combobox-list"
              className="flex min-h-0 scroll-py-2 flex-col gap-1 overflow-y-auto overscroll-contain outline-0 data-empty:p-0"
            >
              {(item: TItem) => (
                <BaseCombobox.Item
                  key={item.id}
                  value={item}
                  role="option"
                  className="cursor-pointer rounded-sm p-2 select-none data-highlighted:bg-primary data-highlighted:text-white data-selected:not-data-highlighted:bg-secondary data-selected:not-data-highlighted:text-secondary-foreground"
                >
                  {formatItem(item)}
                </BaseCombobox.Item>
              )}
            </BaseCombobox.List>
            {hiddenItemsCount !== 0 && (
              <span className="border-t border-t-border pt-2 text-center">
                {hiddenItemsCount} resultado{hiddenItemsCount > 1 && "s"} más
              </span>
            )}
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  );
}

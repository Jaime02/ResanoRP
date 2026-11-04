import { CalendarIcon, XIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { APP_TIME_ZONE, startOfAppDay } from "@/lib/dates";
import { formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { SELECT_DATE_MESSAGE } from "@/messages/common";

export interface DateInputProps {
  ref?: React.Ref<HTMLButtonElement>;
  id?: string;
  testId?: string;
  className?: string;
  date: Date | null;
  disabled?: boolean;
  emptyMessage?: string;
  nullable?: boolean;
  onValueChange?: (date: Date | null) => void;
  onBlur?: () => void;
}

export default function DateInput({
  ref,
  id,
  testId,
  className,
  date,
  disabled = false,
  emptyMessage = SELECT_DATE_MESSAGE,
  nullable = true,
  onValueChange,
  onBlur,
}: DateInputProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleDateSelect = useCallback(
    (selectedDate: Date) => {
      onValueChange?.(startOfAppDay(selectedDate));
      setIsOpen(false);
    },
    [onValueChange],
  );

  return (
    <div
      data-input-type="date-input"
      data-testid={testId}
      data-value={date?.toISOString()}
      className={cn("flex w-base-input min-w-fit flex-row items-center gap-1", className)}
    >
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger id={id} ref={ref} disabled={disabled} onBlur={onBlur} className="grow justify-start text-left">
          <CalendarIcon />
          <span className="min-w-[10ch]">{date ? formatDate(date) : emptyMessage}</span>
        </PopoverTrigger>
        <PopoverContent>
          <Calendar
            timeZone={APP_TIME_ZONE}
            disabled={disabled}
            mode="single"
            required
            selected={date ?? undefined}
            defaultMonth={date ?? undefined}
            onSelect={handleDateSelect}
            className="p-1"
          />
        </PopoverContent>
      </Popover>
      {nullable && date && !disabled && (
        <Button data-testid="button-clear" size="icon" variant="destructive" onClick={() => onValueChange?.(null)}>
          <XIcon />
        </Button>
      )}
    </div>
  );
}

import { SquareMousePointerIcon, XIcon } from "lucide-react";
import React, { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SELECT_OPTION_PLACEHOLDER } from "@/messages/combobox";

interface TParams {
  activeItemId: number | null;
  formattedActiveItem?: string | null;
}

interface PickerChildProps<T extends TParams> {
  onRowSelect: (params: T | null) => void;
}

export interface PickerProps<T extends TParams> {
  id?: string;
  testId?: string;
  label?: string | null;
  initialValue?: TParams | null;
  onRowSelect: (params: T | null) => void;
  disabled?: boolean;
  showFormattedActiveItem?: boolean;
  className?: string;
  children: (props: PickerChildProps<T>) => React.ReactNode;
}

export default function Picker<T extends TParams>({
  id,
  testId,
  label,
  initialValue,
  onRowSelect,
  disabled = false,
  showFormattedActiveItem = true,
  className,
  children,
}: PickerProps<T>) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeItemId, setActiveItemId] = useState(initialValue?.activeItemId ?? null);
  const [formattedActiveItem, setFormattedOption] = useState(initialValue?.formattedActiveItem ?? null);

  const handleSelect = useCallback(
    (params: T | null) => {
      onRowSelect(params);
      setFormattedOption(params?.formattedActiveItem ?? null);
      setActiveItemId(params?.activeItemId ?? null);
      setIsDialogOpen(false);
    },
    [onRowSelect],
  );

  return (
    <div
      id={id}
      data-testid={testId}
      data-input-type="picker"
      data-value={activeItemId}
      className={cn("flex w-base-input min-w-fit flex-row items-center gap-1", className)}
    >
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger
          testId="button-trigger"
          className="grow justify-center"
          disabled={disabled}
          onClick={() => {
            setIsDialogOpen(true);
          }}
        >
          {showFormattedActiveItem && formattedActiveItem !== null ? formattedActiveItem : label}
          <SquareMousePointerIcon />
        </DialogTrigger>
        <DialogContent data-testid={`${testId}-content`}>
          <DialogHeader>
            <DialogTitle>{label ?? SELECT_OPTION_PLACEHOLDER}</DialogTitle>
          </DialogHeader>
          {children({ onRowSelect: handleSelect })}
        </DialogContent>
      </Dialog>
      {formattedActiveItem !== null && (
        <Button
          data-testid="button-clear"
          size="icon"
          variant="destructive"
          onClick={() => {
            handleSelect(null);
          }}
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}

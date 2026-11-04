import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { TSerializeOutput } from "@/lib/serializers";
import { NOT_AVAILABLE_MESSAGE } from "@/messages/common";

export interface ButtonModelActionProps {
  dialogTriggerTestId: string;
  dialogContentTestId: string;
  dialogTitle: string;
  dialogDescription: string;
  serializedModel?: TSerializeOutput;
  onConfirm: () => Promise<void> | void;
  disabled?: boolean;
  triggerExtraComponents?: React.ReactNode;
  className?: string;
  size?: React.ComponentProps<typeof AlertDialogTrigger>["size"];
  variant: React.ComponentProps<typeof AlertDialogTrigger>["variant"];
  icon: React.ReactNode;
  actionText: string;
}

export default function ButtonModelAction({
  dialogTriggerTestId,
  dialogContentTestId,
  dialogTitle,
  dialogDescription,
  onConfirm,
  disabled,
  serializedModel,
  triggerExtraComponents,
  className,
  size = "icon",
  variant,
  icon,
  actionText,
}: ButtonModelActionProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger
        size={size}
        onClick={() => {
          setIsOpen(true);
        }}
        variant={variant}
        testId={dialogTriggerTestId}
        disabled={disabled}
        className={className}
        aria-label={dialogTitle}
      >
        {icon}
        {triggerExtraComponents}
      </AlertDialogTrigger>
      <AlertDialogContent data-testid={dialogContentTestId}>
        <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
        <AlertDialogDescription>{dialogDescription}</AlertDialogDescription>
        {serializedModel && (
          <div className="flex flex-col gap-2">
            {Object.entries(serializedModel)
              // oxlint-disable-next-line no-unused-vars
              .filter(([_, value]) => value !== undefined)
              .map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 text-nowrap">
                  <span className="font-semibold">{key}:</span>
                  {value ?? <span className="text-muted-foreground">{NOT_AVAILABLE_MESSAGE}</span>}
                </div>
              ))}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogAction variant={variant} onClick={onConfirm}>
            {icon}
            {actionText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

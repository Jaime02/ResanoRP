import type { ReactNode } from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FormContextProps } from "@/form";
import { BaseFormContext } from "@/form/context";
import { cn } from "@/lib/utils";
import { FormMode } from "@/types";

interface MaintenanceDialogProps extends Pick<
  FormContextProps,
  "validationSchema" | "formMode" | "isLoading" | "form"
> {
  testId: string;
  open: boolean;
  title?: string;
  className?: string;
  layoutClassName?: string;
  submitDisabled?: boolean;
  onClose?: () => void;
  children?: ReactNode;
}

export default function MaintenanceDialog({
  testId,
  form,
  formMode = FormMode.NotApplicable,
  validationSchema,
  isLoading = false,
  open,
  title,
  className,
  layoutClassName,
  submitDisabled,
  onClose,
  children,
}: MaintenanceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(newOpenState: boolean) => !newOpenState && onClose?.()}>
      <BaseFormContext value={{ form, formMode, isLoading, validationSchema }}>
        <form.AppForm>
          <DialogContent data-testid={testId} className={className} isLoading={isLoading}>
            {title !== undefined && (
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
              </DialogHeader>
            )}
            <div className={cn("flex grow flex-row flex-wrap items-stretch justify-center gap-3", layoutClassName)}>
              {children}
            </div>
            <DialogFooter>
              <form.ButtonSubmit disabled={submitDisabled} />
            </DialogFooter>
          </DialogContent>
        </form.AppForm>
      </BaseFormContext>
    </Dialog>
  );
}

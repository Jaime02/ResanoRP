import type { ReactNode } from "react";

import { ErrorMessageOverlay } from "@/components/ui/error-message-overlay";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import type { BaseFormContextProps } from "@/form/context";
import { BaseFormContext } from "@/form/context";
import { cn } from "@/lib/utils";
import { FormMode } from "@/types";

export interface FormContextProps extends Omit<BaseFormContextProps, "formMode" | "isLoading"> {
  testId?: string;
  formMode?: FormMode;
  isLoading?: boolean;
  errorMessage?: string;
  className?: string;
  children?: ReactNode;
}

export function FormContextProvider({
  form,
  testId,
  formMode = FormMode.NotApplicable,
  isLoading = false,
  errorMessage,
  validationSchema,
  className,
  children,
}: FormContextProps) {
  return (
    <BaseFormContext value={{ form, formMode, isLoading, validationSchema }}>
      <form.AppForm>
        <div
          data-testid={testId}
          data-loading={isLoading}
          className={cn("relative mx-auto flex w-fit max-w-full flex-col gap-3", className)}
        >
          {children}
          {isLoading && <LoadingOverlay />}
          {errorMessage !== undefined && <ErrorMessageOverlay message={errorMessage} />}
        </div>
      </form.AppForm>
    </BaseFormContext>
  );
}

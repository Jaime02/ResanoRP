import { LoaderIcon, PlusIcon, SaveIcon } from "lucide-react";

import type { ButtonProps } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { useFormContext } from "@/form/context";
import { CREATE_LABEL, SAVE_LABEL } from "@/messages/common";
import { FormMode } from "@/types";

interface ButtonSubmitProps extends ButtonProps {
  icon?: React.ReactNode;
  customText?: string;
  disableIfPristine?: boolean;
}

export default function ButtonSubmit({
  icon,
  customText,
  disabled,
  children,
  disableIfPristine = true,
  testId = "button-submit",
  ...props
}: ButtonSubmitProps) {
  const { form, formMode, isLoading } = useFormContext();
  return (
    <form.Subscribe
      selector={(state) => [state.canSubmit, state.isValid, state.isSubmitting, state.isPristine, state.isDefaultValue]}
      children={([canSubmit, isValid, isSubmitting, isPristine, isDefaultValue]) => (
        <Button
          testId={testId}
          variant="success"
          onClick={() => void form.handleSubmit()}
          disabled={
            isSubmitting ||
            isLoading === true ||
            !isValid ||
            !canSubmit ||
            // An update that changes nothing never syncs back, so waiting for its txid would time out
            (disableIfPristine && (isPristine || (formMode === FormMode.Update && isDefaultValue))) ||
            disabled
          }
          className="w-max"
          {...props}
        >
          {children ?? (
            <>
              {isSubmitting ? (
                <LoaderIcon className="animate-spin" />
              ) : (
                (icon ?? (formMode === FormMode.Create ? <PlusIcon /> : <SaveIcon />))
              )}
              <span>{customText ?? (formMode === FormMode.Create ? CREATE_LABEL : SAVE_LABEL)}</span>
            </>
          )}
        </Button>
      )}
    />
  );
}

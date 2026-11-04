import { Trash2Icon } from "lucide-react";

import ButtonModelAction from "@/components/table/button-model-action";
import type { ButtonModelActionProps } from "@/components/table/button-model-action";
import { DELETE_LABEL } from "@/messages/common";

type ButtonDeleteModelProps = Omit<
  ButtonModelActionProps,
  "dialogTriggerTestId" | "dialogContentTestId" | "variant" | "icon" | "actionText"
> &
  Partial<Pick<ButtonModelActionProps, "dialogTriggerTestId">>;

export default function ButtonDeleteModel({ dialogTriggerTestId = "button-delete", ...props }: ButtonDeleteModelProps) {
  return (
    <ButtonModelAction
      dialogTriggerTestId={dialogTriggerTestId}
      dialogContentTestId="dialog-delete-model-content"
      variant="destructive"
      icon={<Trash2Icon />}
      actionText={DELETE_LABEL}
      {...props}
    />
  );
}

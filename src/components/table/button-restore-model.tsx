import { UndoIcon } from "lucide-react";

import ButtonModelAction from "@/components/table/button-model-action";
import type { ButtonModelActionProps } from "@/components/table/button-model-action";
import { RESTORE_LABEL } from "@/messages/common";

type ButtonRestoreModelProps = Omit<
  ButtonModelActionProps,
  "dialogTriggerTestId" | "dialogContentTestId" | "variant" | "icon" | "actionText"
> &
  Partial<Pick<ButtonModelActionProps, "dialogTriggerTestId">>;

export default function ButtonRestoreModel({
  dialogTriggerTestId = "button-restore",
  ...props
}: ButtonRestoreModelProps) {
  return (
    <ButtonModelAction
      dialogTriggerTestId={dialogTriggerTestId}
      dialogContentTestId="dialog-restore-model-content"
      variant="success"
      icon={<UndoIcon />}
      actionText={RESTORE_LABEL}
      {...props}
    />
  );
}

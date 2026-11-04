import { EditIcon, PlusIcon } from "lucide-react";

import ButtonDeleteModel from "@/components/table/button-delete-model";
import ButtonRestoreModel from "@/components/table/button-restore-model";
import { Button } from "@/components/ui/button";

interface ModelActionsProps {
  disabled?: boolean;
  onSuccess?: () => void;
  onEdit?: () => void;
  deleteButton?: React.ComponentProps<typeof ButtonDeleteModel>;
  restoreButton?: React.ComponentProps<typeof ButtonRestoreModel>;
  extraComponentsStart?: React.ReactNode;
  extraComponentsEnd?: React.ReactNode;
  buttonSuccessTestId?: string;
  buttonEditTestId?: string;
}

export function ModelActions({
  disabled,
  onSuccess,
  onEdit,
  deleteButton,
  restoreButton,
  extraComponentsStart,
  extraComponentsEnd,
  buttonSuccessTestId = "button-success",
  buttonEditTestId = "button-edit",
}: ModelActionsProps) {
  return (
    <div className="flex justify-center gap-2">
      {extraComponentsStart}
      {onSuccess && (
        <Button testId={buttonSuccessTestId} size="icon" variant="success" onClick={onSuccess} disabled={disabled}>
          <PlusIcon />
        </Button>
      )}
      {onEdit && (
        <Button testId={buttonEditTestId} size="icon" onClick={onEdit} disabled={disabled}>
          <EditIcon />
        </Button>
      )}
      {deleteButton && <ButtonDeleteModel disabled={disabled} {...deleteButton} />}
      {restoreButton && <ButtonRestoreModel disabled={disabled} {...restoreButton} />}
      {extraComponentsEnd}
    </div>
  );
}

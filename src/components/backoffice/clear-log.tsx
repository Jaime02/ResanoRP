import { useRouter } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
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
import { useAppContext } from "@/contexts/app-context";
import { clearErrorsLogFn } from "@/lib/backoffice-fns";
import {
  CLEAR_LOG_DESCRIPTION_MESSAGE,
  CLEAR_LOG_LABEL,
  CLEAR_LOG_TITLE,
  LOG_CLEARED_MESSAGE,
} from "@/messages/backoffice";

export default function DialogClearLog() {
  const { showToastOnTRPCMutation } = useAppContext();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger testId="button-clear-errors-log" className="self-end" onClick={() => setIsOpen(true)}>
        <Trash2Icon /> {CLEAR_LOG_LABEL}
      </AlertDialogTrigger>
      <AlertDialogContent data-testid="dialog-clear-log-content">
        <AlertDialogTitle>{CLEAR_LOG_TITLE}</AlertDialogTitle>
        <AlertDialogDescription>{CLEAR_LOG_DESCRIPTION_MESSAGE}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={() =>
              void showToastOnTRPCMutation({
                mutation: clearErrorsLogFn(),
                onSubmit: async () => router.invalidate(),
                onSuccess: { title: LOG_CLEARED_MESSAGE },
              })
            }
          >
            <Trash2Icon />
            {CLEAR_LOG_LABEL}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

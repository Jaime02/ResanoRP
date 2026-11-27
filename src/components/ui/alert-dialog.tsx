import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function AlertDialog({ ...props }: React.ComponentProps<typeof BaseAlertDialog.Root>) {
  return <BaseAlertDialog.Root {...props} />;
}

function AlertDialogAction({
  testId = "button-action",
  variant = "destructive",
  ...props
}: React.ComponentProps<typeof BaseAlertDialog.Close> & React.ComponentProps<typeof Button>) {
  return <BaseAlertDialog.Close render={<Button testId={testId} variant={variant} />} {...props} />;
}

function AlertDialogTitle({ ...props }: React.ComponentProps<typeof DialogTitle>) {
  return (
    <DialogHeader>
      <DialogTitle {...props} />
    </DialogHeader>
  );
}

export {
  AlertDialog,
  DialogTrigger as AlertDialogTrigger,
  DialogContent as AlertDialogContent,
  DialogFooter as AlertDialogFooter,
  DialogDescription as AlertDialogDescription,
  AlertDialogAction,
  AlertDialogTitle,
};

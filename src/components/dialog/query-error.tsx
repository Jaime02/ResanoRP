import { useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface DialogQueryErrorProps {
  testId?: string;
  title: string;
  errorMessage: string;
  onClose?: () => void;
}

export default function DialogQueryError({ testId, title, errorMessage, onClose }: DialogQueryErrorProps) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog
      open={open}
      onOpenChange={(newOpenState) => {
        setOpen(newOpenState);
        if (!newOpenState) {
          onClose?.();
        }
      }}
    >
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <DialogTitle className="text-destructive">{title}</DialogTitle>
        </DialogHeader>
        <DialogDescription>{errorMessage}</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

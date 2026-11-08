import { FileIcon } from "lucide-react";
import { useState } from "react";

import type { LayoutBlueprintViewerProps } from "@/components/pdf/layout-blueprint-viewer";
import LayoutBlueprintViewer from "@/components/pdf/layout-blueprint-viewer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BLUEPRINTS_TITLE } from "@/messages/blueprint";

interface DialogBlueprintViewerProps extends Pick<LayoutBlueprintViewerProps, "blueprints" | "pdfViewerClassName"> {
  testId?: string;
  title: string;
  // Controlled from outside and without trigger, for openers that unmount while the dialog is open, like popovers
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function DialogBlueprintViewer({
  testId,
  title,
  blueprints,
  pdfViewerClassName,
  open,
  onOpenChange,
}: DialogBlueprintViewerProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Dialog open={open ?? isOpen} onOpenChange={onOpenChange ?? setIsOpen}>
      {open === undefined && (
        <DialogTrigger
          testId="button-open-blueprints"
          aria-label={BLUEPRINTS_TITLE}
          variant="secondary"
          size="icon"
          disabled={blueprints === undefined || blueprints.length === 0}
          onClick={() => setIsOpen(true)}
        >
          <FileIcon />
        </DialogTrigger>
      )}
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <LayoutBlueprintViewer blueprints={blueprints} stackedFiles pdfViewerClassName={pdfViewerClassName} />
      </DialogContent>
    </Dialog>
  );
}

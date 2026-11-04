import { FileIcon } from "lucide-react";
import { useState } from "react";

import type { LayoutBlueprintViewerProps } from "@/components/pdf/layout-blueprint-viewer";
import LayoutBlueprintViewer from "@/components/pdf/layout-blueprint-viewer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface DialogBlueprintViewerProps extends Pick<LayoutBlueprintViewerProps, "blueprints" | "pdfViewerClassName"> {
  testId?: string;
  title: string;
}

export default function DialogBlueprintViewer({
  testId,
  title,
  blueprints,
  pdfViewerClassName,
}: DialogBlueprintViewerProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Dialog open={isOpen} onOpenChange={(newOpenState) => setIsOpen(newOpenState)}>
      <DialogTrigger
        variant="secondary"
        size="icon"
        disabled={blueprints === undefined || blueprints.length === 0}
        onClick={() => setIsOpen(true)}
      >
        <FileIcon />
      </DialogTrigger>
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <LayoutBlueprintViewer blueprints={blueprints} stackedFiles pdfViewerClassName={pdfViewerClassName} />
      </DialogContent>
    </Dialog>
  );
}

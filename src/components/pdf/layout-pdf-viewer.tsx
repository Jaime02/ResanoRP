import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BLUEPRINT_LABEL } from "@/messages/blueprint";
import { NEXT_PAGE_LABEL, NO_FILES_MESSAGE, PREVIOUS_PAGE_LABEL } from "@/messages/common";

interface LayoutPDFViewerProps<TBaseTypeFile = unknown> {
  files?: Array<TBaseTypeFile>;
  stackedFiles?: boolean;
  renderCard: (file: TBaseTypeFile, navigation?: React.ReactNode) => React.ReactElement;
  noFilesMessage?: string;
  layoutClassName?: string;
}

export default function LayoutPDFViewer<TBaseTypeFile>({
  files,
  stackedFiles = false,
  renderCard,
  noFilesMessage = NO_FILES_MESSAGE,
  layoutClassName,
}: LayoutPDFViewerProps<TBaseTypeFile>) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handlePrevious = () => {
    if (!files) {
      return;
    }
    setCurrentIndex((prev) => (prev === 0 ? files.length - 1 : prev - 1));
  };

  const handleNext = () => {
    if (!files) {
      return;
    }
    setCurrentIndex((prev) => (prev === files.length - 1 ? 0 : prev + 1));
  };

  if (!files || files.length === 0) {
    return (
      <div className="p-2 text-center text-red-500">
        <p>{noFilesMessage}</p>
      </div>
    );
  }

  if (stackedFiles) {
    const navigation =
      files.length > 1 ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            data-testid="button-previous-file"
            size="icon"
            aria-label={PREVIOUS_PAGE_LABEL}
            onClick={handlePrevious}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="min-w-[8ch] text-center text-sm whitespace-nowrap tabular-nums">
            {BLUEPRINT_LABEL} {currentIndex + 1}/{files.length}
          </span>
          <Button data-testid="button-next-file" size="icon" aria-label={NEXT_PAGE_LABEL} onClick={handleNext}>
            <ChevronRightIcon />
          </Button>
        </div>
      ) : undefined;
    return (
      <div className={cn("flex min-h-0 w-full flex-1 flex-row gap-2", layoutClassName)}>
        <div className="flex min-h-0 max-w-full flex-1 justify-center overflow-auto">
          {renderCard(files[currentIndex], navigation)}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("align-center flex flex-col flex-wrap justify-center gap-2 lg:flex-row", layoutClassName)}>
      {files.map((blueprint) => renderCard(blueprint))}
    </div>
  );
}

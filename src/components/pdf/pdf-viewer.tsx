import { Maximize2Icon, Minimize2Icon, RotateCwIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import type { ComponentType } from "react";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";

import PDFPagePlaceholder from "@/components/pdf/pdf-page-placeholder";
import type { PDFViewerClientProps } from "@/components/pdf/pdf-viewer-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import clientLog from "@/logging/clientLog";
import { LoggerLevels } from "@/logging/types";

let PDFViewerClient: ComponentType<PDFViewerClientProps>;

// oxlint-disable-next-line typescript/no-unnecessary-condition
if (import.meta.env?.VITE_ENV_NAME !== "test") {
  PDFViewerClient = lazy(async () =>
    import("./pdf-viewer-client").then((module) => ({ default: module.PDFViewerClient })),
  );
}

interface PDFViewerProps {
  url?: string;
  initialScale?: number;
  landscape?: boolean;
  fullScreen?: boolean;
  pdfViewerClassName?: string;
  renderHeader?: (toolbar: React.ReactNode, disabled: boolean) => React.ReactNode;
  fullScreenContent?: React.ReactNode;
  onFullScreenChange?: (isFullScreen: boolean) => void;
}

export default function PDFViewer({
  url,
  initialScale = 0.8,
  landscape = false,
  fullScreen,
  pdfViewerClassName,
  renderHeader,
  fullScreenContent,
  onFullScreenChange,
}: PDFViewerProps) {
  const [scale, setScale] = useState(initialScale);
  const [internalFullscreen, setInternalFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState(0);

  const isControlled = fullScreen !== undefined;
  const isFullscreen = isControlled ? fullScreen : internalFullscreen;

  const zoomIn = useCallback(() => {
    setScale((prev) => Math.round(Math.min(prev + 0.2, 3.0) * 10) / 10);
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.round(Math.max(prev - 0.2, 0.4) * 10) / 10);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = Boolean(document.fullscreenElement);
      if (!isControlled) {
        setInternalFullscreen(isCurrentlyFullscreen);
      }
      onFullScreenChange?.(isCurrentlyFullscreen);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [isControlled, onFullScreenChange]);

  useEffect(() => {
    if (!isControlled) {
      return;
    }
    const syncFullscreen = async () => {
      const isCurrentlyFullscreen = Boolean(document.fullscreenElement);
      if (fullScreen && !isCurrentlyFullscreen) {
        try {
          await containerRef.current?.requestFullscreen();
        } catch (err) {
          await clientLog(LoggerLevels.error, "Enabling fullscreen failed", { error: err });
        }
      } else if (!fullScreen && isCurrentlyFullscreen) {
        try {
          await document.exitFullscreen();
        } catch (err) {
          await clientLog(LoggerLevels.error, "Exiting fullscreen failed", { error: err });
        }
      }
    };
    void syncFullscreen();
  }, [fullScreen, isControlled]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      await clientLog(LoggerLevels.error, "Enabling fullscreen failed", { error: err });
    }
  }, []);

  const rotateDocument = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  if (isControlled && !fullScreen) {
    return null;
  }

  const disabled = loading || error !== null;

  const toolbar = (
    <PDFViewerToolbar
      fullScreen={false}
      zoomIn={zoomIn}
      zoomOut={zoomOut}
      toggleFullscreen={toggleFullscreen}
      rotateDocument={rotateDocument}
      disabled={disabled}
      scale={scale}
    />
  );

  return (
    <div className="flex h-full max-h-[80vh] min-h-0 flex-1 flex-col items-center gap-1">
      {!isFullscreen && (renderHeader ? renderHeader(toolbar, disabled) : toolbar)}
      <div
        ref={containerRef}
        className={cn(
          "relative flex min-h-0 max-w-[70vw] min-w-0 flex-1 resize flex-col gap-2 space-y-2 overflow-auto border bg-background p-4",
          pdfViewerClassName,
        )}
      >
        {isFullscreen && (
          <PDFViewerToolbar
            fullScreen
            zoomIn={zoomIn}
            zoomOut={zoomOut}
            toggleFullscreen={toggleFullscreen}
            rotateDocument={rotateDocument}
            disabled={loading || error !== null}
            scale={scale}
          />
        )}
        {isFullscreen && fullScreenContent}
        <Suspense fallback={<PDFPagePlaceholder scale={scale} landscape={landscape} />}>
          {import.meta.env.VITE_ENV_NAME !== "test" && (
            <PDFViewerClient
              url={url}
              scale={scale}
              rotation={rotation}
              landscape={landscape}
              setLoading={setLoading}
              setError={setError}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}

interface PDFViewerToolbarProps {
  className?: string;
  fullScreen?: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  toggleFullscreen: () => Promise<void>;
  rotateDocument: () => void;
  disabled: boolean;
  scale: number;
}

function PDFViewerToolbar({
  className,
  fullScreen = false,
  zoomIn,
  zoomOut,
  toggleFullscreen,
  rotateDocument,
  disabled,
  scale,
}: PDFViewerToolbarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        fullScreen ? "fixed top-4 right-6 z-20 flex-col-reverse" : "flex-row",
        className,
      )}
    >
      <Button size="icon" variant="secondary" onClick={zoomOut} disabled={disabled}>
        <ZoomOutIcon />
      </Button>
      <span className="w-[4ch] text-center text-sm text-muted-foreground">{`${Math.round(scale * 100)}%`}</span>
      <Button size="icon" variant="secondary" onClick={zoomIn} disabled={disabled}>
        <ZoomInIcon />
      </Button>
      <Button size="icon" variant="secondary" onClick={rotateDocument} disabled={disabled}>
        <RotateCwIcon />
      </Button>
      <Button size="icon" variant="secondary" onClick={() => void toggleFullscreen()} disabled={disabled}>
        {fullScreen ? <Minimize2Icon /> : <Maximize2Icon />}
      </Button>
    </div>
  );
}

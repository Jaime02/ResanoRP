import { FileXIcon } from "lucide-react";
import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import PDFPagePlaceholder from "@/components/pdf/pdf-page-placeholder";
import clientLog from "@/logging/clientLog";
import { LoggerLevels } from "@/logging/types";
import { PDF_LOAD_ERROR_MESSAGE } from "@/messages/common";

import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const documentOptions = { wasmUrl: "/pdfjs-wasm/" };

export interface PDFViewerClientProps {
  url: string;
  scale: number;
  rotation: number;
  landscape: boolean;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export function PDFViewerClient({ url, scale, rotation, landscape, setLoading, setError }: PDFViewerClientProps) {
  const [pagesCount, setPagesCount] = useState(0);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setPagesCount(numPages);
    setLoading(false);
    setError(null);
  }

  async function onDocumentLoadError(error: Error) {
    await clientLog(LoggerLevels.error, "Failed to load PDF", { error });
    setError(error.message);
    setLoading(false);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <Document
        file={url}
        options={documentOptions}
        suspense={false}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        onLoadProgress={() => {
          setLoading(true);
        }}
        className="flex flex-col gap-4"
        loading={<PDFPagePlaceholder scale={scale} landscape={landscape} />}
        error={
          <PDFPagePlaceholder scale={scale} landscape={landscape}>
            <FileXIcon className="size-16 text-destructive" />
            <p className="font-semibold text-destructive">{PDF_LOAD_ERROR_MESSAGE}</p>
          </PDFPagePlaceholder>
        }
      >
        {Array.from(new Array(pagesCount), (_, index) => (
          <Page
            key={index}
            pageNumber={index + 1}
            scale={scale}
            rotate={rotation}
            renderAnnotationLayer
            renderTextLayer
            loading={<PDFPagePlaceholder scale={scale} landscape={landscape} />}
            className="shadow-xl outline outline-border"
          />
        ))}
      </Document>
    </div>
  );
}

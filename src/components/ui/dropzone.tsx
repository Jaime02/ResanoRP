import { UploadIcon, XIcon } from "lucide-react";
import { useRef } from "react";
import { useDropzone } from "react-dropzone";
import type { DropEvent, DropzoneOptions, FileRejection } from "react-dropzone";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CLEAR_SELECTION_LABEL, DROP_FILE_PLACEHOLDER, getDropFilesPlaceholder } from "@/messages/common";

export type DropzoneProps = Omit<DropzoneOptions, "onDrop"> & {
  id?: string;
  testId?: string;
  filterFieldName: string;
  required?: boolean;
  allowMultipleFiles?: boolean;
  src?: Array<File> | File | null;
  onDrop?: (acceptedFiles: Array<File>, fileRejections: Array<FileRejection>, event: DropEvent) => void;
  onClear?: () => void;
};

export function Dropzone({
  id,
  testId,
  filterFieldName,
  required = false,
  accept,
  allowMultipleFiles = false,
  maxFiles = 1,
  maxSize,
  minSize,
  onError,
  src,
  disabled = false,
  onDrop,
  onClear,
  ...props
}: DropzoneProps) {
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    disabled,
    maxFiles,
    maxSize,
    minSize,
    multiple: allowMultipleFiles,
    onDrop: (acceptedFiles, fileRejections, event) => {
      if (fileRejections.length > 0) {
        const message = fileRejections.at(0)?.errors.at(0)?.message;
        onError?.(new Error(message));
        return;
      }
      if (hiddenInputRef.current) {
        // Note the specific way we need to munge the file into the hidden input
        // https://stackoverflow.com/a/68182158/1068446
        const dataTransfer = new DataTransfer();
        acceptedFiles.forEach((v) => {
          dataTransfer.items.add(v);
        });
        hiddenInputRef.current.files = dataTransfer.files;
      }
      onDrop?.(acceptedFiles, fileRejections, event);
    },
    onError,
    ...props,
  });
  const files = src == null ? [] : Array.isArray(src) ? src : [src];

  return (
    <div
      id={id}
      data-testid={testId}
      data-input-type="dropzone"
      className="flex w-base-input flex-row items-center gap-1"
    >
      {!disabled && (
        <>
          <Button
            className={cn(
              "min-w-0 grow justify-start text-left whitespace-normal",
              isDragActive && "ring-1 ring-ring outline-none",
            )}
            {...getRootProps()}
          >
            <UploadIcon />
            <span className="min-w-0 wrap-anywhere">
              {files.length > 0
                ? new Intl.ListFormat("es").format(files.map((file) => file.name))
                : maxFiles === 1
                  ? DROP_FILE_PLACEHOLDER
                  : getDropFilesPlaceholder(maxFiles)}
            </span>
            <input
              data-testid="input-hidden"
              type="file"
              name={filterFieldName}
              required={required}
              className="hidden"
              ref={hiddenInputRef}
            />
            <input data-testid="input-visible" {...getInputProps()} />
          </Button>
          {onClear && files.length > 0 && (
            <Button
              testId="button-clear"
              aria-label={CLEAR_SELECTION_LABEL}
              size="icon"
              variant="destructive"
              onClick={() => {
                if (hiddenInputRef.current) {
                  hiddenInputRef.current.value = "";
                }
                onClear();
              }}
            >
              <XIcon />
            </Button>
          )}
        </>
      )}
    </div>
  );
}

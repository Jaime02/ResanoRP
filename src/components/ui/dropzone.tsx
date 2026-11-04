import { UploadIcon } from "lucide-react";
import { useRef } from "react";
import { useDropzone } from "react-dropzone";
import type { DropEvent, DropzoneOptions, FileRejection } from "react-dropzone";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const maxLabelItems = 3;

export type DropzoneProps = Omit<DropzoneOptions, "onDrop"> & {
  id?: string;
  testId?: string;
  filterFieldName: string;
  required?: boolean;
  allowMultipleFiles?: boolean;
  src?: Array<File> | File;
  onDrop?: (acceptedFiles: Array<File>, fileRejections: Array<FileRejection>, event: DropEvent) => void;
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
  let caption = "";
  /*if (accept) {
    caption += "Formatos aceptados: ";
    caption += new Intl.ListFormat("es").format(Object.keys(accept).map((type) => type.split("/").at(1) ?? type));
  }*/

  if (minSize !== undefined && maxSize !== undefined) {
    caption += ` de entre ${renderBytes(minSize)} y ${renderBytes(maxSize)}`;
  } else if (minSize !== undefined) {
    caption += ` de al menos ${renderBytes(minSize)}`;
  } else if (maxSize !== undefined) {
    caption += ` de menos de ${renderBytes(maxSize)}`;
  }

  return (
    <div id={id} data-testid={testId} data-input-type="dropzone" className="flex w-base-input min-w-fit flex-col gap-2">
      {!disabled && (
        <Button
          className={cn("flex-col gap-0 px-2", isDragActive && "ring-1 ring-ring outline-none")}
          size="unstyled"
          {...getRootProps()}
        >
          <div className="flex flex-col items-center justify-center gap-1 p-2">
            <div className="flex items-center justify-center">
              <UploadIcon className="size-icon-sm" />
            </div>
            <p className="w-full">
              {src
                ? Array.isArray(src)
                  ? src.length > maxLabelItems
                    ? `${new Intl.ListFormat("es").format(
                        src.slice(0, maxLabelItems).map((file) => file.name),
                      )} y ${src.length - maxLabelItems} más`
                    : new Intl.ListFormat("es").format(src.map((file) => file.name))
                  : src.name
                : `Arrastra o selecciona ${maxFiles === 1 ? "un archivo" : `hasta ${maxFiles} archivos`}`}
            </p>
            {caption && <p className="text-sm text-wrap">{caption}</p>}
          </div>
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
      )}
    </div>
  );
}

function renderBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)}${units[unitIndex]}`;
}

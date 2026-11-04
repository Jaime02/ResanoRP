import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  isValid?: boolean;
}

export function Textarea({ className, isValid = true, ...props }: TextareaProps) {
  return (
    <textarea
      data-input-type="textarea"
      className={cn(
        "resize rounded-md outline-none dark:bg-border/30",
        "selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        "flex field-sizing-content min-h-10 w-base-input max-w-full px-3 py-2",
        "border-2 border-primary disabled:border disabled:border-border",
        props.readOnly === true || props.disabled === true
          ? "cursor-not-allowed border-border bg-muted"
          : "bg-background shadow-md transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/70",
        className,
      )}
      aria-invalid={!isValid}
      {...props}
    />
  );
}

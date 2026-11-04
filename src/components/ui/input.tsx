import { useRef } from "react";

import { goToNextFocusableElement } from "@/form/utils";
import { cn } from "@/lib/utils";

export interface InputProps extends Omit<React.ComponentProps<"input">, "value" | "disabled"> {
  testId?: string;
  isValid?: boolean;
  value?: React.ComponentProps<"input">["value"] | null;
}

export function Input({ testId, className, isValid = true, value, ...props }: InputProps) {
  const ref = useRef<HTMLInputElement | null>(null);

  return (
    <input
      data-testid={testId}
      ref={ref}
      data-input-type="input"
      className={cn(
        "field-sizing-content rounded-md outline-none dark:bg-border/30",
        "selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/60",
        "h-10 w-base-input max-w-full px-3 py-2",
        "border-2 border-primary disabled:border disabled:border-border",
        props.readOnly === true
          ? "cursor-not-allowed border-border bg-muted"
          : "bg-background shadow-md transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/70",
        className,
      )}
      aria-invalid={!isValid}
      onKeyDown={(e) => goToNextFocusableElement(ref, e)}
      value={value ?? ""}
      {...props}
    />
  );
}

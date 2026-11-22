import type { VariantProps } from "class-variance-authority";
import * as React from "react";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  testId?: string;
  clickable?: boolean;
}

function Button({
  testId,
  className,
  variant,
  size,
  clickable = true,
  disabled = false,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-clickable={clickable && !disabled}
      disabled={disabled}
      className={cn(buttonVariants({ size, variant }), className)}
      {...props}
    >
      {joinAdjacentText(children).map((child, index): React.ReactNode =>
        isText(child) && String(child).trim() !== "" ? (
          <span key={index} className="truncate">
            {child}
          </span>
        ) : (
          child
        ),
      )}
    </button>
  );
}

function isText(child: unknown): child is string | number {
  return typeof child === "string" || typeof child === "number";
}

// `Albarán {id}` comes as two children, which must stay one text, or the gap splits them and each one truncates apart
function joinAdjacentText(children: React.ReactNode) {
  return React.Children.toArray(children).reduce<Array<React.ReactNode>>((joined, child) => {
    const previous = joined.at(-1);
    if (isText(child) && isText(previous)) {
      joined[joined.length - 1] = `${previous}${child}`;
    } else {
      joined.push(child);
    }
    return joined;
  }, []);
}

export { Button };
export type { ButtonProps };

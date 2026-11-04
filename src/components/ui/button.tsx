import type { VariantProps } from "class-variance-authority";
import * as React from "react";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  testId?: string;
  clickable?: boolean;
}

function Button({ testId, className, variant, size, clickable = true, disabled = false, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-clickable={clickable && !disabled}
      disabled={disabled}
      className={cn(buttonVariants({ size, variant }), className)}
      {...props}
    />
  );
}

export { Button };
export type { ButtonProps };

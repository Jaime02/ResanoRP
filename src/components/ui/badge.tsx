import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";
import { NO_ITEMS_MESSAGE } from "@/messages/common";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-2 overflow-hidden rounded-full border px-2 py-1 whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/70 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none",
  {
    defaultVariants: {
      variant: "default",
      size: "default",
    },
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        destructive:
          "border-transparent bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline: "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
      },
      size: {
        default: "h-10 px-4 py-2 [&>svg]:size-6",
        lg: "h-12 px-5 text-xl [&>svg]:size-8",
      },
    },
  },
);

function Badge({
  testId,
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { testId?: string }) {
  return <span className={cn(badgeVariants({ variant, size }), className)} data-testid={testId} {...props} />;
}

function BadgeList({
  className,
  orientation = "horizontal",
  noChildrenText = NO_ITEMS_MESSAGE,
  children,
}: {
  className?: string;
  orientation?: "horizontal" | "vertical";
  noChildrenText?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", orientation === "vertical" ? "flex-col" : "flex-row", className)}>
      {children}
      {children !== undefined && React.Children.count(children) > 0 ? null : (
        <span className="text-muted-foreground">{noChildrenText}</span>
      )}
    </div>
  );
}

export { Badge, BadgeList };

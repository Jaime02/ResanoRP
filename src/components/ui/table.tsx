import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";

import DisabledMessage from "@/components/ui/disabled-message";
import { cn } from "@/lib/utils";

const BORDER_CLASS_NAME = "rounded-md border border-border";

const tableVariants = cva("relative isolate max-w-full border-collapse overflow-auto", {
  defaultVariants: {
    variant: "default",
  },
  variants: {
    variant: {
      default: "",
      ghost: "",
    },
  },
});

export interface TableProps extends React.ComponentProps<"table">, VariantProps<typeof tableVariants> {
  testId?: string;
  disabledMessage?: string;
  tableClassName?: string;
  scrollable?: boolean;
}

function Table({
  testId,
  className,
  tableClassName,
  variant,
  disabledMessage,
  scrollable = false,
  ...props
}: TableProps) {
  return (
    <div
      data-testid={testId}
      className={cn(tableVariants({ className, variant }), !scrollable && BORDER_CLASS_NAME)}
      inert={disabledMessage !== undefined}
    >
      <table className={cn("w-full caption-bottom", tableClassName)} {...props} />
      {disabledMessage !== undefined && <DisabledMessage>{disabledMessage}</DisabledMessage>}
    </div>
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("border-border [&_tr]:border-b", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&>tr:last-child]:border-0", className)} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return <tfoot className={cn("border-t border-border font-medium [&>tr]:last:border-b-0", className)} {...props} />;
}

const tableRowVariants = cva(
  "border-b border-border [&[data-highlight-on-hover]]:transition-colors [&[data-highlight-on-hover]:not(:has(input:focus))]:hover:bg-accent [&[data-selected]]:outline-2 [&[data-selected]]:-outline-offset-2 [&[data-selected]]:outline-primary",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      compact: {
        true: "[&>td]:h-auto",
      },
      variant: {
        default: "bg-tr-background [tbody>&:nth-child(odd_of_[data-row-type=row])]:bg-blue-100/80",
        plain: "bg-transparent",
        subrow: "bg-tr-subrow-background",
        urgent: "bg-red-200 dark:bg-red-950",
      },
    },
  },
);

interface TableRowProps extends React.ComponentProps<"tr">, VariantProps<typeof tableRowVariants> {
  testId?: string;
  highlightOnHover?: boolean;
  selected?: boolean;
  rowType?: "row" | "subrow";
}

function TableRow({
  testId,
  highlightOnHover = false,
  selected = false,
  className,
  rowType = "row",
  variant,
  compact,
  ...props
}: TableRowProps) {
  return (
    <tr
      data-testid={testId}
      data-row-type={rowType}
      data-variant={variant}
      {...(selected ? { "data-selected": true } : {})}
      {...(highlightOnHover ? { "data-highlight-on-hover": true } : {})}
      className={tableRowVariants({ className, compact, variant })}
      {...props}
    />
  );
}

function TableHeader({
  className,
  canBeResized = false,
  ...props
}: React.ComponentProps<"th"> & { canBeResized?: boolean }) {
  return (
    <th
      className={cn(
        "relative p-2 text-left align-bottom font-medium whitespace-nowrap text-foreground",
        canBeResized && "pr-4 [&+th]:pl-4",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ testId, className, ...props }: React.ComponentProps<"td"> & { testId?: string }) {
  return (
    <td
      data-testid={testId}
      className={cn(
        "overflow-hidden border-r border-border px-1.5 py-(--cell-py) text-nowrap text-ellipsis [--cell-py:--spacing(1)] last:border-r-0",
        // Rows without a button are as tall as those with one
        "h-[calc(--theme(--size-icon)+2*var(--cell-py))]",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption className={cn("mt-4 text-muted-foreground", className)} {...props} />;
}

export { Table, TableHead, TableBody, TableFooter, TableRow, TableHeader, TableCell, TableCaption };

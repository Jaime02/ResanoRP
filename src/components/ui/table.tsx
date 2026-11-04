import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";

import DisabledMessage from "@/components/ui/disabled-message";
import { cn } from "@/lib/utils";

const tableVariants = cva("relative max-w-full border-collapse overflow-auto rounded-md border border-border", {
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
}

function Table({ testId, className, tableClassName, variant, disabledMessage, ...props }: TableProps) {
  return (
    <div
      data-testid={testId}
      className={cn(tableVariants({ className, variant }))}
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
  return (
    <tbody
      className={cn(
        "[&>tr:last-child]:border-0 [&>tr:nth-child(odd_of_[data-row-type=row])]:bg-blue-100/80 [&>tr[data-highlight-on-hover]]:transition-colors [&>tr[data-highlight-on-hover]:not(:has(input:focus))]:hover:bg-accent",
        className,
      )}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return <tfoot className={cn("border-t border-border font-medium [&>tr]:last:border-b-0", className)} {...props} />;
}

const tableRowVariants = cva("border-b border-border", {
  defaultVariants: {
    variant: "default",
  },
  variants: {
    variant: {
      default: "bg-tr-background",
      subrow: "bg-tr-subrow-background",
    },
  },
});

interface TableRowProps extends React.ComponentProps<"tr">, VariantProps<typeof tableRowVariants> {
  testId?: string;
  highlightOnHover?: boolean;
  rowType?: "row" | "subrow";
}

function TableRow({ testId, highlightOnHover = false, className, rowType = "row", variant, ...props }: TableRowProps) {
  return (
    <tr
      data-testid={testId}
      data-row-type={rowType}
      {...(highlightOnHover ? { "data-highlight-on-hover": true } : {})}
      className={tableRowVariants({ className, variant })}
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
      className={cn("overflow-hidden border-r border-border p-2 text-nowrap text-ellipsis last:border-r-0", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption className={cn("mt-4 text-muted-foreground", className)} {...props} />;
}

export { Table, TableHead, TableBody, TableFooter, TableRow, TableHeader, TableCell, TableCaption };

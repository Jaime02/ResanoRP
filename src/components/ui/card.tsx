import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";

import DisabledMessage from "@/components/ui/disabled-message";
import Header from "@/components/ui/header";
import { cn } from "@/lib/utils";

const cardVariants = cva("relative mx-auto flex h-fit w-fit max-w-full flex-col gap-2 bg-card text-card-foreground", {
  defaultVariants: {
    variant: "default",
  },
  variants: {
    variant: {
      default: "rounded-xl border border-border p-3",
      frameless: "",
      primary: "rounded-xl bg-primary p-3 text-primary-foreground shadow-lg",
    },
  },
});

interface CardProps extends React.ComponentProps<"div">, VariantProps<typeof cardVariants> {
  disabledMessage?: string;
}

function Card({ className, variant, disabledMessage, children, ...props }: CardProps) {
  return (
    <div className={cn(cardVariants({ variant }), className)} inert={disabledMessage !== undefined} {...props}>
      {children}
      {disabledMessage !== undefined && <DisabledMessage>{disabledMessage}</DisabledMessage>}
    </div>
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid auto-rows-min grid-cols-[1fr_auto] items-center gap-2", className)} {...props} />;
}

function CardTitle({ level = 2, ...props }: React.ComponentProps<typeof Header>) {
  return <Header level={level} {...props} />;
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("col-start-2 row-start-1 flex flex-row gap-2 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-row flex-wrap items-center gap-2", className)} {...props} />;
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction };

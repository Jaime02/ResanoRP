import { Separator as BaseSeparator } from "@base-ui/react/separator";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const separatorVariants = cva(
  "shrink-0 rounded-md bg-border data-[orientation=horizontal]:w-full data-[orientation=vertical]:self-stretch",
  {
    defaultVariants: { thickness: "default" },
    variants: {
      thickness: {
        default: "data-[orientation=horizontal]:h-0.75 data-[orientation=vertical]:w-0.75",
        thin: "data-[orientation=horizontal]:h-0.5 data-[orientation=vertical]:w-0.5",
      },
    },
  },
);

function Separator({
  className,
  thickness,
  ...props
}: React.ComponentProps<typeof BaseSeparator> & VariantProps<typeof separatorVariants>) {
  return <BaseSeparator className={cn(separatorVariants({ thickness }), className)} {...props} />;
}

export { Separator };

import { Separator as BaseSeparator } from "@base-ui/react/separator";
import * as React from "react";

import { cn } from "@/lib/utils";

function Separator({ className, ...props }: React.ComponentProps<typeof BaseSeparator>) {
  return (
    <BaseSeparator
      className={cn(
        "shrink-0 rounded-md bg-border data-[orientation=horizontal]:h-0.75 data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-0.75 data-[orientation=vertical]:self-stretch",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };

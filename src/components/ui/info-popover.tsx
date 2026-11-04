import { Popover as BasePopover } from "@base-ui/react/popover";
import { InfoIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

function InfoPopoverTrigger({
  children,
  className,
  Icon = InfoIcon,
  ...props
}: React.ComponentProps<typeof BasePopover.Trigger> & { Icon?: LucideIcon }) {
  return (
    <BasePopover.Trigger
      className={cn("flex cursor-help flex-row items-center gap-1", className)}
      openOnHover
      delay={100}
      {...props}
    >
      {children}
      <Icon
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
        }}
      />
    </BasePopover.Trigger>
  );
}

export { InfoPopoverTrigger };

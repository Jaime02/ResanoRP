import { Collapsible as BaseCollapsible } from "@base-ui/react/collapsible";
import { ChevronRightIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Collapsible({
  open,
  defaultOpen = false,
  onOpenChange,
  disabled,
  ...props
}: React.ComponentProps<typeof BaseCollapsible.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  if (disabled === true && uncontrolledOpen) setUncontrolledOpen(false);

  return (
    <BaseCollapsible.Root
      open={disabled !== true && (open ?? uncontrolledOpen)}
      onOpenChange={(nextOpen, eventDetails) => {
        setUncontrolledOpen(nextOpen);
        onOpenChange?.(nextOpen, eventDetails);
      }}
      disabled={disabled}
      {...props}
    />
  );
}

function CollapsibleTrigger({ ...props }: React.ComponentProps<typeof BaseCollapsible.Trigger>) {
  return (
    <BaseCollapsible.Trigger
      {...props}
      render={(_props, state) => (
        <Button size="icon" {..._props}>
          <ChevronRightIcon
            {...(state.open ? { "data-open": true } : {})}
            className="transition-all ease-out data-open:rotate-90"
          />
        </Button>
      )}
    />
  );
}

function CollapsibleContent({ className, ...props }: React.ComponentProps<typeof BaseCollapsible.Panel>) {
  return (
    <BaseCollapsible.Panel
      className={cn(
        "flex h-(--collapsible-panel-height) flex-col gap-2 overflow-hidden transition-all duration-150 ease-out data-ending-style:h-0 data-starting-style:h-0",
        "[&[hidden]:not([hidden='until-found'])]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };

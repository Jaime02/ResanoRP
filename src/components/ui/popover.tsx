import { Popover as BasePopover } from "@base-ui/react/popover";
import React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Popover({ ...props }: React.ComponentProps<typeof BasePopover.Root>) {
  return <BasePopover.Root {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof BasePopover.Trigger> & React.ComponentProps<typeof Button>) {
  return <BasePopover.Trigger render={(_props) => <Button testId="popover-trigger" {..._props} />} {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  side,
  ...props
}: React.ComponentProps<typeof BasePopover.Popup> &
  Pick<React.ComponentProps<typeof BasePopover.Positioner>, "align" | "side">) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner sideOffset={8} align={align} side={side}>
        <BasePopover.Popup
          data-testid="popover-content"
          className={cn(
            "flex origin-(--transform-origin) flex-col gap-2 rounded-lg bg-background p-4 shadow-dialog dark:shadow-none",
            "transition-[transform,scale,opacity] data-ending-style:scale-90 data-ending-style:opacity-0 data-starting-style:scale-90 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        >
          {props.children}
          <BasePopover.Arrow className="data-[side=bottom]:-top-2 data-[side=left]:-right-3.25 data-[side=left]:rotate-90 data-[side=right]:-left-3.25 data-[side=right]:-rotate-90 data-[side=top]:-bottom-2 data-[side=top]:rotate-180">
            <ArrowSvg />
          </BasePopover.Arrow>
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

function ArrowSvg(props: React.ComponentProps<"svg">) {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" fill="none" {...props}>
      <path
        d="M9.66437 2.60207L4.80758 6.97318C4.07308 7.63423 3.11989 8 2.13172 8H0V10H20V8H18.5349C17.5468 8 16.5936 7.63423 15.8591 6.97318L11.0023 2.60207C10.622 2.2598 10.0447 2.25979 9.66437 2.60207Z"
        className="fill-background"
      />
    </svg>
  );
}

export { Popover, PopoverTrigger, PopoverContent };

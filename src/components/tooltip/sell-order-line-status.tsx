import { InfoPopoverTrigger } from "@/components/ui/info-popover";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { getSellOrderLineStatusDisplay } from "@/lib/sell-order-line";
import { cn } from "@/lib/utils";
import type { SellOrderLineStatus } from "@/schemas/sell-order-line";

interface TooltipSellOrderLineStatusProps {
  status: SellOrderLineStatus;
}

export default function TooltipSellOrderLineStatus({ status }: TooltipSellOrderLineStatusProps) {
  const { statusText, statusClassName, tooltipDescription } = getSellOrderLineStatusDisplay(status);

  if (tooltipDescription === null) {
    return <span className={cn("font-bold", statusClassName)}>{statusText}</span>;
  }

  return (
    <Popover>
      <InfoPopoverTrigger className={cn("font-bold", statusClassName)}>{statusText}</InfoPopoverTrigger>
      <PopoverContent>{tooltipDescription}</PopoverContent>
    </Popover>
  );
}

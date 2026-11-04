import { InfoPopoverTrigger } from "@/components/ui/info-popover";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { STATUS_COMPLETED_LABEL, STATUS_DELETED_LABEL, STATUS_PENDING_LABEL, UNKNOWN_LABEL } from "@/messages/common";
import {
  SELL_ORDER_STATUS_CLIENT_DELETED_LABEL,
  SELL_ORDER_STATUS_CLIENT_DELETED_TOOLTIP_MESSAGE,
  SELL_ORDER_STATUS_COMPLETED_TOOLTIP_MESSAGE,
  SELL_ORDER_STATUS_DELETED_TOOLTIP_MESSAGE,
  SELL_ORDER_STATUS_PENDING_TOOLTIP_MESSAGE,
} from "@/messages/sell-order";
import { SellOrderStatus } from "@/schemas/sell-order";

interface TooltipSellOrderStatusProps {
  status?: SellOrderStatus;
}

export default function TooltipSellOrderStatus({ status }: TooltipSellOrderStatusProps) {
  let statusText: string;
  let statusClassName: string;
  let tooltipDescription: string | null;

  if (status === SellOrderStatus.Deleted) {
    statusText = STATUS_DELETED_LABEL;
    statusClassName = "text-status-error";
    tooltipDescription = SELL_ORDER_STATUS_DELETED_TOOLTIP_MESSAGE;
  } else if (status === SellOrderStatus.ClientDeleted) {
    statusText = SELL_ORDER_STATUS_CLIENT_DELETED_LABEL;
    statusClassName = "text-status-error";
    tooltipDescription = SELL_ORDER_STATUS_CLIENT_DELETED_TOOLTIP_MESSAGE;
  } else if (status === SellOrderStatus.Pending) {
    statusText = STATUS_PENDING_LABEL;
    statusClassName = "text-status-warning";
    tooltipDescription = SELL_ORDER_STATUS_PENDING_TOOLTIP_MESSAGE;
  } else if (status === SellOrderStatus.Completed) {
    statusText = STATUS_COMPLETED_LABEL;
    statusClassName = "text-success";
    tooltipDescription = SELL_ORDER_STATUS_COMPLETED_TOOLTIP_MESSAGE;
  } else {
    statusText = UNKNOWN_LABEL;
    statusClassName = "text-status-neutral";
    tooltipDescription = null;
  }

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

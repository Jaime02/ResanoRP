import { InfoPopoverTrigger } from "@/components/ui/info-popover";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { translatedEnums } from "@/lib/translations";
import { cn } from "@/lib/utils";
import {
  PRODUCTION_STATUS_COMPLETED_TOOLTIP_MESSAGE,
  PRODUCTION_STATUS_DELETED_TOOLTIP_MESSAGE,
  PRODUCTION_STATUS_IN_PRODUCTION_TOOLTIP_MESSAGE,
  PRODUCTION_STATUS_IN_TREATMENT_TOOLTIP_MESSAGE,
  PRODUCTION_STATUS_PENDING_TOOLTIP_MESSAGE,
  PRODUCTION_STATUS_PENDING_TREATMENT_TOOLTIP_MESSAGE,
  PRODUCTION_STATUS_SELL_ORDER_DELETED_TOOLTIP_MESSAGE,
  PRODUCTION_STATUS_SELL_ORDER_LINE_DELETED_TOOLTIP_MESSAGE,
} from "@/messages/production-order";
import { ProductionOrderStatus } from "@/schemas/production-order";

interface TooltipProductionOrderStatusProps {
  status: ProductionOrderStatus;
}

export default function TooltipProductionOrderStatus({ status }: TooltipProductionOrderStatusProps) {
  let statusClassName: string;
  let tooltipDescription: string;

  const statusText = translatedEnums.ProductionOrderStatus[status];

  if (status === ProductionOrderStatus.Pending) {
    statusClassName = "text-status-neutral";
    tooltipDescription = PRODUCTION_STATUS_PENDING_TOOLTIP_MESSAGE;
  } else if (status === ProductionOrderStatus.InProduction) {
    statusClassName = "text-primary";
    tooltipDescription = PRODUCTION_STATUS_IN_PRODUCTION_TOOLTIP_MESSAGE;
  } else if (status === ProductionOrderStatus.PendingTreatment) {
    statusClassName = "text-status-warning";
    tooltipDescription = PRODUCTION_STATUS_PENDING_TREATMENT_TOOLTIP_MESSAGE;
  } else if (status === ProductionOrderStatus.InTreatment) {
    statusClassName = "text-primary";
    tooltipDescription = PRODUCTION_STATUS_IN_TREATMENT_TOOLTIP_MESSAGE;
  } else if (status === ProductionOrderStatus.Completed) {
    statusClassName = "text-success";
    tooltipDescription = PRODUCTION_STATUS_COMPLETED_TOOLTIP_MESSAGE;
  } else if (status === ProductionOrderStatus.SellOrderLineDeleted) {
    statusClassName = "text-status-error";
    tooltipDescription = PRODUCTION_STATUS_SELL_ORDER_LINE_DELETED_TOOLTIP_MESSAGE;
  } else if (status === ProductionOrderStatus.SellOrderDeleted) {
    statusClassName = "text-status-error";
    tooltipDescription = PRODUCTION_STATUS_SELL_ORDER_DELETED_TOOLTIP_MESSAGE;
  } else {
    statusClassName = "text-status-error";
    tooltipDescription = PRODUCTION_STATUS_DELETED_TOOLTIP_MESSAGE;
  }

  return (
    <Popover>
      <InfoPopoverTrigger className={cn("font-bold", statusClassName)}>{statusText}</InfoPopoverTrigger>
      <PopoverContent>{tooltipDescription}</PopoverContent>
    </Popover>
  );
}

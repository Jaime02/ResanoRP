import TooltipSellOrderLineStatus from "@/components/tooltip/sell-order-line-status";
import type { TUseSellOrderStatusProps } from "@/form/hooks/use-sell-order";
import { useSellOrderLineStatus } from "@/form/hooks/use-sell-order";

export function TableCellSellOrderLineStatus(props: TUseSellOrderStatusProps) {
  const status = useSellOrderLineStatus(props);
  return <TooltipSellOrderLineStatus status={status} />;
}

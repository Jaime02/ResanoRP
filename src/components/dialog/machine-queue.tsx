import { KeyboardMusicIcon, ListIcon } from "lucide-react";

import TableMachineProductionOrderQueue from "@/components/table/machine-production-order-queue";
import ButtonLink from "@/components/ui/button-link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAppContext } from "@/contexts/app-context";
import {
  PRODUCTION_ORDERS_LABEL,
  QUEUE_LABEL,
  QUEUE_PRIORITY_MESSAGE,
  QUEUE_TITLE_PREFIX,
} from "@/messages/production-order";
import type { TMachineProductionOrderQueueItem } from "@/queries/machine";

interface DialogMachineProductionOrderQueueProps extends React.ComponentProps<typeof Dialog> {
  activeProductionOrderId?: number;
  productionOrdersQueue?: Array<TMachineProductionOrderQueueItem>;
  isLoading: boolean;
}

export default function DialogMachineProductionOrderQueue({
  activeProductionOrderId,
  productionOrdersQueue,
  isLoading,
  ...props
}: DialogMachineProductionOrderQueueProps) {
  const { userModeMachine } = useAppContext();

  return (
    <Dialog {...props}>
      <DialogTrigger
        testId="button-dialog-trigger-machine-production-order-queue"
        variant="secondary"
        disabled={isLoading}
      >
        <ListIcon className="size-icon-sm" />
        {QUEUE_LABEL}
      </DialogTrigger>
      <DialogContent data-testid="dialog-content-machine-production-order-queue">
        <DialogHeader closable={activeProductionOrderId !== undefined}>
          <DialogTitle>
            {QUEUE_TITLE_PREFIX} {userModeMachine?.name ?? "..."}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription>{QUEUE_PRIORITY_MESSAGE}</DialogDescription>
        <TableMachineProductionOrderQueue
          productionOrdersQueue={productionOrdersQueue}
          activeProductionOrderId={activeProductionOrderId}
          isLoading={isLoading}
        />
        <DialogFooter>
          <ButtonLink to="/production-order">
            <KeyboardMusicIcon /> {PRODUCTION_ORDERS_LABEL}
          </ButtonLink>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

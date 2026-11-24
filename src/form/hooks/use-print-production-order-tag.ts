import { useState } from "react";

import type { TPrintControls } from "@/components/print/use-print-controls";
import { useAppContext } from "@/contexts/app-context";
import { getPartTagFileUrl, getPartTagName, PartTagSource } from "@/lib/part-tag";
import trpc from "@/trpc/trpc-client";

// The tag is rendered at the size of the labels of the selected printer, then printed on it. printTag resolves whether it was
// printed
export default function usePrintProductionOrderTag(printControls: TPrintControls) {
  const { showToastOnTRPCMutation } = useAppContext();
  const [isPrintingTag, setIsPrintingTag] = useState(false);

  async function printTag(productionOrderId: number, partQuantity: number) {
    setIsPrintingTag(true);
    let isPrinted = false;
    const printId = crypto.randomUUID();
    await showToastOnTRPCMutation({
      mutation: trpc.productionOrder.printTag.mutate({
        labelSize: printControls.labelSize,
        partQuantity,
        printId,
        productionOrderId,
      }),
      onSubmit: async () => {
        isPrinted = await printControls.printPdf(
          getPartTagFileUrl(getPartTagName(PartTagSource.ProductionOrder, productionOrderId, printId)),
        );
      },
    });
    setIsPrintingTag(false);
    return isPrinted;
  }

  return { isPrintingTag, printTag };
}

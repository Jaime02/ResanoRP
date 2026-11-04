import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";

import TableDeliveryNote from "@/components/table/delivery-note";
import { UserMode, useAppContext } from "@/contexts/app-context";
import { DELIVERY_NOTES_LABEL } from "@/messages/delivery-note";
import { optionalIdSchema } from "@/schemas";
import { tableDeliveryNoteStateSchema } from "@/schemas/delivery-note";
import { TableMode } from "@/types";

const routeSearchSchema = z.object({
  createDeliveryNote: z.boolean().optional().catch(undefined),
  createDeliveryNoteLine: z.boolean().optional().catch(undefined),
  editDeliveryNoteId: optionalIdSchema.catch(undefined),
  printTagDeliveryNoteLineId: optionalIdSchema.catch(undefined),
  "table-delivery-note": tableDeliveryNoteStateSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/delivery-note/")({
  beforeLoad: () => ({
    title: DELIVERY_NOTES_LABEL,
  }),
  component: RouteComponent,
  validateSearch: routeSearchSchema,
});

function RouteComponent() {
  const {
    createDeliveryNote,
    createDeliveryNoteLine,
    editDeliveryNoteId,
    "table-delivery-note": tableDeliveryNoteState,
    printTagDeliveryNoteLineId,
  } = Route.useSearch();
  const navigate = useNavigate();
  const { userMode } = useAppContext();
  // A Máquina only looks the Albaranes up
  const isMachine = userMode === UserMode.Machine;

  useEffect(() => {
    // When loading the page, remove the printTagDeliveryNoteLineId from the URL
    void navigate({
      search: (prev) => ({ ...prev, printTagDeliveryNoteLineId: undefined }),
      to: ".",
    });
  }, [navigate]);

  return (
    <>
      <TableDeliveryNote
        tableMode={isMachine ? TableMode.ReadOnly : TableMode.Editable}
        state={tableDeliveryNoteState}
        {...(!isMachine && { createDeliveryNote, createDeliveryNoteLine, editDeliveryNoteId })}
        printTagDeliveryNoteLineId={printTagDeliveryNoteLineId}
        className="self-center"
      />
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import TableInvoice from "@/components/table/invoice";
import { UserMode } from "@/contexts/app-context";
import { INVOICING_LABEL } from "@/messages/invoice";
import { tableInvoiceStateSchema } from "@/schemas/invoice";

const routeSearchSchema = z.object({
  createInvoice: z.boolean().optional().catch(undefined),
  "table-invoice": tableInvoiceStateSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/invoicing")({
  beforeLoad: () => ({
    title: INVOICING_LABEL,
  }),
  component: RouteComponent,
  staticData: { userModes: [UserMode.Admin] },
  validateSearch: routeSearchSchema,
});

function RouteComponent() {
  const { createInvoice, "table-invoice": tableInvoiceState } = Route.useSearch();

  return <TableInvoice className="mx-auto" state={tableInvoiceState} createInvoice={createInvoice} />;
}

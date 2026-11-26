import { createFileRoute } from "@tanstack/react-router";
import z from "zod";

import FormProductionOrder from "@/form/forms/production-order";
import { FormMode } from "@/types";

const routeParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const Route = createFileRoute("/production-order/$id")({
  beforeLoad: ({ params }) => ({
    title: `Orden de producción ${params.id}`,
  }),
  component: RouteComponent,
  params: routeParamsSchema,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <FormProductionOrder requestedFormMode={FormMode.Update} productionOrderId={id} />;
}

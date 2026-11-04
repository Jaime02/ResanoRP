import { createFileRoute } from "@tanstack/react-router";
import z from "zod";

import { useAppContext } from "@/contexts/app-context";
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
  const { isAdmin } = useAppContext();
  const formMode = isAdmin ? FormMode.Update : FormMode.ReadOnly;
  return <FormProductionOrder requestedFormMode={formMode} productionOrderId={id} />;
}

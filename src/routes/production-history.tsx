import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import TableMachineProductionHistory from "@/components/table/machine-production-history";
import { UserMode, useAppContext } from "@/contexts/app-context";
import { PRODUCTION_HISTORY_PAGE_TITLE } from "@/messages/production-order";
import { tablePartProductionStateSchema } from "@/schemas/part-production";

const routeSearchSchema = z.object({
  "table-machine-production-history": tablePartProductionStateSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/production-history")({
  beforeLoad: () => ({
    title: PRODUCTION_HISTORY_PAGE_TITLE,
  }),
  component: RouteComponent,
  staticData: { userModes: [UserMode.Machine] },
  validateSearch: routeSearchSchema,
});

function RouteComponent() {
  const { "table-machine-production-history": tableMachineProductionHistoryState } = Route.useSearch();
  const { userModeMachine } = useAppContext();

  return (
    <TableMachineProductionHistory
      className="mx-auto"
      machineId={userModeMachine?.id}
      state={tableMachineProductionHistoryState}
    />
  );
}

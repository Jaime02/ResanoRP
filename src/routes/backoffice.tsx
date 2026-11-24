import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import Backoffice from "@/components/backoffice/backoffice";
import { UserMode } from "@/contexts/app-context";
import { getErrorsLogFn } from "@/lib/backoffice-fns";
import { BACKOFFICE_LABEL } from "@/messages/backoffice";
import { optionalIdSchema } from "@/schemas";
import { tableAuditLogStateSchema } from "@/schemas/audit-log";
import { tableUserStateSchema } from "@/schemas/user";

const routeSearchSchema = z.object({
  createUser: z.boolean().optional().catch(undefined),
  editUserId: optionalIdSchema.catch(undefined),
  "table-audit-log": tableAuditLogStateSchema.optional().catch(undefined),
  "table-user": tableUserStateSchema.optional().catch(undefined),
  tab: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/backoffice")({
  beforeLoad: () => ({
    title: BACKOFFICE_LABEL,
  }),
  component: RouteComponent,
  staticData: { userModes: [UserMode.Admin] },
  validateSearch: routeSearchSchema,
  loader: async () => ({ errors: await getErrorsLogFn() }),
});

function RouteComponent() {
  return <Backoffice {...Route.useLoaderData()} />;
}

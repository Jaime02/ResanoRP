import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import GridMaintenanceOtherModels from "@/components/maintenance/other-models";
import { UserMode } from "@/contexts/app-context";
import { MAINTENANCE_LABEL } from "@/messages/home";
import { optionalIdSchema } from "@/schemas";
import { tableClientStateSchema } from "@/schemas/client";
import { tableCoatingStateSchema } from "@/schemas/coating";
import { tableDeliveryMethodStateSchema } from "@/schemas/delivery-method";
import { tableMachineStateSchema } from "@/schemas/machine";
import { tableMaterialStateSchema } from "@/schemas/material";
import { tablePaymentMethodStateSchema } from "@/schemas/payment-method";
import { tableRawMaterialStateSchema } from "@/schemas/raw-material";

const routeSearchSchema = z.object({
  createClient: z.boolean().optional().catch(undefined),
  createMaterial: z.boolean().optional().catch(undefined),
  createCoating: z.boolean().optional().catch(undefined),
  createDeliveryMethod: z.boolean().optional().catch(undefined),
  createMachine: z.boolean().optional().catch(undefined),
  createPaymentMethod: z.boolean().optional().catch(undefined),
  createRawMaterial: z.boolean().optional().catch(undefined),
  editCoatingId: optionalIdSchema.catch(undefined),
  editDeliveryMethodId: optionalIdSchema.catch(undefined),
  editPaymentMethodId: optionalIdSchema.catch(undefined),
  editRawMaterialId: optionalIdSchema.catch(undefined),
  "table-client": tableClientStateSchema.optional().catch(undefined),
  "table-coating": tableCoatingStateSchema.optional().catch(undefined),
  "table-delivery-method": tableDeliveryMethodStateSchema.optional().catch(undefined),
  "table-machine": tableMachineStateSchema.optional().catch(undefined),
  "table-material": tableMaterialStateSchema.optional().catch(undefined),
  "table-payment-method": tablePaymentMethodStateSchema.optional().catch(undefined),
  "table-raw-material": tableRawMaterialStateSchema.optional().catch(undefined),
  tab: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/maintenance")({
  beforeLoad: () => ({
    title: MAINTENANCE_LABEL,
  }),
  component: GridMaintenanceOtherModels,
  staticData: { userModes: [UserMode.Admin] },
  validateSearch: routeSearchSchema,
});

import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceConfiguration from "@/components/maintenance/configuration";
import TableMaintenanceCoating from "@/components/maintenance/table-coating";
import TableMaintenanceDeliveryMethod from "@/components/maintenance/table-delivery-method";
import TableMaintenanceMachine from "@/components/maintenance/table-machine";
import TableMaintenanceMaterial from "@/components/maintenance/table-material";
import TableMaintenancePaymentMethod from "@/components/maintenance/table-payment-method";
import TableMaintenanceRawMaterial from "@/components/maintenance/table-raw-material";
import TableClient from "@/components/table/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CLIENTS_LABEL,
  COATINGS_LABEL,
  CONFIGURATION_LABEL,
  DELIVERY_METHODS_LABEL,
  MACHINES_LABEL,
  PAYMENT_METHODS_LABEL,
  RAW_MATERIALS_LABEL,
} from "@/messages/maintenance";
import { MATERIALS_LABEL } from "@/messages/material";

export default function OtherModels() {
  const navigate = useNavigate();
  const {
    tab,
    editDeliveryMethodId,
    "table-coating": tableCoatingState,
    "table-delivery-method": tableDeliveryMethodState,
    "table-machine": tableMachineState,
    "table-material": tableMaterialState,
    "table-payment-method": tablePaymentMethodState,
    "table-raw-material": tableRawMaterialState,
    createClient,
    "table-client": tableClientState,
    createDeliveryMethod,
    editPaymentMethodId,
    createPaymentMethod,
    createMachine,
    editCoatingId,
    createCoating,
    createMaterial,
    editRawMaterialId,
    createRawMaterial,
  } = useSearch({
    from: "/maintenance",
  });

  const defaultTab = "client";

  const handleTabChange = useCallback(
    async (value: string) => {
      await navigate({
        replace: true,
        search: (prev) => ({ ...prev, tab: value !== defaultTab ? value : undefined }),
        to: ".",
      });
    },
    [navigate],
  );

  return (
    <Tabs value={tab ?? defaultTab} onValueChange={handleTabChange}>
      <TabsList className="self-center">
        <TabsTrigger value="client">{CLIENTS_LABEL}</TabsTrigger>
        <TabsTrigger value="deliveryMethod">{DELIVERY_METHODS_LABEL}</TabsTrigger>
        <TabsTrigger value="paymentMethod">{PAYMENT_METHODS_LABEL}</TabsTrigger>
        <TabsTrigger value="machine">{MACHINES_LABEL}</TabsTrigger>
        <TabsTrigger value="coating">{COATINGS_LABEL}</TabsTrigger>
        <TabsTrigger value="material">{MATERIALS_LABEL}</TabsTrigger>
        <TabsTrigger value="rawMaterial">{RAW_MATERIALS_LABEL}</TabsTrigger>
        <TabsTrigger value="configuration">{CONFIGURATION_LABEL}</TabsTrigger>
      </TabsList>
      <TabsContent value="client">
        <TableClient createClient={createClient} state={tableClientState} />
      </TabsContent>
      <TabsContent value="deliveryMethod">
        <TableMaintenanceDeliveryMethod
          editDeliveryMethodId={editDeliveryMethodId}
          createDeliveryMethod={createDeliveryMethod}
          state={tableDeliveryMethodState}
        />
      </TabsContent>
      <TabsContent value="paymentMethod">
        <TableMaintenancePaymentMethod
          editPaymentMethodId={editPaymentMethodId}
          createPaymentMethod={createPaymentMethod}
          state={tablePaymentMethodState}
        />
      </TabsContent>
      <TabsContent value="machine">
        <TableMaintenanceMachine createMachine={createMachine} state={tableMachineState} />
      </TabsContent>
      <TabsContent value="coating">
        <TableMaintenanceCoating
          editCoatingId={editCoatingId}
          createCoating={createCoating}
          state={tableCoatingState}
        />
      </TabsContent>
      <TabsContent value="material">
        <TableMaintenanceMaterial createMaterial={createMaterial} state={tableMaterialState} />
      </TabsContent>
      <TabsContent value="rawMaterial">
        <TableMaintenanceRawMaterial
          editRawMaterialId={editRawMaterialId}
          createRawMaterial={createRawMaterial}
          state={tableRawMaterialState}
        />
      </TabsContent>
      <TabsContent value="configuration">
        <MaintenanceConfiguration />
      </TabsContent>
    </Tabs>
  );
}

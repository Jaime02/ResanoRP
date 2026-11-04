import { ProductionOrderStatus } from "@/schemas/production-order";
import { SellOrderStatus } from "@/schemas/sell-order";

export const translatedEnums = {
  ProductionOrderStatus: {
    [ProductionOrderStatus.Pending]: "Pendiente",
    [ProductionOrderStatus.InProduction]: "En producción",
    [ProductionOrderStatus.PendingTreatment]: "Pendiente de tratamiento",
    [ProductionOrderStatus.InTreatment]: "En tratamiento",
    [ProductionOrderStatus.Completed]: "Completado",
    [ProductionOrderStatus.Deleted]: "Eliminado",
    [ProductionOrderStatus.SellOrderLineDeleted]: "Línea eliminada",
    [ProductionOrderStatus.SellOrderDeleted]: "Pedido eliminado",
  } satisfies Record<ProductionOrderStatus, string>,
  SellOrderStatus: {
    [SellOrderStatus.Pending]: "Pendiente",
    [SellOrderStatus.Completed]: "Completado",
    [SellOrderStatus.Deleted]: "Eliminado",
    [SellOrderStatus.ClientDeleted]: "Cliente eliminado",
  } satisfies Record<SellOrderStatus, string>,
} as const;

export function getTranslatedEnumValues(enumName: keyof typeof translatedEnums): Array<string> {
  return Object.values(translatedEnums[enumName]);
}

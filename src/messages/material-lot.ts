import { MaterialLotUnit } from "@/types/material-lot";

export const MATERIAL_LOTS_TITLE = "Lotes";
export const MATERIAL_LOT_LABEL = "Lote";
export const HEAT_LABEL = "Colada";
export const MATERIAL_LOT_UNIT_LABEL = "Unidad";
export const MATERIAL_LOT_RECEIVED_AT_LABEL = "Fecha de recepción";
export const MATERIAL_LOT_RECEIVED_QUANTITY_LABEL = "Cantidad";
export const MATERIAL_LOT_REMAINING_LABEL = "Restante";
export const MATERIAL_LOT_CERTIFICATE_LABEL = "Certificado";
export const MATERIAL_LOT_MOVEMENTS_TITLE = "Movimientos";
export const MATERIAL_LOT_CREATE_TITLE = "Añadir Lote";
export const MATERIAL_LOT_EDIT_TITLE = "Editar Lote";
export const MATERIAL_LOT_CREATED_MESSAGE = "Lote añadido";
export const MATERIAL_LOT_EDITED_MESSAGE = "Lote editado";
export const MATERIAL_LOT_DELETE_TITLE = "Eliminar Lote";
export const MATERIAL_LOT_DELETE_MESSAGE = "¿Estás seguro que quieres eliminar el Lote?";
export const MATERIAL_LOT_DELETED_MESSAGE = "Lote eliminado";
export const SHOW_USED_UP_MATERIAL_LOTS_LABEL = "Ver Lotes agotados";
export const TAKE_MATERIAL_LABEL = "Usar material";
export const RETURN_MATERIAL_LABEL = "Añadir material";
export const MATERIAL_TAKEN_MESSAGE = "Material sacado";
export const MATERIAL_RETURNED_MESSAGE = "Material devuelto";
export const MATERIAL_LOT_MOVED_MESSAGE = "Movimiento del Lote registrado";
export const ZERO_QUANTITY_HINT_MESSAGE = "Vacío o 0 registra que se usa la Colada sin consumir material";
export const NO_MATERIAL_USED_MESSAGE = "No se ha usado material";
export const NO_MATERIAL_LOTS_MESSAGE = "No hay Lotes";
export const MATERIAL_LOT_WITH_MOVEMENTS_MESSAGE = "No se puede eliminar un Lote con movimientos";
export const MATERIAL_LOT_UNIT_WITH_MOVEMENTS_MESSAGE = "No se puede cambiar la unidad de un Lote con movimientos";
export const MATERIAL_LOT_USED_BY_PRODUCTION_ORDERS_MESSAGE = "Lo han usado:";
export const MATERIAL_LOT_STOCK_EXCEEDED_MESSAGE = (remaining: number) =>
  `El Lote se quedaría con menos de 0: quedan ${remaining}`;
export const MATERIAL_LOT_WITHOUT_STOCK_MESSAGE = "El Lote no tiene material restante";
export const MATERIAL_LOT_RECEIVED_BELOW_TAKEN_MESSAGE = (taken: number) =>
  `Ya se han sacado ${taken} del Lote, no se puede recibir menos`;
export const MATERIAL_LOT_USE_WITHOUT_ORDER_MESSAGE = "Una cantidad de 0 necesita una Orden de producción";
export const MATERIAL_LOT_NOT_FOUND_MESSAGE = (materialLotId: number) => `Lote con ID ${materialLotId} no encontrado`;

export const MATERIAL_LOT_UNIT_LABELS = {
  [MaterialLotUnit.Package]: "Paquetes",
  [MaterialLotUnit.Bar]: "Barras",
} satisfies Record<MaterialLotUnit, string>;

const MATERIAL_LOT_UNIT_SINGULAR_LABELS = {
  [MaterialLotUnit.Package]: "paquete",
  [MaterialLotUnit.Bar]: "barra",
} satisfies Record<MaterialLotUnit, string>;

export const MATERIAL_LOT_QUANTITY_MESSAGE = (quantity: number, unit: MaterialLotUnit) =>
  `${quantity} ${quantity === 1 ? MATERIAL_LOT_UNIT_SINGULAR_LABELS[unit] : MATERIAL_LOT_UNIT_LABELS[unit].toLowerCase()}`;

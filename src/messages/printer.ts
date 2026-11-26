import { PrinterKind } from "@/types/printer";

export const PRINTER_CREATE_TITLE = "Crear Impresora";
export const PRINTER_EDIT_TITLE = "Editar Impresora";
export const PRINTER_EDIT_ERROR_TITLE = "Error al editar la Impresora";
export const PRINTER_FETCH_ERROR_MESSAGE = "Error al obtener los datos de la Impresora";
export const PRINTER_DELETE_TITLE = "Eliminar Impresora";
export const PRINTER_DELETE_MESSAGE = "¿Estás seguro que quieres eliminar la Impresora?";
export const PRINTER_DELETED_MESSAGE = "Impresora eliminada";
export const PRINTER_CREATED_MESSAGE = "Impresora creada";
export const PRINTER_EDITED_MESSAGE = "Impresora editada";
export const PRINTER_ADDRESS_LABEL = "Dirección IP";
export const PRINTER_KIND_LABEL = "Tipo";
export const PRINTER_SHARE_NAME_LABEL = "Recurso compartido";
export const PRINTER_USERNAME_LABEL = "Usuario";
export const PRINTER_PASSWORD_LABEL = "Contraseña";
export const PRINTER_LABEL_WIDTH_LABEL = "Ancho de la etiqueta";
export const PRINTER_LABEL_LENGTH_LABEL = "Largo de la etiqueta";
export const PRINTER_FOR_TAGS_LABEL = "Para etiquetas de Artículos";
export const MILLIMETERS_SUFFIX = " mm";
export const PRINTER_PASSWORD_UNCHANGED_PLACEHOLDER = "Vacía para no cambiarla";
export const PRINTER_HOST_INVALID_MESSAGE =
  "Introduce una dirección IP o un nombre de equipo, sin \\, http:// ni puerto";
export const PRINTER_SHARE_NAME_INVALID_MESSAGE =
  "Introduce solo el nombre del recurso compartido: letras, números, espacios y . _ - $ ( )";
export const PRINTER_KIND_LABELS: Record<PrinterKind, string> = {
  [PrinterKind.Ipp]: "Red (IPP)",
  [PrinterKind.IntermecShare]: "Compartida: Intermec (etiquetas)",
  [PrinterKind.BrotherShare]: "Compartida: Brother láser",
  [PrinterKind.TscRaw]: "Red: TSC (etiquetas)",
};
export const BROWSER_PRINTER_LABEL = "Otra";
export const SENT_TO_PRINTER_MESSAGE = (printerName: string) => `Enviado a ${printerName}`;
export const PRINTER_NOT_FOUND_MESSAGE = (printerId: number) => `Impresora con ID ${printerId} no encontrada`;
export const PRINTER_FILE_UNAVAILABLE_MESSAGE = "No se pudo obtener el archivo a imprimir";
export const PRINTER_REACHABLE_MESSAGE = (printerName: string) => `${printerName} responde`;
export const PRINTER_NOT_RESPONDING_MESSAGE = (printerName: string) => `${printerName} no responde`;
export const PRINTER_UNREACHABLE_MESSAGE = (printerName: string) => `No se pudo enviar el archivo a ${printerName}`;

export const INVOICING_LABEL = "Facturación";
export const INVOICE_LABEL = "Factura";
export const INVOICE_NUMBER_LABEL = "Nº Factura";
export const INVOICE_CREATE_TITLE = "Crear Factura";
export const INVOICE_DELETE_TITLE = "Eliminar Factura";
export const INVOICE_DELETE_MESSAGE =
  "¿Estás seguro que quieres eliminar la Factura? Sus Albaranes volverán a estar pendientes de facturar.";
export const INVOICE_DELETED_MESSAGE = "Factura eliminada";
export const INVOICE_NO_DELIVERY_NOTES_MESSAGE = "La Factura no tiene Albaranes";
export const SEND_INVOICE_LABEL = "Enviar Factura";
export const UNACCOUNT_INVOICE_TITLE = "Marcar Factura como no contabilizada";
export const INVOICE_UNACCOUNTED_MESSAGE = "Factura marcada como no contabilizada";
export const ACCOUNT_INVOICES_TITLE = "Contabilizar Facturas";
export const INVOICES_ACCOUNTED_MESSAGE = "Facturas contabilizadas";
export const DELIVERY_NOTE_TOTAL_LABEL = "Total Albarán";
export const TAXABLE_BASE_LABEL = "Base imponible";
export const INVOICE_TOTAL_LABEL = "Total Factura";
export const INVOICE_CREATED_MESSAGE = "Factura creada";
export const ACCOUNT_INVOICES_DESCRIPTION_MESSAGE =
  "Se descargará el fichero para Prisma con todas las Facturas pendientes de contabilizar, que quedarán marcadas como contabilizadas.";
export const ACCOUNT_LABEL = "Contabilizar";
export const MARK_LABEL = "Marcar";
export const INVOICE_ACCOUNTED_LABEL = "Contabilizada";
export const INVOICE_SENT_LABEL = "Enviada";
export const DUE_DATE_LABEL = "Vencimiento";
export const INVOICES_NOT_ACCOUNTED_WITHOUT_ACCOUNT_MESSAGE = (clientNames: Array<string>) =>
  `No se han contabilizado las Facturas porque estos Clientes no tienen cuenta contable de Prisma: ${clientNames.join(", ")}`;
export const INVOICES_NOT_ACCOUNTED_UNPRICED_MESSAGE = (deliveryNoteIds: Array<number>) =>
  `No se han contabilizado las Facturas porque estos Albaranes tienen Líneas sin precio: ${deliveryNoteIds.join(", ")}`;
export const INVOICES_NOT_ACCOUNTED_AMOUNT_TOO_LARGE_MESSAGE = (maxAmount: string, invoiceIds: Array<number>) =>
  `No se han contabilizado las Facturas porque estas tienen importes mayores de ${maxAmount}, que no caben en el fichero de Prisma: ${invoiceIds.join(", ")}`;
export const INVOICE_NOT_SENT_UNPRICED_MESSAGE = (deliveryNoteIds: Array<number>) =>
  `No se ha enviado la Factura porque estos Albaranes tienen Líneas sin precio: ${deliveryNoteIds.join(", ")}`;

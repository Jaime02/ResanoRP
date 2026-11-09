export const DELIVERY_NOTES_LABEL = "Albaranes";
export const DELIVERY_NOTE_LABEL = "Albarán";
export const DELIVERY_NOTE_NUMBER_LABEL = "Albarán Nº";
export const DELIVERY_NOTE_PRINT_NUMBER_LABEL = "Nº Albarán";
export const DELIVERY_NOTE_CREATE_TITLE = "Crear Albarán";
export const DELIVERY_NOTE_EDIT_TITLE = "Editar Albarán";
export const DELIVERY_NOTE_EDIT_ERROR_TITLE = "Error al editar el Albarán";
export const DELIVERY_NOTE_FETCH_ERROR_TITLE = "Error al obtener el Albarán";
export const DELIVERY_NOTE_FETCH_ERROR_MESSAGE = "Error al obtener los datos del Albarán";
export const DELIVERY_NOTE_DELETE_TITLE = "Eliminar Albarán";
export const DELIVERY_NOTE_DELETE_MESSAGE = "¿Estás seguro que quieres eliminar el Albarán?";
export const DELIVERY_NOTE_DELETED_MESSAGE = "Albarán eliminado";
export const DELIVERY_NOTE_NO_PARTS_MESSAGE = "El Albarán no tiene Artículos";
export const NO_PENDING_DELIVERY_NOTES_MESSAGE = "No hay Albaranes pendientes de facturar";
export const ADD_LINES_REQUIRES_DELIVERY_NOTE_MESSAGE = "Para añadir líneas al Albarán, primero debes crear el Albarán";
export const ADD_LINES_TO_DELIVERY_NOTE_TITLE = "Añadir líneas a un Albarán existente";
export const ADD_LINES_TO_DELIVERY_NOTE_INVOICED_MESSAGE =
  "Selecciona el Albarán al que añadir las líneas. Si su Factura está contabilizada o enviada, se marcará para contabilizarla y enviarla de nuevo";
export const ADD_LINES_TO_DELIVERY_NOTE_MESSAGE =
  "Selecciona el Albarán al que añadir las líneas. Los Albaranes de Facturas contabilizadas no se pueden modificar";
export const ADD_TO_DELIVERY_NOTE_LABEL = "Añadir a Albarán existente";
export const ADD_LINES_LABEL = "Añadir Líneas";
export const CANCEL_DELIVERY_NOTE_CREATION_TITLE = "Cancelar Albarán en creación";
export const CANCEL_DELIVERY_NOTE_CREATION_MESSAGE =
  "¿Estás seguro de que quieres cancelar la creación del Albarán? Se descartarán todas las líneas servidas";
export const PARTS_TO_SERVE_TITLE = "Artículos a servir";
export const LAST_DELIVERY_NOTES_TITLE = "Últimos Albaranes";
export const PENDING_SELL_ORDERS_FETCH_ERROR_TITLE = "Error al obtener Pedidos pendientes";
export const PENDING_SELL_ORDERS_FETCH_ERROR_MESSAGE = "Error al obtener los datos de los Pedidos pendientes";
export const PRINT_DELIVERY_NOTE_TITLE = "Imprimir Albarán";
export const PRINT_DELIVERY_NOTE_MESSAGE = "¿Quieres incluir los precios en el Albarán?";
export const PRINT_LABELS_TITLE = "Imprimir Etiquetas";
export const UNITS_PER_LABEL_LABEL = "Unidades por etiqueta";
export const LABELS_LABEL = "Etiquetas";
export const DELIVERY_NOTE_LINE_CREATE_TITLE = "Crear línea";
export const DELIVERY_NOTE_LINE_DELETE_TITLE = "Eliminar Línea";
export const DELIVERY_NOTE_LINE_DELETE_MESSAGE = "¿Estás seguro que quieres eliminar la Línea?";
export const DELIVERY_NOTE_LINE_DELETED_MESSAGE = "Línea del Albarán eliminada";
export const DELIVERY_NOTE_LINE_PRICE_EDITED_MESSAGE = "Precio de la Línea del Albarán editado";
export const DELIVERY_NOTE_LINE_EDITED_MESSAGE = "Línea del Albarán editada";
export const DELIVERY_NOTE_LINE_VALIDATION_ERROR_MESSAGE = "Error al validar la línea del Albarán a editar";
export const DELIVERY_NOTE_LINE_CREATED_MESSAGE = "Línea de Albarán creada";
export const DELIVERY_NOTE_CREATED_MESSAGE = "Albarán creado";
export const DELIVERY_NOTE_EDITED_MESSAGE = "Albarán editado";
export const LINES_ADDED_TO_DELIVERY_NOTE_MESSAGE = "Líneas añadidas al Albarán";
export const INVOICED_DELIVERY_NOTE_SUFFIX_LABEL = " (Factura contabilizada)";
export const DISCARD_SERVED_LINES_LABEL = "Descartar líneas servidas";
export const WITHOUT_PRICES_LABEL = "Sin precios";
export const WITH_PRICES_LABEL = "Con precios";
export const PRINT_TWICE_LABEL = "Imprimir x2";
export const ADD_LABEL_GROUP_LABEL = "Añadir grupo de Etiquetas";
export const PENDING_QUANTITY_EXCEEDED_MESSAGE = (sellOrderLineId: number) =>
  `La cantidad pendiente de la Línea de pedido de venta ${sellOrderLineId} no puede pasar de su cantidad`;
export const ACCOUNTED_DELIVERY_NOTE_MESSAGE = (deliveryNoteId: number) =>
  `El Albarán ${deliveryNoteId} pertenece a una Factura contabilizada, solo el Administrador puede cambiar sus líneas`;
export const SELL_ORDER_LINE_NOT_OF_CLIENT_MESSAGE = (sellOrderLineId: number) =>
  `La Línea de pedido de venta ${sellOrderLineId} no es del Cliente del Albarán`;

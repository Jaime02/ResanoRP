export const BACKOFFICE_LABEL = "Backoffice";
export const AUDIT_LOG_LABEL = "Auditoría";
export const ERRORS_LOG_LABEL = "Errores";
export const AUDIT_ACTION_LABEL = "Acción";
export const AUDIT_DESCRIPTION_LABEL = "Descripción";
export const AUDIT_RESULT_LABEL = "Resultado";
export const AUDIT_USER_LABEL = "Usuario";
export const IP_LABEL = "IP";
export const AUDIT_DOCUMENT_LABEL = "Documento";
export const AUDIT_INPUT_LABEL = "Datos";
export const AUDIT_OK_LABEL = "Correcto";
export const AUDIT_ADMIN_LABEL = "Administrador";
export const AUDIT_NOT_ADMIN_LABEL = "Otro";
export const LOG_TIMESTAMP_LABEL = "Fecha";
export const getAuditLogStartNote = (startDate: string) => `Se muestran las entradas desde el ${startDate}`;
export const getLogLinesNote = (maxLines: number) =>
  `Se muestran las últimas ${maxLines} líneas, las más recientes primero`;
export const CLEAR_LOG_LABEL = "Vaciar";
export const CLEAR_LOG_TITLE = "Vaciar el registro";
export const CLEAR_LOG_DESCRIPTION_MESSAGE = "Se borrará todo el contenido del archivo y no se puede deshacer";
export const LOG_CLEARED_MESSAGE = "Registro vaciado";
export const USERS_LABEL = "Usuarios";
export const USER_CREATE_TITLE = "Crear Usuario";
export const USER_EDIT_TITLE = "Editar Usuario";
export const USER_EDIT_ERROR_TITLE = "Error al editar el Usuario";
export const USER_FETCH_ERROR_MESSAGE = "Error al obtener los datos del Usuario";
export const USER_DELETE_TITLE = "Eliminar Usuario";
export const USER_DELETE_MESSAGE = "¿Estás seguro que quieres eliminar el Usuario?";
export const USER_CREATED_MESSAGE = "Usuario creado";
export const USER_EDITED_MESSAGE = "Usuario editado";
export const USER_DELETED_MESSAGE = "Usuario eliminado";
export const USER_IP_INVALID_MESSAGE = "Introduce una dirección IP válida";
export const USER_IP_TAKEN_MESSAGE = "Existe un Usuario con la misma IP";
export const USER_NOT_FOUND_MESSAGE = (id: number) => `Usuario con ID ${id} no encontrado`;
// The name of the IP of the entry, with the user mode it was in
export const getAuditUserNameLabel = (name: string, userModeLabel: string) =>
  userModeLabel === "" ? name : `${name} (${userModeLabel})`;

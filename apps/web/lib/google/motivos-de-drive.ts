/**
 * Los motivos con los que las acciones de Drive de Marketing
 * (`app/marketing/content/drive-actions.ts`) devuelven un rechazo esperable
 * (SCRUM-519). Viven en un módulo sin dependencias porque los usan también las
 * pantallas: con el motivo deciden qué botón mostrar (conectar o reconectar
 * Google). Son los mismos textos que esas pantallas mostraban antes.
 */

export const MOTIVO_DRIVE_NO_CONECTADO =
  "No hay conexión con Google Drive. Conectá tu cuenta de Google primero.";

/** Google rechazó el token (401: vencido o revocado). Se arregla reconectando Google. */
export const MOTIVO_DRIVE_SIN_PERMISOS =
  "Permisos insuficientes. Reconectá tu cuenta de Google con acceso completo a Drive.";

/**
 * 403 de Drive porque la cuenta o la app no tienen acceso al archivo
 * (`appNotAuthorizedToFile`: la app no está en sus permisos;
 * `teamDriveMembershipRequired`: la cuenta no es miembro de la unidad
 * compartida; `insufficientFilePermissions`: sin permiso de escritura, que con
 * acciones que sólo leen no debería llegar). Reconectar no lo arregla.
 */
export const MOTIVO_DRIVE_SIN_ACCESO_AL_ARCHIVO =
  "Tu cuenta de Google no tiene acceso a ese archivo. Pedile acceso a quien lo comparte o elegí otro.";

/** 403 `domainPolicy`: el administrador del dominio no deja que apps externas usen Drive. */
export const MOTIVO_DRIVE_BLOQUEADO_POR_EL_DOMINIO =
  "El administrador de tu cuenta de Google Workspace no permite que otras apps accedan a Drive. Pedile que lo habilite.";

/** 404 de Drive: el archivo no existe o la cuenta de Google no lo puede leer. */
export const MOTIVO_DRIVE_NO_ENCONTRADO =
  "No encontramos ese archivo o carpeta en tu Drive, o tu cuenta de Google no tiene acceso.";

export const MOTIVO_DRIVE_ARCHIVO_GRANDE = "El archivo supera el límite de 500 MB";

export type CodigoDeRechazoDeDrive =
  | "GOOGLE_NOT_CONNECTED"
  | "GOOGLE_INSUFFICIENT_PERMISSIONS"
  | "OTHER";

/** Qué botón corresponde a un motivo devuelto por una acción de Drive. */
export function codigoDelMotivoDeDrive(motivo: string): CodigoDeRechazoDeDrive {
  if (motivo === MOTIVO_DRIVE_NO_CONECTADO) return "GOOGLE_NOT_CONNECTED";
  if (motivo === MOTIVO_DRIVE_SIN_PERMISOS) return "GOOGLE_INSUFFICIENT_PERMISSIONS";
  return "OTHER";
}

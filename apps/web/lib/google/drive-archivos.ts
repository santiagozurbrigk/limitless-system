import { getCurrentProfile } from "@/lib/auth/bootstrap";
import { leerTokenDeGoogle } from "@/lib/google/get-access-token";
import {
  MOTIVO_DRIVE_ARCHIVO_GRANDE,
  MOTIVO_DRIVE_BLOQUEADO_POR_EL_DOMINIO,
  MOTIVO_DRIVE_NO_CONECTADO,
  MOTIVO_DRIVE_NO_ENCONTRADO,
  MOTIVO_DRIVE_SIN_ACCESO_AL_ARCHIVO,
  MOTIVO_DRIVE_SIN_PERMISOS,
} from "@/lib/google/motivos-de-drive";
import { ErrorEsperable } from "@/lib/server/error-esperable";

/**
 * Lo común de las lecturas de Google Drive de Marketing (SCRUM-519): el token
 * de la organización, la traducción de una respuesta de Drive que no es 2xx y
 * la descarga de un archivo. Lanza `ErrorEsperable` para lo que se le explica
 * al usuario y cualquier otra cosa para lo inesperado; las server actions lo
 * corren dentro de `mutacionConErroresEsperables`.
 *
 * Está fuera del archivo `"use server"` porque la descarga la usa también el
 * análisis de una pieza (`app/marketing/content/actions.ts`), que necesita el
 * archivo o la excepción, no un `MutationResult`.
 *
 * Nunca se pone en el texto de un error el token, la consulta que escribió el
 * usuario ni el cuerpo de la respuesta de Google (SCRUM-501): sólo la
 * operación, el status y la razón que da Google.
 */

const SESION_NO_VALIDA = "Sesión no válida";

/**
 * El token de Google de la organización del perfil. Sin sesión o sin conexión
 * usable, un motivo; si la base falla al leer la integración, `FallaDeLaBase`
 * (antes eso se veía como "No hay conexión con Google Drive").
 *
 * Usa la organización del perfil, como antes (`[MKT-HOLDING-ORG]`). Si la
 * lectura del perfil falla, `getCurrentProfile` devuelve `null` y se ve como
 * sesión no válida (`[PERFIL-Y-ADDONS-FALLA-COMO-RECHAZO]`).
 */
export async function exigirTokenDeDrive(): Promise<string> {
  const profile = await getCurrentProfile();
  if (!profile?.organization_id) {
    throw new ErrorEsperable(SESION_NO_VALIDA);
  }
  const token = await leerTokenDeGoogle(profile.organization_id);
  if (!token) {
    throw new ErrorEsperable(MOTIVO_DRIVE_NO_CONECTADO);
  }
  return token;
}

/** Una respuesta de Drive que no es un rechazo con motivo: va a Sentry. */
export class FallaDeGoogleDrive extends Error {
  readonly status: number;
  constructor(operacion: string, status: number, razon: string | null) {
    super(`Google Drive ${operacion}: HTTP ${status}${razon ? ` (${razon})` : ""}`);
    this.name = "FallaDeGoogleDrive";
    this.status = status;
  }
}

type CuerpoDeErrorDeDrive = {
  error?: { errors?: Array<{ domain?: string; reason?: string }> };
};

async function primerErrorDelCuerpo(
  res: Response
): Promise<{ domain: string | null; reason: string | null }> {
  try {
    const cuerpo = (await res.json()) as CuerpoDeErrorDeDrive;
    const primero = cuerpo.error?.errors?.[0];
    return { domain: primero?.domain ?? null, reason: primero?.reason ?? null };
  } catch {
    return { domain: null, reason: null };
  }
}

/**
 * Los `reason` de un 403 que se le explican al usuario, con su texto. Salen de la
 * guía de errores de la API de Drive
 * (`developers.google.com/workspace/drive/api/guides/handle-errors`, copia en la
 * evidencia de SCRUM-519, `fuentes-google/drive-handle-errors.txt`); sólo estos
 * cuatro dicen que la cuenta de Google no puede leer el archivo y qué tiene que
 * hacer el usuario:
 *   - `appNotAuthorizedToFile`: la app no está en el ACL del archivo (la guía:
 *     que el usuario lo abra con el selector o desde Drive).
 *   - `insufficientFilePermissions`: la cuenta no tiene permiso sobre el archivo
 *     (la guía: pedirle acceso al dueño).
 *   - `teamDriveMembershipRequired`: la cuenta no es miembro de la unidad
 *     compartida del archivo.
 *   - `domainPolicy`: el administrador del dominio no deja que apps externas
 *     usen Drive (la guía: pedirle acceso al administrador).
 * Reconectar Google no arregla ninguno de los cuatro, así que no muestran el
 * botón de reconectar.
 */
const MOTIVOS_DE_403: Record<string, string> = {
  appNotAuthorizedToFile: MOTIVO_DRIVE_SIN_ACCESO_AL_ARCHIVO,
  insufficientFilePermissions: MOTIVO_DRIVE_SIN_ACCESO_AL_ARCHIVO,
  teamDriveMembershipRequired: MOTIVO_DRIVE_SIN_ACCESO_AL_ARCHIVO,
  domainPolicy: MOTIVO_DRIVE_BLOQUEADO_POR_EL_DOMINIO,
};

/**
 * Traduce una respuesta de Drive que no es 2xx, según la misma guía:
 *   - 401 `authError`: token vencido o inválido, y ya se intentó renovar
 *     (`getGoogleAccessTokenForOrganization` renueva antes de que venza): hay
 *     que reconectar. Motivo con el botón de reconectar.
 *   - 403 con un `reason` de `MOTIVOS_DE_403`: su motivo.
 *   - Cualquier otro 403 es una falla que va a Sentry con su `reason`: los
 *     límites de uso (dominio `usageLimits`: `userRateLimitExceeded`,
 *     `dailyLimitExceeded`, `UrlLeaseLimitExceeded`), los que dicen que pedimos
 *     mal el archivo (`fileNotDownloadable`: un archivo de Google bajado con
 *     `alt=media`; `fileNotExportable`: un tipo que no se exporta así), los de
 *     escrituras que esta app no hace y cualquier `reason` que la guía no
 *     nombra o un cuerpo que no se puede leer. Antes todos se mostraban como
 *     "Reconectá" y nadie se enteraba.
 *   - 404 `notFound`: el archivo no existe o la cuenta no lo puede leer. Motivo.
 *   - 429 y 5xx: pasajeros o de Google. Falla.
 */
export async function errorDeRespuestaDeDrive(res: Response, operacion: string): Promise<Error> {
  if (res.status === 401) return new ErrorEsperable(MOTIVO_DRIVE_SIN_PERMISOS);
  if (res.status === 404) return new ErrorEsperable(MOTIVO_DRIVE_NO_ENCONTRADO);
  if (res.status === 403) {
    const { reason } = await primerErrorDelCuerpo(res);
    const motivo = reason && Object.hasOwn(MOTIVOS_DE_403, reason) ? MOTIVOS_DE_403[reason] : null;
    if (motivo) return new ErrorEsperable(motivo);
    return new FallaDeGoogleDrive(operacion, res.status, reason);
  }
  return new FallaDeGoogleDrive(operacion, res.status, null);
}

const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const GOOGLE_SLIDE_MIME = "application/vnd.google-apps.presentation";

const GOOGLE_EXPORT_MIME: Record<string, string> = {
  [GOOGLE_DOC_MIME]: "application/pdf",
  [GOOGLE_SHEET_MIME]:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  [GOOGLE_SLIDE_MIME]: "application/pdf",
};

const MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024;

export type ArchivoDeDrive = { buffer: Buffer; mimeType: string; name: string };

/**
 * Descarga un archivo de Drive de la organización (los de Google Docs, Sheets
 * y Slides se exportan). Lanza un motivo (sin conexión, sin permisos, no
 * encontrado, más de 500 MB) o una falla.
 */
export async function descargarArchivoDeDrive(fileId: string): Promise<ArchivoDeDrive> {
  const token = await exigirTokenDeDrive();

  const metaUrl = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`
  );
  metaUrl.searchParams.set("fields", "id,name,mimeType,size");
  metaUrl.searchParams.set("supportsAllDrives", "true");

  const metaRes = await fetch(metaUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!metaRes.ok) {
    throw await errorDeRespuestaDeDrive(metaRes, "metadatos del archivo");
  }

  const meta = (await metaRes.json()) as {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
  };

  const fileSize = meta.size ? Number.parseInt(meta.size, 10) : 0;
  if (fileSize > MAX_DOWNLOAD_BYTES) {
    throw new ErrorEsperable(MOTIVO_DRIVE_ARCHIVO_GRANDE);
  }

  const exportMime = GOOGLE_EXPORT_MIME[meta.mimeType];
  let downloadUrl: URL;
  let resultMimeType = meta.mimeType;

  if (exportMime) {
    downloadUrl = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export`
    );
    downloadUrl.searchParams.set("mimeType", exportMime);
    resultMimeType = exportMime;
  } else {
    downloadUrl = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`
    );
    downloadUrl.searchParams.set("alt", "media");
  }

  downloadUrl.searchParams.set("supportsAllDrives", "true");

  const res = await fetch(downloadUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw await errorDeRespuestaDeDrive(res, "descarga del archivo");
  }

  const arrayBuffer = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: resultMimeType,
    name: meta.name,
  };
}

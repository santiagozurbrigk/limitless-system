"use server";

import {
  descargarArchivoDeDrive,
  errorDeRespuestaDeDrive,
  exigirTokenDeDrive,
  type ArchivoDeDrive,
} from "@/lib/google/drive-archivos";
import {
  codigoDelMotivoDeDrive,
  type CodigoDeRechazoDeDrive,
} from "@/lib/google/motivos-de-drive";
import {
  ErrorEsperable,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { updateContentPieceAction } from "./actions";

/**
 * Drive de Marketing (SCRUM-519): cada acción devuelve sus errores esperables
 * como valor (`MutationResult`). Sin sesión, sin Google conectado, con el token
 * rechazado o sin permiso sobre el archivo, el motivo; una falla de la base o
 * de Google va a la consola y a Sentry y vuelve con el texto fijo. Lo común
 * (token, traducción de las respuestas de Drive y descarga) está en
 * `lib/google/drive-archivos.ts`.
 */

export type DriveFileListItem = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webViewLink?: string;
  size?: string;
  modifiedTime: string;
  parents?: string[];
};

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export type DriveListResult =
  | { ok: true; files: DriveFileListItem[] }
  | { ok: false; errorCode: CodigoDeRechazoDeDrive; message: string };

type ParametrosDeListado = {
  folderId?: string;
  mimeTypeFilter?: string;
  query?: string;
};

/**
 * La lista con el código que usa `DriveFilePicker` para elegir el botón
 * (conectar o reconectar Google). El código sale del motivo; con `OTHER`,
 * `message` es el motivo o el texto fijo, nunca el texto de Google.
 */
export async function listDriveFilesSafeAction(
  params?: ParametrosDeListado
): Promise<DriveListResult> {
  const resultado = await listDriveFilesAction(params);
  if (resultado.success) return { ok: true, files: resultado.data };
  return {
    ok: false,
    errorCode: codigoDelMotivoDeDrive(resultado.error),
    message: resultado.error,
  };
}

async function listarArchivos(params?: ParametrosDeListado): Promise<DriveFileListItem[]> {
  const token = await exigirTokenDeDrive();

  let q = "trashed = false";

  if (params?.folderId) {
    q += ` and '${escapeDriveQueryValue(params.folderId)}' in parents`;
  } else {
    q += " and 'root' in parents";
  }

  if (params?.mimeTypeFilter) {
    q += ` and mimeType = '${escapeDriveQueryValue(params.mimeTypeFilter)}'`;
  }

  if (params?.query?.trim()) {
    q += ` and name contains '${escapeDriveQueryValue(params.query.trim())}'`;
  }

  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", q);
  url.searchParams.set(
    "fields",
    "files(id,name,mimeType,thumbnailLink,webViewLink,size,modifiedTime,parents)"
  );
  url.searchParams.set("orderBy", "folder,name");
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  url.searchParams.set("supportsAllDrives", "true");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw await errorDeRespuestaDeDrive(res, "listar archivos");
  }

  const data = (await res.json()) as { files?: DriveFileListItem[] };
  return data.files ?? [];
}

export async function listDriveFilesAction(
  params?: ParametrosDeListado
): Promise<MutationResult<DriveFileListItem[]>> {
  return mutacionConErroresEsperables("[listDriveFiles]", () => listarArchivos(params));
}

export async function getDriveFileAction(
  fileId: string
): Promise<MutationResult<DriveFileListItem>> {
  return mutacionConErroresEsperables("[getDriveFile]", async () => {
    const token = await exigirTokenDeDrive();

    const url = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`
    );
    url.searchParams.set(
      "fields",
      "id,name,mimeType,thumbnailLink,webViewLink,size,modifiedTime"
    );
    url.searchParams.set("supportsAllDrives", "true");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw await errorDeRespuestaDeDrive(res, "leer archivo");
    }

    return (await res.json()) as DriveFileListItem;
  });
}

/**
 * La ruta de carpetas hasta `folderId`. Una carpeta de arriba que Drive no
 * deja ver (404: no existe o la cuenta no tiene acceso) corta la ruta ahí, como
 * antes; un token rechazado es un motivo y cualquier otra respuesta, una falla
 * (antes cortaba la ruta sin avisar).
 */
export async function getDriveFolderPathAction(
  folderId: string
): Promise<MutationResult<Array<{ id: string; name: string }>>> {
  return mutacionConErroresEsperables("[getDriveFolderPath]", async () => {
    const token = await exigirTokenDeDrive();

    const path: Array<{ id: string; name: string }> = [];
    let currentId = folderId;

    for (let i = 0; i < 10; i++) {
      if (currentId === "root") break;

      const url = new URL(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(currentId)}`
      );
      url.searchParams.set("fields", "id,name,parents");
      url.searchParams.set("supportsAllDrives", "true");

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 404) break;
      if (!res.ok) {
        throw await errorDeRespuestaDeDrive(res, "ruta de carpetas");
      }

      const file = (await res.json()) as {
        id: string;
        name: string;
        parents?: string[];
      };

      path.unshift({ id: file.id, name: file.name });

      if (!file.parents?.length) break;
      currentId = file.parents[0];
    }

    return path;
  });
}

export async function linkDriveFileToContentAction(
  contentPieceId: string,
  driveFile: { id: string; name: string; url: string }
): Promise<void> {
  await updateContentPieceAction(contentPieceId, {
    drive_file_id: driveFile.id,
    drive_file_name: driveFile.name,
    drive_file_url: driveFile.url,
  });
}

export async function unlinkDriveFileAction(contentPieceId: string): Promise<void> {
  await updateContentPieceAction(contentPieceId, {
    drive_file_id: null,
    drive_file_name: null,
    drive_file_url: null,
  });
}

/**
 * La descarga como server action. El análisis de una pieza no pasa por acá:
 * usa `descargarArchivoDeDrive` (`lib/google/drive-archivos.ts`) directamente.
 */
export async function downloadDriveFileAction(
  fileId: string
): Promise<MutationResult<ArchivoDeDrive>> {
  return mutacionConErroresEsperables("[downloadDriveFile]", () =>
    descargarArchivoDeDrive(fileId)
  );
}

const CREAR_CARPETA_NO_DISPONIBLE =
  "La creación de carpetas no está disponible temporalmente. Seleccioná una carpeta existente de tu Drive.";

/** Siempre rechaza: el scope de Drive es de sólo lectura (`[MKT-DRIVE-CARPETA]`). */
export async function createDriveFolderAction(_params: {
  name: string;
  parentFolderId?: string;
}): Promise<MutationResult<{ id: string; name: string; mimeType: string }>> {
  return mutacionConErroresEsperables("[createDriveFolder]", async () => {
    throw new ErrorEsperable(CREAR_CARPETA_NO_DISPONIBLE);
  });
}

export async function searchDriveFilesAction(
  query: string
): Promise<MutationResult<DriveFileListItem[]>> {
  return mutacionConErroresEsperables("[searchDriveFiles]", async () => {
    const token = await exigirTokenDeDrive();
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return [];
    }

    const q = `name contains '${escapeDriveQueryValue(trimmedQuery)}' and trashed = false`;
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", q);
    url.searchParams.set(
      "fields",
      "files(id,name,mimeType,thumbnailLink,webViewLink,size,modifiedTime,parents)"
    );
    url.searchParams.set("pageSize", "30");
    url.searchParams.set("orderBy", "modifiedByMeTime desc");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("supportsAllDrives", "true");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw await errorDeRespuestaDeDrive(res, "buscar archivos");
    }

    const data = (await res.json()) as { files?: DriveFileListItem[] };
    return data.files ?? [];
  });
}

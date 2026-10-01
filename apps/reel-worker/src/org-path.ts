/**
 * [STORAGE-RUTA-DESDE-FILA] (SCRUM-81): una ruta del bucket es de la org sólo si
 * empieza con `<organizationId>/`, cada segmento usa sólo `[A-Za-z0-9._-]` y
 * ninguno es `.` ni `..`. La lista blanca frena `%2e%2e` y `\`, que `fetch`
 * convierte en `..` y `/` al pedir la URL.
 * Misma regla que `apps/web/lib/storage/org-path.ts` (el worker es standalone y
 * no importa paquetes del workspace). La música sale de una columna que el
 * founder puede escribir, y el worker descarga con service role.
 */
const SEGMENTO_VALIDO = /^[A-Za-z0-9._-]+$/;

export function isOrgStoragePath(ruta: unknown, organizationId: string): ruta is string {
  if (typeof ruta !== "string" || !organizationId) return false;
  if (!ruta.startsWith(`${organizationId}/`)) return false;
  return ruta
    .slice(organizationId.length + 1)
    .split("/")
    .every((segmento) => SEGMENTO_VALIDO.test(segmento) && segmento !== "." && segmento !== "..");
}

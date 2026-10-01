/**
 * [STORAGE-RUTA-DESDE-FILA] (SCRUM-81): una ruta del bucket es de la org sólo si
 * empieza con `<organizationId>/` y no tiene segmentos vacíos, `.` ni `..`.
 * Misma regla que `apps/web/lib/storage/org-path.ts` (el worker es standalone y
 * no importa paquetes del workspace). La música sale de una columna que el
 * founder puede escribir, y el worker descarga con service role.
 */
export function isOrgStoragePath(ruta: unknown, organizationId: string): ruta is string {
  if (typeof ruta !== "string" || !organizationId) return false;
  if (!ruta.startsWith(`${organizationId}/`)) return false;
  return ruta
    .slice(organizationId.length + 1)
    .split("/")
    .every((segmento) => segmento.length > 0 && segmento !== "." && segmento !== "..");
}

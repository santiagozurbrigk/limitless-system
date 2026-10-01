/**
 * Rutas de Storage que llegan del navegador.
 *
 * El flujo de subida es en dos pasos: el servidor arma la ruta
 * (`${organizationId}/...`) y firma la subida, y después el cliente "finaliza"
 * mandando esa ruta de vuelta. Como las lecturas, firmas y borrados posteriores
 * van con service role, una ruta ajena aceptada en el paso 2 daba acceso a
 * archivos de otra org. Toda ruta que vuelve del cliente pasa por acá.
 *
 * [STORAGE-RUTA-DESDE-FILA] (SCRUM-81): lo mismo vale para una ruta leída de una
 * fila de la base, porque un miembro puede escribirla por PostgREST. Antes de
 * firmar, descargar o borrar con service role, la ruta se valida contra la org
 * dueña de la fila.
 */
export function isOrgStoragePath(path: unknown, organizationId: string): path is string {
  if (typeof path !== "string" || !organizationId) return false;
  if (!path.startsWith(`${organizationId}/`)) return false;
  // Sin segmentos que suban de carpeta ni vacíos: `org/../otra-org/x`.
  return path
    .slice(organizationId.length + 1)
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function assertOrgStoragePath(path: unknown, organizationId: string): string {
  if (!isOrgStoragePath(path, organizationId)) {
    throw new Error("Ruta de almacenamiento inválida");
  }
  return path;
}

/**
 * Las rutas de `paths` que son de la org. Las demás se descartan con un aviso
 * en el log: sirve donde un archivo ajeno no tiene que cortar el resto (borrar
 * varios adjuntos, firmar una lista, la limpieza de un cron).
 */
export function soloRutasDeLaOrg(
  paths: readonly (string | null | undefined)[],
  organizationId: string,
  contexto: string
): string[] {
  const validas: string[] = [];
  for (const path of paths) {
    if (!path) continue;
    if (isOrgStoragePath(path, organizationId)) validas.push(path);
    else console.warn(`[storage] ${contexto}: ruta fuera de la organización descartada`, { organizationId, path });
  }
  return validas;
}

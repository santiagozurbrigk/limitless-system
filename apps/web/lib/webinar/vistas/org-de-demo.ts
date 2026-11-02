import "server-only";

/**
 * ¿Es la organización de demo de Limitless Webinars? (SCRUM-542)
 *
 * Sólo esa organización ve el escenario de ejemplo. Se identifica por la
 * variable de entorno `WEBINAR_DEMO_ORGANIZATION_ID` (el UUID de la org), de
 * servidor: nunca por un parámetro de la URL, una cookie ni el nombre de la
 * organización. Quién crea la organización de demo y con qué id lo decide
 * SCRUM-522; hasta que se cargue la variable, ninguna organización ve datos de
 * ejemplo.
 *
 * Reglas:
 *   - sin la variable, vacía o con algo que no es un UUID: ninguna org es demo;
 *   - la variable se compara entera, sin espacios y en minúsculas (como
 *     devuelve los UUID Postgres): un UUID mal copiado no habilita a otra
 *     organización;
 *   - una sola organización: no acepta listas.
 */
export const VARIABLE_DE_LA_ORG_DE_DEMO = "WEBINAR_DEMO_ORGANIZATION_ID";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function idDeLaOrgDeDemo(
  env: Record<string, string | undefined> = process.env
): string | null {
  const valor = env[VARIABLE_DE_LA_ORG_DE_DEMO]?.trim().toLowerCase() ?? "";
  return UUID.test(valor) ? valor : null;
}

export function esOrgDeDemo(
  organizationId: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  const demo = idDeLaOrgDeDemo(env);
  return demo !== null && typeof organizationId === "string" && organizationId === demo;
}

/**
 * Proveedores de integración conocidos por Limitless.
 *
 * Es sólo el conjunto de identificadores. Todo lo que *describe* a cada
 * proveedor —cómo se autentica, qué datos mueve, qué módulo alimenta, si se ve
 * en la pantalla— vive en `lib/integrations/registry.ts`, que es el registro
 * único. Agregar un id acá sin entrada en el registro es un error de tipos.
 */
export const INTEGRATION_PROVIDERS = [
  // Ventas y conversaciones
  "zernio",
  "manychat",
  "calendly",
  "ghl",
  "fathom",
  "unipile_instagram",
  "unipile_whatsapp",
  // Marketing y contenido
  "google_ecosystem",
  "youtube",
  "instagram",
  "typeform",
  "google_forms",
  // Embudos
  "vturb",
  "webinarjam",
  "hyros",
  "landing",
  // Pagos
  "whop",
  "fanbasis",
  "stripe",
  "mercadopago",
  // Operación y datos
  "discord",
  "clickup",
] as const;

export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export function isIntegrationProvider(
  value: string,
): value is IntegrationProvider {
  return (INTEGRATION_PROVIDERS as readonly string[]).includes(value);
}

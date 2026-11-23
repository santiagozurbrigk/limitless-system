import { paths } from "@/routes/paths";

/**
 * Adónde sale el error de Leads (SCRUM-546): la pantalla de inicio de quien
 * mira, salvo que sea Leads misma (un rol con Ventas y sin Inicio ni Panel),
 * que es la que falló. Entonces, Ajustes si quien mira la puede abrir (tiene
 * su propio módulo de permisos, `settings`); si tampoco, `null`: la pantalla
 * de error muestra sólo «Reintentar», sin un enlace que lleve a otro bloqueo.
 * Lógica pura.
 */
export function destinoDelErrorDeLeads(
  inicio: string,
  puedeAbrirAjustes: boolean
): { href: string; texto: string } | null {
  const leads = paths.platform.webinars.leads;
  const esLeads = inicio === leads || inicio.startsWith(`${leads}/`) || inicio.startsWith(`${leads}?`);
  if (!esLeads) return { href: inicio, texto: "Ir al inicio" };
  return puedeAbrirAjustes ? { href: paths.platform.settings, texto: "Ir a Ajustes" } : null;
}

/**
 * Si quien mira puede abrir un módulo, con la misma regla que el layout
 * (`puedeEntrarAlModulo`), en una versión que se puede usar en el cliente.
 */
export function puedeAbrirModulo(
  permisos: { isFounder: boolean; hasRoleConfigured: boolean; modules: Partial<Record<string, string>> },
  moduleId: string
): boolean {
  if (permisos.isFounder || !permisos.hasRoleConfigured) return true;
  return (permisos.modules[moduleId] ?? "none") !== "none";
}

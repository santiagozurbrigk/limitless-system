import { paths } from "@/routes/paths";

/**
 * Adónde sale el error de Leads (SCRUM-546): la pantalla de inicio de quien
 * mira, salvo que sea Leads misma (un rol con Ventas y sin Inicio ni Panel),
 * que es la que falló; entonces, Ajustes, que es una ruta libre. Lógica pura.
 */
export function destinoDelErrorDeLeads(inicio: string): { href: string; texto: string } {
  const leads = paths.platform.webinars.leads;
  const esLeads = inicio === leads || inicio.startsWith(`${leads}/`) || inicio.startsWith(`${leads}?`);
  return esLeads ? { href: paths.platform.settings, texto: "Ir a Ajustes" } : { href: inicio, texto: "Ir al inicio" };
}

/**
 * ⭐ Las lecturas del marco de la plataforma y qué módulos las abren (SCRUM-540).
 *
 * El marco (`AppProviders` en el layout de `(platform)`, la barra y el menú del
 * celular) se monta en toda pantalla, y sus providers piden datos que después
 * usan pantallas de varios módulos. Antes los pedían para cualquier miembro:
 * alguien sin Clientes ni Finanzas recibía los clientes, los gastos y los
 * reportes ejecutivos de su organización en cualquier pantalla.
 *
 * Cada lectura se abre si la persona puede entrar a **alguno** de los módulos
 * cuyas pantallas la usan (la lista sale de quién consume cada dato: por
 * ejemplo, los clientes los muestran Clientes, Ventas con Cobros, Finanzas y el
 * Panel). Así, con cualquiera de esos módulos todo sigue igual, y sin ninguno
 * el dato no se pide ni viaja.
 *
 * Este archivo no depende del servidor: lo usan las actions
 * (`rechazoDeLecturaDelMarco` en `acceso-a-modulo.ts`) y los providers del
 * cliente (`leerDelMarco`), con la misma tabla.
 */
import type { PermissionModuleId } from "@/constants/permission-modules";
import {
  esRechazoPorModulo,
  puedeEntrarAlModulo,
  type PermisosDeModulo,
  type RechazoPorModulo,
} from "@/lib/auth/regla-de-modulo";

export const MODULOS_DE_LAS_LECTURAS_DEL_MARCO = {
  /** `listClientsAction`: lista de Clientes, Cobros, Finanzas, Panel (y el contador de la barra). */
  clientes: ["clients", "sales", "finance", "dashboard"],
  /** `listClosingCallsAction`: Closing y métricas de Ventas, Finanzas, Panel. */
  llamadasDeCierre: ["sales", "finance", "dashboard"],
  /** `listConversationsAction`, `getConnectedUnipileAccountsAction` y su canal en vivo: Inbox y métricas de Ventas, Panel. */
  conversaciones: ["sales", "dashboard"],
  /** Gastos fijos, suscripciones y sueldos de `loadFinanceConfigAction`: Finanzas, Gastos, el resumen de Ventas y del Panel. */
  configuracionDeFinanzas: ["finance", "sales", "dashboard"],
  /** Las plataformas de cobro de `loadFinanceConfigAction`: lo mismo, más Ajustes y el cobro de Closing. */
  plataformasDePago: ["finance", "sales", "dashboard", "settings"],
  /** `listOrganizationPaymentsAction`: Finanzas, el resumen de Ventas y el Panel. */
  cobros: ["finance", "sales", "dashboard"],
  /** `getSalesMetricsSnapshotsAction`: métricas importadas del Panel y de Ventas. */
  metricasImportadas: ["dashboard", "sales"],
  /** `getInstagramIntegrationStatusAction`: el estado de Instagram que usan Marketing e Integraciones. */
  instagram: ["marketing", "integrations"],
  /** `getLatestReportsByCadenceAction`: el panel de reportes de la barra (los reportes son de Operaciones). */
  reportesEjecutivos: ["operations"],
  /** `countPendingFathomCallsAction`: el contador de llamadas sin asignar de Clientes. */
  llamadasPendientes: ["clients"],
} as const satisfies Record<string, readonly PermissionModuleId[]>;

export type LecturaDelMarco = keyof typeof MODULOS_DE_LAS_LECTURAS_DEL_MARCO;

/** Si la persona puede leer `lectura`: entra a alguno de sus módulos, con la regla de siempre. */
export function puedeLeerDelMarco(permisos: PermisosDeModulo, lectura: LecturaDelMarco): boolean {
  return MODULOS_DE_LAS_LECTURAS_DEL_MARCO[lectura].some((moduleId) =>
    puedeEntrarAlModulo(permisos, moduleId)
  );
}

/**
 * Lo que usan los providers del marco para pedir una lectura: sin el módulo no
 * la pide (ni un pedido de más) y devuelve `vacio`; si la action la rechaza
 * igual (los permisos cambiaron mientras la pantalla estaba abierta), también
 * `vacio`. El componente que la usa queda vacío, sin error. Una falla de la
 * lectura sigue su camino como antes (lanza o vuelve como la devuelva la action).
 */
export async function leerDelMarco<T>(
  permisos: PermisosDeModulo,
  lectura: LecturaDelMarco,
  leer: () => Promise<T | RechazoPorModulo>,
  vacio: T
): Promise<T> {
  if (!puedeLeerDelMarco(permisos, lectura)) return vacio;
  const resultado = await leer();
  return esRechazoPorModulo(resultado) ? vacio : resultado;
}

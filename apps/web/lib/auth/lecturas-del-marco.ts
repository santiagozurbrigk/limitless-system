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
 * cuyas pantallas **muestran** ese dato tal cual (mínimo privilegio, AR 1 de
 * SCRUM-540). Un módulo que sólo muestra totales no recibe las filas: los
 * recibe calculados en el servidor (Ventas, `resumenFinanciero`; el Panel, en
 * su propia página). Así cada módulo recibe lo que sus pantallas muestran, y
 * sin ninguno el dato no se pide ni viaja.
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
  /**
   * `listClientsAction`: las filas de clientes. Las muestran Clientes, Ventas
   * (Cobros, Closing) y Finanzas. El Panel no: sus totales se calculan en el
   * servidor (`leerDatosDelPanel`).
   */
  clientes: ["clients", "sales", "finance"],
  /** `listClosingCallsAction`: Closing y métricas de Ventas, y Finanzas (comisiones por closer). */
  llamadasDeCierre: ["sales", "finance"],
  /** `listConversationsAction`, `getConnectedUnipileAccountsAction` y su canal en vivo: Inbox y métricas de Ventas. */
  conversaciones: ["sales"],
  /**
   * El detalle de Finanzas en `loadFinanceConfigAction`: gastos fijos,
   * suscripciones, sueldos y comisiones por persona, y lo cobrado por
   * plataforma. Sólo lo muestra Finanzas.
   */
  detalleDeFinanzas: ["finance"],
  /**
   * Las plataformas de cobro sin lo cobrado (nombre, clave, moneda, etiqueta):
   * Finanzas, el cobro de Closing (Ventas) y Ajustes.
   */
  plataformasDePago: ["finance", "sales", "settings"],
  /**
   * `getResumenFinancieroAction`: los totales que muestra Ventas (gastos del
   * mes, facturación, margen, por cobrar, serie mensual), calculados en el
   * servidor. Finanzas los calcula en el navegador con el detalle.
   */
  resumenFinanciero: ["finance", "sales"],
  /** `listOrganizationPaymentsAction`: cada cobro de la org. Sólo Finanzas. */
  cobros: ["finance"],
  /** `getSalesMetricsSnapshotsAction`: las métricas importadas, respaldo de los totales de Finanzas y de Ventas. */
  metricasImportadas: ["finance", "sales"],
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

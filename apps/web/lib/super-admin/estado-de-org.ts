import type { OrganizationStatus } from "@ai-coo/types";
import { es } from "@/lib/locale/es";
import type { AdminOrgPlan, AdminOrgStatus } from "@/types/super-admin";

/**
 * Estado de la organización en el panel de super admin, alineado con la base
 * (`organizations.status in ('active', 'paused', 'churned')`). Antes los tipos
 * decían `inactive` y `trial`, que la base no puede producir: una org pausada o
 * dada de baja se mostraba como "Inactivo" y los filtros de "Trial" nunca
 * encontraban nada.
 */

export const ESTADOS_DE_ORG = ["active", "paused", "churned"] as const satisfies readonly OrganizationStatus[];

export const ETIQUETA_DE_ESTADO_DE_ORG: Record<AdminOrgStatus, string> = {
  ...es.status.org,
  unknown: "Desconocido",
};

export const VARIANTE_DE_ESTADO_DE_ORG: Record<
  AdminOrgStatus,
  "success" | "warning" | "secondary" | "outline"
> = {
  active: "success",
  paused: "warning",
  churned: "secondary",
  unknown: "outline",
};

/**
 * Lee `organizations.status`. El check de la base sólo admite los tres
 * estados; si llegara otro valor no se inventa uno: se muestra "Desconocido"
 * (`unknown`) y se avisa en la consola.
 */
export function estadoDeOrg(status: string | null | undefined): AdminOrgStatus {
  if (status === "active" || status === "paused" || status === "churned") return status;
  console.warn(`[super-admin] estado de organización desconocido: ${String(status)}`);
  return "unknown";
}

/**
 * Qué ofrece el botón de estado de una org: "Pausar" una activa, "Activar"
 * una pausada o dada de baja (`setOrganizationStatusAction(id, activar)`).
 * Con estado desconocido no ofrece nada: cualquiera de las dos sería
 * engañosa sin saber en qué estado está.
 */
export function accionDeEstado(
  status: AdminOrgStatus
): { etiqueta: "Pausar" | "Activar"; activar: boolean } | null {
  if (status === "active") return { etiqueta: "Pausar", activar: false };
  if (status === "paused" || status === "churned") return { etiqueta: "Activar", activar: true };
  return null;
}

/** Plan estimado por MRR en USD: no hay columna de plan en la base. */
export function planPorMrr(mrrUsd: number): AdminOrgPlan {
  if (mrrUsd >= 50000) return "enterprise";
  if (mrrUsd >= 30000) return "growth";
  return "starter";
}

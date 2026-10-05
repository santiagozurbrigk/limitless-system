import type { OrganizationStatus } from "@ai-coo/types";
import { es } from "@/lib/locale/es";
import type { AdminOrgPlan } from "@/types/super-admin";

/**
 * Estado de la organización en el panel de super admin, alineado con la base
 * (`organizations.status in ('active', 'paused', 'churned')`). Antes los tipos
 * decían `inactive` y `trial`, que la base no puede producir: una org pausada o
 * dada de baja se mostraba como "Inactivo" y los filtros de "Trial" nunca
 * encontraban nada.
 */

export const ESTADOS_DE_ORG = ["active", "paused", "churned"] as const satisfies readonly OrganizationStatus[];

export const ETIQUETA_DE_ESTADO_DE_ORG: Record<OrganizationStatus, string> = es.status.org;

export const VARIANTE_DE_ESTADO_DE_ORG: Record<OrganizationStatus, "success" | "warning" | "secondary"> = {
  active: "success",
  paused: "warning",
  churned: "secondary",
};

/**
 * Lee `organizations.status`. El check de la base sólo admite los tres
 * estados; si llegara otro valor, no se muestra como activa: se trata como
 * pausada, que es lo que el super admin puede volver a activar.
 */
export function estadoDeOrg(status: string | null | undefined): OrganizationStatus {
  if (status === "active" || status === "paused" || status === "churned") return status;
  console.warn(`[super-admin] estado de organización desconocido: ${String(status)}`);
  return "paused";
}

/** Plan estimado por MRR en USD: no hay columna de plan en la base. */
export function planPorMrr(mrrUsd: number): AdminOrgPlan {
  if (mrrUsd >= 50000) return "enterprise";
  if (mrrUsd >= 30000) return "growth";
  return "starter";
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { FallaDeLaBase, registrarFallaDeAccion } from "@/lib/server/action-result";
import {
  BUILT_IN_CATALOG,
  buildFollowUpCatalog,
  isFollowUpBehavior,
  isFollowUpColor,
  type FollowUpCatalog,
  type FollowUpKind,
  type FollowUpOption,
} from "@/lib/sales/follow-up-options";

/**
 * Los valores de seguimiento propios de la organización, leídos de la base.
 *
 * Vive fuera de `app/sales/follow-up-options-actions.ts` para que las acciones
 * de leads lo usen sin pasar por otra server action (SCRUM-504): cada export de
 * un archivo `"use server"` es un endpoint y devuelve `MutationResult`.
 */

export type OptionRow = {
  id: string;
  kind: FollowUpKind;
  slug: string;
  label: string;
  color: string;
  behavior: string;
  sort_order: number;
  archived_at: string | null;
};

export const OPTION_COLUMNS = "id, kind, slug, label, color, behavior, sort_order, archived_at";

export function rowToOption(row: OptionRow): FollowUpOption {
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    label: row.label,
    // Un color o comportamiento que no reconocemos no rompe la fila: cae al
    // default visible. El dato que importa —el slug— se conserva igual.
    color: isFollowUpColor(row.color) ? row.color : "slate",
    behavior: isFollowUpBehavior(row.behavior) ? row.behavior : "needs_date",
    sortOrder: row.sort_order,
    builtIn: false,
    archived: row.archived_at !== null,
  };
}

async function consultarCatalogo(supabase: SupabaseClient, organizationId: string) {
  return supabase
    .from("sales_follow_up_options")
    .select(OPTION_COLUMNS)
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });
}

/**
 * Catálogo completo (de fábrica + propios) para **validar una escritura**. Si
 * la lectura falla, lanza `FallaDeLaBase`: con el catálogo de fábrica, un
 * valor propio válido se rechazaría como "no existe en el catálogo", que no es
 * cierto (AR de SCRUM-504, MAYOR-1). La acción la registra y devuelve el texto
 * fijo.
 */
export async function leerCatalogoParaEscribir(
  supabase: SupabaseClient,
  organizationId: string
): Promise<FollowUpCatalog> {
  const { data, error } = await consultarCatalogo(supabase, organizationId);
  if (error) throw new FallaDeLaBase(error);
  return buildFollowUpCatalog(((data ?? []) as OptionRow[]).map(rowToOption));
}

/**
 * Catálogo completo para **mostrar**. Si la lectura falla, la pantalla sigue
 * funcionando con los valores de fábrica, pero la falla se registra y va a
 * Sentry con la etiqueta de la acción (`etiqueta`): no se pierde.
 */
export async function leerCatalogoConRespaldo(
  supabase: SupabaseClient,
  organizationId: string,
  etiqueta: string
): Promise<FollowUpCatalog> {
  const { data, error } = await consultarCatalogo(supabase, organizationId);
  if (error) {
    registrarFallaDeAccion(etiqueta, new FallaDeLaBase(error));
    return BUILT_IN_CATALOG;
  }
  return buildFollowUpCatalog(((data ?? []) as OptionRow[]).map(rowToOption));
}

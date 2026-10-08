import type { SupabaseClient } from "@supabase/supabase-js";
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

/** Catálogo completo: de fábrica + propios, listo para la UI y para el motor. */
export async function leerCatalogoDeSeguimiento(
  supabase: SupabaseClient,
  organizationId: string
): Promise<FollowUpCatalog> {
  const { data, error } = await supabase
    .from("sales_follow_up_options")
    .select(OPTION_COLUMNS)
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });

  // Sin catálogo propio la pantalla sigue funcionando con los de fábrica: es
  // preferible a dejar la tabla sin valores porque falló una query. Queda en
  // el log.
  if (error) console.warn("[leerCatalogoDeSeguimiento]", error.message);
  if (error || !data) return BUILT_IN_CATALOG;

  return buildFollowUpCatalog((data as OptionRow[]).map(rowToOption));
}

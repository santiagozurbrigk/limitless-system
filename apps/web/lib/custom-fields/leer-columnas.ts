import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { FallaDeLaBase } from "@/lib/server/action-result";
import { rowToFieldDefinition } from "@/lib/custom-fields";
import type {
  FieldDefinition,
  FieldDefinitionRow,
  FieldEntity,
} from "@/types/custom-fields";
import { esTablaAusente } from "@/lib/server/tabla-ausente";

/**
 * Las columnas configurables de la organización, archivadas incluidas, con la
 * falla a la vista (SCRUM-517).
 *
 * Es la lectura que usan las escrituras para validar (la clave nueva no se
 * repite, la métrica de un checkpoint existe, los valores de un cliente son de
 * un campo ofrecido). Antes se leían con `listFieldDefinitionsAction`, que ante
 * una falla devolvía `[]`: crear una columna podía chocar con una clave que ya
 * existía y guardar los campos de un cliente decía "guardados" sin guardar
 * nada. Acá una tabla ausente (antes de su migración) sigue contando como
 * vacía; cualquier otro error lanza una `FallaDeLaBase`. La tabla ausente se
 * decide por código (`esTablaAusente`): un PGRST002 de PostgREST dice "schema
 * cache" en el texto pero es una caída, y antes se tomaba como tabla ausente
 * (SCRUM-516, AR pasada 2).
 */
export async function leerColumnas(
  supabase: SupabaseClient,
  organizationId: string,
  entity?: FieldEntity
): Promise<FieldDefinition[]> {
  let query = supabase
    .from("field_definitions")
    .select("*")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (entity) query = query.eq("entity", entity);

  const { data, error } = await query;

  if (error) {
    if (esTablaAusente(error)) return [];
    throw new FallaDeLaBase(error);
  }

  return ((data ?? []) as FieldDefinitionRow[])
    .map(rowToFieldDefinition)
    .filter((field): field is FieldDefinition => field !== null);
}

"use server";

/**
 * Los valores de las columnas configurables **de un cliente**.
 *
 * ⭐ No confundir con `custom-field-actions.ts`: ese administra el catálogo —qué
 * columnas existen y con qué opciones— y es del founder. Esto carga el dato de
 * un cliente concreto, que es trabajo de todos los días.
 *
 * El valor vive en `clients.custom`, el mismo patrón que `client_wins.custom` y
 * `client_checkpoint_events.metrics`: un jsonb en la fila dueña, con la clave
 * del `field_definitions`.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isMissingTableError, requireOrganizationId } from "@/lib/auth/bootstrap";
import { leerColumnas } from "@/lib/custom-fields/leer-columnas";
import {
  activeFields,
  mergeCustomFieldValues,
  validateFieldValues,
} from "@/lib/custom-fields";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { firstZodError } from "@/lib/validations";
import { createClient } from "@/lib/supabase/server";
import { paths } from "@/routes";
import type { CustomFieldValues, FieldDefinition } from "@/types/custom-fields";
import { rechazoPorModulo } from "@/lib/auth/acceso-a-modulo";

const updateSchema = z.object({
  clientId: z.string().uuid(),
  values: z.record(z.string(), z.unknown()).default({}),
});

export type UpdateClientCustomFieldsInput = z.input<typeof updateSchema>;

/**
 * Las columnas configurables de cliente. Archivadas incluidas, como en C0.
 *
 * SCRUM-517: con un error devuelve el motivo (antes, una lista vacía: la ficha
 * escondía sus tarjetas como si la organización no tuviera columnas).
 */
export async function listClientFieldDefinitionsAction(): Promise<
  MutationResult<FieldDefinition[]>
> {
  const rechazo = await rechazoPorModulo("clients");
  if (rechazo) return rechazo;

  return mutacionConErroresEsperables("[listClientFieldDefinitions]", async () => {
    const organizationId = await requireOrganizationId();
    return leerColumnas(await createClient(), organizationId, "client");
  });
}

/**
 * Guarda las columnas configurables de un cliente.
 *
 * ⭐ Dos reglas que valen acá y explican el `merge` de abajo:
 *
 *   1. **Se valida sólo contra los campos activos**, que son los que el
 *      formulario ofrece. Validar contra uno archivado rebotaría: sus opciones
 *      dejaron de estar disponibles, y guardar un cliente sin tocar ese campo
 *      fallaría con un error que nadie puede arreglar desde la pantalla.
 *   2. **Lo cargado en un campo archivado se conserva.** Un campo archivado
 *      deja de ofrecerse pero sigue mostrándose donde ya se cargó; si el guardado
 *      lo pisara, archivar sería una forma silenciosa de borrar el pasado.
 *
 * De ahí que el resultado sea "lo archivado que ya estaba" + "lo validado", y no
 * simplemente lo validado.
 */
export async function updateClientCustomFieldsAction(
  input: UpdateClientCustomFieldsInput
): Promise<MutationResult<CustomFieldValues>> {
  return mutacionConErroresEsperables("[updateClientCustomFields]", async () => {
    const organizationId = await requireOrganizationId();

    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) throw new ErrorEsperable(firstZodError(parsed.error));
    const { clientId, values } = parsed.data;

    const supabase = await createClient();

    const { data: current, error: readError } = await supabase
      .from("clients")
      .select("custom")
      .eq("id", clientId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (readError) {
      if (isMissingTableError(readError.message)) {
        throw new ErrorEsperable(
          "La columna de campos configurables todavía no existe en la base. Falta aplicar la migración."
        );
      }
      throw new FallaDeLaBase(readError);
    }
    if (!current) throw new ErrorEsperable("El cliente no existe");

    // Con la lectura que lanza: si las columnas no se pudieran leer, validar
    // contra ninguna descartaba lo editado y la ficha decía "guardados".
    const all = await leerColumnas(supabase, organizationId, "client");
    const offered = activeFields(all);

    const validation = validateFieldValues(offered, values);
    if (!validation.ok) {
      // ⭐ Todos los errores, no el primero. La tarjeta guarda los 22 campos de
      // una sola vez: quedarse con uno obliga a apretar Guardar, corregir,
      // apretar de nuevo y recién ahí enterarse del siguiente.
      const mensajes = Object.values(validation.errors);
      throw new ErrorEsperable(mensajes.join(" · ") || "Datos inválidos");
    }

    const loaded = (current.custom ?? {}) as CustomFieldValues;
    const merged = mergeCustomFieldValues(all, loaded, validation.values);

    const { error } = await supabase
      .from("clients")
      .update({ custom: merged, updated_at: new Date().toISOString() })
      .eq("id", clientId)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);

    revalidatePath(paths.platform.clients.detail(clientId));
    revalidatePath(paths.platform.clients.root);
    return merged;
  });
}

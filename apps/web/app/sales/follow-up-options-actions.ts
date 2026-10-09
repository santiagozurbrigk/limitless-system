"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";
import {
  BUILT_IN_CATALOG,
  isFollowUpKind,
  slugifyOptionLabel,
  type FollowUpBehavior,
  type FollowUpCatalog,
  type FollowUpColor,
  type FollowUpKind,
  type FollowUpOption,
} from "@/lib/sales/follow-up-options";
import {
  leerCatalogoConRespaldo,
  OPTION_COLUMNS,
  rowToOption,
  type OptionRow,
} from "@/lib/sales/catalogo-de-seguimiento";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { paths } from "@/routes";

/**
 * Los valores de seguimiento propios de la organización.
 *
 * Los de fábrica no viven en la base: se juntan con estos al leer. Así una
 * organización nueva ya tiene vocabulario, y borrar filas acá no deja a nadie
 * sin próximo paso posible.
 *
 * SCRUM-504: devuelven sus errores como valor (`MutationResult`). Sesión y
 * validación vuelven con su motivo; un error de la base se registra, va a
 * Sentry y vuelve con el texto fijo.
 */

/** Código de Postgres de una restricción de unicidad violada. */
const VIOLACION_DE_UNICIDAD = "23505";
const VALOR_REPETIDO = "Ya existe un valor con ese nombre.";

/** Catálogo completo: de fábrica + propios, listo para la UI y para el motor. */
export async function getFollowUpCatalogAction(): Promise<MutationResult<FollowUpCatalog>> {
  return mutacionConErroresEsperables("[getFollowUpCatalog]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    return leerCatalogoConRespaldo(supabase, organizationId, "[getFollowUpCatalog]");
  });
}

export async function createFollowUpOptionAction(params: {
  kind: FollowUpKind;
  label: string;
  color?: FollowUpColor;
  behavior?: FollowUpBehavior;
}): Promise<MutationResult<FollowUpOption>> {
  return mutacionConErroresEsperables("[createFollowUpOption]", async () => {
    const organizationId = await requireOrganizationId();

    const label = params.label.trim();
    if (!label) throw new ErrorEsperable("El valor necesita un nombre.");
    if (label.length > 60) {
      throw new ErrorEsperable("El nombre no puede pasar de 60 caracteres.");
    }
    if (!isFollowUpKind(params.kind)) {
      throw new ErrorEsperable("Tipo de valor desconocido.");
    }

    // Una calificación sólo describe: no puede cerrar el hilo ni pedir fecha.
    const behavior: FollowUpBehavior =
      params.kind === "qualification" ? "neutral" : (params.behavior ?? "needs_date");
    if (params.kind === "next_action" && behavior === "neutral") {
      throw new ErrorEsperable("Un próximo paso tiene que pedir fecha o cerrar el hilo.");
    }

    const slug = slugifyOptionLabel(label);
    const builtIns =
      params.kind === "next_action"
        ? BUILT_IN_CATALOG.nextActions
        : BUILT_IN_CATALOG.qualifications;
    if (builtIns.some((o) => o.slug === slug || o.label === label)) {
      throw new ErrorEsperable(VALOR_REPETIDO);
    }

    const supabase = await createClient();

    const { data: last, error: lastError } = await supabase
      .from("sales_follow_up_options")
      .select("sort_order")
      .eq("organization_id", organizationId)
      .eq("kind", params.kind)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastError) throw new FallaDeLaBase(lastError);

    const { data, error } = await supabase
      .from("sales_follow_up_options")
      .insert({
        organization_id: organizationId,
        kind: params.kind,
        slug,
        label,
        color: params.color ?? "slate",
        behavior,
        sort_order: ((last?.sort_order as number | undefined) ?? -1) + 1,
      })
      .select(OPTION_COLUMNS)
      .single();

    if (error) {
      // 23505: ya existe ese slug en la organización, probablemente archivado.
      if (error.code === VIOLACION_DE_UNICIDAD) throw new ErrorEsperable(VALOR_REPETIDO);
      throw new FallaDeLaBase(error);
    }

    revalidatePath(paths.platform.sales.closing);
    return rowToOption(data as OptionRow);
  });
}

export async function updateFollowUpOptionAction(params: {
  id: string;
  label?: string;
  color?: FollowUpColor;
}): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[updateFollowUpOption]", async () => {
    const organizationId = await requireOrganizationId();

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (params.label !== undefined) {
      const label = params.label.trim();
      if (!label) throw new ErrorEsperable("El valor necesita un nombre.");
      // El slug **no** se toca al renombrar: los turnos ya cargados lo apuntan.
      patch.label = label;
    }
    if (params.color !== undefined) patch.color = params.color;

    const supabase = await createClient();
    const { error } = await supabase
      .from("sales_follow_up_options")
      .update(patch)
      .eq("id", params.id)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);

    revalidatePath(paths.platform.sales.closing);
  });
}

/**
 * Archiva o desarchiva un valor propio.
 *
 * ⭐ **No se borra.** Hay turnos apuntando a este slug: borrarlo vaciaría ese
 * dato en silencio. Archivado desaparece del selector, pero las filas que ya lo
 * tenían lo siguen mostrando.
 */
export async function setFollowUpOptionArchivedAction(params: {
  id: string;
  archived: boolean;
}): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[setFollowUpOptionArchived]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("sales_follow_up_options")
      .update({
        archived_at: params.archived ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);

    revalidatePath(paths.platform.sales.closing);
  });
}

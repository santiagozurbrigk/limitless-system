"use server";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { uuidSchema } from "@/lib/validations";
import type { InstallmentSystem, Plan } from "@/types/plans";

// ── Tipos internos ──────────────────────────────────────────────────────────

type PlanRow = {
  id: string;
  organization_id: string;
  name: string;
  duration_days: number | null;
  installment_systems: InstallmentSystem[];
  created_at: string;
  updated_at: string;
};

function rowToPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    durationDays: row.duration_days ?? undefined,
    installmentSystems: row.installment_systems ?? [],
    createdAt: row.created_at,
  };
}

/**
 * SCRUM-516: los planes devuelven sus errores esperables como valor
 * (`MutationResult`). Corren dentro de `mutacionConErroresEsperables`: sólo un
 * `ErrorEsperable` vuelve con su mensaje (validación, sesión, Supabase no
 * configurado, plan inexistente o de otra organización); lo inesperado (la red,
 * la base, una RLS que rechaza) se registra, va a Sentry y vuelve con el texto
 * fijo. Antes el texto crudo de la base llegaba a la pantalla, y la lista de
 * planes devolvía `[]` ante una falla: Cobros y el cierre de venta mostraban
 * "sin planes".
 */

/** Código de PostgREST cuando `.single()` no encuentra la fila. */
const SIN_FILAS = "PGRST116";

const SUPABASE_NO_CONFIGURADO = "Supabase no configurado";
const PLAN_NO_ENCONTRADO = "No se encontró el plan. Puede que lo hayan eliminado.";

function exigirSupabase() {
  if (!isSupabaseConfigured()) throw new ErrorEsperable(SUPABASE_NO_CONFIGURADO);
}

/** Un rechazo de PostgREST que se conoce vuelve con su motivo; el resto es una falla. */
function errorDePlan(error: { message: string; code?: string | null }): Error {
  if (error.code === SIN_FILAS) return new ErrorEsperable(PLAN_NO_ENCONTRADO);
  return new FallaDeLaBase(error);
}

// ── Listar planes ───────────────────────────────────────────────────────────

export async function listPlansAction(): Promise<MutationResult<Plan[]>> {
  return mutacionConErroresEsperables("[listPlans]", async () => {
    if (!isSupabaseConfigured()) return [];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("plans")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new FallaDeLaBase(error);
    return (data as PlanRow[]).map(rowToPlan);
  });
}

// ── Crear plan ──────────────────────────────────────────────────────────────

export async function createPlanAction(input: {
  name: string;
  durationDays?: number | null;
  installmentSystems?: InstallmentSystem[];
}): Promise<MutationResult<Plan>> {
  return mutacionConErroresEsperables("[createPlan]", async () => {
    exigirSupabase();
    if (!input.name?.trim()) throw new ErrorEsperable("El nombre es obligatorio");

    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("plans")
      .insert({
        organization_id: organizationId,
        name: input.name.trim(),
        duration_days: input.durationDays ?? null,
        installment_systems: input.installmentSystems ?? [],
      })
      .select()
      .single();

    if (error) throw new FallaDeLaBase(error);
    if (!data) throw new FallaDeLaBase({ message: "El alta no devolvió el plan creado" });
    return rowToPlan(data as PlanRow);
  });
}

// ── Actualizar plan ─────────────────────────────────────────────────────────

export async function updatePlanAction(
  id: string,
  patch: {
    name?: string;
    durationDays?: number | null;
    installmentSystems?: InstallmentSystem[];
  }
): Promise<MutationResult<Plan>> {
  return mutacionConErroresEsperables("[updatePlan]", async () => {
    if (!uuidSchema.safeParse(id).success) throw new ErrorEsperable("ID inválido");
    exigirSupabase();

    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.name != null) update.name = patch.name.trim();
    if ("durationDays" in patch) update.duration_days = patch.durationDays ?? null;
    if (patch.installmentSystems != null) update.installment_systems = patch.installmentSystems;

    const { data, error } = await supabase
      .from("plans")
      .update(update)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();

    if (error) throw errorDePlan(error);
    if (!data) throw new ErrorEsperable(PLAN_NO_ENCONTRADO);
    return rowToPlan(data as PlanRow);
  });
}

// ── Eliminar plan ───────────────────────────────────────────────────────────

export async function deletePlanAction(id: string): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[deletePlan]", async () => {
    if (!uuidSchema.safeParse(id).success) throw new ErrorEsperable("ID inválido");
    exigirSupabase();

    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("plans")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);
  });
}

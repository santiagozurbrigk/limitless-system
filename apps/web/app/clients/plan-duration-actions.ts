"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getCurrentProfile,
  isMissingTableError,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import { distinctPlanNames } from "@/lib/clients/plan-utils";
import {
  rowToPlanDuration,
  type PlanDurationRow,
} from "@/lib/clients/plan-duration-mapper";
import { leerPagosDeLaOrganizacion } from "@/lib/sales/pagos";
import { listClientsAction } from "@/app/clients/actions";
import { extractPlanDurationsFromRAG } from "@/lib/rag/extract-plan-durations";
import {
  mutacionConErroresEsperables,
  runMutation,
  type MutationResult,
} from "@/lib/server/action-result";
import { firstZodError } from "@/lib/validations";
import { createClient } from "@/lib/supabase/server";
import { paths } from "@/routes";
import type { PlanDuration } from "@/types/plan-durations";

const updatePlanDurationSchema = z.object({
  planName: z.string().trim().min(1).max(500),
  durationDays: z.number().int().min(1).max(3650).nullable(),
});

async function requireFounder() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "founder") {
    throw new Error("Solo el founder puede gestionar duraciones de planes");
  }
}

export async function listPlanDurationsAction(): Promise<PlanDuration[]> {
  try {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("plan_durations")
      .select("*")
      .eq("organization_id", organizationId)
      .order("plan_name", { ascending: true });

    if (error) {
      if (isMissingTableError(error.message)) return [];
      console.error("[listPlanDurations]", error.message);
      return [];
    }

    return (data as PlanDurationRow[]).map(rowToPlanDuration);
  } catch {
    return [];
  }
}

/**
 * Lo cobrado por cliente y las duraciones de plan, para Cobros. Devuelve su
 * error como valor (SCRUM-504): si los pagos no se pueden leer, la pantalla
 * avisa en vez de mostrar a todos los clientes con la deuda completa.
 */
export async function getClientsTableEnrichmentAction(): Promise<
  MutationResult<{
    paidByClientId: Record<string, number>;
    planDurations: PlanDuration[];
    isFounder: boolean;
  }>
> {
  return mutacionConErroresEsperables("[getClientsTableEnrichment]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const [profile, payments, planDurations] = await Promise.all([
      getCurrentProfile(),
      leerPagosDeLaOrganizacion(supabase, organizationId),
      listPlanDurationsAction(),
    ]);

    const paidByClientId: Record<string, number> = {};
    for (const payment of payments) {
      paidByClientId[payment.clientId] =
        (paidByClientId[payment.clientId] ?? 0) + payment.amount;
    }

    return {
      paidByClientId,
      planDurations,
      isFounder: profile?.role === "founder",
    };
  });
}

export async function resolvePlanDurationsAction(
  planNames?: string[]
): Promise<MutationResult<{ resolved: number }>> {
  return runMutation(async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const names =
      planNames?.map((n) => n.trim()).filter(Boolean) ??
      distinctPlanNames(await listClientsAction());

    if (!names.length) {
      throw new Error("No hay planes para inferir. Asigná productos a los clientes primero.");
    }

    const existingRows = await listPlanDurationsAction();
    const manualPlans = new Set(
      existingRows
        .filter((r) => r.source === "manual")
        .map((r) => r.planName.toLowerCase())
    );

    const extracted = await extractPlanDurationsFromRAG(organizationId, names);
    const now = new Date().toISOString();

    let resolved = 0;
    for (const item of extracted) {
      if (manualPlans.has(item.plan_name.toLowerCase())) continue;

      const { error } = await supabase.from("plan_durations").upsert(
        {
          organization_id: organizationId,
          plan_name: item.plan_name,
          duration_days: item.duration_days,
          source: item.duration_days != null ? "rag" : "unknown",
          source_detail: item.source_detail ?? null,
          resolved_at: now,
          updated_at: now,
        },
        { onConflict: "organization_id,plan_name" }
      );

      if (error) {
        if (isMissingTableError(error.message)) {
          throw new Error(
            "Falta la tabla plan_durations. Ejecutá supabase/migrations/20260720100000_clients_offered_product_and_plan_durations.sql"
          );
        }
        throw new Error(error.message);
      }
      resolved += 1;
    }

    revalidatePath(paths.platform.clients.root);
    return { resolved };
  });
}

export async function updatePlanDurationAction(
  input: unknown
): Promise<MutationResult<PlanDuration>> {
  const parsed = updatePlanDurationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  return runMutation(async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const now = new Date().toISOString();
    const { planName, durationDays } = parsed.data;

    const { data, error } = await supabase
      .from("plan_durations")
      .upsert(
        {
          organization_id: organizationId,
          plan_name: planName.trim(),
          duration_days: durationDays,
          source: durationDays != null ? "manual" : "unknown",
          source_detail: durationDays != null ? "Corrección manual del founder" : null,
          resolved_at: now,
          updated_at: now,
        },
        { onConflict: "organization_id,plan_name" }
      )
      .select("*")
      .single();

    if (error) {
      if (isMissingTableError(error.message)) {
        throw new Error(
          "Falta la tabla plan_durations. Ejecutá supabase/migrations/20260720100000_clients_offered_product_and_plan_durations.sql"
        );
      }
      throw new Error(error.message);
    }

    revalidatePath(paths.platform.clients.root);
    return rowToPlanDuration(data as PlanDurationRow);
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getCurrentProfile,
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
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { lecturaDegradable } from "@/lib/server/lectura-degradable";
import { AI_KEY_REJECTED_MESSAGE } from "@/lib/ai/anthropic-auth-errors";
import { claudeNoCreditsUserMessage } from "@/lib/ai/anthropic-errors";
import { firstZodError } from "@/lib/validations";
import { createClient } from "@/lib/supabase/server";
import { paths } from "@/routes";
import type { PlanDuration } from "@/types/plan-durations";
import { esTablaAusente } from "@/lib/server/tabla-ausente";
import { rechazoPorModulo } from "@/lib/auth/acceso-a-modulo";

const updatePlanDurationSchema = z.object({
  planName: z.string().trim().min(1, "Falta el nombre del plan.").max(500, "El nombre del plan es demasiado largo."),
  durationDays: z
    .number({ error: "La duración tiene que ser un número de días." })
    .int("La duración tiene que ser un número entero de días.")
    .min(1, "La duración tiene que ser de al menos 1 día.")
    .max(3650, "La duración no puede pasar de 3650 días.")
    .nullable(),
});

/**
 * SCRUM-516: las duraciones de plan devuelven sus errores esperables como valor
 * (`MutationResult`), dentro de `mutacionConErroresEsperables`. Ser founder,
 * la sesión, la validación, la tabla que falta y la clave de Claude rechazada o
 * sin créditos vuelven con su motivo; lo inesperado se registra, va a Sentry y
 * vuelve con el texto fijo. Antes el texto crudo de la base llegaba a la
 * pantalla y la lista devolvía `[]` ante cualquier falla.
 */

const SOLO_FOUNDER = "Solo el founder puede gestionar duraciones de planes";
const FALTA_LA_TABLA =
  "Falta la tabla plan_durations. Ejecutá supabase/migrations/20260720100000_clients_offered_product_and_plan_durations.sql";

/**
 * Sólo el founder gestiona las duraciones. Antes se preguntaba con
 * `getCurrentProfile`, que devuelve `null` también cuando la lectura del perfil
 * falla: el founder veía "Solo el founder..." ante una caída de la base. Ahora
 * la falla es una `FallaDeLaBase` (texto fijo y registro) y el rechazo queda
 * sólo para quien no es founder. Se llama después de `requireOrganizationId`,
 * que ya resolvió la sesión.
 */
async function requireFounder(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ErrorEsperable("Sesión no válida");
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new FallaDeLaBase(error);
  if (data?.role !== "founder") throw new ErrorEsperable(SOLO_FOUNDER);
}

function errorDeEscritura(error: { message: string; code?: string | null }): Error {
  if (esTablaAusente(error)) return new ErrorEsperable(FALTA_LA_TABLA);
  return new FallaDeLaBase(error);
}

/**
 * Las duraciones de la organización. Sin la tabla devuelve `[]` (la migración
 * todavía no corrió); cualquier otro error es una `FallaDeLaBase`.
 */
async function leerDuracionesDePlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string
): Promise<PlanDuration[]> {
  const { data, error } = await supabase
    .from("plan_durations")
    .select("*")
    .eq("organization_id", organizationId)
    .order("plan_name", { ascending: true });

  if (error) {
    if (esTablaAusente(error)) return [];
    throw new FallaDeLaBase(error);
  }

  return (data as PlanDurationRow[]).map(rowToPlanDuration);
}

export async function listPlanDurationsAction(): Promise<MutationResult<PlanDuration[]>> {
  return mutacionConErroresEsperables("[listPlanDurations]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    return leerDuracionesDePlan(supabase, organizationId);
  });
}

/**
 * Lo cobrado por cliente y las duraciones de plan, para Cobros. Devuelve su
 * error como valor (SCRUM-504): si los pagos no se pueden leer, la pantalla
 * avisa en vez de mostrar a todos los clientes con la deuda completa.
 *
 * Las duraciones son secundarias (los días que le quedan al programa): si no se
 * pueden leer, la falla se registra (SCRUM-516) y Cobros sigue con lo cobrado,
 * sin los días restantes de los clientes cuyo plan no tiene duración propia.
 */
export async function getClientsTableEnrichmentAction(): Promise<
  MutationResult<{
    paidByClientId: Record<string, number>;
    planDurations: PlanDuration[];
    isFounder: boolean;
  }>
> {
  const rechazo = await rechazoPorModulo("sales");
  if (rechazo) return rechazo;

  return mutacionConErroresEsperables("[getClientsTableEnrichment]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const [profile, payments, planDurations] = await Promise.all([
      getCurrentProfile(),
      leerPagosDeLaOrganizacion(supabase, organizationId),
      lecturaDegradable(
        "cobros:duraciones-de-plan",
        () => leerDuracionesDePlan(supabase, organizationId),
        [] as PlanDuration[]
      ),
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

/** Un rechazo conocido de Claude (clave rechazada, sin créditos) vuelve con su motivo. */
function rechazoDeClaude(error: unknown): unknown {
  if (
    error instanceof Error &&
    error.constructor === Error &&
    (error.message === AI_KEY_REJECTED_MESSAGE || error.message === claudeNoCreditsUserMessage())
  ) {
    return new ErrorEsperable(error.message);
  }
  return error;
}

export async function resolvePlanDurationsAction(
  planNames?: string[]
): Promise<MutationResult<{ resolved: number }>> {
  return mutacionConErroresEsperables("[resolvePlanDurations]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    await requireFounder(supabase);

    const names =
      planNames?.map((n) => n.trim()).filter(Boolean) ??
      distinctPlanNames(await listClientsAction());

    if (!names.length) {
      throw new ErrorEsperable("No hay planes para inferir. Asigná productos a los clientes primero.");
    }

    const existingRows = await leerDuracionesDePlan(supabase, organizationId);
    const manualPlans = new Set(
      existingRows
        .filter((r) => r.source === "manual")
        .map((r) => r.planName.toLowerCase())
    );

    const extracted = await extractPlanDurationsFromRAG(organizationId, names).catch(
      (error: unknown) => {
        throw rechazoDeClaude(error);
      }
    );
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

      if (error) throw errorDeEscritura(error);
      resolved += 1;
    }

    revalidatePath(paths.platform.clients.root);
    return { resolved };
  });
}

export async function updatePlanDurationAction(
  input: unknown
): Promise<MutationResult<PlanDuration>> {
  return mutacionConErroresEsperables("[updatePlanDuration]", async () => {
    const parsed = updatePlanDurationSchema.safeParse(input);
    if (!parsed.success) throw new ErrorEsperable(firstZodError(parsed.error));

    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    await requireFounder(supabase);
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

    if (error) throw errorDeEscritura(error);

    revalidatePath(paths.platform.clients.root);
    return rowToPlanDuration(data as PlanDurationRow);
  });
}

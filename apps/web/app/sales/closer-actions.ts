"use server";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getCurrentProfile } from "@/lib/auth/bootstrap";
import {
  sincronizarEventosDelCloser,
  getCloserCalendlyIntegration,
  disconnectCloserCalendly,
  RechazoDeCalendly,
  type CloserSyncResult,
} from "@/lib/calendly/closer-sync";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type CloserProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  commission_pct: number | null;
  calendly_connected: boolean;
  calendly_user_uri: string | null;
  last_calendly_sync: string | null;
};

export type CloserMetrics = {
  closerId: string;
  closerName: string | null;
  closerEmail: string | null;
  avatarUrl: string | null;
  commissionPct: number | null;
  totalCalls: number;
  scheduledCalls: number;
  completedCalls: number;
  cancelledCalls: number;
  closedCalls: number;
  conversionPct: number;
  totalRevenue: number;
  commissionAmount: number;
  avgScore: number | null;
  calendlyConnected: boolean;
};

// ─── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Devuelve los profiles de la org que tienen un rol ILIKE 'closer'.
 * Incluye también al founder si pidió verse a sí mismo.
 */
async function getCloserProfileIds(
  organizationId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string[]> {
  // Profiles con role de closer (custom_role_id → team_roles.name ILIKE 'closer')
  const { data: roleRows } = await supabase
    .from("team_roles")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("name", "%closer%");

  const roleIds = (roleRows ?? []).map((r) => r.id as string);

  if (!roleIds.length) return [];

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id")
    .eq("organization_id", organizationId)
    .in("custom_role_id", roleIds);

  return (profileRows ?? []).map((p) => p.id as string);
}

// ─── Acciones públicas ────────────────────────────────────────────────────────

/**
 * Lista los closers de la org con su estado de integración Calendly.
 */
export async function getClosersWithCalendlyStatusAction(): Promise<CloserProfile[]> {
  if (!isSupabaseConfigured()) return [];

  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const closerIds = await getCloserProfileIds(organizationId, supabase);
  if (!closerIds.length) return [];

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, commission_pct")
    .in("id", closerIds);

  if (error || !profiles?.length) return [];

  // Buscar integraciones Calendly para estos profiles
  const admin = createAdminClient();
  const { data: integrations } = await admin
    .from("team_member_integrations")
    .select("user_id, config, last_sync_at")
    .eq("organization_id", organizationId)
    .eq("integration_type", "calendly")
    .in("user_id", closerIds);

  const integrationMap = new Map(
    (integrations ?? []).map((i) => [
      i.user_id as string,
      {
        config: i.config as { access_token?: string; calendly_user_uri?: string } | null,
        last_sync_at: i.last_sync_at as string | null,
      },
    ])
  );

  return profiles.map((p) => {
    const integ = integrationMap.get(p.id);
    return {
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      avatar_url: p.avatar_url,
      commission_pct: p.commission_pct,
      calendly_connected: !!(integ?.config?.access_token),
      calendly_user_uri: integ?.config?.calendly_user_uri ?? null,
      last_calendly_sync: integ?.last_sync_at ?? null,
    };
  });
}

/**
 * Métricas de cada closer: llamadas, conversión, revenue, comisión, score IA.
 */
export async function getCloserMetricsAction(
  since?: string // ISO date string; default últimos 90 días
): Promise<CloserMetrics[]> {
  if (!isSupabaseConfigured()) return [];

  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const closerIds = await getCloserProfileIds(organizationId, supabase);
  if (!closerIds.length) return [];

  const sinceDate =
    since ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Llamadas agrupadas por closer
  const { data: calls, error: callsError } = await supabase
    .from("closing_calls")
    .select("closer_id, status, amount_closed")
    .eq("organization_id", organizationId)
    .in("closer_id", closerIds)
    .gte("scheduled_at", sinceDate);

  if (callsError) {
    console.error("[getCloserMetricsAction] calls:", callsError.message);
    return [];
  }

  // Scores de call_analyses agrupados por closer_id
  const { data: analyses } = await supabase
    .from("call_analyses")
    .select("closer_id, overall_score")
    .eq("organization_id", organizationId)
    .in("closer_id", closerIds)
    .gte("call_date", sinceDate);

  // Profiles + comisión
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, commission_pct")
    .in("id", closerIds);

  // Integración calendly
  const admin = createAdminClient();
  const { data: integrations } = await admin
    .from("team_member_integrations")
    .select("user_id, config")
    .eq("organization_id", organizationId)
    .eq("integration_type", "calendly")
    .in("user_id", closerIds);

  const integrationMap = new Map(
    (integrations ?? []).map((i) => [
      i.user_id as string,
      !!(i.config as { access_token?: string } | null)?.access_token,
    ])
  );

  // Agrupar llamadas por closer
  type CallAgg = {
    total: number;
    scheduled: number;
    completed: number;
    cancelled: number;
    closed: number;
    revenue: number;
  };

  const callAgg = new Map<string, CallAgg>();
  for (const call of calls ?? []) {
    if (!call.closer_id) continue;
    const agg = callAgg.get(call.closer_id) ?? {
      total: 0,
      scheduled: 0,
      completed: 0,
      cancelled: 0,
      closed: 0,
      revenue: 0,
    };
    agg.total += 1;
    if (call.status === "scheduled") agg.scheduled += 1;
    if (call.status === "completed") agg.completed += 1;
    if (call.status === "cancelled") agg.cancelled += 1;
    if (call.status === "closed") {
      agg.closed += 1;
      agg.revenue += Number(call.amount_closed ?? 0);
    }
    callAgg.set(call.closer_id, agg);
  }

  // Agrupar scores por closer
  const scoreAgg = new Map<string, number[]>();
  for (const a of analyses ?? []) {
    if (!a.closer_id) continue;
    const scores = scoreAgg.get(a.closer_id) ?? [];
    if (a.overall_score != null) scores.push(a.overall_score);
    scoreAgg.set(a.closer_id, scores);
  }

  return (profiles ?? []).map((p) => {
    const agg = callAgg.get(p.id) ?? {
      total: 0,
      scheduled: 0,
      completed: 0,
      cancelled: 0,
      closed: 0,
      revenue: 0,
    };
    const scores = scoreAgg.get(p.id) ?? [];
    const avgScore =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;
    const relevantCalls = agg.completed + agg.closed;
    const conversionPct =
      relevantCalls > 0 ? Math.round((agg.closed / relevantCalls) * 100) : 0;
    const commissionPct = Number(p.commission_pct ?? 0);
    const commissionAmount = (agg.revenue * commissionPct) / 100;

    return {
      closerId: p.id,
      closerName: p.full_name,
      closerEmail: p.email,
      avatarUrl: p.avatar_url,
      commissionPct,
      totalCalls: agg.total,
      scheduledCalls: agg.scheduled,
      completedCalls: agg.completed,
      cancelledCalls: agg.cancelled,
      closedCalls: agg.closed,
      conversionPct,
      totalRevenue: agg.revenue,
      commissionAmount,
      avgScore,
      calendlyConnected: integrationMap.get(p.id) ?? false,
    };
  });
}

/*
 * SCRUM-504: las mutaciones de closers devuelven sus errores esperables como
 * valor (`MutationResult`): en producción Next no le manda al cliente el
 * mensaje de un error lanzado por una server action. Sólo un `ErrorEsperable`
 * vuelve con su mensaje (sesión, validación, closer o integración que no
 * existe, Calendly que rechaza la conexión); el resto se registra, va a Sentry
 * (tag `server_action`) y vuelve con el texto fijo de la interfaz.
 */

/** Código de Postgres de `insufficient_privilege` (el trigger `protect_profile_columns`). */
const SIN_PRIVILEGIO = "42501";

/**
 * Actualiza el % de comisión de un closer (solo admins/owners).
 *
 * El permiso lo pone la base: la policy de UPDATE de `profiles` (otro perfil
 * de la org, sólo founder/admin) y el trigger `protect_profile_columns` (el
 * propio perfil). Acá sólo se traduce el rechazo.
 */
export async function updateCloserCommissionAction(
  closerId: string,
  commissionPct: number
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[updateCloserCommission]", async () => {
    // Mismo rango que el CHECK de `profiles.commission_pct`.
    if (!Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > 100) {
      throw new ErrorEsperable("La comisión tiene que ser un porcentaje entre 0 y 100.");
    }

    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    // Verificar que el profile pertenece a la org
    const { data, error } = await supabase
      .from("profiles")
      .update({ commission_pct: commissionPct })
      .eq("id", closerId)
      .eq("organization_id", organizationId)
      .select("id");

    if (error) {
      if (error.code === SIN_PRIVILEGIO) {
        throw new ErrorEsperable("Sólo un founder o un admin puede cambiar la comisión.");
      }
      throw new FallaDeLaBase(error);
    }
    // Un id de otra org o inexistente, o la policy de UPDATE que no deja tocar
    // otro perfil: no se actualizó ninguna fila.
    if (!data?.length) {
      throw new ErrorEsperable(
        "No se encontró el closer en tu organización o no tenés permiso para cambiar su comisión."
      );
    }
  });
}

const SIN_INTEGRACION_CALENDLY = "No se encontró integración Calendly para este closer";

/**
 * El motivo para el usuario cuando Calendly rechaza la sync. `propio`: el
 * closer sincroniza su propio Calendly (desde Configuración); si no, alguien
 * sincroniza el de otro closer (ranking de closers).
 */
function motivoDelRechazoDeCalendly(
  motivo: RechazoDeCalendly["motivo"] | "sin_usuario",
  propio: boolean
): string {
  if (motivo === "limite_de_consultas") {
    return "Calendly está limitando las consultas. Probá de nuevo en unos minutos.";
  }
  const problema =
    motivo === "conexion_vencida"
      ? "venció o fue revocada"
      : "quedó incompleta (falta el usuario de Calendly)";
  return propio
    ? `Tu conexión con Calendly ${problema}. Desconectala y volvé a conectarla para sincronizar.`
    : `La conexión con Calendly de este closer ${problema}. El closer tiene que volver a conectarla desde su configuración.`;
}

/**
 * Dispara un sync manual de Calendly para el closer actual (o un closerId específico).
 */
export async function syncCloserCalendlyAction(
  closerId?: string
): Promise<MutationResult<CloserSyncResult>> {
  return mutacionConErroresEsperables("[syncCloserCalendly]", async () => {
    const organizationId = await requireOrganizationId();
    const propio = closerId === undefined;

    const targetId = closerId ?? (await getCurrentProfile())?.id;
    if (!targetId) throw new ErrorEsperable("No se pudo determinar el closer");

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("team_member_integrations")
      .select("user_id, organization_id, config, last_sync_at")
      .eq("organization_id", organizationId)
      .eq("user_id", targetId)
      .eq("integration_type", "calendly")
      .maybeSingle();

    if (error) throw new FallaDeLaBase(error);

    const config = data?.config as
      | Parameters<typeof sincronizarEventosDelCloser>[0]["config"]
      | null
      | undefined;
    // Sin fila o sin token es lo mismo que la pantalla muestra como "No conectado".
    if (!data || !config?.access_token) {
      throw new ErrorEsperable(SIN_INTEGRACION_CALENDLY);
    }

    let result: CloserSyncResult;
    try {
      result = await sincronizarEventosDelCloser({
        user_id: data.user_id,
        organization_id: data.organization_id,
        config,
        last_sync_at: data.last_sync_at,
      });
    } catch (err) {
      if (err instanceof RechazoDeCalendly) {
        // Esperable: se avisa con el motivo; el detalle de Calendly queda en el log.
        console.warn("[syncCloserCalendly] Calendly rechazó la sync:", err.motivo, err.message);
        throw new ErrorEsperable(motivoDelRechazoDeCalendly(err.motivo, propio));
      }
      throw err;
    }

    if (result.skipped && result.reason === "no_user_uri") {
      throw new ErrorEsperable(motivoDelRechazoDeCalendly("sin_usuario", propio));
    }
    return result;
  });
}

/**
 * Estado de la integración Calendly del closer actual.
 */
export async function getMyCalendlyIntegrationAction() {
  if (!isSupabaseConfigured()) return { connected: false };

  const profile = await getCurrentProfile();
  if (!profile?.id || !profile?.organization_id) return { connected: false };

  return getCloserCalendlyIntegration(profile.organization_id, profile.id);
}

/**
 * Desconectar Calendly del closer actual.
 */
export async function disconnectMyCalendlyAction(): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[disconnectMyCalendly]", async () => {
    const profile = await getCurrentProfile();
    if (!profile?.id || !profile?.organization_id) {
      throw new ErrorEsperable("Sesión no válida");
    }
    await disconnectCloserCalendly(profile.organization_id, profile.id);
  });
}

/**
 * Llamadas de un closer específico (para vista de detalle).
 */
export async function getCloserCallsAction(closerId: string) {
  if (!isSupabaseConfigured()) return [];

  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("closing_calls")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("closer_id", closerId)
    .order("scheduled_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[getCloserCallsAction]", error.message);
    return [];
  }
  return data ?? [];
}

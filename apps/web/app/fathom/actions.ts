"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { requireAuthContext } from "@/lib/auth/require-auth";
import {
  integrationRateLimit,
  rateLimitErrorMessage,
} from "@/lib/rate-limit";
import { apiKeySchema, firstZodError } from "@/lib/validations";
import {
  connectFathomWithApiKey,
  mapFathomConnectError,
} from "@/lib/fathom/connect";
import {
  finalizeAssociatedCall,
} from "@/lib/fathom/process-call";
import { syncFathomMeetingsForOrganization } from "@/lib/fathom/sync";
import {
  attachCallAnalyses,
  type CallAnalysisRow,
  type SalesCall,
} from "@/lib/fathom/sales-calls";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptMemberFathomKey } from "@/lib/fathom/member-key";
import {
  learnSpeakerAliasFromConfirmation,
  seedOrganizationIdentities,
} from "@/lib/fathom/identities";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { paths } from "@/routes";

export type FathomConnectState = {
  error?: string;
  success?: string;
};

export async function connectFathomAction(
  _prev: FathomConnectState,
  formData: FormData
): Promise<FathomConnectState> {
  const rawKey = String(formData.get("apiKey") ?? "").trim();
  const parsed = apiKeySchema.safeParse(rawKey);
  if (!parsed.success) {
    return { error: firstZodError(parsed.error) };
  }

  if (!isSupabaseConfigured()) {
    return { error: "Supabase no configurado." };
  }

  try {
    const { user, orgId } = await requireAuthContext();

    // Se cifra antes de conectar: si no se puede, no se guarda nada.
    const memberKeyEncrypted = encryptMemberFathomKey(parsed.data, orgId, user.id);

    const result = await connectFathomWithApiKey(orgId, parsed.data);

    if (!result.ok) {
      return { error: result.error ?? "No se pudo conectar Fathom." };
    }

    // Auto-registrar al usuario que conectó la integración como miembro conectado
    const admin = createAdminClient();
    await admin.from("team_member_integrations").upsert(
      {
        organization_id: orgId,
        user_id: user.id,
        integration_type: "fathom",
        encrypted_api_key: memberKeyEncrypted,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,user_id,integration_type" }
    );

    revalidatePath(paths.platform.integrations);

    if (result.error) {
      return {
        success: result.error,
      };
    }

    const synced = result.synced ?? 0;
    return {
      success:
        synced > 0
          ? `Fathom conectado. ${synced} reunión${synced === 1 ? "" : "es"} importada${synced === 1 ? "" : "s"}.`
          : "Fathom conectado. Las nuevas reuniones se sincronizarán automáticamente.",
    };
  } catch (e) {
    return {
      error: mapFathomConnectError(
        e instanceof Error ? e.message : "Error al conectar Fathom"
      ),
    };
  }
}

export async function syncFathomMeetingsAction(): Promise<
  MutationResult<{ synced: number }>
> {
  return runMutation(async () => {
    const { user, orgId } = await requireAuthContext();

    const { allowed, resetAt } = await integrationRateLimit(`fathom-sync:${user.id}`);
    if (!allowed) {
      throw new Error(rateLimitErrorMessage(resetAt));
    }

    const synced = await syncFathomMeetingsForOrganization(orgId);
    revalidatePath(paths.platform.integrations);
    return { synced };
  });
}

export async function getFathomIntegrationStatusAction(): Promise<{
  connected: boolean;
  lastSyncAt: string | null;
}> {
  try {
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();
    const { data } = await admin
      .from("fathom_integrations")
      .select("status, last_sync_at")
      .eq("organization_id", organizationId)
      .maybeSingle();

    return {
      connected: data?.status === "connected" && Boolean(data),
      lastSyncAt: data?.last_sync_at ?? null,
    };
  } catch {
    return { connected: false, lastSyncAt: null };
  }
}

export async function countPendingFathomCallsAction(): Promise<number> {
  const organizationId = await requireOrganizationId();
  const admin = createAdminClient();
  const { count } = await admin
    .from("fathom_calls")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("status", ["unmatched", "pending_review"]);

  return count ?? 0;
}

export async function listPendingFathomCallsAction() {
  const organizationId = await requireOrganizationId();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("fathom_calls")
    .select(
      "id, title, duration_seconds, call_date, status, association_candidates, fathom_url, created_at"
    )
    .eq("organization_id", organizationId)
    .in("status", ["unmatched", "pending_review"])
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function associateFathomCallAction(
  callId: string,
  clientId: string | null,
  ignore = false
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();

    const { data: call } = await admin
      .from("fathom_calls")
      .select("*")
      .eq("id", callId)
      .eq("organization_id", organizationId)
      .single();

    if (!call) throw new Error("Llamada no encontrada");

    if (ignore || !clientId) {
      await admin
        .from("fathom_calls")
        .update({ status: "ignored", client_id: null })
        .eq("id", callId);
      revalidatePending();
      return;
    }

    /**
     * ⭐ Confirmar a mano es la señal más fuerte que existe: alguien lo dijo.
     *
     * Un cliente del otro lado es una entrega, salvo que la grabación haya
     * cruzado un turno agendado — eso es un upsell, y ahí manda el `sales` que
     * ya resolvió el cruce. No se pisa.
     */
    const purpose = call.purpose === "sales" ? "sales" : "delivery";

    await finalizeAssociatedCall({
      callId: call.id,
      organizationId,
      clientId,
      fathomCallId: call.fathom_call_id,
      title: call.title,
      rawTitle: call.raw_title ?? call.title,
      transcript: call.transcript,
      fathomUrl: call.fathom_url,
      confidence: 1,
      durationSeconds: call.duration_seconds,
      callDate: call.call_date,
      purpose,
    });

    await admin
      .from("fathom_calls")
      .update({
        counterparty: "client",
        purpose,
        resolution_method: "manual",
      })
      .eq("id", call.id);

    /**
     * ⭐ La confirmación enseña: se guarda el alias de esa persona y no se la
     * vuelve a preguntar nunca. Es lo que hace que el trabajo manual arranque
     * alto y tienda a cero.
     *
     * No frena la confirmación si falla: el vínculo de la llamada ya quedó bien,
     * y perder el aprendizaje es molesto, no grave.
     */
    await learnSpeakerAliasFromConfirmation({
      organizationId,
      speakerName: call.counterparty_speaker_name ?? null,
      clientId,
      leadId: null,
    });

    revalidatePending();
  });
}

export async function loadClientTimelineAction(clientId: string) {
  const organizationId = await requireOrganizationId();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("client_timeline_entries")
    .select("*, fathom_calls(fathom_url)")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

function revalidatePending() {
  revalidatePath(paths.platform.clients.pendingCalls);
  revalidatePath(paths.platform.clients.root);
}

export async function markFathomTasksSentToBoardAction(
  fathomCallId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("fathom_calls")
      .update({ tasks_sent_to_board: true })
      .eq("id", fathomCallId)
      .eq("organization_id", organizationId);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath(paths.platform.businessContext.documents);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo marcar la reunión.",
    };
  }
}

export async function updateFathomTaskProposalsAction(
  fathomCallId: string,
  proposals: Array<Record<string, unknown>>
): Promise<{ ok: boolean; error?: string }> {
  try {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("fathom_calls")
      .update({ ai_task_proposals: proposals })
      .eq("id", fathomCallId)
      .eq("organization_id", organizationId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo guardar.",
    };
  }
}

export type SalesCallsResult =
  | { ok: true; calls: SalesCall[] }
  | { ok: false; error: string };

/**
 * Llamadas de venta de la org con su análisis profundo, para Ventas → Llamadas.
 *
 * Son dos lecturas unidas en código (`attachCallAnalyses`): `call_analyses` no
 * tiene FK a `fathom_calls`, así que PostgREST no puede embeberla y la consulta
 * con embed fallaba siempre. Un error no se traga: se loguea y, si es de la
 * lectura de llamadas, se devuelve para que la pantalla no diga "sin llamadas".
 */
export async function getSalesCallsAction(): Promise<SalesCallsResult> {
  try {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: calls, error } = await supabase
      .from("fathom_calls")
      .select(
        "id, organization_id, fathom_call_id, title, fathom_url, call_date, duration_seconds, ai_situation_summary, status"
      )
      .eq("organization_id", organizationId)
      // Antes: `call_type = 'consulting'`. Ese campo lo escribía la IA sin
      // definiciones de ningún tipo, y cuando fallaba quedaba en null — así que
      // una llamada de venta mal clasificada simplemente desaparecía de acá.
      .eq("purpose", "sales")
      .order("call_date", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[getSalesCallsAction] fathom_calls", error);
      return { ok: false, error: "No se pudieron cargar las llamadas." };
    }

    const rows = calls ?? [];
    const fathomCallIds = rows.map((row) => row.fathom_call_id);
    let analyses: CallAnalysisRow[] = [];

    if (fathomCallIds.length > 0) {
      const { data, error: analysesError } = await supabase
        .from("call_analyses")
        .select(
          "id, organization_id, fathom_call_id, overall_score, closer_name, lead_qualified, sold, booked, summary, strengths, improvements, objections"
        )
        .eq("organization_id", organizationId)
        .in("fathom_call_id", fathomCallIds);

      // Sin análisis la lista sigue sirviendo: se muestran las llamadas solas.
      if (analysesError) {
        console.error("[getSalesCallsAction] call_analyses", analysesError);
      } else {
        analyses = data ?? [];
      }
    }

    return { ok: true, calls: attachCallAnalyses(rows, analyses) };
  } catch (err) {
    // El error con el que Next marca la ruta como dinámica (y los de redirect o
    // notFound) no es una falla: se relanza para que Next lo maneje.
    unstable_rethrow(err);
    console.error("[getSalesCallsAction]", err);
    return { ok: false, error: "No se pudieron cargar las llamadas." };
  }
}

/**
 * Sembrar las identidades con las que se reconoce a la contraparte.
 *
 * ⭐ `client_identities` nace vacía, y sin ella el resolvedor no resuelve nada:
 * cada grabación cae al último peldaño y pide confirmación. Esto la llena con lo
 * que ya está cargado en el CRM — mail, nombre y apodo de clientes y leads.
 *
 * Es idempotente: correrla de nuevo no pisa lo aprendido a mano.
 *
 * Los valores ambiguos —dos personas con el mismo nombre— **no se siembran**, y
 * se devuelven para poder decirlo: sembrar el primero mandaría las llamadas de
 * los dos a la ficha de uno solo, en silencio.
 */
export async function seedClientIdentitiesAction(): Promise<
  MutationResult<{ total: number; ambiguous: { value: string; owners: number }[] }>
> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const result = await seedOrganizationIdentities(organizationId);
    return {
      total: result.created,
      ambiguous: result.ambiguous.map((entry) => ({
        value: entry.value,
        owners: entry.owners,
      })),
    };
  });
}

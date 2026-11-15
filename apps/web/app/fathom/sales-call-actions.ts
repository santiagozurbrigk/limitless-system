"use server";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import {
  rechazoPorModulo,
  type RechazoPorModulo,
} from "@/lib/auth/acceso-a-modulo";
import { createClient } from "@/lib/supabase/server";
import type { MatchConfidence } from "@/lib/fathom/match-appointment";

/**
 * Grabaciones que no quedaron asociadas a ningún turno, y vinculación a mano.
 *
 * ⭐ **No es una cola de "clasificar".** Limitless registra únicamente llamadas de
 * venta: una grabación sin turno normalmente es una reunión de equipo o una
 * sesión con un cliente, y eso está bien. Lo que esta lista resuelve es el caso
 * contrario: **una llamada de venta que existió y no llegó a cruzar** —porque el
 * turno todavía no tenía mail, o porque la grabación arrancó muy lejos del
 * horario—. Ahí el turno queda sin su registro de la llamada, que es justo lo
 * que el seguimiento del lead necesita.
 */

export type UnlinkedRecording = {
  id: string;
  title: string;
  callDate: string | null;
  fathomUrl: string | null;
  /** Mails de los participantes, para reconocer de quién fue la llamada. */
  participantEmails: string[];
  /** Motivo por el que no cruzó, cuando se conoce. */
  noMatchReason: string | null;
};

export type LinkableAppointment = {
  id: string;
  leadName: string;
  scheduledAt: string;
  leadEmail: string | null;
};

/** Grabaciones procesadas que no quedaron asociadas a un turno. */
export async function listUnlinkedRecordingsAction(
  limit = 30
): Promise<UnlinkedRecording[] | RechazoPorModulo> {
  const rechazo = await rechazoPorModulo("integrations");
  if (rechazo) return rechazo;
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("fathom_calls")
    .select("id, title, call_date, fathom_url, calendar_invitees, appointment_match")
    .eq("organization_id", organizationId)
    .is("closing_call_id", null)
    .not("status", "in", "(pending,processing)")
    .order("call_date", { ascending: false })
    .limit(limit);

  if (error) return [];

  return (data ?? []).map((row) => {
    const invitees = Array.isArray(row.calendar_invitees)
      ? (row.calendar_invitees as Array<Record<string, unknown>>)
      : [];
    const match = (row.appointment_match ?? null) as {
      status?: string;
      reason?: string;
    } | null;

    return {
      id: row.id as string,
      title: (row.title as string) ?? "Sin título",
      callDate: (row.call_date as string | null) ?? null,
      fathomUrl: (row.fathom_url as string | null) ?? null,
      participantEmails: invitees
        .map((i) => String(i?.email ?? ""))
        .filter(Boolean),
      noMatchReason: match?.status === "no_match" ? (match.reason ?? null) : null,
    };
  });
}

/**
 * Turnos cercanos a una grabación, para poder vincularla a mano.
 *
 * Ventana amplia (un día) porque acá decide una persona: el sistema ya intentó y
 * no pudo, así que lo útil es mostrarle opciones, no filtrarlas de más.
 */
export async function listLinkableAppointmentsAction(
  recordingId: string
): Promise<LinkableAppointment[] | RechazoPorModulo> {
  const rechazo = await rechazoPorModulo("integrations");
  if (rechazo) return rechazo;
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const { data: recording } = await supabase
    .from("fathom_calls")
    .select("call_date")
    .eq("id", recordingId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  const center = recording?.call_date
    ? new Date(recording.call_date as string).getTime()
    : NaN;
  if (Number.isNaN(center)) return [];

  const DAY_MS = 24 * 60 * 60 * 1000;
  const { data } = await supabase
    .from("closing_calls")
    .select("id, lead_name, scheduled_at, lead_email")
    .eq("organization_id", organizationId)
    .gte("scheduled_at", new Date(center - DAY_MS).toISOString())
    .lte("scheduled_at", new Date(center + DAY_MS).toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(30);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    leadName: (row.lead_name as string) ?? "Sin nombre",
    scheduledAt: row.scheduled_at as string,
    leadEmail: (row.lead_email as string | null) ?? null,
  }));
}

/** Vincula a mano una grabación con un turno. */
export async function linkRecordingToAppointmentAction(params: {
  recordingId: string;
  appointmentId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  // Que el turno sea de la misma organización: el id viene del cliente.
  const { data: appointment } = await supabase
    .from("closing_calls")
    .select("id")
    .eq("id", params.appointmentId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!appointment) {
    return { ok: false, error: "El turno no existe en esta organización." };
  }

  const { error } = await supabase
    .from("fathom_calls")
    .update({
      closing_call_id: params.appointmentId,
      // Queda registrado que lo vinculó una persona, no el cruce automático.
      appointment_match: {
        status: "matched",
        confidence: "manual" satisfies string,
      },
    })
    .eq("id", params.recordingId)
    .eq("organization_id", organizationId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type { MatchConfidence };

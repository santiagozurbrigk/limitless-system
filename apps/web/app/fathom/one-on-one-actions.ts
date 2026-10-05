"use server";

/**
 * Las sesiones 1-1 de un cliente, para su ficha.
 *
 * ⭐ Existe porque el bloque «Llamadas del cliente» **nunca mostró las 1-1**.
 * Ese bloque se llena desde `clients.linked_calls`, que sólo escribe el análisis
 * profundo de las llamadas de **venta** — el del closer. Una ficha con diez
 * sesiones de acompañamiento mostraba igual "Sin llamadas vinculadas", y lo de
 * las 1-1 terminaba como texto suelto en el timeline.
 */

import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadClientOneOnOneStats } from "@/lib/fathom/one-on-ones";
import { fechaDeInstanteEnZona } from "@/lib/fechas/calendario";
import { leerZonaHorariaDeLaOrganizacion } from "@/lib/fechas/organizacion";
import { maybeExtractOneOnOneTasks } from "@/lib/clients/client-tasks";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import type { OneOnOneStats } from "@/lib/fathom/one-on-one-types";
import { paths } from "@/routes";

export type ClientOneOnOneCall = {
  id: string;
  title: string;
  /** `YYYY-MM-DD`. */
  date: string | null;
  durationMinutes: number | null;
  fathomUrl: string | null;
  situationSummary: string | null;
  nextSteps: string[];
  /** La subió alguien pegando el link, en vez de entrar por la sincronización. */
  uploadedManually: boolean;
  hasTranscript: boolean;
  /** Cuántas tareas salieron de esta llamada. Cero con transcript = se puede reintentar. */
  tasksCreated: number;
};

export type ClientOneOnOnes = {
  stats: OneOnOneStats;
  calls: ClientOneOnOneCall[];
};

const EMPTY: ClientOneOnOnes = {
  stats: {
    totalCalls: 0,
    firstDate: null,
    lastDate: null,
    everyDays: null,
    daysSinceLast: null,
  },
  calls: [],
};

/** Cuántas se listan. El contador cuenta todas; la lista no se hace infinita. */
const LIMITE = 50;

export async function getClientOneOnOnesAction(
  clientId: string
): Promise<ClientOneOnOnes> {
  const organizationId = await requireOrganizationId();

  /**
   * ⭐ La pertenencia del cliente se chequea con la sesión del usuario antes de
   * leer nada con el cliente admin. `fathom_calls` guarda transcripts completos
   * de conversaciones: un id de otra organización no puede devolver contenido.
   */
  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!client) return EMPTY;

  const admin = createAdminClient();
  // La zona de la org, una sola lectura para la lista y el contador: el día de
  // cada llamada es el de esa zona (una 1-1 de las 22:00 en Argentina es de
  // ese día, aunque en UTC ya sea mañana).
  const [{ data, error }, zona] = await Promise.all([
    admin
      .from("fathom_calls")
      .select(
        "id, title, call_date, duration_seconds, fathom_url, ai_situation_summary, ai_next_steps, ingest_source, transcript"
      )
      .eq("organization_id", organizationId)
      .eq("client_id", clientId)
      .eq("purpose", "delivery")
      .order("call_date", { ascending: false })
      .limit(LIMITE),
    leerZonaHorariaDeLaOrganizacion(supabase, organizationId),
  ]);

  if (error) {
    console.error("[fathom:one-on-ones] ficha", error.message);
    return EMPTY;
  }

  const rows = (data ?? []) as {
    id: string;
    title: string | null;
    call_date: string | null;
    duration_seconds: number | null;
    fathom_url: string | null;
    ai_situation_summary: string | null;
    ai_next_steps: string[] | null;
    ingest_source: string | null;
    transcript: string | null;
  }[];

  /**
   * Cuántas tareas dejó cada llamada, en una sola consulta.
   *
   * ⭐ Es lo que le permite a la ficha ofrecer el reintento sólo donde tiene
   * sentido: una llamada con transcripción y cero tareas es sospechosa; una sin
   * transcripción no tiene nada que reintentar.
   */
  const { data: tareas } = await admin
    .from("client_tasks")
    .select("source_call_id")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .not("source_call_id", "is", null);

  const tareasPorLlamada = new Map<string, number>();
  for (const fila of (tareas ?? []) as { source_call_id: string }[]) {
    tareasPorLlamada.set(
      fila.source_call_id,
      (tareasPorLlamada.get(fila.source_call_id) ?? 0) + 1
    );
  }

  return {
    stats: await loadClientOneOnOneStats(organizationId, clientId, zona),
    calls: rows.map((row) => ({
      id: row.id,
      title: row.title ?? "Sesión 1-1",
      date: fechaDeInstanteEnZona(row.call_date, zona) || null,
      // Sin duración conocida queda `null`: una llamada no dura cero minutos.
      durationMinutes:
        row.duration_seconds != null && row.duration_seconds > 0
          ? Math.max(1, Math.round(row.duration_seconds / 60))
          : null,
      fathomUrl: row.fathom_url,
      situationSummary: row.ai_situation_summary,
      nextSteps: row.ai_next_steps ?? [],
      uploadedManually: row.ingest_source === "manual_link",
      hasTranscript: Boolean(row.transcript?.trim()),
      tasksCreated: tareasPorLlamada.get(row.id) ?? 0,
    })),
  };
}

/**
 * Volver a sacarle las tareas a una llamada que ya está subida.
 *
 * ⭐ Existe porque la extracción depende de que un modelo conteste en el formato
 * pedido, y eso puede fallar. Sin este botón, una llamada que falló la primera
 * vez **no tiene forma de recuperarse**: volver a pegar el link la reconoce como
 * ya cargada y no reintenta nada.
 */
export async function retryOneOnOneTasksAction(input: {
  callId: string;
}): Promise<MutationResult<{ tasksCreated: number }>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();

    // La llamada tiene que ser de la organización de quien lo pide.
    const { data: call } = await admin
      .from("fathom_calls")
      .select("id, client_id, purpose, transcript, call_date")
      .eq("id", input.callId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!call) throw new Error("No se encontró esa llamada.");
    if (!call.transcript?.trim()) {
      throw new Error(
        "Esta llamada no tiene transcripción, así que no hay de dónde sacar tareas. Cargalas a mano."
      );
    }

    const tasksCreated = await maybeExtractOneOnOneTasks({
      callId: call.id as string,
      organizationId,
      clientId: call.client_id as string | null,
      purpose: call.purpose as string | null,
      transcript: call.transcript as string,
      callDate: call.call_date as string | null,
      force: true,
    });

    if (call.client_id) {
      revalidatePath(paths.platform.clients.detail(call.client_id as string));
    }

    return { tasksCreated };
  });
}

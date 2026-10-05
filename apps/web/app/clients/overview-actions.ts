"use server";

/**
 * Lo que la ficha del cliente dice **de un vistazo**, en una sola llamada.
 *
 * ⭐ Existe porque la ficha se abre para responder una pregunta —"¿cómo viene
 * este cliente?"— y hasta acá la respuesta estaba repartida en catorce bloques
 * que había que scrollear enteros. El encabezado ahora la contesta arriba:
 * cuántas sesiones lleva, qué le quedó pendiente, dónde está en el programa.
 *
 * Cada número lo calcula el módulo que ya lo sabe: el contador de 1-1 sale de
 * `loadClientOneOnOneStats`, el recorrido de `summarizeJourneyPosition`. Acá no
 * hay una segunda fórmula de nada; sólo se juntan.
 */

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";
import { loadClientOneOnOneStats } from "@/lib/fathom/one-on-ones";
import { leerZonaHorariaDeLaOrganizacion } from "@/lib/fechas/organizacion";
import { summarizeJourneyPosition } from "@/lib/checkpoints/progress";
import { getClientJourneyAction } from "@/app/clients/checkpoint-event-actions";

export type ClientOverview = {
  oneOnOne: {
    total: number;
    /** Días desde la última. `null` si no hubo ninguna. */
    daysSinceLast: number | null;
  };
  tasks: {
    pending: number;
    /** De las pendientes, cuántas le tocan al coach. */
    coach: number;
  };
  journey: {
    configured: boolean;
    reached: number;
    total: number;
    /** El próximo hito que falta, para decir "sigue: X". */
    next: string | null;
  };
};

const VACIO: ClientOverview = {
  oneOnOne: { total: 0, daysSinceLast: null },
  tasks: { pending: 0, coach: 0 },
  journey: { configured: false, reached: 0, total: 0, next: null },
};

export async function getClientOverviewAction(clientId: string): Promise<ClientOverview> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  // La pertenencia se chequea con la sesión del usuario antes de leer con el
  // cliente admin, igual que en el resto de las acciones de la ficha.
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!client) return VACIO;

  const [stats, tareas, journey] = await Promise.all([
    // La zona de la org, una lectura por pedido: el contador de 1-1 cuenta en ella.
    leerZonaHorariaDeLaOrganizacion(supabase, organizationId).then((zona) =>
      loadClientOneOnOneStats(organizationId, clientId, zona)
    ),
    supabase
      .from("client_tasks")
      .select("owner")
      .eq("organization_id", organizationId)
      .eq("client_id", clientId)
      .eq("status", "pending"),
    getClientJourneyAction(clientId).catch(() => null),
  ]);

  const pendientes = (tareas.data ?? []) as { owner: string | null }[];
  const resumen = journey ? summarizeJourneyPosition(journey.progress) : null;

  return {
    oneOnOne: { total: stats.totalCalls, daysSinceLast: stats.daysSinceLast },
    tasks: {
      pending: pendientes.length,
      coach: pendientes.filter((t) => t.owner === "coach").length,
    },
    journey: {
      configured: Boolean(journey?.journeyConfigured),
      reached: resumen?.reached ?? 0,
      total: resumen?.total ?? 0,
      next: resumen?.nextCheckpoint?.name ?? null,
    },
  };
}

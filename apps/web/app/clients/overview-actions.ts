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
 * `leerEstadisticasDeUnoAUno` (la misma lectura que `loadClientOneOnOneStats`,
 * pero lanza si `fathom_calls` falla), el recorrido de
 * `summarizeJourneyPosition`. Acá no hay una segunda fórmula de nada; sólo se
 * juntan.
 */

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";
import { leerEstadisticasDeUnoAUno } from "@/lib/fathom/one-on-ones";
import { leerZonaHorariaDeLaOrganizacion } from "@/lib/fechas/organizacion";
import { summarizeJourneyPosition } from "@/lib/checkpoints/progress";
import { leerRecorridoDelCliente } from "@/lib/checkpoints/lecturas-del-recorrido";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { lecturaDegradable } from "@/lib/server/lectura-degradable";
import { rechazoPorModulo } from "@/lib/auth/acceso-a-modulo";

export type ClientOverview = {
  /** `null` si no se pudieron leer (la falla queda registrada). */
  oneOnOne: {
    total: number;
    /** Días desde la última. `null` si no hubo ninguna. */
    daysSinceLast: number | null;
  } | null;
  tasks: {
    pending: number;
    /** De las pendientes, cuántas le tocan al coach. */
    coach: number;
  };
  /** `null` si no se pudo leer (la falla queda registrada). */
  journey: {
    configured: boolean;
    reached: number;
    total: number;
    /** El próximo hito que falta, para decir "sigue: X". */
    next: string | null;
  } | null;
};

/**
 * SCRUM-517: devuelve sus errores como valor. Antes lanzaba sin sesión (en
 * producción, un digest que la franja tragaba), un cliente de otra
 * organización se veía como un resumen en cero y una falla de las tareas, de
 * las sesiones 1-1 o del recorrido se veía como cero pendientes, "0 sesiones"
 * o "sin recorrido configurado".
 *
 * La pertenencia y las tareas son imprescindibles: si fallan, la acción
 * devuelve el texto fijo. Las sesiones 1-1 y el recorrido son celdas sueltas:
 * si una no se puede leer, viene en `null` (la franja muestra «—» y "no se pudo
 * cargar") y la falla queda registrada (`lecturaDegradable`); las otras celdas
 * salen igual.
 */
export async function getClientOverviewAction(
  clientId: string
): Promise<MutationResult<ClientOverview>> {
  const rechazo = await rechazoPorModulo("clients");
  if (rechazo) return rechazo;

  return mutacionConErroresEsperables("[getClientOverview]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    // La pertenencia se chequea con la sesión del usuario antes de leer con el
    // cliente admin, igual que en el resto de las acciones de la ficha.
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (clientError) throw new FallaDeLaBase(clientError);
    if (!client) {
      throw new ErrorEsperable("No se encontró el cliente. Puede que lo hayan eliminado.");
    }

    // La consulta armada en el lugar va primera: si `from()` lanzara al
    // armarse, las lecturas async no quedarían con su rechazo sin atender.
    const [tareas, stats, journey] = await Promise.all([
      supabase
        .from("client_tasks")
        .select("owner")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .eq("status", "pending"),
      // La zona de la org, una lectura por pedido: el contador de 1-1 cuenta en ella.
      lecturaDegradable(
        "getClientOverview:sesiones",
        async () =>
          leerEstadisticasDeUnoAUno(
            organizationId,
            clientId,
            await leerZonaHorariaDeLaOrganizacion(supabase, organizationId)
          ),
        null
      ),
      lecturaDegradable(
        "getClientOverview:recorrido",
        () => leerRecorridoDelCliente(supabase, organizationId, clientId),
        null
      ),
    ]);

    if (tareas.error) throw new FallaDeLaBase(tareas.error);

    const pendientes = (tareas.data ?? []) as { owner: string | null }[];
    const resumen = journey ? summarizeJourneyPosition(journey.progress) : null;

    return {
      oneOnOne: stats ? { total: stats.totalCalls, daysSinceLast: stats.daysSinceLast } : null,
      tasks: {
        pending: pendientes.length,
        coach: pendientes.filter((t) => t.owner === "coach").length,
      },
      journey: journey
        ? {
            configured: journey.journeyConfigured,
            reached: resumen?.reached ?? 0,
            total: resumen?.total ?? 0,
            next: resumen?.nextCheckpoint?.name ?? null,
          }
        : null,
    };
  });
}

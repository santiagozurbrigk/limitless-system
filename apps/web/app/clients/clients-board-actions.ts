"use server";

/**
 * Todo lo que la tabla de clientes necesita, en una sola vuelta.
 *
 * ⭐ Existe para no hacer cuatro round trips desde el navegador cada vez que se
 * abre la pantalla. Las cuatro piezas se piden juntas porque se dibujan juntas:
 * sin el recorrido no hay etapa, sin los checkpoints no se sabe si el próximo
 * hito pide métricas, y sin las columnas configurables no hay objetivo.
 *
 * No agrega lógica: cada pieza sale de la lectura que ya la servía.
 *
 * SCRUM-517: devuelve sus errores como valor. Antes lanzaba sin sesión (en
 * producción, un digest que dejaba la tabla sin recorrido ni columnas) y cada
 * pieza escondía su falla devolviendo vacío: la tabla mostraba a todos "sin
 * empezar" y sin próxima tarea como si fuera cierto. Ahora las piezas propias
 * se leen con lecturas que lanzan y la lista muestra el motivo.
 */

import { getRevenueByClientAction } from "@/app/clients/revenue-actions";
import { pickNextTask } from "@/lib/clients/next-task";
import { rowToClientTask, type ClientTask, type ClientTaskRow } from "@/types/client-tasks";
import type { RevenueSummary } from "@/lib/clients/revenue";
import { createClient } from "@/lib/supabase/server";
import {
  leerCheckpoints,
  leerEstadosDelRecorrido,
  leerFasesFijadas,
} from "@/lib/checkpoints/lecturas-del-recorrido";
import { leerColumnas } from "@/lib/custom-fields/leer-columnas";
import {
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { loadLastOneOnOneByClient } from "@/lib/fathom/one-on-ones";
import type { LastOneOnOne } from "@/lib/fathom/one-on-one-types";
import type { Checkpoint, ClientJourneyStatus } from "@/types/checkpoints";
import type { FieldDefinition } from "@/types/custom-fields";
import { rechazoPorModulo } from "@/lib/auth/acceso-a-modulo";

export type ClientsBoardData = {
  /** Etapa actual, progreso y próximo hito de cada cliente. */
  journey: Record<string, ClientJourneyStatus>;
  /**
   * El catálogo de hitos. La tabla lo necesita para una sola cosa: saber si el
   * próximo hito de un cliente **pide métricas**, y por lo tanto si el check
   * inline puede marcarlo solo o tiene que abrir el diálogo.
   */
  checkpoints: Checkpoint[];
  /** Las columnas que las métricas de un checkpoint referencian. */
  checkpointFields: FieldDefinition[];
  /** Las columnas configurables del cliente — entre ellas, el objetivo general. */
  clientFields: FieldDefinition[];
  /**
   * La última sesión 1-1 de cada cliente, por id de cliente.
   *
   * Un cliente sin entregas clasificadas no aparece en el diccionario: la tabla
   * muestra un guion, que es la respuesta honesta a "todavía no hay ninguna".
   */
  lastOneOnOne: Record<string, LastOneOnOne>;
  /**
   * La próxima tarea de cada cliente: la que alguien escribió o la que salió de
   * una llamada.
   *
   * ⭐ Es lo que la columna «Próxima tarea» muestra desde ahora. Antes mostraba
   * el próximo hito del recorrido, que es otra cosa: el recorrido es un catálogo
   * que se define una vez y vale para todos; esto es lo que decidiste para
   * **este** cliente.
   */
  nextTask: Record<string, ClientTask>;
  /** La facturación del negocio de cada cliente. No es lo que nos paga. */
  revenue: Record<string, RevenueSummary>;
  /** La fase que alguien fijó a mano, cuando la hay. */
  manualStages: Record<string, string>;
};

export async function getClientsBoardAction(): Promise<MutationResult<ClientsBoardData>> {
  const rechazo = await rechazoPorModulo("clients");
  if (rechazo) return rechazo;

  return mutacionConErroresEsperables("[getClientsBoard]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const [
      journey,
      checkpoints,
      checkpointFields,
      clientFields,
      lastOneOnOne,
      revenue,
      manualStages,
      nextTask,
    ] = await Promise.all([
      leerEstadosDelRecorrido(supabase, organizationId),
      leerCheckpoints(supabase, organizationId),
      leerColumnas(supabase, organizationId, "checkpoint"),
      leerColumnas(supabase, organizationId, "client"),
      loadLastOneOnOneByClient(organizationId),
      getRevenueByClientAction(),
      leerFasesFijadas(supabase, organizationId),
      loadNextTaskByClient(supabase, organizationId),
    ]);

    return {
      journey,
      checkpoints,
      checkpointFields,
      clientFields,
      lastOneOnOne,
      nextTask,
      revenue,
      manualStages,
    };
  });
}

/**
 * La próxima tarea pendiente de cada cliente, en una sola consulta.
 *
 * Trae **todas** las pendientes de la organización y elige en memoria con
 * `pickNextTask`, que es la misma función que usa la ficha: dos criterios de
 * "cuál es la próxima" podrían discrepar, y entonces la tabla y la ficha dirían
 * cosas distintas de la misma tarea.
 */
async function loadNextTaskByClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string
): Promise<Record<string, ClientTask>> {
  const { data, error } = await supabase
    .from("client_tasks")
    .select(
      "id, client_id, title, description, owner, status, due_date, source, source_call_id, workboard_task_id, completed_at, created_at"
    )
    .eq("organization_id", organizationId)
    .eq("status", "pending");

  // Antes devolvía `{}`: la columna «Próxima tarea» decía "sin tareas".
  if (error) throw new FallaDeLaBase(error);

  const porCliente = new Map<string, ClientTask[]>();
  for (const row of (data ?? []) as unknown as ClientTaskRow[]) {
    const task = rowToClientTask(row);
    const lista = porCliente.get(task.clientId) ?? [];
    lista.push(task);
    porCliente.set(task.clientId, lista);
  }

  const result: Record<string, ClientTask> = {};
  for (const [clientId, tasks] of porCliente) {
    const next = pickNextTask(tasks);
    if (next) result[clientId] = next;
  }
  return result;
}

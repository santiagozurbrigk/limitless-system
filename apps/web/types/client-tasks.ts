/**
 * Las tareas que quedan de una 1-1 con un cliente.
 *
 * ⭐ No son tareas del tablero. El tablero es el trabajo del equipo —tiene
 * sprint, responsables que son perfiles de la organización, y se mide como carga
 * interna—. Esto es lo que el coach y el cliente se comprometieron a hacer, y el
 * cliente no tiene usuario en Limitless.
 */

/** De quién es la tarea: del cliente o del coach. */
export type ClientTaskOwner = "client" | "coach";

export type ClientTaskStatus = "pending" | "done";

/** Si la cargó una persona o salió de una llamada. */
export type ClientTaskSource = "manual" | "fathom_call";

export type ClientTask = {
  id: string;
  clientId: string;
  title: string;
  description: string;
  owner: ClientTaskOwner;
  status: ClientTaskStatus;
  /** `YYYY-MM-DD` o `null`. */
  dueDate: string | null;
  source: ClientTaskSource;
  /** La llamada de la que salió, si salió de una. */
  sourceCallId: string | null;
  /** Título de esa llamada, para poder decir de dónde salió. */
  sourceCallTitle: string | null;
  /**
   * Cuándo fue esa llamada: el instante tal cual (`call_date`). Su día se lee
   * en la zona de la organización (`fechaDeInstanteEnZona`) al mostrarlo: un
   * mapper no conoce la zona, y cortar el texto daba el día de UTC (SCRUM-493).
   */
  sourceCallAt: string | null;
  /** Cuando se mandó al tablero del equipo, cuál es allá. */
  workboardTaskId: string | null;
  completedAt: string | null;
  createdAt: string;
};

export const CLIENT_TASK_OWNER_LABEL: Record<ClientTaskOwner, string> = {
  client: "Cliente",
  coach: "Coach",
};

export type ClientTaskRow = {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  owner: string | null;
  status: string | null;
  due_date: string | null;
  source: string | null;
  source_call_id: string | null;
  workboard_task_id: string | null;
  completed_at: string | null;
  created_at: string;
  fathom_calls?: { title: string | null; call_date: string | null } | null;
};

export function rowToClientTask(row: ClientTaskRow): ClientTask {
  const call = Array.isArray(row.fathom_calls)
    ? (row.fathom_calls[0] as { title: string | null; call_date: string | null } | undefined)
    : row.fathom_calls;

  return {
    id: row.id,
    clientId: row.client_id,
    title: row.title,
    description: row.description ?? "",
    owner: row.owner === "coach" ? "coach" : "client",
    status: row.status === "done" ? "done" : "pending",
    dueDate: row.due_date,
    source: row.source === "fathom_call" ? "fathom_call" : "manual",
    sourceCallId: row.source_call_id,
    sourceCallTitle: call?.title ?? null,
    sourceCallAt: call?.call_date ?? null,
    workboardTaskId: row.workboard_task_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

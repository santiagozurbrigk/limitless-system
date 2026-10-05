"use server";

/**
 * Las tareas del cliente: leerlas, tildarlas, editarlas y mandarlas al tablero.
 *
 * Todo pasa por RLS con la sesión del usuario. El único camino que usa el
 * cliente admin es el que crea tareas desde una llamada procesada en segundo
 * plano (`lib/clients/client-tasks.ts`), donde no hay sesión.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getCurrentProfile,
  isMissingTableError,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";
import { fechaDeInstanteEnZona } from "@/lib/fechas/calendario";
import { leerZonaHorariaDeLaOrganizacion } from "@/lib/fechas/organizacion";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { firstZodError } from "@/lib/validations";
import { createWorkboardTasksAction } from "@/app/agent/workboard-actions";
import {
  rowToClientTask,
  type ClientTask,
  type ClientTaskRow,
} from "@/types/client-tasks";
import { paths } from "@/routes";

const SELECT_COLUMNS =
  "id, client_id, title, description, owner, status, due_date, source, source_call_id, workboard_task_id, completed_at, created_at, fathom_calls(title, call_date)";

const taskInputSchema = z.object({
  clientId: z.string().uuid(),
  title: z.string().trim().min(1, "La tarea necesita un título.").max(120),
  description: z.string().trim().max(500).default(""),
  owner: z.enum(["client", "coach"]).default("client"),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha tiene que ser un día del calendario.")
    .nullable()
    .default(null),
});

/**
 * Las tareas de un cliente, las pendientes primero.
 *
 * Devuelve `[]` —no rompe la ficha— si la migración todavía no corrió. El resto
 * de la pantalla no tiene por qué caerse por una sección que aún no existe en la
 * base.
 */
export async function listClientTasksAction(clientId: string): Promise<ClientTask[]> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_tasks")
    .select(SELECT_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    // Pendientes arriba; dentro de cada grupo, las más viejas primero.
    .order("status", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingTableError(error.message)) return [];
    console.error("[client-tasks] list", error.message);
    return [];
  }

  return ((data ?? []) as unknown as ClientTaskRow[]).map(rowToClientTask);
}

export async function createClientTaskAction(
  input: z.input<typeof taskInputSchema>
): Promise<MutationResult<ClientTask>> {
  return runMutation(async () => {
    const parsed = taskInputSchema.safeParse(input);
    if (!parsed.success) throw new Error(firstZodError(parsed.error));
    const values = parsed.data;

    const organizationId = await requireOrganizationId();
    const profile = await getCurrentProfile();
    const supabase = await createClient();

    const { data: ultima } = await supabase
      .from("client_tasks")
      .select("position")
      .eq("organization_id", organizationId)
      .eq("client_id", values.clientId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("client_tasks")
      .insert({
        organization_id: organizationId,
        client_id: values.clientId,
        title: values.title,
        description: values.description,
        owner: values.owner,
        due_date: values.dueDate,
        source: "manual",
        position: Number(ultima?.position ?? 0) + 1,
        created_by: profile?.id ?? null,
      })
      .select(SELECT_COLUMNS)
      .single();

    if (error) throw new Error(error.message);

    revalidatePath(paths.platform.clients.detail(values.clientId));
    return rowToClientTask(data as unknown as ClientTaskRow);
  });
}

export async function updateClientTaskAction(input: {
  taskId: string;
  title?: string;
  description?: string;
  owner?: "client" | "coach";
  dueDate?: string | null;
}): Promise<MutationResult<ClientTask>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (input.title != null) {
      const title = input.title.trim().slice(0, 120);
      if (!title) throw new Error("La tarea necesita un título.");
      patch.title = title;
    }
    if (input.description != null) {
      patch.description = input.description.trim().slice(0, 500);
    }
    if (input.owner != null) patch.owner = input.owner;
    if (input.dueDate !== undefined) {
      if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
        throw new Error("La fecha tiene que ser un día del calendario.");
      }
      patch.due_date = input.dueDate || null;
    }

    const { data, error } = await supabase
      .from("client_tasks")
      .update(patch)
      .eq("id", input.taskId)
      .eq("organization_id", organizationId)
      .select(SELECT_COLUMNS)
      .single();

    if (error) throw new Error(error.message);

    const task = rowToClientTask(data as unknown as ClientTaskRow);
    revalidatePath(paths.platform.clients.detail(task.clientId));
    return task;
  });
}

/**
 * Tilda o destilda una tarea.
 *
 * ⭐ Guarda **quién** la dio por hecha y **cuándo**, y los borra al destildar.
 * Un "listo" sin autor ni fecha no se puede discutir en la próxima sesión, que
 * es exactamente el momento en que se mira esta lista.
 */
export async function toggleClientTaskAction(input: {
  taskId: string;
  done: boolean;
}): Promise<MutationResult<ClientTask>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const profile = await getCurrentProfile();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("client_tasks")
      .update({
        status: input.done ? "done" : "pending",
        completed_at: input.done ? new Date().toISOString() : null,
        completed_by: input.done ? profile?.id ?? null : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.taskId)
      .eq("organization_id", organizationId)
      .select(SELECT_COLUMNS)
      .single();

    if (error) throw new Error(error.message);

    const task = rowToClientTask(data as unknown as ClientTaskRow);
    revalidatePath(paths.platform.clients.detail(task.clientId));
    return task;
  });
}

export async function deleteClientTaskAction(
  taskId: string
): Promise<MutationResult<void>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("client_tasks")
      .delete()
      .eq("id", taskId)
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
  });
}

/**
 * Manda una tarea al tablero de trabajo del equipo.
 *
 * ⭐ La tarea **no se muda**: sigue viéndose en la ficha del cliente, con la
 * marca de que ya está en el tablero. Moverla haría que el coach abra la ficha
 * antes de la próxima sesión y no encuentre lo que él mismo se comprometió a
 * hacer.
 *
 * Es idempotente: si ya se mandó, no crea una segunda.
 */
export async function sendClientTaskToBoardAction(input: {
  taskId: string;
}): Promise<MutationResult<ClientTask>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: existente, error: readError } = await supabase
      .from("client_tasks")
      .select(SELECT_COLUMNS)
      .eq("id", input.taskId)
      .eq("organization_id", organizationId)
      .single();

    if (readError) throw new Error(readError.message);

    const task = rowToClientTask(existente as unknown as ClientTaskRow);
    if (task.workboardTaskId) return task;

    const [{ data: client }, zona] = await Promise.all([
      supabase.from("clients").select("name").eq("id", task.clientId).maybeSingle(),
      // El día de la 1-1 que se menciona es el de la zona de la organización.
      leerZonaHorariaDeLaOrganizacion(supabase, organizationId),
    ]);

    const clientName = (client?.name as string | undefined) ?? "cliente";
    const diaDeLaLlamada = fechaDeInstanteEnZona(task.sourceCallAt, zona);

    const created = await createWorkboardTasksAction({
      tasks: [
        {
          // El nombre del cliente va en el título: en el tablero, fuera de la
          // ficha, "Mandar la plantilla" no dice a quién.
          title: `${clientName}: ${task.title}`.slice(0, 120),
          description: [
            task.description,
            diaDeLaLlamada ? `Salió de la 1-1 del ${diaDeLaLlamada}.` : null,
          ]
            .filter(Boolean)
            .join("\n\n"),
          area: "clientes",
          priority: "medium",
          due_date: task.dueDate,
        },
      ],
    });

    if (!created.ok || !created.taskIds.length) {
      throw new Error(created.error ?? "No se pudo crear la tarea en el tablero.");
    }

    const { data, error } = await supabase
      .from("client_tasks")
      .update({
        workboard_task_id: created.taskIds[0],
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.taskId)
      .eq("organization_id", organizationId)
      .select(SELECT_COLUMNS)
      .single();

    if (error) throw new Error(error.message);

    revalidatePath(paths.platform.clients.detail(task.clientId));
    revalidatePath(paths.platform.workboard.root);
    return rowToClientTask(data as unknown as ClientTaskRow);
  });
}

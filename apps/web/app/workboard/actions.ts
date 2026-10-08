"use server";

import { revalidatePath } from "next/cache";
import {
  getCurrentProfile,
  isMissingTableError,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import { rowToMember, rowToTask, type WorkboardTaskRow } from "@/lib/workboard/mapper";
import { getNextPosition } from "@/lib/workboard/group-tasks";
import {
  buildMemberTimeReports,
  type TimeByMemberRow,
} from "@/lib/workboard/time-report";
import { rowToSprint, type SprintRow } from "@/lib/workboard/sprint";
import { createClient } from "@/lib/supabase/server";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import {
  assignTaskToLaunchSchema,
  assignTaskToSprintSchema,
  createSprintSchema,
  createWorkboardTaskSchema,
  firstZodError,
  logTaskTimeSchema,
  moveWorkboardTaskSchema,
  setMemberHourlyRateSchema,
  updateSprintPatchSchema,
  updateWorkboardTaskSchema,
  uuidSchema,
} from "@/lib/validations";
import { paths } from "@/routes/paths";
import {
  deleteTaskAttachmentsForTask,
  leerTareaConVinculos,
  loadTaskLinksBundle,
  TAREA_NO_ENCONTRADA,
} from "@/lib/workboard/tarea-con-vinculos";
import type {
  MemberTimeReport,
  WorkboardMember,
  WorkboardSprint,
  WorkboardTask,
} from "@/types/workboard";

function revalidateWorkboard() {
  revalidatePath(paths.platform.workboard.root);
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Código de PostgREST cuando `.single()` no encuentra la fila. */
const SIN_FILAS = "PGRST116";
/** Código de Postgres de una clave foránea que apunta a algo que no existe. */
const REFERENCIA_INEXISTENTE = "23503";

const SESION_NO_VALIDA = "Sesión no válida";
const REFERENCIA_DE_LA_TAREA_INEXISTENTE =
  "El responsable, el sprint, el lanzamiento o el SOP que elegiste ya no existe. Recargá la página e intentá de nuevo.";
const LANZAMIENTO_INEXISTENTE =
  "El lanzamiento que elegiste ya no existe. Recargá la página e intentá de nuevo.";
const SPRINT_INEXISTENTE =
  "El sprint que elegiste ya no existe. Recargá la página e intentá de nuevo.";

/**
 * ⭐ Traduce el error de PostgREST de una escritura del tablero (SCRUM-503).
 *
 * Los rechazos que se conocen vuelven con un mensaje para el usuario
 * (`ErrorEsperable`): la tarea que ya no está (o es de otra organización, que
 * para el filtro por organización es lo mismo), una referencia elegida que ya
 * no existe, la tabla que falta. Cualquier otro (la red, una RLS que rechaza,
 * una constraint) es una `FallaDeLaBase`: `mutacionConErroresEsperables` la
 * registra, la manda a Sentry y el usuario ve el texto fijo, nunca el mensaje
 * técnico de la base.
 */
function errorDeEscritura(
  error: { message: string; code?: string | null },
  tabla: string,
  conocidos: { sinFilas?: string; referenciaInexistente?: string } = {}
): Error {
  if (conocidos.sinFilas && error.code === SIN_FILAS) {
    return new ErrorEsperable(conocidos.sinFilas);
  }
  if (conocidos.referenciaInexistente && error.code === REFERENCIA_INEXISTENTE) {
    return new ErrorEsperable(conocidos.referenciaInexistente);
  }
  if (isMissingTableError(error.message)) {
    return new ErrorEsperable(
      `Falta la tabla ${tabla} en Supabase. Aplicá las migraciones de supabase/migrations.`
    );
  }
  return new FallaDeLaBase(error);
}

function validar<T>(
  resultado: { success: true; data: T } | { success: false; error: Parameters<typeof firstZodError>[0] }
): T {
  if (!resultado.success) throw new ErrorEsperable(firstZodError(resultado.error));
  return resultado.data;
}

/*
 * Lecturas internas: lanzan `FallaDeLaBase` y las acciones exportadas las
 * corren dentro de `mutacionConErroresEsperables`. Una tabla que falta se lee
 * como vacía, como antes.
 */

async function leerMiembros(
  supabase: Supabase,
  organizationId: string
): Promise<WorkboardMember[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("organization_id", organizationId)
    .order("full_name", { ascending: true });

  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new FallaDeLaBase(error);
  }

  return (data ?? []).map(rowToMember);
}

async function leerTareas(
  supabase: Supabase,
  organizationId: string
): Promise<WorkboardTask[]> {
  const members = await leerMiembros(supabase, organizationId);
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const links = await loadTaskLinksBundle(organizationId);

  const { data, error } = await supabase
    .from("workboard_tasks")
    .select("*")
    .eq("organization_id", organizationId)
    .order("status")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new FallaDeLaBase(error);
  }

  return ((data ?? []) as WorkboardTaskRow[]).map((row) =>
    rowToTask(row, memberMap, links)
  );
}

/** La tarea guardada, con sus responsables y sus vínculos, como la ve la pantalla. */
async function armarTarea(
  supabase: Supabase,
  organizationId: string,
  row: unknown
): Promise<WorkboardTask> {
  const members = await leerMiembros(supabase, organizationId);
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const links = await loadTaskLinksBundle(organizationId);
  return rowToTask(row as WorkboardTaskRow, memberMap, links);
}

async function leerSprintActivo(
  supabase: Supabase,
  organizationId: string
): Promise<WorkboardSprint | null> {
  const { data, error } = await supabase
    .from("sprints")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error.message)) return null;
    throw new FallaDeLaBase(error);
  }

  if (!data) return null;

  const tasks = await leerTareas(supabase, organizationId);
  return rowToSprint(data as SprintRow, tasks);
}

async function leerSprints(
  supabase: Supabase,
  organizationId: string
): Promise<WorkboardSprint[]> {
  const { data, error } = await supabase
    .from("sprints")
    .select("*")
    .eq("organization_id", organizationId)
    .order("start_date", { ascending: false });

  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new FallaDeLaBase(error);
  }

  const tasks = await leerTareas(supabase, organizationId);
  return (data ?? []).map((row) => rowToSprint(row as SprintRow, tasks));
}

/*
 * SCRUM-503: las acciones del tablero devuelven sus errores esperables
 * (validación, sesión, permiso, tarea inexistente o de otra organización,
 * referencia que ya no existe, tabla que falta) como valor
 * (`MutationResult`). Corren dentro de `mutacionConErroresEsperables`: sólo un
 * `ErrorEsperable` vuelve con su mensaje; lo inesperado (la red, la base, un
 * bug) se registra, va a Sentry con el tag `server_action` y vuelve con el
 * texto fijo. Ninguna redirige.
 *
 * Las lecturas también: `/workboard` es un server component sin error
 * boundary y una lectura que lanzaba terminaba en la pantalla de error de
 * Next, con el párrafo técnico en inglés en producción. La página muestra el
 * motivo.
 */

export async function listWorkboardMembersAction(): Promise<
  MutationResult<WorkboardMember[]>
> {
  return mutacionConErroresEsperables("[listWorkboardMembers]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    return leerMiembros(supabase, organizationId);
  });
}

export async function listWorkboardTasksAction(): Promise<
  MutationResult<WorkboardTask[]>
> {
  return mutacionConErroresEsperables("[listWorkboardTasks]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    return leerTareas(supabase, organizationId);
  });
}

export async function loadWorkboardPageDataAction(): Promise<
  MutationResult<{
    tasks: WorkboardTask[];
    members: WorkboardMember[];
    sprints: WorkboardSprint[];
  }>
> {
  return mutacionConErroresEsperables("[loadWorkboardPageData]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const [tasks, members, sprints] = await Promise.all([
      leerTareas(supabase, organizationId),
      leerMiembros(supabase, organizationId),
      leerSprints(supabase, organizationId),
    ]);
    return { tasks, members, sprints };
  });
}

export async function createWorkboardTaskAction(
  input: unknown
): Promise<MutationResult<WorkboardTask>> {
  return mutacionConErroresEsperables("[createWorkboardTask]", async () => {
    const payload = validar(createWorkboardTaskSchema.safeParse(input));
    const organizationId = await requireOrganizationId();
    const profile = await getCurrentProfile();
    const supabase = await createClient();

    const existing = await leerTareas(supabase, organizationId);
    const position = getNextPosition(existing, payload.status);

    let sprintId = payload.sprintId;
    if (sprintId === undefined) {
      const active = await leerSprintActivo(supabase, organizationId);
      sprintId = active?.id ?? null;
    }

    /**
     * ⭐ La lista de responsables, normalizada.
     *
     * `assignee_id` se sigue escribiendo con el primero: los reportes de tiempo y
     * los filtros viejos lo leen, y romperlos para estrenar la columna nueva
     * sería cambiar un problema por otro.
     */
    const responsables = normalizarResponsables(payload.assigneeIds, payload.assigneeId);

    const insertRow: Record<string, unknown> = {
        organization_id: organizationId,
        title: payload.title.trim(),
        description: payload.description?.trim() ?? "",
        status: payload.status,
        area: payload.area,
        priority: payload.priority,
        assignee_id: responsables[0] ?? null,
        assignee_ids: responsables,
        due_date: payload.dueDate || null,
        tags: payload.tags ?? [],
        sprint_id: sprintId || null,
        launch_id: payload.launchId || null,
        position,
        created_by: profile?.id ?? null,
        updated_at: new Date().toISOString(),
      };

    if (payload.sopId) {
      insertRow.sop_id = payload.sopId;
    }

    const { data: row, error } = await supabase
      .from("workboard_tasks")
      .insert(insertRow)
      .select("*")
      .single();

    if (error) {
      throw errorDeEscritura(error, "workboard_tasks", {
        referenciaInexistente: REFERENCIA_DE_LA_TAREA_INEXISTENTE,
      });
    }

    const taskId = row.id as string;

    if (payload.documentIds?.length) {
      const links = payload.documentIds.map((documentId) => ({
        task_id: taskId,
        document_id: documentId,
        organization_id: organizationId,
      }));
      const { error: linkError } = await supabase
        .from("workboard_task_documents")
        .upsert(links, { onConflict: "task_id,document_id", ignoreDuplicates: true });

      if (linkError && !isMissingTableError(linkError.message)) {
        console.error("[Workboard] link documents on create:", linkError.message);
      }
    }

    if (sprintId) {
      await refreshSprintCompletionForTask(supabase, organizationId, taskId);
    }
    revalidateWorkboard();
    // La tarea recién creada, con sus vínculos. Si no se puede leer es una
    // falla: la acción la registra y avisa con el texto fijo.
    return leerTareaConVinculos(taskId, organizationId);
  });
}

export async function moveWorkboardTaskAction(
  input: unknown
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[moveWorkboardTask]", async () => {
    const data = validar(moveWorkboardTaskSchema.safeParse(input));
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const existing = await leerTareas(supabase, organizationId);
    const position = getNextPosition(
      existing.filter((t) => t.id !== data.taskId),
      data.status
    );

    const { error } = await supabase
      .from("workboard_tasks")
      .update({
        status: data.status,
        position,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.taskId)
      .eq("organization_id", organizationId);

    if (error) throw errorDeEscritura(error, "workboard_tasks");
    await refreshSprintCompletionForTask(supabase, organizationId, data.taskId);
    revalidateWorkboard();
  });
}

/**
 * Deja la lista de responsables lista para guardar: sin repetidos, sin vacíos, y
 * aceptando tanto la forma nueva (varios) como la vieja (uno solo).
 */
function normalizarResponsables(
  varios: readonly (string | null | undefined)[] | null | undefined,
  uno: string | null | undefined
): string[] {
  const crudos = varios && varios.length > 0 ? varios : [uno];
  const limpios = crudos
    .map((id) => id?.trim())
    .filter((id): id is string => Boolean(id));
  return [...new Set(limpios)];
}

export async function updateWorkboardTaskAction(
  input: unknown
): Promise<MutationResult<WorkboardTask>> {
  return mutacionConErroresEsperables("[updateWorkboardTask]", async () => {
    const { taskId, ...fields } = validar(updateWorkboardTaskSchema.safeParse(input));
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const profile = await getCurrentProfile();

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (fields.title !== undefined) patch.title = fields.title.trim();
    if (fields.description !== undefined) patch.description = fields.description.trim();
    if (fields.status !== undefined) patch.status = fields.status;
    if (fields.area !== undefined) patch.area = fields.area;
    if (fields.priority !== undefined) patch.priority = fields.priority;
    if (fields.assigneeIds !== undefined || fields.assigneeId !== undefined) {
      const responsables = normalizarResponsables(fields.assigneeIds, fields.assigneeId);
      patch.assignee_ids = responsables;
      patch.assignee_id = responsables[0] ?? null;
    }
    if (fields.dueDate !== undefined) patch.due_date = fields.dueDate || null;
    if (fields.tags !== undefined) patch.tags = fields.tags;
    if (fields.launchId !== undefined) patch.launch_id = fields.launchId || null;
    if (fields.estimatedMinutes !== undefined) {
      patch.estimated_minutes = fields.estimatedMinutes;
    }

    /**
     * ⭐ Quién dio la tarea por terminada.
     *
     * Con varios responsables cualquiera puede cerrarla, así que la tarjeta tiene
     * que poder decir quién fue. Si se reabre, el dato se borra: dejar colgado el
     * nombre de quien la cerró la vez pasada confunde más de lo que ayuda.
     */
    if (fields.status !== undefined) {
      if (fields.status === "done") {
        patch.completed_by = profile?.id ?? null;
        patch.completed_at = new Date().toISOString();
      } else {
        patch.completed_by = null;
        patch.completed_at = null;
      }
    }

    if (fields.status !== undefined) {
      const existing = await leerTareas(supabase, organizationId);
      patch.position = getNextPosition(
        existing.filter((t) => t.id !== taskId),
        fields.status
      );
    }

    const { data, error } = await supabase
      .from("workboard_tasks")
      .update(patch)
      .eq("id", taskId)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (error) {
      throw errorDeEscritura(error, "workboard_tasks", {
        sinFilas: TAREA_NO_ENCONTRADA,
        referenciaInexistente: REFERENCIA_DE_LA_TAREA_INEXISTENTE,
      });
    }
    await refreshSprintCompletionForTask(supabase, organizationId, taskId);
    revalidateWorkboard();
    return armarTarea(supabase, organizationId, data);
  });
}

export async function deleteWorkboardTaskAction(
  taskId: unknown
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[deleteWorkboardTask]", async () => {
    const id = validar(uuidSchema.safeParse(taskId));
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    await deleteTaskAttachmentsForTask(organizationId, id);

    const { error } = await supabase
      .from("workboard_tasks")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw errorDeEscritura(error, "workboard_tasks");
    revalidateWorkboard();
  });
}

type TaskTimeEntry = {
  logged_at: string;
  minutes: number;
  note?: string;
  logged_by: string;
};

export async function assignTaskToLaunchAction(
  taskId: string,
  launchId: string | null
): Promise<MutationResult<WorkboardTask>> {
  return mutacionConErroresEsperables("[assignTaskToLaunch]", async () => {
    const data = validar(assignTaskToLaunchSchema.safeParse({ taskId, launchId }));
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: row, error } = await supabase
      .from("workboard_tasks")
      .update({
        launch_id: data.launchId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.taskId)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (error) {
      throw errorDeEscritura(error, "workboard_tasks", {
        sinFilas: TAREA_NO_ENCONTRADA,
        referenciaInexistente: LANZAMIENTO_INEXISTENTE,
      });
    }

    revalidateWorkboard();
    revalidatePath(paths.platform.lanzamientos);

    return armarTarea(supabase, organizationId, row);
  });
}

export async function logTaskTimeAction(input: unknown): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[logTaskTime]", async () => {
    const data = validar(logTaskTimeSchema.safeParse(input));
    const organizationId = await requireOrganizationId();
    const profile = await getCurrentProfile();
    if (!profile) throw new ErrorEsperable(SESION_NO_VALIDA);

    const supabase = await createClient();

    const { data: task, error: fetchError } = await supabase
      .from("workboard_tasks")
      .select("id, time_entries, organization_id, estimated_minutes, actual_minutes")
      .eq("id", data.taskId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (fetchError) throw errorDeEscritura(fetchError, "workboard_tasks");
    if (!task) throw new ErrorEsperable(TAREA_NO_ENCONTRADA);

    const currentEntries = (task.time_entries ?? []) as TaskTimeEntry[];
    const previousActualMinutes = Number(task.actual_minutes ?? 0);
    const accumulatedActualMinutes = previousActualMinutes + data.actualMinutes;
    const newEntry: TaskTimeEntry = {
      logged_at: new Date().toISOString(),
      minutes: data.actualMinutes,
      note: data.note ?? "",
      logged_by: profile.id,
    };

    const { error } = await supabase
      .from("workboard_tasks")
      .update({
        actual_minutes: accumulatedActualMinutes,
        estimated_minutes:
          data.estimatedMinutes ?? task.estimated_minutes ?? null,
        time_entries: [...currentEntries, newEntry],
        timer_running: false,
        timer_started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.taskId)
      .eq("organization_id", organizationId);

    if (error) throw errorDeEscritura(error, "workboard_tasks");

    revalidateWorkboard();
  });
}

export async function getTimeByMemberAction(): Promise<
  MutationResult<MemberTimeReport[] | null>
> {
  return mutacionConErroresEsperables("[getTimeByMember]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("workboard_time_by_member")
      .select("*")
      .eq("organization_id", organizationId)
      .order("actual_minutes", { ascending: false });

    if (error) {
      if (isMissingTableError(error.message)) return null;
      throw new FallaDeLaBase(error);
    }

    if (!data?.length) return null;

    return buildMemberTimeReports(data as TimeByMemberRow[]);
  });
}

export async function setMemberHourlyRateAction(
  input: unknown
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[setMemberHourlyRate]", async () => {
    const data = validar(setMemberHourlyRateSchema.safeParse(input));
    const profile = await getCurrentProfile();
    if (!profile) throw new ErrorEsperable(SESION_NO_VALIDA);

    if (!["founder", "admin"].includes(profile.role)) {
      throw new ErrorEsperable("Sin permisos para configurar sueldos");
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        hourly_rate: data.hourlyRate,
        hourly_rate_currency: data.currency,
      })
      .eq("id", data.memberId)
      .eq("organization_id", profile.organization_id);

    if (error) throw errorDeEscritura(error, "profiles");
    revalidatePath(paths.platform.team.root);
  });
}

async function refreshSprintCompletionForTask(
  supabase: Supabase,
  organizationId: string,
  taskId: string
): Promise<void> {
  const { data: task } = await supabase
    .from("workboard_tasks")
    .select("sprint_id")
    .eq("id", taskId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (task?.sprint_id) {
    await updateSprintCompletionInternal(supabase, organizationId, task.sprint_id);
  }
}

/**
 * Recalcula el avance del sprint. Después de mover, editar o asignar una tarea
 * es un efecto secundario: la escritura principal ya se hizo y una falla acá
 * no la deshace, así que se ignora como siempre. `estricto` es para
 * `updateSprintCompletionAction`, cuyo único trabajo es este: ahí una falla de
 * la base no puede volver como éxito (SCRUM-503).
 */
async function updateSprintCompletionInternal(
  supabase: Supabase,
  organizationId: string,
  sprintId: string,
  estricto = false
): Promise<void> {
  const { data: tasks, error: lecturaError } = await supabase
    .from("workboard_tasks")
    .select("status")
    .eq("sprint_id", sprintId)
    .eq("organization_id", organizationId);

  if (estricto && lecturaError) throw errorDeEscritura(lecturaError, "workboard_tasks");
  if (!tasks?.length) return;

  const completed = tasks.filter((t) => t.status === "done").length;
  const rate = Math.round((completed / tasks.length) * 100);

  const { error } = await supabase
    .from("sprints")
    .update({ completion_rate: rate, updated_at: new Date().toISOString() })
    .eq("id", sprintId)
    .eq("organization_id", organizationId);

  if (estricto && error) throw errorDeEscritura(error, "sprints");
}

export async function getActiveSprintAction(): Promise<
  MutationResult<WorkboardSprint | null>
> {
  return mutacionConErroresEsperables("[getActiveSprint]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    return leerSprintActivo(supabase, organizationId);
  });
}

export async function getSprintsAction(): Promise<MutationResult<WorkboardSprint[]>> {
  return mutacionConErroresEsperables("[getSprints]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    return leerSprints(supabase, organizationId);
  });
}

export async function createSprintAction(
  input: unknown
): Promise<MutationResult<WorkboardSprint>> {
  return mutacionConErroresEsperables("[createSprint]", async () => {
    const data = validar(createSprintSchema.safeParse(input));
    const organizationId = await requireOrganizationId();
    const profile = await getCurrentProfile();
    const supabase = await createClient();

    // Sólo puede haber un sprint activo: si no se pudo cerrar el anterior, no
    // se crea el nuevo (quedarían dos activos). Antes la falla se ignoraba.
    const { error: cierreError } = await supabase
      .from("sprints")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .eq("status", "active");

    if (cierreError) throw errorDeEscritura(cierreError, "sprints");

    const { data: sprint, error } = await supabase
      .from("sprints")
      .insert({
        organization_id: organizationId,
        name: data.name.trim(),
        goal: data.goal?.trim() || null,
        area_focus: data.areaFocus || null,
        start_date: data.startDate,
        end_date: data.endDate,
        status: "active",
        created_by: profile?.id ?? null,
      })
      .select("*")
      .single();

    if (error) throw errorDeEscritura(error, "sprints");

    revalidateWorkboard();
    return rowToSprint(sprint as SprintRow, []);
  });
}

export async function updateSprintAction(
  sprintId: string,
  input: unknown
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[updateSprint]", async () => {
    const id = validar(uuidSchema.safeParse(sprintId));
    const data = validar(updateSprintPatchSchema.safeParse(input));
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.goal !== undefined) patch.goal = data.goal.trim() || null;
    if (data.areaFocus !== undefined) patch.area_focus = data.areaFocus || null;
    if (data.startDate !== undefined) patch.start_date = data.startDate;
    if (data.endDate !== undefined) patch.end_date = data.endDate;
    if (data.status !== undefined) patch.status = data.status;

    const { error } = await supabase
      .from("sprints")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw errorDeEscritura(error, "sprints");

    revalidateWorkboard();
  });
}

export async function assignTaskToSprintAction(
  taskId: string,
  sprintId: string | null
): Promise<MutationResult<WorkboardTask>> {
  return mutacionConErroresEsperables("[assignTaskToSprint]", async () => {
    const data = validar(assignTaskToSprintSchema.safeParse({ taskId, sprintId }));
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: row, error } = await supabase
      .from("workboard_tasks")
      .update({
        sprint_id: data.sprintId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.taskId)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (error) {
      throw errorDeEscritura(error, "workboard_tasks", {
        sinFilas: TAREA_NO_ENCONTRADA,
        referenciaInexistente: SPRINT_INEXISTENTE,
      });
    }

    await refreshSprintCompletionForTask(supabase, organizationId, data.taskId);
    revalidateWorkboard();

    return armarTarea(supabase, organizationId, row);
  });
}

export async function updateSprintCompletionAction(
  sprintId: string
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[updateSprintCompletion]", async () => {
    const id = validar(uuidSchema.safeParse(sprintId));
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    await updateSprintCompletionInternal(supabase, organizationId, id, true);
  });
}

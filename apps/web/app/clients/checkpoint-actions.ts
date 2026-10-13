"use server";

/**
 * C1 · El recorrido del cliente — CRUD del catálogo de fases y checkpoints.
 *
 * Esto es configuración, no datos del negocio. Mismas reglas que C0:
 *   · No se borra lo que tiene historia: se archiva.
 *   · Lo que no se entiende se rechaza; no se guarda "como venga".
 *   · Las métricas de un checkpoint son campos configurables de C0, no un
 *     segundo mecanismo.
 *
 * SCRUM-517: todas las acciones devuelven sus errores como valor
 * (`MutationResult`) dentro de `mutacionConErroresEsperables`. Un rechazo
 * esperable (validación, sesión, sólo el founder, nombre repetido, fase o
 * checkpoint inexistente o de otra org) vuelve con su mensaje; una falla de la
 * base se registra, va a Sentry y el usuario ve el texto fijo. Las lecturas
 * tampoco esconden una falla detrás de una lista vacía.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getCurrentProfile,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import { FIELD_OPTION_COLORS } from "@/types/custom-fields";
import {
  CHECKPOINT_CLIENT_STATUSES,
  type Checkpoint,
  type CheckpointRow,
  type JourneyStage,
  type JourneyStageRow,
  type JourneyStageWithCheckpoints,
} from "@/types/checkpoints";
import type { FieldDefinition } from "@/types/custom-fields";
import {
  buildJourney,
  rowToCheckpoint,
  rowToJourneyStage,
  serializeMetricSchema,
} from "@/lib/checkpoints";
import { leerCheckpoints, leerFasesDelRecorrido } from "@/lib/checkpoints/lecturas-del-recorrido";
import { leerColumnas } from "@/lib/custom-fields/leer-columnas";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { firstZodError } from "@/lib/validations";
import { createClient } from "@/lib/supabase/server";
import { paths } from "@/routes";
import { esTablaAusente } from "@/lib/server/tabla-ausente";

const stageSchema = z.object({
  name: z.string().trim().min(1, "La fase necesita un nombre.").max(120),
  color: z.enum(FIELD_OPTION_COLORS).default("neutral"),
});

const metricSchema = z.object({
  fieldKey: z.string().trim().min(1).max(60),
  required: z.boolean().default(false),
});

const checkpointSchema = z.object({
  stageId: z.string().uuid("Elegí la fase a la que pertenece."),
  name: z.string().trim().min(1, "El checkpoint necesita un nombre.").max(160),
  description: z.string().trim().max(500).nullable().default(null),
  setsClientStatus: z.enum(CHECKPOINT_CLIENT_STATUSES).nullable().default(null),
  /** Días desde el checkpoint anterior. Un plazo de cero días no es un plazo. */
  expectedDays: z.number().int().min(1).max(3650).nullable().default(null),
  metricSchema: z.array(metricSchema).max(40).default([]),
  productId: z.string().uuid().nullable().default(null),
});

export type CreateStageInput = z.input<typeof stageSchema>;
export type CreateCheckpointInput = z.input<typeof checkpointSchema>;

/** Código de PostgREST cuando `.single()` no encuentra la fila. */
const SIN_FILAS = "PGRST116";

const FASE_NO_ENCONTRADA = "No se encontró la fase. Puede que la hayan borrado.";
const CHECKPOINT_NO_ENCONTRADO = "No se encontró el checkpoint. Puede que lo hayan borrado.";

/**
 * El error de una escritura que devuelve la fila (`.single()`): sin filas es
 * que no existe o es de otra organización (`ErrorEsperable`); cualquier otro
 * es una falla de la base.
 */
function errorDeEscritura(
  error: { message: string; code?: string | null },
  noEncontrado: string
): Error {
  if (error.code === SIN_FILAS) return new ErrorEsperable(noEncontrado);
  return new FallaDeLaBase(error);
}

async function requireFounder() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "founder") {
    throw new ErrorEsperable("Solo el founder puede configurar el recorrido");
  }
}

function revalidate() {
  revalidatePath(paths.platform.clients.checkpoints);
}

// ─── Lectura ────────────────────────────────────────────────────────────────

export async function listJourneyStagesAction(): Promise<MutationResult<JourneyStage[]>> {
  return mutacionConErroresEsperables("[listJourneyStages]", async () => {
    const organizationId = await requireOrganizationId();
    return leerFasesDelRecorrido(await createClient(), organizationId);
  });
}

export async function listCheckpointsAction(): Promise<MutationResult<Checkpoint[]>> {
  return mutacionConErroresEsperables("[listCheckpoints]", async () => {
    const organizationId = await requireOrganizationId();
    return leerCheckpoints(await createClient(), organizationId);
  });
}

export type JourneyPageData = {
  stages: JourneyStageWithCheckpoints[];
  orphanCheckpoints: Checkpoint[];
  checkpointFields: FieldDefinition[];
  canManage: boolean;
};

/**
 * Todo lo que la pantalla necesita, en una llamada.
 *
 * Incluye los campos de C0 porque sin ellos no se puede mostrar qué métrica pide
 * cada checkpoint — es el cruce, no un dato aparte.
 *
 * La usa el server component de la pantalla: con un error, la pantalla muestra
 * el motivo en vez de un recorrido vacío o la pantalla de error.
 */
export async function getJourneyPageDataAction(): Promise<MutationResult<JourneyPageData>> {
  return mutacionConErroresEsperables("[getJourneyPageData]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const [stages, checkpoints, fields, profile] = await Promise.all([
      leerFasesDelRecorrido(supabase, organizationId),
      leerCheckpoints(supabase, organizationId),
      leerColumnas(supabase, organizationId, "checkpoint"),
      getCurrentProfile(),
    ]);

    const journey = buildJourney(stages, checkpoints);

    return {
      stages: journey.stages,
      orphanCheckpoints: journey.orphanCheckpoints,
      checkpointFields: fields,
      canManage: profile?.role === "founder",
    };
  });
}

// ─── Fases ──────────────────────────────────────────────────────────────────

export async function createJourneyStageAction(
  input: CreateStageInput
): Promise<MutationResult<JourneyStage>> {
  return mutacionConErroresEsperables("[createJourneyStage]", async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();

    const parsed = stageSchema.safeParse(input);
    if (!parsed.success) throw new ErrorEsperable(firstZodError(parsed.error));

    const supabase = await createClient();
    const existing = await leerFasesDelRecorrido(supabase, organizationId);
    assertNameIsFree(existing, parsed.data.name, "fase");

    const { data, error } = await supabase
      .from("client_journey_stages")
      .insert({
        organization_id: organizationId,
        name: parsed.data.name,
        color: parsed.data.color,
        sort_order: nextSortOrder(existing),
      })
      .select("*")
      .single();

    if (error) throw new FallaDeLaBase(error);
    revalidate();
    return rowToJourneyStage(data as JourneyStageRow);
  });
}

export async function updateJourneyStageAction(
  id: string,
  input: Partial<CreateStageInput>
): Promise<MutationResult<JourneyStage>> {
  return mutacionConErroresEsperables("[updateJourneyStage]", async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();

    const parsed = stageSchema.partial().safeParse(input);
    if (!parsed.success) throw new ErrorEsperable(firstZodError(parsed.error));

    const supabase = await createClient();
    if (parsed.data.name !== undefined) {
      const existing = await leerFasesDelRecorrido(supabase, organizationId);
      assertNameIsFree(
        existing.filter((stage) => stage.id !== id),
        parsed.data.name,
        "fase"
      );
    }

    // `.single()` sin filas (PGRST116): la fase no existe o es de otra org.
    const { data, error } = await supabase
      .from("client_journey_stages")
      .update(parsed.data)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (error) throw errorDeEscritura(error, FASE_NO_ENCONTRADA);
    revalidate();
    return rowToJourneyStage(data as JourneyStageRow);
  });
}

export async function setJourneyStageArchivedAction(
  id: string,
  archived: boolean
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[setJourneyStageArchived]", async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();

    const supabase = await createClient();
    const { error } = await supabase
      .from("client_journey_stages")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);
    revalidate();
  });
}

/**
 * Borrado de verdad — sólo si la fase está vacía.
 *
 * Con checkpoints adentro se rechaza: la cascada de la base los borraría a
 * todos, y eso es exactamente el tipo de borrado silencioso que no queremos.
 * Si no se pueden leer los checkpoints, no se borra: es una falla, no "vacía".
 */
export async function deleteJourneyStageAction(
  id: string
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[deleteJourneyStage]", async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();

    const supabase = await createClient();
    const checkpoints = await leerCheckpoints(supabase, organizationId);
    if (checkpoints.some((checkpoint) => checkpoint.stageId === id)) {
      throw new ErrorEsperable(
        "La fase tiene checkpoints adentro. Movelos o borralos primero, o archivá la fase."
      );
    }

    const { error } = await supabase
      .from("client_journey_stages")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);
    revalidate();
  });
}

export async function reorderJourneyStagesAction(
  orderedIds: string[]
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[reorderJourneyStages]", async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    for (const [index, id] of orderedIds.entries()) {
      const { error } = await supabase
        .from("client_journey_stages")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw new FallaDeLaBase(error);
    }
    revalidate();
  });
}

// ─── Checkpoints ────────────────────────────────────────────────────────────

export async function createCheckpointAction(
  input: CreateCheckpointInput
): Promise<MutationResult<Checkpoint>> {
  return mutacionConErroresEsperables("[createCheckpoint]", async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();

    const parsed = checkpointSchema.safeParse(input);
    if (!parsed.success) throw new ErrorEsperable(firstZodError(parsed.error));
    const values = parsed.data;

    const supabase = await createClient();
    await assertStageExists(supabase, organizationId, values.stageId);
    await assertMetricsExist(supabase, organizationId, values.metricSchema);

    const existing = await leerCheckpoints(supabase, organizationId);
    assertNameIsFree(
      existing.filter((checkpoint) => checkpoint.stageId === values.stageId),
      values.name,
      "checkpoint"
    );

    const { data, error } = await supabase
      .from("client_checkpoints")
      .insert({
        organization_id: organizationId,
        stage_id: values.stageId,
        name: values.name,
        description: values.description,
        sets_client_status: values.setsClientStatus,
        expected_days: values.expectedDays,
        metric_schema: serializeMetricSchema(values.metricSchema),
        product_id: values.productId,
        sort_order: nextSortOrder(
          existing.filter((checkpoint) => checkpoint.stageId === values.stageId)
        ),
      })
      .select("*")
      .single();

    if (error) throw new FallaDeLaBase(error);
    revalidate();
    return rowToCheckpoint(data as CheckpointRow);
  });
}

export async function updateCheckpointAction(
  id: string,
  input: Partial<CreateCheckpointInput>
): Promise<MutationResult<Checkpoint>> {
  return mutacionConErroresEsperables("[updateCheckpoint]", async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();

    const parsed = checkpointSchema.partial().safeParse(input);
    if (!parsed.success) throw new ErrorEsperable(firstZodError(parsed.error));
    const values = parsed.data;

    const supabase = await createClient();
    if (values.stageId !== undefined) {
      await assertStageExists(supabase, organizationId, values.stageId);
    }
    if (values.metricSchema !== undefined) {
      await assertMetricsExist(supabase, organizationId, values.metricSchema);
    }

    const patch: Record<string, unknown> = {};
    if (values.stageId !== undefined) patch.stage_id = values.stageId;
    if (values.name !== undefined) patch.name = values.name;
    if (values.description !== undefined) patch.description = values.description;
    if (values.setsClientStatus !== undefined) {
      patch.sets_client_status = values.setsClientStatus;
    }
    if (values.expectedDays !== undefined) patch.expected_days = values.expectedDays;
    if (values.metricSchema !== undefined) {
      patch.metric_schema = serializeMetricSchema(values.metricSchema);
    }
    if (values.productId !== undefined) patch.product_id = values.productId;

    // `.single()` sin filas (PGRST116): el checkpoint no existe o es de otra org.
    const { data, error } = await supabase
      .from("client_checkpoints")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (error) throw errorDeEscritura(error, CHECKPOINT_NO_ENCONTRADO);
    revalidate();
    return rowToCheckpoint(data as CheckpointRow);
  });
}

export async function setCheckpointArchivedAction(
  id: string,
  archived: boolean
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[setCheckpointArchived]", async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();

    const supabase = await createClient();
    const { error } = await supabase
      .from("client_checkpoints")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);
    revalidate();
  });
}

/**
 * Borrado de verdad — sólo mientras ningún cliente lo haya alcanzado.
 *
 * `client_checkpoint_events` todavía no existe (la trae C2). Una tabla ausente
 * cuenta como "sin uso", que es la verdad hoy, y el chequeo empieza a valer solo
 * cuando esa migración entre.
 */
export async function deleteCheckpointAction(
  id: string
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[deleteCheckpoint]", async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();

    const supabase = await createClient();
    if (await checkpointHasEvents(supabase, id, organizationId)) {
      throw new ErrorEsperable(
        "Algún cliente ya alcanzó este checkpoint. Archivalo en vez de borrarlo: el registro viejo lo sigue mostrando."
      );
    }

    const { error } = await supabase
      .from("client_checkpoints")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);
    revalidate();
  });
}

export async function reorderCheckpointsAction(
  stageId: string,
  orderedIds: string[]
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[reorderCheckpoints]", async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    for (const [index, id] of orderedIds.entries()) {
      const { error } = await supabase
        .from("client_checkpoints")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("organization_id", organizationId)
        .eq("stage_id", stageId);
      if (error) throw new FallaDeLaBase(error);
    }
    revalidate();
  });
}

// ─── Ejemplo ────────────────────────────────────────────────────────────────

/**
 * Un recorrido de tres fases para que la pantalla no nazca en blanco.
 *
 * Es una forma, no una recomendación: son los tramos que casi cualquier negocio
 * de infoproductos reconoce. Se espera que Santiago los reemplace.
 */
export async function seedExampleJourneyAction(): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[seedExampleJourney]", async () => {
    const organizationId = await requireOrganizationId();
    const existing = await leerFasesDelRecorrido(await createClient(), organizationId);
    if (existing.length > 0) {
      throw new ErrorEsperable("El recorrido ya tiene fases: agregá las que falten a mano.");
    }

    const examples = [
      { name: "Onboarding", color: "cat-1" as const },
      { name: "Primeros resultados", color: "cat-3" as const },
      { name: "Escala", color: "cat-5" as const },
    ];

    for (const example of examples) {
      const result = await createJourneyStageAction(example);
      // El motivo ya viene para el usuario (y si fue una falla, ya quedó
      // registrada con la etiqueta de `createJourneyStage`): pasa tal cual.
      if (!result.success) throw new ErrorEsperable(result.error);
    }
  });
}

// ─── Ayudas ─────────────────────────────────────────────────────────────────

type Supabase = Awaited<ReturnType<typeof createClient>>;

function nextSortOrder(existing: readonly { sortOrder: number }[]): number {
  return existing.reduce((max, entry) => Math.max(max, entry.sortOrder + 1), 0);
}

/** Dos fases con el mismo nombre son dos fases que nadie puede distinguir. */
function assertNameIsFree(
  existing: readonly { name: string }[],
  name: string,
  what: "fase" | "checkpoint"
) {
  const taken = existing.some(
    (entry) => entry.name.trim().toLowerCase() === name.trim().toLowerCase()
  );
  if (taken) {
    throw new ErrorEsperable(
      what === "fase"
        ? `Ya existe una fase que se llama "${name}".`
        : `Esa fase ya tiene un checkpoint que se llama "${name}".`
    );
  }
}

async function assertStageExists(supabase: Supabase, organizationId: string, stageId: string) {
  const stages = await leerFasesDelRecorrido(supabase, organizationId);
  if (!stages.some((stage) => stage.id === stageId)) {
    throw new ErrorEsperable("La fase elegida no existe");
  }
}

/**
 * Una métrica tiene que apuntar a una columna de checkpoint que exista y esté
 * activa. Guardar una referencia rota sería configurar un formulario que después
 * no puede pedir nada.
 */
async function assertMetricsExist(
  supabase: Supabase,
  organizationId: string,
  metrics: readonly { fieldKey: string }[]
) {
  if (metrics.length === 0) return;

  const fields = await leerColumnas(supabase, organizationId, "checkpoint");
  const available = new Set(
    fields.filter((f) => f.archivedAt === null).map((f) => f.key)
  );

  for (const metric of metrics) {
    if (!available.has(metric.fieldKey)) {
      throw new ErrorEsperable(
        `La métrica "${metric.fieldKey}" no es una columna de checkpoint disponible. Creala en Campos personalizados.`
      );
    }
  }
}

/**
 * ¿Algún cliente alcanzó el checkpoint? Una tabla ausente cuenta como "sin
 * uso". Si no se puede saber, lanza: no se borra (es la opción que no pierde
 * datos), pero tampoco se le dice al usuario que hay clientes que lo
 * alcanzaron cuando lo que pasó es que la base falló.
 */
async function checkpointHasEvents(
  supabase: Supabase,
  checkpointId: string,
  organizationId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from("client_checkpoint_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("checkpoint_id", checkpointId);

  if (error) {
    if (esTablaAusente(error)) return false;
    throw new FallaDeLaBase(error);
  }

  return (count ?? 0) > 0;
}

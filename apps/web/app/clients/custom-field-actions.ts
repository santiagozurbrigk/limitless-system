"use server";

/**
 * C0 · Campos configurables — CRUD del catálogo de columnas.
 *
 * Esta tabla es configuración, no datos del negocio. Las tres reglas que la
 * mantienen sana están en `lib/custom-fields/`, y acá se aplican:
 *   1. La clave se deriva al crear y **no se puede cambiar** (renombrar la
 *      etiqueta no toca ningún dato cargado).
 *   2. Una opción en uso no se borra: se archiva.
 *   3. Un campo archivado deja de ofrecerse pero sigue mostrándose.
 */

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import {
  getCurrentProfile,
  isMissingTableError,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import {
  FIELD_ENTITIES,
  FIELD_SECTIONS,
  type FieldSection,
  FIELD_OPTION_COLORS,
  FIELD_TYPES,
  type FieldDefinition,
  type FieldDefinitionRow,
  type FieldEntity,
  type FieldOnboardingConfig,
} from "@/types/custom-fields";
import {
  deriveFieldKey,
  deriveFieldKeyOrError,
  fieldTypeUsesOptions,
  rowToFieldDefinition,
} from "@/lib/custom-fields";
import { orgHasAddOn } from "@/lib/auth/add-ons";
import { exigirAddOn } from "@/lib/auth/exigir-add-on";
import { leerColumnas } from "@/lib/custom-fields/leer-columnas";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { lecturaDegradable } from "@/lib/server/lectura-degradable";
import { firstZodError } from "@/lib/validations";
import { createClient } from "@/lib/supabase/server";
import { paths } from "@/routes";
import { ONBOARDING_QUESTIONS } from "@/lib/client-onboarding/questions";

/**
 * Tablas donde puede estar cargado el valor de un campo.
 *
 * `isFieldInUse` las consulta para decidir si una columna se puede borrar o hay
 * que archivarla. Una tabla que no existe cuenta como "sin uso", no como error.
 */
const VALUES_TABLE: Record<FieldEntity, { table: string; column: string }[]> = {
  win: [{ table: "client_wins", column: "custom" }],
  checkpoint: [{ table: "client_checkpoint_events", column: "metrics" }],
  /*
   * ⭐ Un campo del cliente también se carga en los clientes de un growth
   * partner (`client_sub_clients`). Sin mirar esa tabla, una pregunta del
   * onboarding respondida sólo ahí se contaba como "sin uso" y se podía borrar
   * de verdad, llevándose las respuestas.
   */
  client: [
    { table: "clients", column: "custom" },
    { table: "client_sub_clients", column: "custom" },
  ],
};

const optionSchema = z.object({
  value: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1, "La opción necesita un nombre.").max(120),
  color: z.enum(FIELD_OPTION_COLORS).default("neutral"),
  archived: z.boolean().default(false),
});

const createSchema = z.object({
  entity: z.enum(FIELD_ENTITIES),
  label: z.string().trim().min(1, "La columna necesita un nombre.").max(120),
  /** Hasta 2.000: la ayuda de una pregunta del onboarding trae los benchmarks enteros. */
  description: z.string().trim().max(2000).nullable().default(null),
  fieldType: z.enum(FIELD_TYPES),
  options: z.array(optionSchema).max(60).default([]),
  unit: z.string().trim().max(20).nullable().default(null),
  currency: z.enum(["USD", "ARS"]).nullable().default(null),
  /**
   * ⭐ Sólo para fechas: a cuántos días la fecha se muestra en alerta.
   *
   * El tope de 365 no es capricho: un aviso a dos años no avisa nada, se
   * enciende siempre y deja de significar algo.
   */
  alertDaysBefore: z.number().int().min(1).max(365).nullable().default(null),
  isRequired: z.boolean().default(false),
  /** El apartado de la ficha donde se agrupa. `null` = suelta, como siempre. */
  section: z.enum(FIELD_SECTIONS).nullable().default(null),
  /** Si se dibuja como columna en la tabla de clientes. */
  showInTable: z.boolean().default(false),
  /**
   * Si se pregunta en el formulario de onboarding. Sólo los campos del cliente
   * con apartado, y sólo con el add-on `growth_partners`.
   *
   * La condición y el audio no se editan desde la pantalla (vienen de la
   * plantilla): al guardar se conservan los que la columna ya tenía.
   */
  onboarding: z
    .object({
      step: z.string().trim().min(1).max(60),
      question: z.string().trim().max(500).nullable().default(null),
      required: z.boolean().default(false),
    })
    .nullable()
    .default(null),
});

/** La clave, el tipo y la entidad no se editan: cambiarlos reescribiría el pasado. */
const updateSchema = createSchema
  .omit({ entity: true, fieldType: true })
  .partial()
  .extend({ id: z.string().uuid() });

export type CreateFieldDefinitionInput = z.input<typeof createSchema>;
export type UpdateFieldDefinitionInput = z.input<typeof updateSchema>;

async function requireFounder() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "founder") {
    throw new ErrorEsperable("Solo el founder puede configurar las columnas");
  }
}

function revalidate() {
  revalidatePath(paths.platform.clients.customFields);
}

// ─── Lectura ────────────────────────────────────────────────────────────────

/**
 * Todas las columnas de la organización, archivadas incluidas.
 *
 * Devolverlas todas es deliberado: quien muestra un dato ya cargado necesita
 * las archivadas para no perder una columna que alguien archivó después.
 * Filtrar es trabajo de `activeFields` / `fieldsForValues`.
 */
export async function listFieldDefinitionsAction(
  entity?: FieldEntity
): Promise<FieldDefinition[]> {
  /*
   * SCRUM-517: esta lectura la usan pantallas para mostrar datos (Wins, la
   * bandeja de onboarding) y otras acciones que devuelven la lista tal cual,
   * así que conserva su tipo. Lo que cambia es que una falla ya no se esconde:
   * `lecturaDegradable` la registra (consola y Sentry, tag `lectura_degradada`)
   * y recién ahí devuelve la lista vacía. Las escrituras no la usan para
   * validar: leen con `leerColumnas`, que lanza.
   */
  try {
    return await lecturaDegradable(
      "listFieldDefinitions",
      async () => leerColumnas(await createClient(), await requireOrganizationId(), entity),
      []
    );
  } catch (error) {
    // Sólo llegan acá un error interno de Next (se relanza) y la sesión que
    // falta, que no es una falla: sin sesión no hay columnas que mostrar.
    unstable_rethrow(error);
    return [];
  }
}

export type CustomFieldsPageData = {
  fields: FieldDefinition[];
  canManage: boolean;
};

/**
 * Lo que la pantalla de Campos personalizados necesita. La usan el server
 * component y la recarga después de cada cambio: con un error, la pantalla
 * muestra el motivo en vez de "Todavía no hay columnas".
 */
export async function getCustomFieldsPageDataAction(): Promise<
  MutationResult<CustomFieldsPageData>
> {
  return mutacionConErroresEsperables("[getCustomFieldsPageData]", async () => {
    const organizationId = await requireOrganizationId();
    const [fields, profile] = await Promise.all([
      leerColumnas(await createClient(), organizationId),
      getCurrentProfile(),
    ]);
    return { fields, canManage: profile?.role === "founder" };
  });
}

// ─── Escritura ──────────────────────────────────────────────────────────────

export async function createFieldDefinitionAction(
  input: CreateFieldDefinitionInput
): Promise<MutationResult<FieldDefinition>> {
  return mutacionConErroresEsperables("[createFieldDefinition]", async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();

    const parsed = createSchema.safeParse(input);
    if (!parsed.success) throw new ErrorEsperable(firstZodError(parsed.error));
    const values = parsed.data;

    const supabase = await createClient();
    const existing = await leerColumnas(supabase, organizationId, values.entity);
    const key = deriveFieldKeyOrError(
      values.label,
      existing.map((field) => field.key)
    );
    if (!key.ok) throw new ErrorEsperable(key.error);

    assertOptionsMatchType(values.fieldType, values.options);

    // Los apartados son del add-on `growth_partners`: sin él, la columna va
    // suelta, que es la única forma en que esa organización la ve.
    const conApartados = await orgHasAddOn(organizationId, "growth_partners");

    const { data, error } = await supabase
      .from("field_definitions")
      .insert({
        organization_id: organizationId,
        entity: values.entity,
        key: key.key,
        label: values.label,
        description: values.description,
        field_type: values.fieldType,
        options: values.options,
        options_source: "inline",
        unit: values.fieldType === "number" ? values.unit : null,
        currency: values.fieldType === "currency" ? (values.currency ?? "USD") : null,
        alert_days_before:
          values.fieldType === "date" ? values.alertDaysBefore : null,
        is_required: values.isRequired,
        // Una sección sólo tiene sentido en las columnas del cliente: son las
        // únicas que se dibujan en apartados de una ficha.
        section: values.entity === "client" && conApartados ? values.section : null,
        onboarding:
          values.entity === "client" && conApartados && values.section && values.onboarding
            ? onboardingJson(values.onboarding, null)
            : null,
        show_in_table: values.showInTable,
        // Al final de la lista: una columna nueva no se mete en el medio de un
        // orden que alguien ya acomodó.
        sort_order: nextSortOrder(existing),
      })
      .select("*")
      .single();

    if (error) throw new FallaDeLaBase(error);

    const field = rowToFieldDefinition(data as FieldDefinitionRow);
    if (!field) throw new FallaDeLaBase({ message: "No se pudo leer la columna recién creada" });

    revalidate();
    return field;
  });
}

export async function updateFieldDefinitionAction(
  input: UpdateFieldDefinitionInput
): Promise<MutationResult<FieldDefinition>> {
  return mutacionConErroresEsperables("[updateFieldDefinition]", async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();

    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) throw new ErrorEsperable(firstZodError(parsed.error));
    const { id, ...changes } = parsed.data;

    const supabase = await createClient();
    const current = await findFieldOrThrow(supabase, organizationId, id);

    if (changes.options !== undefined) {
      assertOptionsMatchType(current.fieldType, changes.options);
      assertNoOptionDisappears(current, changes.options);
    }

    const patch: Record<string, unknown> = {};
    // La etiqueta cambia; la clave no. Es la regla 1 y es lo que hace que
    // renombrar sea gratis.
    if (changes.label !== undefined) patch.label = changes.label;
    if (changes.description !== undefined) patch.description = changes.description;
    if (changes.options !== undefined) patch.options = changes.options;
    if (changes.isRequired !== undefined) patch.is_required = changes.isRequired;
    if (changes.unit !== undefined) {
      patch.unit = current.fieldType === "number" ? changes.unit : null;
    }
    if (changes.alertDaysBefore !== undefined) {
      // Como con unidad y moneda: el umbral sólo tiene sentido en su tipo. Si
      // el campo no es una fecha, se guarda nulo en vez de un dato huérfano.
      patch.alert_days_before =
        current.fieldType === "date" ? changes.alertDaysBefore : null;
    }
    if (changes.currency !== undefined) {
      patch.currency = current.fieldType === "currency" ? changes.currency : null;
    }
    if (changes.section !== undefined) {
      const conApartados = await orgHasAddOn(organizationId, "growth_partners");
      patch.section = current.entity === "client" && conApartados ? changes.section : null;
    }
    if (changes.showInTable !== undefined) patch.show_in_table = changes.showInTable;
    if (changes.onboarding !== undefined) {
      const conApartados = await orgHasAddOn(organizationId, "growth_partners");
      const section = changes.section !== undefined ? changes.section : current.section;
      patch.onboarding =
        current.entity === "client" && conApartados && section && changes.onboarding
          ? onboardingJson(changes.onboarding, current.onboarding)
          : null;
    }

    if (Object.keys(patch).length === 0) return current;

    // `.single()` sin filas (PGRST116): la columna dejó de existir entre la
    // lectura de arriba y esta escritura.
    const { data, error } = await supabase
      .from("field_definitions")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (error) {
      if (error.code === SIN_FILAS) throw new ErrorEsperable(COLUMNA_INEXISTENTE);
      throw new FallaDeLaBase(error);
    }

    const field = rowToFieldDefinition(data as FieldDefinitionRow);
    if (!field) throw new FallaDeLaBase({ message: "No se pudo leer la columna actualizada" });

    revalidate();
    return field;
  });
}

/** Archivar o desarchivar. Es lo que reemplaza al borrado para una columna en uso. */
export async function setFieldDefinitionArchivedAction(
  id: string,
  archived: boolean
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[setFieldDefinitionArchived]", async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();

    const supabase = await createClient();
    const { error } = await supabase
      .from("field_definitions")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);
    revalidate();
  });
}

/**
 * Borrado de verdad — sólo para el error de tipeo.
 *
 * Si la columna tiene aunque sea un dato cargado, se rechaza y se ofrece
 * archivar. Borrar una columna en uso dejaría datos huérfanos en el jsonb que
 * nadie podría volver a leer.
 */
export async function deleteFieldDefinitionAction(
  id: string
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[deleteFieldDefinition]", async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();

    const supabase = await createClient();
    const field = await findFieldOrThrow(supabase, organizationId, id);
    if (await isFieldInUse(supabase, field)) {
      throw new ErrorEsperable(
        `"${field.label}" ya tiene datos cargados. Archivala en vez de borrarla: los datos viejos la siguen mostrando.`
      );
    }

    const { error } = await supabase
      .from("field_definitions")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);
    revalidate();
  });
}

/** Reordenar: la pantalla manda la lista completa de una entidad, en orden. */
export async function reorderFieldDefinitionsAction(
  entity: FieldEntity,
  orderedIds: string[]
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[reorderFieldDefinitions]", async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();

    const supabase = await createClient();
    for (const [index, id] of orderedIds.entries()) {
      const { error } = await supabase
        .from("field_definitions")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("organization_id", organizationId)
        .eq("entity", entity);
      if (error) throw new FallaDeLaBase(error);
    }

    revalidate();
  });
}

// ─── Ayudas ─────────────────────────────────────────────────────────────────

/**
 * El jsonb `onboarding` que se guarda. Lo que la pantalla no edita (la
 * condición y el audio) se toma de lo que la columna ya tenía.
 */
function onboardingJson(
  input: { step: string; question: string | null; required: boolean },
  current: FieldOnboardingConfig | null
): Record<string, unknown> {
  return {
    step: input.step,
    question: input.question || null,
    required: input.required,
    showIf: current?.showIf ?? null,
    audio: current?.audio ?? null,
  };
}

function nextSortOrder(existing: readonly FieldDefinition[]): number {
  return existing.reduce((max, field) => Math.max(max, field.sortOrder + 1), 0);
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Código de PostgREST cuando `.single()` no encuentra la fila. */
const SIN_FILAS = "PGRST116";
const COLUMNA_INEXISTENTE = "La columna no existe";

async function findFieldOrThrow(
  supabase: Supabase,
  organizationId: string,
  id: string
): Promise<FieldDefinition> {
  const all = await leerColumnas(supabase, organizationId);
  const field = all.find((candidate) => candidate.id === id);
  if (!field) throw new ErrorEsperable(COLUMNA_INEXISTENTE);
  return field;
}

function assertOptionsMatchType(
  fieldType: FieldDefinition["fieldType"],
  options: readonly { value: string }[]
) {
  if (!fieldTypeUsesOptions(fieldType) && options.length > 0) {
    throw new ErrorEsperable("Sólo los campos de lista llevan opciones");
  }
  const values = options.map((option) => option.value);
  if (new Set(values).size !== values.length) {
    throw new ErrorEsperable("Hay dos opciones con el mismo valor");
  }
}

/**
 * Una opción que ya existe no puede desaparecer de la lista: se archiva.
 *
 * Sin este corte, editar la lista sería una forma silenciosa de borrar el
 * pasado — los datos que la usaban quedarían mostrando un valor que ya no
 * significa nada.
 */
function assertNoOptionDisappears(
  current: FieldDefinition,
  next: readonly { value: string }[]
) {
  const nextValues = new Set(next.map((option) => option.value));
  const missing = current.options.filter((option) => !nextValues.has(option.value));
  if (missing.length > 0) {
    throw new ErrorEsperable(
      `No se puede sacar "${missing[0]?.label}": archivala para que los datos viejos la sigan mostrando.`
    );
  }
}

/**
 * ¿Hay algún dato cargado con esta columna?
 *
 * La tabla de valores todavía no existe (la traen A y C2). Una tabla ausente
 * cuenta como "sin uso" — que es la verdad hoy — y el chequeo empieza a valer
 * solo cuando esas migraciones entren. Si no se puede saber, lanza: no se
 * borra, pero tampoco se dice "ya tiene datos cargados" cuando falló la base.
 */
async function isFieldInUse(supabase: Supabase, field: FieldDefinition): Promise<boolean> {
  for (const target of VALUES_TABLE[field.entity]) {
    const { count, error } = await supabase
      .from(target.table)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", field.organizationId)
      .not(`${target.column}->>${field.key}`, "is", null);

    if (error) {
      if (isMissingTableError(error.message)) continue;
      // Ante la duda, no se borra: es la opción que no pierde datos.
      throw new FallaDeLaBase(error);
    }
    if ((count ?? 0) > 0) return true;
  }

  return false;
}

// ─── Ejemplos ───────────────────────────────────────────────────────────────

/**
 * Carga la columna "Objetivo general" con la lista de las correcciones.
 *
 * Mismo criterio que el ejemplo de wins: la pantalla nace vacía y esto es la
 * salida del estado vacío, a pedido.
 */
export async function seedExampleClientGoalFieldAction(): Promise<
  MutationResult<FieldDefinition>
> {
  /**
   * ⭐ Las opciones son un **punto de partida**, no un estándar.
   *
   * Salieron de las correcciones de Santiago ("10k en primer lanzamiento,
   * escalar a 50k, escalar a 100k, etc"), y están pensadas para editarse: cada
   * organización acompaña a otra clase de cliente. Por eso se cargan apretando
   * un botón y no en la migración — datos que aparecen solos son datos que
   * después hay que borrar.
   *
   * Van en orden de ambición creciente. El orden importa: es lo que permite
   * leer la lista como una escalera y no como un menú.
   */
  const labels = [
    "10k en primer lanzamiento",
    "Escalar a 50k",
    "Escalar a 100k",
    "Escalar a 500k",
    "Otro",
  ];

  return createFieldDefinitionAction({
    entity: "client",
    label: "Objetivo general",
    description:
      "A dónde dijo que quiere llegar, dicho en la call. Cambiá las opciones cuando el uso las revele.",
    fieldType: "select",
    options: labels.map((label, index) => ({
      value: deriveFieldKey(label),
      label,
      color: index === labels.length - 1 ? "neutral" : `cat-${(index % 6) + 1}`,
      archived: false,
    })),
  } as CreateFieldDefinitionInput);
}

/**
 * Carga la columna "Tipo de win" con las opciones que propone el plan.
 *
 * La pantalla nace vacía a propósito —no queremos datos que después haya que
 * borrar—, pero un estado vacío sin una salida es una pared. Esto es la salida:
 * un punto de partida explícito, que se pide apretando un botón.
 */
export async function seedExampleWinFieldAction(): Promise<
  MutationResult<FieldDefinition>
> {
  const labels = [
    "Facturación",
    "Hito",
    "Testimonio",
    "Métrica",
    "Lanzamiento",
    "Mentalidad",
    "Otro",
  ];

  return createFieldDefinitionAction({
    entity: "win",
    label: "Tipo de win",
    description: "Qué clase de logro es. Cambiá las opciones cuando el uso las revele.",
    fieldType: "select",
    options: labels.map((label, index) => ({
      value: deriveFieldKey(label),
      label,
      color: index === labels.length - 1 ? "neutral" : `cat-${(index % 6) + 1}`,
      archived: false,
    })),
  } as CreateFieldDefinitionInput);
}

/**
 * La plantilla de Limitless: las 22 columnas del cliente, en sus tres apartados.
 *
 * ⭐ Va como botón y no como migración por la misma razón que el resto de los
 * seeds de este archivo: **datos que aparecen solos son datos que después hay
 * que borrar**. Cada organización decide si los quiere, y una vez cargados son
 * suyos — se renombran, se archivan, se agregan otros, sin tocar código.
 *
 * ⭐ Todos de tipo texto a propósito. Lo que se pega en «Avatar» puede ser un
 * link a un Miro, a un Google Doc o tres renglones escritos a mano; un tipo más
 * estricto obligaría a elegir por adelantado, que es justo el error que este
 * mecanismo existe para no cometer. La ficha se da cuenta sola de si el
 * contenido es un link y lo muestra clickeable.
 *
 * Es idempotente: las que ya existen se saltean, no se duplican.
 */
const PLANTILLA_LIMITLESS: { section: FieldSection; labels: string[] }[] = [
  {
    section: "marketing",
    labels: [
      "Avatar",
      "Oferta",
      "Dolores",
      "Método único",
      "Narrativa de webinar",
      "Funnel",
      "Métricas clave",
    ],
  },
  {
    section: "ventas",
    labels: [
      "Equipo",
      "Ticket y modalidad",
      "Flujo de preventa",
      "Flujo post-webinar",
      "Script de llamadas",
      "Métricas",
      "Cuellos de botella actuales",
    ],
  },
  {
    section: "sistemas",
    labels: [
      "Cuenta WebinarJam",
      "Addevent",
      "GHL",
      "Claude",
      "Vercel",
      "Supabase",
      "WhatsApp Business",
      "Dominio activo",
    ],
  },
];

export async function seedLimitlessClientFieldsAction(): Promise<
  MutationResult<{ created: number; skipped: number }>
> {
  return mutacionConErroresEsperables("[seedLimitlessClientFields]", async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();
    await exigirAddOn(organizationId, "growth_partners");
    const supabase = await createClient();

    const existing = await leerColumnas(supabase, organizationId, "client");
    const existingKeys = new Set(existing.map((field) => field.key));

    const filas: Record<string, unknown>[] = [];
    let skipped = 0;
    let sortOrder = nextSortOrder(existing);

    for (const grupo of PLANTILLA_LIMITLESS) {
      for (const label of grupo.labels) {
        const key = deriveFieldKey(label);
        // Una clave repetida escribiría en la misma posición del jsonb que la
        // columna que ya existe: se saltea y se cuenta.
        if (!key || existingKeys.has(key)) {
          skipped += 1;
          continue;
        }
        existingKeys.add(key);
        filas.push({
          organization_id: organizationId,
          entity: "client",
          key,
          label,
          description: null,
          field_type: "text",
          options: [],
          options_source: "inline",
          unit: null,
          currency: null,
          alert_days_before: null,
          is_required: false,
          section: grupo.section,
          // Ninguna va a la tabla: 22 columnas más la volverían una planilla.
          show_in_table: false,
          sort_order: sortOrder++,
        });
      }
    }

    if (filas.length > 0) {
      const { error } = await supabase.from("field_definitions").insert(filas);
      if (error) throw new FallaDeLaBase(error);
    }

    revalidate();
    revalidatePath(paths.platform.clients.root);
    return { created: filas.length, skipped };
  });
}

/**
 * Las preguntas del formulario de onboarding, en la solapa «Onboarding».
 *
 * ⭐ Mismo criterio que la Plantilla Limitless: botón y no migración, e
 * idempotente. Una vez cargadas son columnas de la organización: se reescriben
 * y se archivan desde esta pantalla, y el formulario lee de ahí.
 *
 * Sólo con el add-on `growth_partners`: el formulario lo completa cada cliente
 * de un growth partner.
 */
export async function seedOnboardingQuestionsAction(): Promise<
  MutationResult<{ created: number; skipped: number }>
> {
  return mutacionConErroresEsperables("[seedOnboardingQuestions]", async () => {
    await requireFounder();
    const organizationId = await requireOrganizationId();
    await exigirAddOn(organizationId, "growth_partners");
    const supabase = await createClient();

    const existing = await leerColumnas(supabase, organizationId, "client");
    const existingKeys = new Set(existing.map((field) => field.key));

    const filas: Record<string, unknown>[] = [];
    let skipped = 0;
    let sortOrder = nextSortOrder(existing);

    for (const q of ONBOARDING_QUESTIONS) {
      if (existingKeys.has(q.key)) {
        skipped += 1;
        continue;
      }
      existingKeys.add(q.key);
      filas.push({
        organization_id: organizationId,
        entity: "client",
        key: q.key,
        label: q.label,
        description: q.help ?? null,
        field_type: q.type ?? (q.options ? "select" : "text"),
        options: (q.options ?? []).map((o, index) => ({
          value: o.value,
          label: o.label,
          color: `cat-${(index % 6) + 1}`,
          archived: false,
        })),
        options_source: "inline",
        unit: null,
        currency: null,
        alert_days_before: q.type === "date" ? (q.alertDaysBefore ?? null) : null,
        // Obligatoria en el formulario, no en la ficha: el equipo tiene que
        // poder guardar un cliente a medio cargar.
        is_required: false,
        section: q.section ?? "onboarding",
        onboarding: {
          step: q.step,
          question: q.question ?? null,
          required: q.required ?? true,
          showIf: q.showIf ?? null,
          audio: q.audio ?? null,
        },
        show_in_table: false,
        sort_order: sortOrder++,
      });
    }

    if (filas.length > 0) {
      const { error } = await supabase.from("field_definitions").insert(filas);
      if (error) throw new FallaDeLaBase(error);
    }

    revalidate();
    revalidatePath(paths.platform.clients.root);
    return { created: filas.length, skipped };
  });
}

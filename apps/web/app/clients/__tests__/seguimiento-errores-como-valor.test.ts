import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-517: las acciones del seguimiento de Clientes (recorrido, columnas
 * configurables, seguimiento, señales, fase fijada, resumen y tablero)
 * devuelven sus errores como valor. Antes usaban `runMutation` (el texto crudo
 * de la base le llegaba al usuario), las lecturas lanzaban sin sesión (en
 * producción, un digest) o escondían una falla devolviendo una lista vacía.
 */

const ERROR_INESPERADO = "Ocurrió un error inesperado. Intentá de nuevo.";

const ORG = "org-1";
const OTRA_ORG = "org-2";
const FASE = "11111111-1111-4111-8111-111111111111";
const FASE_AJENA = "22222222-2222-4222-8222-222222222222";
const CHECKPOINT = "33333333-3333-4333-8333-333333333333";
const CLIENTE = "44444444-4444-4444-8444-444444444444";
const CLIENTE_AJENO = "55555555-5555-4555-8555-555555555555";
const COLUMNA = "66666666-6666-4666-8666-666666666666";
const PROPUESTA = "77777777-7777-4777-8777-777777777777";
const EVENTO = "88888888-8888-4888-8888-888888888888";
const COLUMNA_AJENA = "99999999-9999-4999-8999-999999999999";

type Fila = Record<string, unknown>;
type ErrorDeLaBase = { message: string; code?: string } | null;
type Operacion = {
  tabla: string;
  op: string;
  valores?: unknown;
  filtros: Array<[string, unknown]>;
  nots: string[];
};

const sim = vi.hoisted(() => ({
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
  sesion: true,
  rol: "founder" as string | null,
  addOn: true,
  tablas: {} as Record<string, Fila[]>,
  // Error de supabase-js para una tabla, o para "tabla:op".
  errores: {} as Record<string, { message: string; code?: string } | null>,
  // Error para cualquier consulta.
  errorGlobal: null as { message: string; code?: string } | null,
  // Si está, `from()` lanza: como una excepción de la red o un bug.
  lanza: null as unknown,
  operaciones: [] as Array<{ tabla: string; op: string; filtros: Array<[string, unknown]> }>,
  propuestaCreada: true,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));
vi.mock("@/lib/auth/bootstrap", async () => {
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  const isMissingColumnError = (msg: string) => /column\s+.+\s+does not exist/i.test(msg);
  return {
    requireOrganizationId: async () => {
      if (!sim.sesion) throw new ErrorEsperable("Sesión no válida");
      return ORG;
    },
    getCurrentProfile: async () => (sim.rol ? { id: "perfil-1", role: sim.rol } : null),
    isMissingColumnError,
    isMissingTableError: (msg: string) =>
      !isMissingColumnError(msg) && msg.includes("does not exist"),
  };
});
vi.mock("@/lib/auth/add-ons", () => ({
  orgHasAddOn: async () => sim.addOn,
  requireAddOn: async () => {
    throw new Error("no se usa: las acciones de SCRUM-517 usan exigirAddOn");
  },
}));
vi.mock("@/lib/fathom/one-on-ones", () => ({
  loadClientOneOnOneStats: async () => ({ totalCalls: 3, daysSinceLast: 2 }),
  loadLastOneOnOneByClient: async () => ({}),
}));
vi.mock("@/app/clients/revenue-actions", () => ({ getRevenueByClientAction: async () => ({}) }));
vi.mock("@/app/clients/actions", () => ({ listClientsAction: async () => [] }));
vi.mock("@/app/clients/win-actions", () => ({
  listWinsAction: async () => [],
  listClientBaselinesAction: async () => ({}),
}));
// Como el real: usa el cliente admin y relanza el error de la base como
// `Error` común.
vi.mock("@/lib/checkpoints/create-proposal", () => ({
  createCheckpointProposal: async () => {
    if (sim.lanza) throw sim.lanza;
    if (sim.errorGlobal) throw new Error(sim.errorGlobal.message);
    return { created: sim.propuestaCreada };
  },
}));

/** Un supabase-js falso que aplica los filtros pedidos sobre `sim.tablas`. */
function crearSupabase() {
  let siguiente = 0;
  return {
    rpc() {
      return {
        range: async () =>
          sim.errorGlobal ? { data: null, error: sim.errorGlobal } : { data: [], error: null },
      };
    },
    from(tabla: string) {
      if (sim.lanza) throw sim.lanza;
      const op: Operacion = { tabla, op: "select", filtros: [], nots: [] };
      const valorDe = (fila: Fila, columna: string) => {
        const [col, clave] = columna.split("->>");
        const valor = fila[col as string];
        return clave ? (valor as Fila | null)?.[clave] : valor;
      };
      const coincide = (fila: Fila) =>
        op.filtros.every(([c, v]) => fila[c] === v) &&
        op.nots.every((c) => valorDe(fila, c) != null);
      const ejecutar = () => {
        sim.operaciones.push({ tabla, op: op.op, filtros: op.filtros });
        const error: ErrorDeLaBase =
          sim.errorGlobal ?? sim.errores[`${tabla}:${op.op}`] ?? sim.errores[tabla] ?? null;
        if (error) return { data: null, error, count: null };
        const filas = (sim.tablas[tabla] ??= []);
        if (op.op === "insert" || op.op === "upsert") {
          const nuevas = (Array.isArray(op.valores) ? op.valores : [op.valores]).map((v) => ({
            id: `nueva-${siguiente++}`,
            archived_at: null,
            created_at: "2026-10-01T00:00:00Z",
            updated_at: "2026-10-01T00:00:00Z",
            ...(v as Fila),
          }));
          filas.push(...nuevas);
          return { data: nuevas, error: null, count: nuevas.length };
        }
        const coincidentes = filas.filter(coincide);
        if (op.op === "update") coincidentes.forEach((f) => Object.assign(f, op.valores));
        if (op.op === "delete") sim.tablas[tabla] = filas.filter((f) => !coincide(f));
        return { data: coincidentes, error: null, count: coincidentes.length };
      };
      const builder = {
        select: () => builder,
        order: () => builder,
        range: () => builder,
        limit: () => builder,
        insert(valores: unknown) {
          op.op = "insert";
          op.valores = valores;
          return builder;
        },
        upsert(valores: unknown) {
          op.op = "upsert";
          op.valores = valores;
          return builder;
        },
        update(valores: unknown) {
          op.op = "update";
          op.valores = valores;
          return builder;
        },
        delete() {
          op.op = "delete";
          return builder;
        },
        eq(columna: string, valor: unknown) {
          op.filtros.push([columna, valor]);
          return builder;
        },
        not(columna: string) {
          op.nots.push(columna);
          return builder;
        },
        single: async () => {
          const { data, error } = ejecutar();
          if (error) return { data: null, error };
          if (!data?.[0]) {
            return {
              data: null,
              error: { code: "PGRST116", message: "Cannot coerce the result to a single JSON object" },
            };
          }
          return { data: data[0], error: null };
        },
        maybeSingle: async () => {
          const { data, error } = ejecutar();
          return { data: data?.[0] ?? null, error };
        },
        then(resolver: (r: unknown) => void, rechazar?: (e: unknown) => void) {
          try {
            resolver(ejecutar());
          } catch (e) {
            rechazar?.(e);
          }
        },
      };
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => crearSupabase() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => crearSupabase() }));

import {
  createCheckpointAction,
  createJourneyStageAction,
  deleteCheckpointAction,
  deleteJourneyStageAction,
  getJourneyPageDataAction,
  listCheckpointsAction,
  listJourneyStagesAction,
  reorderCheckpointsAction,
  reorderJourneyStagesAction,
  seedExampleJourneyAction,
  setCheckpointArchivedAction,
  setJourneyStageArchivedAction,
  updateCheckpointAction,
  updateJourneyStageAction,
} from "../checkpoint-actions";
import {
  createFieldDefinitionAction,
  deleteFieldDefinitionAction,
  getCustomFieldsPageDataAction,
  listFieldDefinitionsAction,
  reorderFieldDefinitionsAction,
  seedLimitlessClientFieldsAction,
  seedOnboardingQuestionsAction,
  setFieldDefinitionArchivedAction,
  updateFieldDefinitionAction,
} from "../custom-field-actions";
import {
  getWeeklyReviewAction,
  listClientTrackingAction,
  updateClientCurrentStatusAction,
  updateClientNotesAction,
  updateClientSatisfactionAction,
  updateClientTrackingAction,
} from "../tracking-actions";
import {
  getClientSignalsAction,
  getClientSilenceDaysAction,
  setClientSilenceDaysAction,
} from "../signals-actions";
import {
  acceptCheckpointProposalAction,
  createCheckpointProposalAction,
  getClientsJourneyStatusAction,
  listCheckpointProposalsAction,
  rejectCheckpointProposalAction,
} from "../checkpoint-derived-actions";
import {
  getClientJourneyAction,
  listCheckpointEventsAction,
  recordCheckpointAction,
  undoCheckpointAction,
} from "../checkpoint-event-actions";
import { getManualStagesAction, setClientManualStageAction } from "../stage-actions";
import { getClientOverviewAction } from "../overview-actions";
import { getClientsBoardAction } from "../clients-board-actions";
import {
  listClientFieldDefinitionsAction,
  updateClientCustomFieldsAction,
} from "../client-custom-fields-actions";

const FECHA = "2026-09-01T00:00:00Z";

function fase(id: string, org: string, nombre: string, orden = 0): Fila {
  return {
    id,
    organization_id: org,
    name: nombre,
    color: "neutral",
    sort_order: orden,
    archived_at: null,
    created_at: FECHA,
    updated_at: FECHA,
  };
}

function checkpoint(id: string, org: string, stageId: string, nombre: string): Fila {
  return {
    id,
    organization_id: org,
    stage_id: stageId,
    name: nombre,
    description: null,
    sort_order: 0,
    sets_client_status: null,
    expected_days: null,
    metric_schema: [],
    product_id: null,
    archived_at: null,
    created_at: FECHA,
    updated_at: FECHA,
  };
}

function columna(id: string, org: string, entity: string, key: string, label: string): Fila {
  return {
    id,
    organization_id: org,
    entity,
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
    section: null,
    onboarding: null,
    show_in_table: false,
    sort_order: 0,
    archived_at: null,
    created_at: FECHA,
    updated_at: FECHA,
  };
}

function cliente(id: string, org: string): Fila {
  return { id, organization_id: org, name: "Ana", custom: {}, manual_stage_id: null };
}

function propuesta(id: string, org: string, status = "pending"): Fila {
  return {
    id,
    organization_id: org,
    client_id: CLIENTE,
    checkpoint_id: CHECKPOINT,
    source: "fathom",
    source_ref: null,
    rationale: "Lo dijo en la llamada",
    suggested_reached_at: null,
    suggested_metrics: {},
    confidence: 0.9,
    status,
    resolved_by: null,
    resolved_at: null,
    created_at: FECHA,
    updated_at: FECHA,
  };
}

let consola: ReturnType<typeof vi.spyOn>;
let aviso: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.reportes = [];
  sim.sesion = true;
  sim.rol = "founder";
  sim.addOn = true;
  sim.errores = {};
  sim.errorGlobal = null;
  sim.lanza = null;
  sim.operaciones = [];
  sim.propuestaCreada = true;
  sim.tablas = {
    client_journey_stages: [fase(FASE, ORG, "Onboarding"), fase(FASE_AJENA, OTRA_ORG, "Ajena")],
    client_checkpoints: [checkpoint(CHECKPOINT, ORG, FASE, "Kickoff")],
    field_definitions: [
      columna(COLUMNA, ORG, "client", "objetivo", "Objetivo"),
      columna(COLUMNA_AJENA, OTRA_ORG, "client", "ajena", "Ajena"),
    ],
    client_checkpoint_events: [],
    clients: [cliente(CLIENTE, ORG), cliente(CLIENTE_AJENO, OTRA_ORG)],
    client_checkpoint_proposals: [propuesta(PROPUESTA, ORG), propuesta("prop-ajena", OTRA_ORG)],
    client_tasks: [],
    organizations: [{ id: ORG, client_silence_days: 20, timezone: null }],
  };
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  consola.mockRestore();
  aviso.mockRestore();
});

const escrituras = () =>
  sim.operaciones.filter((o) => o.op !== "select").map((o) => `${o.tabla}:${o.op}`);

/**
 * Cada acción del alcance, corrida con una entrada válida. Las fallas
 * inesperadas se prueban sobre todas: tienen que volver con el texto fijo y
 * quedar registradas con la etiqueta de la acción.
 */
const ACCIONES: Array<[string, () => Promise<{ success: boolean }>]> = [
  ["listJourneyStages", () => listJourneyStagesAction()],
  ["listCheckpoints", () => listCheckpointsAction()],
  ["getJourneyPageData", () => getJourneyPageDataAction()],
  ["createJourneyStage", () => createJourneyStageAction({ name: "Escala" })],
  ["updateJourneyStage", () => updateJourneyStageAction(FASE, { name: "Arranque" })],
  ["setJourneyStageArchived", () => setJourneyStageArchivedAction(FASE, true)],
  ["deleteJourneyStage", () => deleteJourneyStageAction(FASE)],
  ["reorderJourneyStages", () => reorderJourneyStagesAction([FASE])],
  ["createCheckpoint", () => createCheckpointAction({ stageId: FASE, name: "Primer cobro" })],
  ["updateCheckpoint", () => updateCheckpointAction(CHECKPOINT, { name: "Kickoff 2" })],
  ["setCheckpointArchived", () => setCheckpointArchivedAction(CHECKPOINT, true)],
  ["deleteCheckpoint", () => deleteCheckpointAction(CHECKPOINT)],
  ["reorderCheckpoints", () => reorderCheckpointsAction(FASE, [CHECKPOINT])],
  ["seedExampleJourney", () => seedExampleJourneyAction()],
  ["getCustomFieldsPageData", () => getCustomFieldsPageDataAction()],
  [
    "createFieldDefinition",
    () => createFieldDefinitionAction({ entity: "win", label: "Monto", fieldType: "number" }),
  ],
  ["updateFieldDefinition", () => updateFieldDefinitionAction({ id: COLUMNA, label: "Meta" })],
  ["setFieldDefinitionArchived", () => setFieldDefinitionArchivedAction(COLUMNA, true)],
  ["deleteFieldDefinition", () => deleteFieldDefinitionAction(COLUMNA)],
  ["reorderFieldDefinitions", () => reorderFieldDefinitionsAction("client", [COLUMNA])],
  ["seedLimitlessClientFields", () => seedLimitlessClientFieldsAction()],
  ["seedOnboardingQuestions", () => seedOnboardingQuestionsAction()],
  ["getWeeklyReview", () => getWeeklyReviewAction()],
  ["updateClientTracking", () => updateClientTrackingAction(CLIENTE, { goalText: "50k" })],
  [
    "updateClientCurrentStatus",
    () => updateClientCurrentStatusAction(CLIENTE, { note: "Trabado en el guion" }),
  ],
  ["updateClientNotes", () => updateClientNotesAction(CLIENTE, "Decide el socio")],
  ["updateClientSatisfaction", () => updateClientSatisfactionAction(CLIENTE, "conforme")],
  ["getClientSignals", () => getClientSignalsAction()],
  ["getClientSilenceDays", () => getClientSilenceDaysAction()],
  ["setClientSilenceDays", () => setClientSilenceDaysAction(10)],
  ["getClientsJourneyStatus", () => getClientsJourneyStatusAction()],
  ["listCheckpointProposals", () => listCheckpointProposalsAction(CLIENTE)],
  ["acceptCheckpointProposal", () => acceptCheckpointProposalAction(PROPUESTA)],
  ["rejectCheckpointProposal", () => rejectCheckpointProposalAction(PROPUESTA)],
  [
    "createCheckpointProposal",
    () =>
      createCheckpointProposalAction({ clientId: CLIENTE, checkpointId: CHECKPOINT, source: "fathom" }),
  ],
  ["listCheckpointEvents", () => listCheckpointEventsAction(CLIENTE)],
  ["getClientJourney", () => getClientJourneyAction(CLIENTE)],
  ["recordCheckpoint", () => recordCheckpointAction({ clientId: CLIENTE, checkpointId: CHECKPOINT })],
  ["undoCheckpoint", () => undoCheckpointAction(EVENTO, CLIENTE)],
  ["setClientManualStage", () => setClientManualStageAction({ clientId: CLIENTE, stageId: FASE })],
  ["getManualStages", () => getManualStagesAction()],
  ["getClientOverview", () => getClientOverviewAction(CLIENTE)],
  ["getClientsBoard", () => getClientsBoardAction()],
  ["listClientFieldDefinitions", () => listClientFieldDefinitionsAction()],
  [
    "updateClientCustomFields",
    () => updateClientCustomFieldsAction({ clientId: CLIENTE, values: { objetivo: "50k" } }),
  ],
];

/** Las acciones que crean algo nuevo sin leer antes (en el falso, no chocan). */
const SIN_DATOS_PREVIOS = new Set(["seedExampleJourney"]);

describe("todas las acciones del seguimiento", () => {
  it.each(ACCIONES)("%s: con la base andando devuelve éxito", async (nombre, correr) => {
    if (SIN_DATOS_PREVIOS.has(nombre)) sim.tablas.client_journey_stages = [];
    // Una fase con checkpoints no se borra (otro test).
    if (nombre === "deleteJourneyStage") sim.tablas.client_checkpoints = [];
    const r = await correr();
    expect(r).toMatchObject({ success: true });
    expect(sim.reportes).toEqual([]);
  });

  it.each(ACCIONES)("%s: sin sesión devuelve el motivo, sin registrar", async (_nombre, correr) => {
    sim.sesion = false;
    await expect(correr()).resolves.toEqual({ success: false, error: "Sesión no válida" });
    expect(sim.reportes).toEqual([]);
  });

  it.each(ACCIONES)(
    "%s: una excepción de la red vuelve con el texto fijo y queda registrada",
    async (nombre, correr) => {
      if (SIN_DATOS_PREVIOS.has(nombre)) sim.tablas.client_journey_stages = [];
      const falla = new TypeError("fetch failed");
      sim.lanza = falla;
      await expect(correr()).resolves.toEqual({ success: false, error: ERROR_INESPERADO });
      expect(sim.reportes.map((r) => r.error)).toContain(falla);
      expect(sim.reportes.map((r) => r.contexto)).toContainEqual({ accion: `[${nombre}]` });
      expect(consola).toHaveBeenCalled();
    }
  );

  it.each(ACCIONES)(
    "%s: el error de supabase-js vuelve con el texto fijo, nunca el mensaje crudo",
    async (nombre, correr) => {
      if (SIN_DATOS_PREVIOS.has(nombre)) sim.tablas.client_journey_stages = [];
      sim.errorGlobal = { message: "TypeError: fetch failed" };
      await expect(correr()).resolves.toEqual({ success: false, error: ERROR_INESPERADO });
      expect(sim.reportes.map((r) => r.contexto)).toContainEqual({ accion: `[${nombre}]` });
      expect(consola).toHaveBeenCalled();
    }
  );
});

describe("recorrido: fases y checkpoints", () => {
  it("⭐ las lecturas leen sólo la organización de la sesión", async () => {
    const r = await listJourneyStagesAction();
    expect(r.success && r.data.map((s) => s.id)).toEqual([FASE]);
  });

  it("⭐ la pantalla devuelve el recorrido armado y si puede editar", async () => {
    sim.rol = "member";
    const r = await getJourneyPageDataAction();
    expect(r.success && r.data.stages.map((s) => s.id)).toEqual([FASE]);
    expect(r.success && r.data.canManage).toBe(false);
  });

  it("⭐ sólo el founder configura: motivo exacto, sin registrar ni escribir", async () => {
    sim.rol = "member";
    await expect(createJourneyStageAction({ name: "Escala" })).resolves.toEqual({
      success: false,
      error: "Solo el founder puede configurar el recorrido",
    });
    expect(escrituras()).toEqual([]);
    expect(sim.reportes).toEqual([]);
  });

  it("validación: un nombre vacío vuelve con el mensaje de zod", async () => {
    await expect(createJourneyStageAction({ name: "" })).resolves.toEqual({
      success: false,
      error: "La fase necesita un nombre.",
    });
  });

  it("un nombre repetido vuelve con el motivo", async () => {
    await expect(createJourneyStageAction({ name: "onboarding" })).resolves.toEqual({
      success: false,
      error: 'Ya existe una fase que se llama "onboarding".',
    });
  });

  it("crea la fase en la organización de la sesión", async () => {
    await createJourneyStageAction({ name: "Escala" });
    expect(sim.tablas.client_journey_stages?.at(-1)).toMatchObject({
      organization_id: ORG,
      name: "Escala",
      sort_order: 1,
    });
  });

  it("⭐ editar una fase de otra organización: no se encontró, sin tocarla", async () => {
    await expect(updateJourneyStageAction(FASE_AJENA, { color: "cat-1" })).resolves.toEqual({
      success: false,
      error: "No se encontró la fase. Puede que la hayan borrado.",
    });
    expect(sim.tablas.client_journey_stages?.[1]).toMatchObject({ color: "neutral" });
    expect(sim.reportes).toEqual([]);
  });

  it("las escrituras filtran por organización", async () => {
    await setJourneyStageArchivedAction(FASE_AJENA, true);
    await reorderJourneyStagesAction([FASE_AJENA]);
    expect(sim.tablas.client_journey_stages?.[1]).toMatchObject({ archived_at: null, sort_order: 0 });
  });

  it("una fase con checkpoints no se borra", async () => {
    await expect(deleteJourneyStageAction(FASE)).resolves.toEqual({
      success: false,
      error: "La fase tiene checkpoints adentro. Movelos o borralos primero, o archivá la fase.",
    });
    expect(escrituras()).toEqual([]);
  });

  it("⭐ si los checkpoints no se pueden leer, la fase no se borra y es una falla", async () => {
    sim.errores.client_checkpoints = { message: "TypeError: fetch failed" };
    await expect(deleteJourneyStageAction(FASE)).resolves.toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
    expect(escrituras()).toEqual([]);
    expect(sim.reportes).toHaveLength(1);
  });

  it("⭐ si las fases no se pueden leer, no se dice 'la fase elegida no existe'", async () => {
    sim.errores.client_journey_stages = { message: "TypeError: fetch failed" };
    await expect(createCheckpointAction({ stageId: FASE, name: "Cobro" })).resolves.toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
    expect(escrituras()).toEqual([]);
  });

  it("una fase de otra org no existe para un checkpoint", async () => {
    await expect(createCheckpointAction({ stageId: FASE_AJENA, name: "Cobro" })).resolves.toEqual({
      success: false,
      error: "La fase elegida no existe",
    });
  });

  it("una métrica que no es una columna de checkpoint vuelve con el motivo", async () => {
    const r = await createCheckpointAction({
      stageId: FASE,
      name: "Cobro",
      metricSchema: [{ fieldKey: "facturacion", required: true }],
    });
    expect(r).toEqual({
      success: false,
      error:
        'La métrica "facturacion" no es una columna de checkpoint disponible. Creala en Campos personalizados.',
    });
  });

  it("un checkpoint de otra org: no se encontró", async () => {
    sim.tablas.client_checkpoints?.push(checkpoint("cp-ajeno", OTRA_ORG, FASE_AJENA, "Ajeno"));
    await expect(updateCheckpointAction("cp-ajeno", { name: "X" })).resolves.toEqual({
      success: false,
      error: "No se encontró el checkpoint. Puede que lo hayan borrado.",
    });
  });

  it("un checkpoint que algún cliente alcanzó no se borra", async () => {
    sim.tablas.client_checkpoint_events = [
      { id: EVENTO, organization_id: ORG, client_id: CLIENTE, checkpoint_id: CHECKPOINT },
    ];
    const r = await deleteCheckpointAction(CHECKPOINT);
    expect(r).toEqual({
      success: false,
      error:
        "Algún cliente ya alcanzó este checkpoint. Archivalo en vez de borrarlo: el registro viejo lo sigue mostrando.",
    });
  });

  it("⭐ si no se sabe si hay eventos, no se borra y no se inventa el motivo", async () => {
    sim.errores.client_checkpoint_events = { message: "permission denied for table" };
    await expect(deleteCheckpointAction(CHECKPOINT)).resolves.toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
    expect(escrituras()).toEqual([]);
  });

  it("antes de su migración, la tabla de eventos ausente cuenta como sin uso", async () => {
    sim.errores.client_checkpoint_events = {
      message: 'relation "client_checkpoint_events" does not exist',
    };
    await expect(deleteCheckpointAction(CHECKPOINT)).resolves.toEqual({
      success: true,
      data: undefined,
    });
  });

  it("el recorrido de ejemplo no pisa uno existente", async () => {
    await expect(seedExampleJourneyAction()).resolves.toEqual({
      success: false,
      error: "El recorrido ya tiene fases: agregá las que falten a mano.",
    });
  });

  it("el ejemplo pasa el motivo de crear la fase (sólo el founder)", async () => {
    sim.tablas.client_journey_stages = [];
    sim.rol = "member";
    await expect(seedExampleJourneyAction()).resolves.toEqual({
      success: false,
      error: "Solo el founder puede configurar el recorrido",
    });
    expect(sim.reportes).toEqual([]);
  });

  it("el ejemplo crea las tres fases", async () => {
    sim.tablas.client_journey_stages = [];
    await expect(seedExampleJourneyAction()).resolves.toEqual({ success: true, data: undefined });
    expect(sim.tablas.client_journey_stages?.map((s) => s.name)).toEqual([
      "Onboarding",
      "Primeros resultados",
      "Escala",
    ]);
  });
});

describe("columnas configurables", () => {
  it("sólo el founder configura", async () => {
    sim.rol = null;
    await expect(setFieldDefinitionArchivedAction(COLUMNA, true)).resolves.toEqual({
      success: false,
      error: "Solo el founder puede configurar las columnas",
    });
  });

  it("⭐ si las columnas no se pueden leer, crear una no sigue (antes podía repetir la clave)", async () => {
    sim.errores.field_definitions = { message: "TypeError: fetch failed" };
    const r = await createFieldDefinitionAction({
      entity: "client",
      label: "Objetivo",
      fieldType: "text",
    });
    expect(r).toEqual({ success: false, error: ERROR_INESPERADO });
    expect(escrituras()).toEqual([]);
  });

  it("una opción en un campo que no es de lista vuelve con el motivo", async () => {
    const r = await createFieldDefinitionAction({
      entity: "win",
      label: "Monto",
      fieldType: "number",
      options: [{ value: "a", label: "A" }],
    });
    expect(r).toEqual({ success: false, error: "Sólo los campos de lista llevan opciones" });
  });

  it("una columna de otra organización no existe", async () => {
    await expect(updateFieldDefinitionAction({ id: COLUMNA_AJENA, label: "X" })).resolves.toEqual({
      success: false,
      error: "La columna no existe",
    });
    expect(escrituras()).toEqual([]);
  });

  it("una columna con datos cargados no se borra", async () => {
    sim.tablas.clients = [{ ...cliente(CLIENTE, ORG), custom: { objetivo: "50k" } }];
    await expect(deleteFieldDefinitionAction(COLUMNA)).resolves.toEqual({
      success: false,
      error:
        '"Objetivo" ya tiene datos cargados. Archivala en vez de borrarla: los datos viejos la siguen mostrando.',
    });
  });

  it("⭐ si no se sabe si está en uso, no se borra y es una falla", async () => {
    sim.errores.clients = { message: "canceling statement due to statement timeout" };
    await expect(deleteFieldDefinitionAction(COLUMNA)).resolves.toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
    expect(escrituras()).toEqual([]);
  });

  it("⭐ sin el add-on, la plantilla vuelve con el motivo (antes era un Error común)", async () => {
    sim.addOn = false;
    for (const accion of [seedLimitlessClientFieldsAction, seedOnboardingQuestionsAction]) {
      await expect(accion()).resolves.toEqual({
        success: false,
        error: "Esta función no está habilitada para tu organización.",
      });
    }
    expect(sim.reportes).toEqual([]);
  });

  it("la plantilla saltea las que ya existen", async () => {
    sim.tablas.field_definitions = [columna(COLUMNA, ORG, "client", "avatar", "Avatar")];
    const r = await seedLimitlessClientFieldsAction();
    expect(r.success && r.data).toEqual({ created: 21, skipped: 1 });
  });

  it("⭐ la lectura con tipo fijo registra la falla en vez de esconderla", async () => {
    const falla = { message: "TypeError: fetch failed" };
    sim.errores.field_definitions = falla;
    await expect(listFieldDefinitionsAction("client")).resolves.toEqual([]);
    expect(sim.reportes).toEqual([
      { error: expect.objectContaining({ message: falla.message }), contexto: { lectura: "listFieldDefinitions" } },
    ]);
  });

  it("la lectura con tipo fijo, sin sesión, devuelve vacío sin registrar", async () => {
    sim.sesion = false;
    await expect(listFieldDefinitionsAction()).resolves.toEqual([]);
    expect(sim.reportes).toEqual([]);
  });

  it("la lectura con tipo fijo lee sólo la organización de la sesión", async () => {
    const r = await listFieldDefinitionsAction("client");
    expect(r.map((f) => f.key)).toEqual(["objetivo"]);
  });

  it("la pantalla devuelve las columnas y si puede editar", async () => {
    const r = await getCustomFieldsPageDataAction();
    expect(r.success && r.data.fields.map((f) => f.id)).toEqual([COLUMNA]);
    expect(r.success && r.data.canManage).toBe(true);
  });
});

describe("campos de un cliente", () => {
  it("⭐ si las columnas no se pueden leer, no dice 'guardados' (antes guardaba sin lo editado)", async () => {
    sim.errores.field_definitions = { message: "TypeError: fetch failed" };
    await expect(
      updateClientCustomFieldsAction({ clientId: CLIENTE, values: { objetivo: "50k" } })
    ).resolves.toEqual({ success: false, error: ERROR_INESPERADO });
    expect(escrituras()).toEqual([]);
  });

  it("un cliente de otra organización no existe", async () => {
    await expect(
      updateClientCustomFieldsAction({ clientId: CLIENTE_AJENO, values: {} })
    ).resolves.toEqual({ success: false, error: "El cliente no existe" });
  });

  it("guarda lo validado en el cliente de la organización", async () => {
    const r = await updateClientCustomFieldsAction({ clientId: CLIENTE, values: { objetivo: "50k" } });
    expect(r).toEqual({ success: true, data: { objetivo: "50k" } });
    expect(sim.tablas.clients?.[0]?.custom).toEqual({ objetivo: "50k" });
    expect(sim.tablas.clients?.[1]?.custom).toEqual({});
  });

  it("las columnas del cliente vuelven como valor", async () => {
    const r = await listClientFieldDefinitionsAction();
    expect(r.success && r.data.map((f) => f.key)).toEqual(["objetivo"]);
  });
});

describe("seguimiento y revisión semanal", () => {
  it("un nivel de satisfacción que no existe vuelve con el motivo", async () => {
    await expect(updateClientSatisfactionAction(CLIENTE, "feliz")).resolves.toEqual({
      success: false,
      error: "Ese nivel de satisfacción no existe.",
    });
  });

  it("una fecha de egreso inválida vuelve con el mensaje de zod", async () => {
    await expect(updateClientTrackingAction(CLIENTE, { exitDate: "ayer" })).resolves.toEqual({
      success: false,
      error: "La fecha de egreso no es válida.",
    });
  });

  it("⭐ las escrituras filtran por organización", async () => {
    await updateClientNotesAction(CLIENTE_AJENO, "pisada");
    await updateClientCurrentStatusAction(CLIENTE_AJENO, { note: "pisada" });
    expect(sim.tablas.clients?.[1]).not.toHaveProperty("notes");
    expect(sim.tablas.clients?.[1]).not.toHaveProperty("current_status_note");
    const r = await updateClientNotesAction(CLIENTE, "Decide el socio");
    expect(r.success).toBe(true);
    expect(sim.tablas.clients?.[0]).toMatchObject({ notes: "Decide el socio" });
  });

  it("⭐ la revisión no dice 'nadie pide atención' si el recorrido no se pudo leer", async () => {
    sim.errores.client_checkpoint_events = { message: "TypeError: fetch failed" };
    await expect(getWeeklyReviewAction()).resolves.toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
  });

  it("⭐ el seguimiento con tipo fijo registra la falla", async () => {
    sim.errores.clients = { message: "TypeError: fetch failed" };
    await expect(listClientTrackingAction()).resolves.toEqual({});
    expect(sim.reportes.map((r) => r.contexto)).toEqual([{ lectura: "listClientTracking" }]);
  });

  it("el seguimiento con tipo fijo, sin sesión, devuelve vacío sin registrar", async () => {
    sim.sesion = false;
    await expect(listClientTrackingAction()).resolves.toEqual({});
    expect(sim.reportes).toEqual([]);
  });
});

describe("señales", () => {
  it("el umbral de la organización vuelve como valor", async () => {
    await expect(getClientSilenceDaysAction()).resolves.toEqual({ success: true, data: 20 });
  });

  it("antes de la migración la columna ausente usa el valor por defecto", async () => {
    sim.errores.organizations = {
      message: "column organizations.client_silence_days does not exist",
    };
    await expect(getClientSilenceDaysAction()).resolves.toEqual({ success: true, data: 15 });
  });

  it("⭐ cualquier otro error del umbral es una falla, no 'el de siempre'", async () => {
    sim.errores.organizations = { message: "TypeError: fetch failed" };
    await expect(getClientSilenceDaysAction()).resolves.toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
  });

  it("sin el add-on, las señales vuelven vacías", async () => {
    sim.addOn = false;
    const r = await getClientSignalsAction();
    expect(r).toEqual({ success: true, data: { thresholdDays: 15, silence: {}, dateAlerts: {} } });
  });

  it("validación y permiso del umbral vuelven con su motivo", async () => {
    await expect(setClientSilenceDaysAction(0)).resolves.toEqual({
      success: false,
      error: "Tiene que ser al menos 1 día.",
    });
    sim.rol = "member";
    await expect(setClientSilenceDaysAction(10)).resolves.toEqual({
      success: false,
      error: "Solo el founder puede cambiar el aviso.",
    });
    sim.rol = "founder";
    sim.addOn = false;
    await expect(setClientSilenceDaysAction(10)).resolves.toEqual({
      success: false,
      error: "Esta función no está habilitada para tu organización.",
    });
    expect(sim.reportes).toEqual([]);
  });

  it("cambia el umbral sólo de la organización de la sesión", async () => {
    sim.tablas.organizations?.push({ id: OTRA_ORG, client_silence_days: 20 });
    await expect(setClientSilenceDaysAction(10)).resolves.toEqual({ success: true, data: 10 });
    expect(sim.tablas.organizations?.map((o) => o.client_silence_days)).toEqual([10, 20]);
  });
});

describe("propuestas y eventos", () => {
  it("las propuestas son sólo las de la organización", async () => {
    const r = await listCheckpointProposalsAction();
    expect(r.success && r.data.map((p) => p.id)).toEqual([PROPUESTA]);
  });

  it("una propuesta de otra organización no existe", async () => {
    await expect(acceptCheckpointProposalAction("prop-ajena")).resolves.toEqual({
      success: false,
      error: "La propuesta no existe",
    });
  });

  it("una propuesta resuelta no se vuelve a aceptar", async () => {
    sim.tablas.client_checkpoint_proposals = [propuesta(PROPUESTA, ORG, "accepted")];
    await expect(acceptCheckpointProposalAction(PROPUESTA)).resolves.toEqual({
      success: false,
      error: "Esa propuesta ya estaba resuelta",
    });
  });

  it("⭐ si el registro del hito falla, la propuesta queda pendiente y la falla se registra una vez", async () => {
    sim.errores["client_checkpoint_events:upsert"] = { message: "TypeError: fetch failed" };
    await expect(acceptCheckpointProposalAction(PROPUESTA)).resolves.toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
    expect(sim.tablas.client_checkpoint_proposals?.[0]).toMatchObject({ status: "pending" });
    expect(sim.reportes.map((r) => r.contexto)).toEqual([{ accion: "[recordCheckpoint]" }]);
  });

  it("aceptar registra el hito y resuelve la propuesta", async () => {
    await expect(acceptCheckpointProposalAction(PROPUESTA)).resolves.toEqual({
      success: true,
      data: undefined,
    });
    expect(sim.tablas.client_checkpoint_proposals?.[0]).toMatchObject({ status: "accepted" });
    expect(sim.tablas.client_checkpoint_events).toHaveLength(1);
  });

  it("rechazar sólo toca la propuesta de la organización", async () => {
    await rejectCheckpointProposalAction("prop-ajena");
    expect(sim.tablas.client_checkpoint_proposals?.[1]).toMatchObject({ status: "pending" });
  });

  it("crear una propuesta valida la entrada", async () => {
    const r = await createCheckpointProposalAction({
      clientId: "no-es-un-id",
      checkpointId: CHECKPOINT,
      source: "fathom",
    });
    expect(r.success).toBe(false);
    expect(sim.reportes).toEqual([]);
  });

  it("un checkpoint inexistente no se registra", async () => {
    await expect(
      recordCheckpointAction({ clientId: CLIENTE, checkpointId: FASE })
    ).resolves.toEqual({ success: false, error: "El checkpoint no existe" });
  });

  it("una fecha futura no se registra", async () => {
    await expect(
      recordCheckpointAction({
        clientId: CLIENTE,
        checkpointId: CHECKPOINT,
        reachedAt: "2999-01-01T12:00:00.000Z",
      })
    ).resolves.toEqual({
      success: false,
      error: "La fecha no puede ser futura: registrás algo que ya pasó.",
    });
  });

  it("⭐ si el recálculo de la fase falla, el registro vale, la falla se registra y no se pisa la fase", async () => {
    sim.tablas.clients = [{ ...cliente(CLIENTE, ORG), current_stage_id: FASE }];
    sim.errores["client_journey_stages:select"] = { message: "TypeError: fetch failed" };
    // El registro lee el checkpoint antes; las fases las lee sólo el recálculo.
    const r = await recordCheckpointAction({ clientId: CLIENTE, checkpointId: CHECKPOINT });
    expect(r.success).toBe(true);
    expect(sim.tablas.clients?.[0]).toMatchObject({ current_stage_id: FASE });
    expect(sim.reportes.map((x) => x.contexto)).toEqual([{ accion: "[recomputeCurrentStage]" }]);
  });

  it("deshacer borra sólo el evento de la organización", async () => {
    sim.tablas.client_checkpoint_events = [
      { id: EVENTO, organization_id: OTRA_ORG, client_id: CLIENTE, checkpoint_id: CHECKPOINT },
    ];
    await undoCheckpointAction(EVENTO, CLIENTE);
    expect(sim.tablas.client_checkpoint_events).toHaveLength(1);
  });

  it("el recorrido del cliente vuelve como valor", async () => {
    const r = await getClientJourneyAction(CLIENTE);
    expect(r.success && r.data.journeyConfigured).toBe(true);
    expect(r.success && r.data.progress.map((p) => p.checkpoint.id)).toEqual([CHECKPOINT]);
  });
});

describe("fase fijada, resumen y tablero", () => {
  it("⭐ una fase de otra organización no se fija", async () => {
    await expect(
      setClientManualStageAction({ clientId: CLIENTE, stageId: FASE_AJENA })
    ).resolves.toEqual({ success: false, error: "Esa fase no existe en tu recorrido." });
    expect(escrituras()).toEqual([]);
  });

  it("⭐ si la fase no se puede leer, es una falla y no 'esa fase no existe'", async () => {
    sim.errores.client_journey_stages = { message: "TypeError: fetch failed" };
    await expect(
      setClientManualStageAction({ clientId: CLIENTE, stageId: FASE })
    ).resolves.toEqual({ success: false, error: ERROR_INESPERADO });
  });

  it("las fases fijadas vuelven como valor, sólo de la organización", async () => {
    sim.tablas.clients = [
      { ...cliente(CLIENTE, ORG), manual_stage_id: FASE },
      { ...cliente(CLIENTE_AJENO, OTRA_ORG), manual_stage_id: FASE_AJENA },
    ];
    await expect(getManualStagesAction()).resolves.toEqual({
      success: true,
      data: { [CLIENTE]: FASE },
    });
  });

  it("⭐ el resumen de un cliente de otra organización: no se encontró", async () => {
    await expect(getClientOverviewAction(CLIENTE_AJENO)).resolves.toEqual({
      success: false,
      error: "No se encontró el cliente. Puede que lo hayan eliminado.",
    });
  });

  it("el resumen junta sesiones, tareas y recorrido", async () => {
    sim.tablas.client_tasks = [
      { organization_id: ORG, client_id: CLIENTE, status: "pending", owner: "coach" },
    ];
    const r = await getClientOverviewAction(CLIENTE);
    expect(r).toEqual({
      success: true,
      data: {
        oneOnOne: { total: 3, daysSinceLast: 2 },
        tasks: { pending: 1, coach: 1 },
        journey: { configured: true, reached: 0, total: 1, next: "Kickoff" },
      },
    });
  });

  it("⭐ si sólo el recorrido falla, el resumen sale igual y la falla queda registrada", async () => {
    sim.errores.client_checkpoints = { message: "TypeError: fetch failed" };
    const r = await getClientOverviewAction(CLIENTE);
    expect(r.success && r.data.journey.configured).toBe(false);
    expect(sim.reportes.map((x) => x.contexto)).toEqual([
      { lectura: "getClientOverview:recorrido" },
    ]);
  });

  it("⭐ el tablero no esconde una falla de las tareas (antes: 'sin próxima tarea')", async () => {
    sim.errores.client_tasks = { message: "TypeError: fetch failed" };
    await expect(getClientsBoardAction()).resolves.toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
  });

  it("el tablero junta las piezas de la organización", async () => {
    const r = await getClientsBoardAction();
    expect(r.success && r.data.checkpoints.map((c) => c.id)).toEqual([CHECKPOINT]);
    expect(r.success && r.data.clientFields.map((f) => f.key)).toEqual(["objetivo"]);
    expect(r.success && Object.keys(r.data.journey)).toEqual([CLIENTE]);
  });

  it("los estados del recorrido son de los clientes de la organización", async () => {
    const r = await getClientsJourneyStatusAction();
    expect(r.success && Object.keys(r.data)).toEqual([CLIENTE]);
  });

  it("los eventos de un cliente son los de la organización", async () => {
    sim.tablas.client_checkpoint_events = [
      { id: EVENTO, organization_id: OTRA_ORG, client_id: CLIENTE, checkpoint_id: CHECKPOINT, reached_at: FECHA },
    ];
    await expect(listCheckpointEventsAction(CLIENTE)).resolves.toEqual({ success: true, data: [] });
  });
});

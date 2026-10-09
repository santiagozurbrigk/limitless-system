import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-503: los vínculos de las tareas del Tablero (adjuntos, documentos y
 * SOP, `app/workboard/task-link-actions.ts`) devuelven sus errores esperables
 * como valor. Antes corrían con `runMutation`, que devolvía el mensaje de
 * cualquier excepción: un error de la base o de Storage llegaba crudo, en
 * inglés. `getWorkboardTaskByIdAction` lanzaba sin sesión y devolvía `null`
 * ante cualquier otra cosa.
 */

const ORG = "org-1";
const OTRA_ORG = "org-2";
const T1 = "11111111-1111-4111-8111-111111111111";
const T_OTRA_ORG = "22222222-2222-4222-8222-222222222222";
const A1 = "33333333-3333-4333-8333-333333333333";
const A_OTRA_ORG = "44444444-4444-4444-8444-444444444444";
const SOP1 = "55555555-5555-4555-8555-555555555555";
const DOC1 = "66666666-6666-4666-8666-666666666666";
const NO_EXISTE = "88888888-8888-4888-8888-888888888888";

type Consulta = {
  tabla: string;
  op: "select" | "insert" | "update" | "delete";
  valores?: unknown;
  filtros: Array<[string, unknown]>;
};

const sim = vi.hoisted(() => ({
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
  sesion: true,
  tablas: {} as Record<string, Array<Record<string, unknown>>>,
  errores: {} as Record<string, { message: string; code?: string }>,
  lanza: null as unknown,
  consultas: [] as Array<{
    tabla: string;
    op: "select" | "insert" | "update" | "delete";
    valores?: unknown;
    filtros: Array<[string, unknown]>;
  }>,
  // Base sin la columna workboard_tasks.sop_id: un select que embebe `sops(...)` falla.
  sinColumnaSop: false,
  storage: {
    error: null as null | Error,
    sinUrl: false,
    borradas: [] as string[][],
  },
}));

vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/bootstrap", async () => {
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (!sim.sesion) throw new ErrorEsperable("Sesión no válida");
      return "org-1";
    },
    isMissingTableError: (msg: string) => msg.includes("does not exist"),
    isMissingColumnError: (msg: string, col?: string) =>
      msg.includes("column") && (!col || msg.includes(col)),
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: async (ruta: string) =>
          sim.storage.error
            ? { data: null, error: sim.storage.error }
            : { data: sim.storage.sinUrl ? {} : { signedUrl: `https://subir/${ruta}` }, error: null },
        createSignedUrl: async (ruta: string) =>
          sim.storage.error
            ? { data: null, error: sim.storage.error }
            : { data: sim.storage.sinUrl ? {} : { signedUrl: `https://ver/${ruta}` }, error: null },
        remove: async (rutas: string[]) => {
          sim.storage.borradas.push(rutas);
          return { data: null, error: null };
        },
      }),
    },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from(tabla: string) {
      if (sim.lanza) throw sim.lanza;
      const consulta: Consulta & { columnas?: string } = { tabla, op: "select", filtros: [] };
      sim.consultas.push(consulta);
      const coincidentes = () =>
        (sim.tablas[tabla] ?? []).filter((f) => consulta.filtros.every(([c, v]) => f[c] === v));
      const resolver = (modo: "lista" | "una" | "quizas") => {
        const error =
          sim.errores[`${tabla}:${consulta.op}`] ??
          sim.errores[tabla] ??
          (sim.sinColumnaSop && tabla === "workboard_tasks" && consulta.columnas?.includes("sops(")
            ? { message: "column workboard_tasks.sop_id does not exist", code: "42703" }
            : null);
        if (error) return { data: null, error };
        let filas: Array<Record<string, unknown>>;
        if (consulta.op === "insert") {
          const fila = { id: "nuevo", ...(consulta.valores as object) };
          sim.tablas[tabla] = [...(sim.tablas[tabla] ?? []), fila];
          filas = [fila];
        } else if (consulta.op === "update") {
          filas = coincidentes();
          for (const f of filas) Object.assign(f, consulta.valores);
        } else if (consulta.op === "delete") {
          filas = coincidentes();
          sim.tablas[tabla] = (sim.tablas[tabla] ?? []).filter((f) => !filas.includes(f));
        } else {
          filas = coincidentes();
        }
        if (modo === "lista") return { data: filas, error: null };
        if (modo === "quizas") return { data: filas[0] ?? null, error: null };
        if (!filas[0]) {
          return { data: null, error: { code: "PGRST116", message: "Cannot coerce the result to a single JSON object" } };
        }
        return { data: filas[0], error: null };
      };
      const builder = {
        select(columnas?: string) {
          if (consulta.op === "select") consulta.columnas = columnas;
          return builder;
        },
        order: () => builder,
        not: () => builder,
        eq(columna: string, valor: unknown) {
          consulta.filtros.push([columna, valor]);
          return builder;
        },
        insert(valores: unknown) {
          consulta.op = "insert";
          consulta.valores = valores;
          return builder;
        },
        update(valores: unknown) {
          consulta.op = "update";
          consulta.valores = valores;
          return builder;
        },
        delete() {
          consulta.op = "delete";
          return builder;
        },
        single: async () => resolver("una"),
        maybeSingle: async () => resolver("quizas"),
        then(alResolver: (r: unknown) => unknown, alRechazar?: (e: unknown) => unknown) {
          return Promise.resolve(resolver("lista")).then(alResolver, alRechazar);
        },
      };
      return builder;
    },
  }),
}));

import {
  deleteTaskAttachmentAction,
  finalizeTaskAttachmentAction,
  getTaskAttachmentUrlAction,
  getWorkboardTaskByIdAction,
  linkTaskDocumentAction,
  listWorkboardLinkOptionsAction,
  prepareTaskAttachmentUploadAction,
  setTaskLinkedSopAction,
  unlinkTaskDocumentAction,
} from "../task-link-actions";

const TEXTO_FIJO = "Ocurrió un error inesperado. Intentá de nuevo.";
const TAREA_NO_ENCONTRADA = "No se encontró la tarea. Puede que la hayan eliminado.";

function tarea(id: string, organizationId: string): Record<string, unknown> {
  return {
    id,
    organization_id: organizationId,
    title: "Tarea",
    description: "",
    status: "todo",
    area: "general",
    priority: "medium",
    assignee_id: null,
    assignee_ids: [],
    due_date: null,
    tags: [],
    position: 0,
    created_by: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    sop_id: null,
  };
}

const ADJUNTO_OK = { taskId: T1, fileName: "plan.pdf", fileSize: 1000, mimeType: "application/pdf" };
const FINALIZAR_OK = {
  taskId: T1,
  storagePath: `${ORG}/${T1}/x-plan.pdf`,
  fileName: "plan.pdf",
  mimeType: "application/pdf",
  fileSize: 1000,
};

let consola: ReturnType<typeof vi.spyOn>;
let aviso: ReturnType<typeof vi.spyOn>;
afterEach(() => {
  consola.mockRestore();
  aviso.mockRestore();
});

beforeEach(() => {
  sim.reportes = [];
  sim.sesion = true;
  sim.tablas = {
    profiles: [],
    workboard_tasks: [tarea(T1, ORG), tarea(T_OTRA_ORG, OTRA_ORG)],
    workboard_task_attachments: [
      { id: A1, organization_id: ORG, task_id: T1, storage_path: `${ORG}/${T1}/a-plan.pdf`, file_name: "plan.pdf", mime_type: "application/pdf", created_at: "2026-10-01" },
      { id: A_OTRA_ORG, organization_id: OTRA_ORG, task_id: T_OTRA_ORG, storage_path: `${OTRA_ORG}/${T_OTRA_ORG}/b.pdf`, file_name: "b.pdf", mime_type: "application/pdf", created_at: "2026-10-01" },
    ],
    workboard_task_documents: [],
    sops: [{ id: SOP1, organization_id: ORG, title: "SOP", department: "ops" }],
    business_context_documents: [{ id: DOC1, organization_id: ORG, title: "Doc", category: "x" }],
  };
  sim.errores = {};
  sim.lanza = null;
  sim.consultas = [];
  sim.storage = { error: null, sinUrl: false, borradas: [] };
  sim.sinColumnaSop = false;
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
});

const escrituras = () => sim.consultas.filter((c) => c.op !== "select");

describe("prepareTaskAttachmentUploadAction", () => {
  it("firma la subida en la carpeta de la organización", async () => {
    const r = await prepareTaskAttachmentUploadAction(ADJUNTO_OK);
    expect(r.success).toBe(true);
    expect(r.success && r.data.storagePath.startsWith(`${ORG}/${T1}/`)).toBe(true);
  });

  it("⭐ un formato no permitido vuelve con el motivo", async () => {
    const r = await prepareTaskAttachmentUploadAction({ ...ADJUNTO_OK, fileName: "x.exe", mimeType: "application/x-msdownload" });
    expect(r).toEqual({ success: false, error: "Formato no permitido para adjuntos de tarea." });
    expect(sim.reportes).toEqual([]);
  });

  it("una tarea de otra organización vuelve como no encontrada", async () => {
    await expect(prepareTaskAttachmentUploadAction({ ...ADJUNTO_OK, taskId: T_OTRA_ORG })).resolves.toEqual({
      success: false,
      error: TAREA_NO_ENCONTRADA,
    });
  });

  it("⭐ un error de Storage no llega crudo: texto fijo y se reporta", async () => {
    sim.storage.error = new Error("Bucket not found");
    await expect(prepareTaskAttachmentUploadAction(ADJUNTO_OK)).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(sim.reportes).toHaveLength(1);
  });

  it("un id inválido vuelve con el mensaje de validación", async () => {
    await expect(prepareTaskAttachmentUploadAction({ ...ADJUNTO_OK, taskId: "x" })).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
  });
});

describe("finalizeTaskAttachmentAction", () => {
  it("guarda el adjunto en la organización y devuelve la tarea", async () => {
    const r = await finalizeTaskAttachmentAction(FINALIZAR_OK);
    expect(r.success && r.data.id).toBe(T1);
    const alta = escrituras().find((c) => c.op === "insert");
    expect(alta?.valores).toMatchObject({ organization_id: ORG, task_id: T1 });
  });

  it("⭐ si falta la tabla vuelve con el mensaje que lo explica", async () => {
    sim.errores["workboard_task_attachments:insert"] = { message: 'relation "workboard_task_attachments" does not exist' };
    await expect(finalizeTaskAttachmentAction(FINALIZAR_OK)).resolves.toEqual({
      success: false,
      error: "Falta la tabla workboard_task_attachments. Aplicá la migración 20260714100000_workboard_task_links.sql.",
    });
  });

  it("una ruta de otra organización no se guarda: texto fijo y se reporta como manipulación", async () => {
    const r = await finalizeTaskAttachmentAction({ ...FINALIZAR_OK, storagePath: `${OTRA_ORG}/x/y.pdf` });
    expect(r).toEqual({ success: false, error: TEXTO_FIJO });
    expect(escrituras()).toEqual([]);
    expect(sim.reportes).toHaveLength(1);
  });
});

describe("deleteTaskAttachmentAction", () => {
  it("borra el adjunto de la organización, de Storage y de la base", async () => {
    const r = await deleteTaskAttachmentAction(A1);
    expect(r.success && r.data.id).toBe(T1);
    expect(sim.storage.borradas).toEqual([[`${ORG}/${T1}/a-plan.pdf`]]);
    expect(escrituras()[0].filtros).toEqual([
      ["id", A1],
      ["organization_id", ORG],
    ]);
  });

  it("⭐ un adjunto de otra organización vuelve como no encontrado, sin borrar", async () => {
    await expect(deleteTaskAttachmentAction(A_OTRA_ORG)).resolves.toEqual({
      success: false,
      error: "Adjunto no encontrado",
    });
    expect(sim.storage.borradas).toEqual([]);
    expect(escrituras()).toEqual([]);
  });
});

describe("getTaskAttachmentUrlAction", () => {
  it("firma la URL del adjunto de la organización", async () => {
    const r = await getTaskAttachmentUrlAction(A1);
    expect(r.success && r.data.url).toBe(`https://ver/${ORG}/${T1}/a-plan.pdf`);
  });

  it("⭐ un adjunto de otra organización vuelve como no encontrado", async () => {
    await expect(getTaskAttachmentUrlAction(A_OTRA_ORG)).resolves.toEqual({
      success: false,
      error: "Adjunto no encontrado",
    });
  });

  it("si Storage no devuelve la URL, texto fijo y se reporta", async () => {
    sim.storage.sinUrl = true;
    await expect(getTaskAttachmentUrlAction(A1)).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    expect(sim.reportes).toHaveLength(1);
  });
});

describe("setTaskLinkedSopAction", () => {
  it("vincula el SOP filtrando por la organización", async () => {
    const r = await setTaskLinkedSopAction({ taskId: T1, sopId: SOP1 });
    expect(r.success).toBe(true);
    expect(escrituras()[0].filtros).toEqual([
      ["id", T1],
      ["organization_id", ORG],
    ]);
  });

  it("⭐ un SOP que no es de la organización vuelve con el motivo", async () => {
    await expect(setTaskLinkedSopAction({ taskId: T1, sopId: NO_EXISTE })).resolves.toEqual({
      success: false,
      error: "SOP no encontrado",
    });
    expect(escrituras()).toEqual([]);
  });

  it("si falta la columna vuelve con el mensaje que lo explica", async () => {
    sim.errores["workboard_tasks:update"] = { message: 'column "sop_id" of relation "workboard_tasks" does not exist' };
    await expect(setTaskLinkedSopAction({ taskId: T1, sopId: null })).resolves.toEqual({
      success: false,
      error: "Falta la columna workboard_tasks.sop_id. Aplicá la migración 20260714100000_workboard_task_links.sql.",
    });
  });

  it("una tarea de otra organización vuelve como no encontrada al releerla", async () => {
    await expect(setTaskLinkedSopAction({ taskId: T_OTRA_ORG, sopId: null })).resolves.toEqual({
      success: false,
      error: TAREA_NO_ENCONTRADA,
    });
    expect(sim.tablas.workboard_tasks.find((f) => f.id === T_OTRA_ORG)?.updated_at).toBe("2026-10-01T00:00:00Z");
  });
});

describe("linkTaskDocumentAction y unlinkTaskDocumentAction", () => {
  it("vincula y desvincula el documento en la organización", async () => {
    const r = await linkTaskDocumentAction({ taskId: T1, documentId: DOC1 });
    expect(r.success).toBe(true);
    expect(escrituras()[0].valores).toMatchObject({ organization_id: ORG });
    const r2 = await unlinkTaskDocumentAction({ taskId: T1, documentId: DOC1 });
    expect(r2.success).toBe(true);
    expect(escrituras()[1].filtros).toContainEqual(["organization_id", ORG]);
  });

  it("⭐ un documento que no es de la organización vuelve con el motivo", async () => {
    await expect(linkTaskDocumentAction({ taskId: T1, documentId: NO_EXISTE })).resolves.toEqual({
      success: false,
      error: "Documento no encontrado",
    });
  });

  it("una tarea de otra organización vuelve como no encontrada", async () => {
    await expect(linkTaskDocumentAction({ taskId: T_OTRA_ORG, documentId: DOC1 })).resolves.toEqual({
      success: false,
      error: TAREA_NO_ENCONTRADA,
    });
  });

  it("un vínculo repetido no es un error", async () => {
    sim.errores["workboard_task_documents:insert"] = { message: "duplicate key", code: "23505" };
    const r = await linkTaskDocumentAction({ taskId: T1, documentId: DOC1 });
    expect(r.success).toBe(true);
  });

  it("unlink con datos inválidos vuelve con el mensaje de validación", async () => {
    await expect(unlinkTaskDocumentAction({ taskId: T1, documentId: "x" })).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
  });
});

describe("listWorkboardLinkOptionsAction", () => {
  it("devuelve los SOPs y documentos de la organización", async () => {
    await expect(listWorkboardLinkOptionsAction()).resolves.toEqual({
      success: true,
      data: {
        sops: [{ id: SOP1, title: "SOP", subtitle: "ops" }],
        documents: [{ id: DOC1, title: "Doc", subtitle: "x" }],
      },
    });
  });

  it("una tabla que falta se lee como vacía", async () => {
    sim.errores.sops = { message: 'relation "sops" does not exist' };
    const r = await listWorkboardLinkOptionsAction();
    expect(r.success && r.data.sops).toEqual([]);
  });
});

describe("getWorkboardTaskByIdAction", () => {
  it("devuelve la tarea de la organización", async () => {
    const r = await getWorkboardTaskByIdAction(T1);
    expect(r.success && r.data.id).toBe(T1);
  });

  it("⭐ una tarea de otra organización vuelve como no encontrada", async () => {
    await expect(getWorkboardTaskByIdAction(T_OTRA_ORG)).resolves.toEqual({
      success: false,
      error: TAREA_NO_ENCONTRADA,
    });
    expect(sim.reportes).toEqual([]);
  });

  it("⭐ sin la columna sop_id (migración sin aplicar) relee la tarea sin el SOP, sin reportar", async () => {
    sim.sinColumnaSop = true;
    const r = await getWorkboardTaskByIdAction(T1);
    expect(r.success && r.data.id).toBe(T1);
    expect(sim.reportes).toEqual([]);
    const relecturas = sim.consultas.filter(
      (c) => c.tabla === "workboard_tasks" && c.filtros.some(([col, v]) => col === "id" && v === T1)
    );
    expect(relecturas).toHaveLength(2);
  });

  it("un id inválido vuelve con el mensaje de validación", async () => {
    await expect(getWorkboardTaskByIdAction("x")).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
  });
});

const ACCIONES: ReadonlyArray<readonly [string, () => Promise<{ success: boolean }>, string, string]> = [
  ["prepareTaskAttachmentUploadAction", () => prepareTaskAttachmentUploadAction(ADJUNTO_OK), "[prepareTaskAttachmentUpload]", "workboard_tasks"],
  ["finalizeTaskAttachmentAction", () => finalizeTaskAttachmentAction(FINALIZAR_OK), "[finalizeTaskAttachment]", "workboard_task_attachments:insert"],
  ["deleteTaskAttachmentAction", () => deleteTaskAttachmentAction(A1), "[deleteTaskAttachment]", "workboard_task_attachments:delete"],
  ["getTaskAttachmentUrlAction", () => getTaskAttachmentUrlAction(A1), "[getTaskAttachmentUrl]", "workboard_task_attachments"],
  ["setTaskLinkedSopAction", () => setTaskLinkedSopAction({ taskId: T1, sopId: SOP1 }), "[setTaskLinkedSop]", "workboard_tasks:update"],
  ["linkTaskDocumentAction", () => linkTaskDocumentAction({ taskId: T1, documentId: DOC1 }), "[linkTaskDocument]", "workboard_task_documents:insert"],
  ["unlinkTaskDocumentAction", () => unlinkTaskDocumentAction({ taskId: T1, documentId: DOC1 }), "[unlinkTaskDocument]", "workboard_task_documents:delete"],
  ["listWorkboardLinkOptionsAction", () => listWorkboardLinkOptionsAction(), "[listWorkboardLinkOptions]", "sops"],
  ["getWorkboardTaskByIdAction", () => getWorkboardTaskByIdAction(T1), "[getWorkboardTaskById]", "workboard_tasks"],
];

describe("lo esperable y lo inesperado (SCRUM-503)", () => {
  it.each(ACCIONES)("%s sin sesión devuelve el motivo, sin escribir ni reportar", async (_n, correr) => {
    sim.sesion = false;
    await expect(correr()).resolves.toEqual({ success: false, error: "Sesión no válida" });
    expect(escrituras()).toEqual([]);
    expect(sim.reportes).toEqual([]);
  });

  it.each(ACCIONES)(
    "⭐ %s: una excepción de la red devuelve el texto fijo y se registra y reporta",
    async (_n, correr, etiqueta) => {
      const falla = new TypeError("fetch failed");
      sim.lanza = falla;
      await expect(correr()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
      expect(consola).toHaveBeenCalledWith(etiqueta, falla);
      expect(sim.reportes).toEqual([{ error: falla, contexto: { accion: etiqueta } }]);
    }
  );

  it.each(ACCIONES)(
    "⭐ %s: el error de la red que supabase-js devuelve como valor tampoco llega crudo",
    async (_n, correr, etiqueta, tabla) => {
      sim.errores[tabla] = { message: "TypeError: fetch failed" };
      const r = await correr();
      expect(r).toEqual({ success: false, error: TEXTO_FIJO });
      expect(consola).toHaveBeenCalledWith(
        etiqueta,
        expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" })
      );
      expect(sim.reportes).toEqual([
        { error: expect.objectContaining({ message: "TypeError: fetch failed" }), contexto: { accion: etiqueta } },
      ]);
    }
  );
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-497: las mutaciones de Clientes devuelven sus errores esperables como
 * valor (`MutationResult`). En producción Next no le manda al cliente el
 * mensaje de un error lanzado por una server action: quien no podía borrar un
 * cliente veía un párrafo técnico en inglés en vez del motivo.
 */

const ID = "11111111-1111-4111-8111-111111111111";
const ID_OTRA_ORG = "22222222-2222-4222-8222-222222222222";

type Fila = Record<string, unknown> & { id: string; organization_id: string };
type Escritura = { op: string; valores?: unknown; filtros: Array<[string, unknown]> };

const sim = vi.hoisted(() => ({
  configurado: true,
  sesion: true,
  permiso: true as boolean | "error",
  filas: [] as Fila[],
  errorEscritura: null as { message: string; code?: string } | null,
  escrituras: [] as Escritura[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => sim.configurado }));
vi.mock("@/lib/auth/bootstrap", () => ({
  requireOrganizationId: async () => {
    if (!sim.sesion) throw new Error("Sesión no válida");
    return "org-1";
  },
  isMissingTableError: (msg: string) => msg.includes("does not exist"),
}));
vi.mock("@/lib/utm/attribute-booking", () => ({ attributeSaleToUTM: async () => undefined }));
vi.mock("@/lib/marketing/lead-magnets-internal", () => ({
  attributeLeadMagnetToClient: async () => undefined,
}));
vi.mock("@/lib/conversations/repair-links", () => ({
  repairClosingConversationLinks: async () => undefined,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    // `requireOrgRole` pregunta el rol con esta RPC.
    rpc: async (nombre: string) => {
      expect(nombre).toBe("current_user_has_org_role");
      return sim.permiso === "error"
        ? { data: null, error: { message: "falló" } }
        : { data: sim.permiso, error: null };
    },
    from(tabla: string) {
      expect(tabla).toBe("clients");
      // Aplica los `.eq` pedidos: si una acción deja de filtrar por
      // organización, toca la fila de otra org y el test lo ve.
      const escritura: Escritura = { op: "", filtros: [] };
      const coincidentes = () =>
        sim.filas.filter((f) => escritura.filtros.every(([c, v]) => f[c] === v));
      const builder = {
        insert(valores: unknown) {
          escritura.op = "insert";
          escritura.valores = valores;
          sim.escrituras.push(escritura);
          return builder;
        },
        update(valores: unknown) {
          escritura.op = "update";
          escritura.valores = valores;
          sim.escrituras.push(escritura);
          return builder;
        },
        delete() {
          escritura.op = "delete";
          sim.escrituras.push(escritura);
          return builder;
        },
        eq(columna: string, valor: unknown) {
          escritura.filtros.push([columna, valor]);
          return builder;
        },
        select: () => builder,
        single: async () => {
          if (sim.errorEscritura) return { data: null, error: sim.errorEscritura };
          if (escritura.op === "insert") {
            return { data: { id: ID, ...(escritura.valores as object) }, error: null };
          }
          const fila = coincidentes()[0];
          if (!fila) {
            return {
              data: null,
              error: { code: "PGRST116", message: "Cannot coerce the result to a single JSON object" },
            };
          }
          return { data: { ...fila, ...(escritura.valores as object) }, error: null };
        },
        then(resolver: (r: unknown) => void) {
          resolver({ error: sim.errorEscritura });
        },
      };
      return builder;
    },
  }),
}));

import {
  assignClientPlanAction,
  createClientAction,
  deleteClientAction,
  importClientsAction,
  updateClientAction,
} from "../actions";

const NUEVO = {
  name: "Ana Pérez",
  email: null,
  joinDate: "2026-10-05",
  totalAmount: 1500,
  status: "active",
  paymentType: "upfront",
  platform: "bank_transfer",
  isSuccessCase: false,
  aiInsights: [],
  linkedCalls: [],
};

function filaCliente(id: string, organizationId: string): Fila {
  return {
    id,
    organization_id: organizationId,
    name: "Ana Pérez",
    nickname: null,
    email: null,
    join_date: "2026-10-05",
    payment_type: "upfront",
    platform: "bank_transfer",
    total_amount: 1500,
    upfront_amount: null,
    fee_amount: null,
    fee_frequency: null,
    status: "active",
    is_success_case: false,
    installments: null,
    sales_fathom_url: null,
    closing_call_id: null,
    ai_insights: null,
    linked_calls: null,
    offered_product: null,
    plan_id: null,
    selected_installment_system_id: null,
  };
}

beforeEach(() => {
  sim.configurado = true;
  sim.sesion = true;
  sim.permiso = true;
  sim.filas = [filaCliente(ID, "org-1"), filaCliente(ID_OTRA_ORG, "org-2")];
  sim.errorEscritura = null;
  sim.escrituras = [];
});

const ops = () => sim.escrituras.map((e) => e.op);

describe("createClientAction", () => {
  it("crea el cliente en la organización de la sesión y devuelve éxito", async () => {
    const r = await createClientAction(NUEVO);
    expect(r.success).toBe(true);
    expect(r.success && r.data.name).toBe("Ana Pérez");
    expect(ops()).toEqual(["insert"]);
    expect(sim.escrituras[0].valores).toMatchObject({ organization_id: "org-1" });
  });

  it("⭐ un dato inválido vuelve con el mensaje de validación, sin escribir", async () => {
    await expect(createClientAction({ ...NUEVO, name: "" })).resolves.toEqual({
      success: false,
      error: "Campo requerido",
    });
    expect(ops()).toEqual([]);
  });

  it("sin sesión devuelve el motivo", async () => {
    sim.sesion = false;
    await expect(createClientAction(NUEVO)).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });

  it("sin Supabase configurado devuelve el motivo", async () => {
    sim.configurado = false;
    await expect(createClientAction(NUEVO)).resolves.toEqual({
      success: false,
      error: "Supabase no configurado",
    });
  });

  it("si falta la tabla devuelve el mensaje que lo explica", async () => {
    sim.errorEscritura = { message: 'relation "clients" does not exist' };
    await expect(createClientAction(NUEVO)).resolves.toEqual({
      success: false,
      error: "Falta la tabla clients en Supabase. Aplicá las migraciones de supabase/migrations.",
    });
  });
});

describe("importClientsAction", () => {
  it("importa las filas válidas en la organización de la sesión", async () => {
    await expect(importClientsAction([NUEVO, NUEVO])).resolves.toEqual({
      success: true,
      data: { insertedCount: 2, errors: [] },
    });
    expect(ops()).toEqual(["insert"]);
    const valores = sim.escrituras[0].valores as Array<{ organization_id: string }>;
    expect(valores.map((v) => v.organization_id)).toEqual(["org-1", "org-1"]);
  });

  it("los errores por fila siguen viniendo en el dato, sin escribir", async () => {
    await expect(importClientsAction([NUEVO, { ...NUEVO, name: "" }])).resolves.toEqual({
      success: true,
      data: { insertedCount: 0, errors: [{ row: 3, message: "Campo requerido" }] },
    });
    expect(ops()).toEqual([]);
  });

  it("⭐ un rechazo de la base vuelve con su mensaje", async () => {
    sim.errorEscritura = { message: "duplicate key value violates unique constraint" };
    await expect(importClientsAction([NUEVO])).resolves.toEqual({
      success: false,
      error: "duplicate key value violates unique constraint",
    });
  });

  it("sin Supabase configurado devuelve el motivo", async () => {
    sim.configurado = false;
    await expect(importClientsAction([NUEVO])).resolves.toEqual({
      success: false,
      error: "Supabase no configurado",
    });
  });
});

describe("deleteClientAction", () => {
  it("borra filtrando por el id y por la organización de la sesión", async () => {
    await expect(deleteClientAction(ID)).resolves.toEqual({ success: true, data: undefined });
    expect(sim.escrituras).toEqual([
      {
        op: "delete",
        filtros: [
          ["id", ID],
          ["organization_id", "org-1"],
        ],
      },
    ]);
  });

  it("⭐ sin el rol que puede borrar vuelve con el motivo, sin borrar", async () => {
    sim.permiso = false;
    await expect(deleteClientAction(ID)).resolves.toEqual({
      success: false,
      error: "Sólo el founder o un admin pueden eliminar clientes.",
    });
    expect(ops()).toEqual([]);
  });

  it("si no se puede verificar el permiso, no borra y lo dice", async () => {
    sim.permiso = "error";
    await expect(deleteClientAction(ID)).resolves.toEqual({
      success: false,
      error: "No se pudo verificar el permiso.",
    });
    expect(ops()).toEqual([]);
  });

  it("un id inválido vuelve con el mensaje de validación", async () => {
    await expect(deleteClientAction("no-es-un-id")).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
    expect(ops()).toEqual([]);
  });
});

describe("updateClientAction", () => {
  it("actualiza filtrando por el id y por la organización, y devuelve el cliente", async () => {
    const r = await updateClientAction(ID, { status: "success_case" });
    expect(r.success).toBe(true);
    expect(r.success && r.data.status).toBe("success_case");
    expect(sim.escrituras[0].filtros).toEqual([
      ["id", ID],
      ["organization_id", "org-1"],
    ]);
  });

  it("⭐ un cliente de otra organización vuelve como no encontrado", async () => {
    await expect(updateClientAction(ID_OTRA_ORG, { status: "success_case" })).resolves.toEqual({
      success: false,
      error: "No se encontró el cliente. Puede que lo hayan eliminado.",
    });
    expect(sim.filas.find((f) => f.id === ID_OTRA_ORG)?.status).toBe("active");
  });

  it("un cambio inválido vuelve con el mensaje de validación, sin escribir", async () => {
    await expect(updateClientAction(ID, { name: "" })).resolves.toEqual({
      success: false,
      error: "Campo requerido",
    });
    expect(ops()).toEqual([]);
  });

  it("sin Supabase configurado devuelve el motivo", async () => {
    sim.configurado = false;
    await expect(updateClientAction(ID, { status: "success_case" })).resolves.toEqual({
      success: false,
      error: "Supabase no configurado",
    });
  });
});

describe("assignClientPlanAction", () => {
  it("asigna el plan con la misma escritura filtrada por organización", async () => {
    const PLAN = "33333333-3333-4333-8333-333333333333";
    const r = await assignClientPlanAction(ID, PLAN);
    expect(r.success).toBe(true);
    expect(sim.escrituras[0].valores).toMatchObject({ plan_id: PLAN });
    expect(sim.escrituras[0].filtros).toContainEqual(["organization_id", "org-1"]);
  });

  it("⭐ un plan con id inválido vuelve con el mensaje de validación", async () => {
    await expect(assignClientPlanAction(ID, "no-es-un-id")).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
    expect(ops()).toEqual([]);
  });
});

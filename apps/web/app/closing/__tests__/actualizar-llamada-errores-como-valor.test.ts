import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-497: `updateClosingCallAction` devuelve sus errores esperables como
 * valor (`MutationResult`). En producción Next no le manda al cliente el
 * mensaje de un error lanzado por una server action.
 */

const ID = "11111111-1111-4111-8111-111111111111";
const ID_OTRA_ORG = "22222222-2222-4222-8222-222222222222";

type Fila = { id: string; organization_id: string; status: string };

const sim = vi.hoisted(() => ({
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
  configurado: true,
  sesion: true,
  filas: [] as Fila[],
  error: null as { message: string; code?: string } | null,
  lanza: null as unknown,
  updates: [] as Array<{ valores: unknown; filtros: Array<[string, unknown]> }>,
}));

vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => sim.configurado }));
// Como el real: la sesión que falta es un rechazo esperable.
vi.mock("@/lib/auth/bootstrap", async () => {
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (!sim.sesion) throw new ErrorEsperable("Sesión no válida");
      return "org-1";
    },
    tryRequireOrganizationId: async () => "org-1",
    isMissingTableError: (msg: string) => msg.includes("does not exist"),
  };
});
vi.mock("@/lib/conversations/repair-links", () => ({
  repairClosingConversationLinks: async () => undefined,
}));
vi.mock("@/lib/ghl/integration", () => ({ getGHLIntegrationForOrg: async () => null }));
vi.mock("@/lib/closing/mapper", () => ({
  rowToClosingCall: (row: Fila) => ({ id: row.id, status: row.status }),
  patchToClosingUpdateRow: (patch: { status?: string }) => ({ status: patch.status }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(tabla: string) {
      if (sim.lanza) throw sim.lanza;
      expect(tabla).toBe("closing_calls");
      // Aplica los `.eq` pedidos: si la acción deja de filtrar por
      // organización, actualiza la llamada de otra org y el test lo ve.
      const update = { valores: undefined as unknown, filtros: [] as Array<[string, unknown]> };
      const builder = {
        update(valores: unknown) {
          update.valores = valores;
          sim.updates.push(update);
          return builder;
        },
        eq(columna: string, valor: unknown) {
          update.filtros.push([columna, valor]);
          return builder;
        },
        select: () => builder,
        single: async () => {
          if (sim.error) return { data: null, error: sim.error };
          const fila = sim.filas.find((f) =>
            update.filtros.every(([c, v]) => (f as Record<string, unknown>)[c] === v)
          );
          if (!fila) {
            return {
              data: null,
              error: { code: "PGRST116", message: "Cannot coerce the result to a single JSON object" },
            };
          }
          Object.assign(fila, update.valores);
          return { data: fila, error: null };
        },
      };
      return builder;
    },
  }),
}));

import { updateClosingCallAction } from "../actions";

const TEXTO_FIJO = "Ocurrió un error inesperado. Intentá de nuevo.";

let consola: ReturnType<typeof vi.spyOn>;
afterEach(() => consola.mockRestore());

beforeEach(() => {
  sim.lanza = null;
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  sim.reportes = [];
  sim.configurado = true;
  sim.sesion = true;
  sim.filas = [
    { id: ID, organization_id: "org-1", status: "scheduled" },
    { id: ID_OTRA_ORG, organization_id: "org-2", status: "scheduled" },
  ];
  sim.error = null;
  sim.updates = [];
});

describe("updateClosingCallAction", () => {
  it("actualiza filtrando por el id y por la organización, y devuelve la llamada", async () => {
    await expect(updateClosingCallAction(ID, { status: "attended" })).resolves.toEqual({
      success: true,
      data: { id: ID, status: "attended" },
    });
    expect(sim.updates).toEqual([
      {
        valores: { status: "attended" },
        filtros: [
          ["id", ID],
          ["organization_id", "org-1"],
        ],
      },
    ]);
  });

  it("⭐ una llamada de otra organización vuelve como no encontrada, sin tocarla", async () => {
    await expect(updateClosingCallAction(ID_OTRA_ORG, { status: "attended" })).resolves.toEqual({
      success: false,
      error: "No se encontró la llamada. Puede que la hayan eliminado.",
    });
    expect(sim.filas.find((f) => f.id === ID_OTRA_ORG)?.status).toBe("scheduled");
  });

  it("un estado inválido vuelve con el mensaje de validación, sin escribir", async () => {
    await expect(updateClosingCallAction(ID, { status: "inventado" })).resolves.toEqual({
      success: false,
      error:
        'Invalid option: expected one of "scheduled"|"attended"|"closed"|"not_closed"|"no_show"|"cancelled"',
    });
    expect(sim.updates).toEqual([]);
  });

  it("un id inválido vuelve con el mensaje de validación", async () => {
    await expect(updateClosingCallAction("no-es-un-id", { status: "attended" })).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
    expect(sim.updates).toEqual([]);
  });

  it("si falta la tabla devuelve el mensaje que lo explica", async () => {
    sim.error = { message: 'relation "closing_calls" does not exist' };
    await expect(updateClosingCallAction(ID, { status: "attended" })).resolves.toEqual({
      success: false,
      error:
        "Falta la tabla closing_calls. Ejecuta supabase/migrations/20260521300000_closing_calls.sql en Supabase.",
    });
  });

  it("sin sesión devuelve el motivo", async () => {
    sim.sesion = false;
    await expect(updateClosingCallAction(ID, { status: "attended" })).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });

  it("sin Supabase configurado devuelve el motivo", async () => {
    sim.configurado = false;
    await expect(updateClosingCallAction(ID, { status: "attended" })).resolves.toEqual({
      success: false,
      error: "Supabase no configurado",
    });
  });

  it("⭐ una excepción de la red devuelve el texto fijo, nunca el mensaje crudo, y se registra y reporta", async () => {
    const falla = new TypeError("fetch failed: connect ECONNREFUSED 10.0.0.5:5432");
    sim.lanza = falla;
    const r = await updateClosingCallAction(ID, { status: "attended" });
    expect(r).toEqual({ success: false, error: TEXTO_FIJO });
    expect(consola).toHaveBeenCalledWith("[updateClosingCall]", falla);
    expect(sim.reportes).toEqual([{ error: falla, contexto: { accion: "[updateClosingCall]" } }]);
  });

  it("⭐ una falla de la red que supabase-js devuelve como valor no llega cruda", async () => {
    sim.error = { message: "TypeError: fetch failed" };
    await expect(updateClosingCallAction(ID, { status: "attended" })).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(sim.reportes).toHaveLength(1);
  });

  it("una conversación vinculada que ya no existe (clave foránea) vuelve con un mensaje claro", async () => {
    sim.error = { message: "violates foreign key constraint", code: "23503" };
    await expect(updateClosingCallAction(ID, { status: "attended" })).resolves.toEqual({
      success: false,
      error: "La conversación vinculada ya no existe. Recargá la página e intentá de nuevo.",
    });
    expect(sim.reportes).toEqual([]);
  });

  it("los rechazos esperables no se reportan", async () => {
    await updateClosingCallAction(ID_OTRA_ORG, { status: "attended" });
    await updateClosingCallAction("no-es-un-id", {});
    expect(sim.reportes).toEqual([]);
    expect(consola).not.toHaveBeenCalled();
  });
});

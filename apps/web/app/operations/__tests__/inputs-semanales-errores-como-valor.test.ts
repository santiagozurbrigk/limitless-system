import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRedirectError } from "next/dist/client/components/redirect";
import { RedirectType } from "next/dist/client/components/redirect-error";

/**
 * Las acciones de inputs semanales devuelven sus errores esperables como valor
 * (`MutationResult`): en producción Next no le manda al cliente el mensaje de
 * un error lanzado por una server action, y el member que borra el input de un
 * compañero veía un párrafo técnico en inglés en vez del motivo.
 */

const ID = "11111111-1111-4111-8111-111111111111";

type Fila = { id: string; organization_id: string; submitted_by: string };

const sim = vi.hoisted(() => ({
  configurado: true,
  role: "member" as string,
  filas: [] as Fila[],
  errorLectura: null as { message: string } | null,
  errorEscritura: null as { message: string } | null,
  escrituras: [] as Array<{ op: string; filtros: Array<[string, unknown]> }>,
  fallaAuth: null as unknown,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => sim.configurado }));
vi.mock("@/lib/rag/ingest", () => ({ ingestDocument: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/require-auth", () => ({
  requireAuthContext: async () => {
    if (sim.fallaAuth) throw sim.fallaAuth;
    return {
      user: { id: "yo" },
      orgId: "org-1",
      role: sim.role,
      supabase: {
        // Aplica los `.eq` pedidos: si una acción deja de filtrar por
        // organización, lee o escribe la fila de otra org y el test lo ve.
        from() {
          const filtros: Array<[string, unknown]> = [];
          let op: string | null = null;
          const builder = {
            select: () => builder,
            eq(columna: string, valor: unknown) {
              filtros.push([columna, valor]);
              return builder;
            },
            maybeSingle: async () => ({
              data: sim.errorLectura
                ? null
                : sim.filas.find((f) =>
                    filtros.every(([c, v]) => (f as Record<string, unknown>)[c] === v)
                  ) ?? null,
              error: sim.errorLectura,
            }),
            upsert: async () => {
              sim.escrituras.push({ op: "upsert", filtros: [] });
              return { error: sim.errorEscritura };
            },
            update() {
              op = "update";
              return builder;
            },
            delete() {
              op = "delete";
              return builder;
            },
            then(resolver: (r: unknown) => void) {
              if (op) sim.escrituras.push({ op, filtros: [...filtros] });
              resolver({ error: sim.errorEscritura });
            },
          };
          return builder;
        },
      },
    };
  },
}));

import {
  deleteWeeklyInputAction,
  saveWeeklyInputAction,
  updateWeeklyInputAction,
} from "../actions";

const VALIDO = { department: "sales", content: "Semana tranquila" };

beforeEach(() => {
  sim.configurado = true;
  sim.role = "member";
  sim.filas = [{ id: ID, organization_id: "org-1", submitted_by: "yo" }];
  sim.errorLectura = null;
  sim.errorEscritura = null;
  sim.escrituras = [];
  sim.fallaAuth = null;
});

/** Qué operaciones se escribieron, sin los filtros. */
const ops = () => sim.escrituras.map((e) => e.op);

describe("saveWeeklyInputAction", () => {
  it("guarda y devuelve éxito", async () => {
    await expect(saveWeeklyInputAction(VALIDO)).resolves.toEqual({ success: true, data: undefined });
    expect(ops()).toEqual(["upsert"]);
  });

  it("⭐ un input inválido vuelve con el mensaje de validación, sin escribir", async () => {
    await expect(saveWeeklyInputAction({ department: "sales" })).resolves.toEqual({
      success: false,
      error: "Completá al menos un campo antes de guardar.",
    });
    expect(ops()).toEqual([]);
  });

  it("un error de la base vuelve con el mensaje de mapWeeklyError", async () => {
    sim.errorEscritura = { message: 'relation "weekly_inputs" does not exist' };
    const r = await saveWeeklyInputAction(VALIDO);
    expect(r.success).toBe(false);
    expect(r.success === false && r.error).toContain("Faltan tablas weekly_inputs");
  });

  it("sin Supabase configurado devuelve el motivo", async () => {
    sim.configurado = false;
    await expect(saveWeeklyInputAction(VALIDO)).resolves.toEqual({
      success: false,
      error: "Supabase no configurado.",
    });
  });
});

describe.each([
  ["updateWeeklyInputAction", (id: string) => updateWeeklyInputAction(id, VALIDO), "update", "Solo podés editar tus propios inputs."],
  ["deleteWeeklyInputAction", (id: string) => deleteWeeklyInputAction(id), "delete", "Solo podés eliminar tus propios inputs."],
] as const)("%s", (_nombre, correr, escritura, ajeno) => {
  it("con un input propio escribe y devuelve éxito", async () => {
    await expect(correr(ID)).resolves.toEqual({ success: true, data: undefined });
    expect(ops()).toEqual([escritura]);
  });

  it("⭐ escribe filtrando por el id y por la organización de la sesión", async () => {
    await correr(ID);
    expect(sim.escrituras[0].filtros).toContainEqual(["id", ID]);
    expect(sim.escrituras[0].filtros).toContainEqual(["organization_id", "org-1"]);
  });

  it("⭐ un input con el mismo id pero de otra organización no se encuentra", async () => {
    sim.filas = [{ id: ID, organization_id: "org-2", submitted_by: "yo" }];
    await expect(correr(ID)).resolves.toEqual({ success: false, error: "Input no encontrado." });
    expect(ops()).toEqual([]);
  });

  it("⭐ un member con el input de un compañero recibe el motivo como valor, sin escribir", async () => {
    sim.filas = [{ id: ID, organization_id: "org-1", submitted_by: "otro" }];
    await expect(correr(ID)).resolves.toEqual({ success: false, error: ajeno });
    expect(ops()).toEqual([]);
  });

  it("el founder puede con el input de otro", async () => {
    sim.role = "founder";
    sim.filas = [{ id: ID, organization_id: "org-1", submitted_by: "otro" }];
    await expect(correr(ID)).resolves.toEqual({ success: true, data: undefined });
  });

  it("⭐ un input que no existe (o un error al leerlo) vuelve como 'Input no encontrado.'", async () => {
    sim.filas = [];
    await expect(correr(ID)).resolves.toEqual({ success: false, error: "Input no encontrado." });
    sim.filas = [{ id: ID, organization_id: "org-1", submitted_by: "yo" }];
    sim.errorLectura = { message: "timeout" };
    await expect(correr(ID)).resolves.toEqual({ success: false, error: "Input no encontrado." });
    expect(ops()).toEqual([]);
  });

  it("un id inválido vuelve con el mensaje de validación", async () => {
    await expect(correr("no-es-uuid")).resolves.toEqual({ success: false, error: "ID inválido" });
  });

  it("un error de la base al escribir vuelve como valor", async () => {
    sim.errorEscritura = { message: "timeout" };
    await expect(correr(ID)).resolves.toEqual({ success: false, error: "timeout" });
  });

  it("sin Supabase configurado devuelve el motivo", async () => {
    sim.configurado = false;
    await expect(correr(ID)).resolves.toEqual({ success: false, error: "Supabase no configurado." });
  });
});

describe.each([
  ["saveWeeklyInputAction", () => saveWeeklyInputAction(VALIDO)],
  ["updateWeeklyInputAction", () => updateWeeklyInputAction(ID, VALIDO)],
  ["deleteWeeklyInputAction", () => deleteWeeklyInputAction(ID)],
] as const)("%s sin sesión", (_nombre, correr) => {
  it("⭐ si requireAuthContext lanza un error, la acción lo relanza (no lo devuelve como valor)", async () => {
    sim.fallaAuth = new Error("Unauthorized");
    await expect(correr()).rejects.toThrow("Unauthorized");
    expect(ops()).toEqual([]);
  });

  it("⭐ si requireAuthContext redirige, la acción deja pasar el redirect de Next", async () => {
    sim.fallaAuth = getRedirectError("/auth/force-password-change", RedirectType.replace);
    await expect(correr()).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT/) });
  });
});

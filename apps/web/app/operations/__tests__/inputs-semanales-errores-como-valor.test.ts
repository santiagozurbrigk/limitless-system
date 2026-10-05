import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Las acciones de inputs semanales devuelven sus errores esperables como valor
 * (`MutationResult`): en producción Next no le manda al cliente el mensaje de
 * un error lanzado por una server action, y el member que borra el input de un
 * compañero veía un párrafo técnico en inglés en vez del motivo.
 */

const ID = "11111111-1111-4111-8111-111111111111";

const sim = vi.hoisted(() => ({
  configurado: true,
  role: "member" as string,
  existente: null as { id: string; submitted_by: string } | null,
  errorLectura: null as { message: string } | null,
  errorEscritura: null as { message: string } | null,
  escrituras: [] as string[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => sim.configurado }));
vi.mock("@/lib/rag/ingest", () => ({ ingestDocument: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/require-auth", () => ({
  requireAuthContext: async () => ({
    user: { id: "yo" },
    orgId: "org-1",
    role: sim.role,
    supabase: {
      from() {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({ data: sim.existente, error: sim.errorLectura }),
          upsert: async () => {
            sim.escrituras.push("upsert");
            return { error: sim.errorEscritura };
          },
          update() {
            sim.escrituras.push("update");
            return builder;
          },
          delete() {
            sim.escrituras.push("delete");
            return builder;
          },
          then(resolver: (r: unknown) => void) {
            resolver({ error: sim.errorEscritura });
          },
        };
        return builder;
      },
    },
  }),
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
  sim.existente = { id: ID, submitted_by: "yo" };
  sim.errorLectura = null;
  sim.errorEscritura = null;
  sim.escrituras = [];
});

describe("saveWeeklyInputAction", () => {
  it("guarda y devuelve éxito", async () => {
    await expect(saveWeeklyInputAction(VALIDO)).resolves.toEqual({ success: true, data: undefined });
    expect(sim.escrituras).toEqual(["upsert"]);
  });

  it("⭐ un input inválido vuelve con el mensaje de validación, sin escribir", async () => {
    await expect(saveWeeklyInputAction({ department: "sales" })).resolves.toEqual({
      success: false,
      error: "Completá al menos un campo antes de guardar.",
    });
    expect(sim.escrituras).toEqual([]);
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
    expect(sim.escrituras).toEqual([escritura]);
  });

  it("⭐ un member con el input de un compañero recibe el motivo como valor, sin escribir", async () => {
    sim.existente = { id: ID, submitted_by: "otro" };
    await expect(correr(ID)).resolves.toEqual({ success: false, error: ajeno });
    expect(sim.escrituras).toEqual([]);
  });

  it("el founder puede con el input de otro", async () => {
    sim.role = "founder";
    sim.existente = { id: ID, submitted_by: "otro" };
    await expect(correr(ID)).resolves.toEqual({ success: true, data: undefined });
  });

  it("⭐ un input que no existe (o un error al leerlo) vuelve como 'Input no encontrado.'", async () => {
    sim.existente = null;
    await expect(correr(ID)).resolves.toEqual({ success: false, error: "Input no encontrado." });
    sim.existente = { id: ID, submitted_by: "yo" };
    sim.errorLectura = { message: "timeout" };
    await expect(correr(ID)).resolves.toEqual({ success: false, error: "Input no encontrado." });
    expect(sim.escrituras).toEqual([]);
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

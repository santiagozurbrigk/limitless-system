/**
 * SCRUM-545 · Las tres acciones simuladas de la ficha del lead (AC-9, AC-10).
 *
 * Corre el `runMutation` real (no se mockea `@/lib/server/action-result`): lo
 * que se prueba es lo que le llega a la pantalla, el aviso en los logs y que
 * nada vaya a Sentry. `requireOrganizationId` se simula como en
 * `bloqueo-por-experiencia.test.ts`, con la constante real.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
  organizacionActiva: "org-webinar" as string | null,
  resolverLanza: null as unknown,
}));
const reportarFalla = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("@/lib/auth/bootstrap", async () => {
  const { SIN_ORGANIZACION_VINCULADA } = await vi.importActual<typeof import("@/lib/auth/bootstrap")>(
    "@/lib/auth/bootstrap"
  );
  return {
    SIN_ORGANIZACION_VINCULADA,
    requireOrganizationId: async () => {
      if (sim.resolverLanza) throw sim.resolverLanza;
      if (sim.organizacionActiva === null) throw new Error(SIN_ORGANIZACION_VINCULADA);
      return sim.organizacionActiva;
    },
  };
});
vi.mock("@/lib/observability/reportar-falla", () => ({ reportarFalla }));
// Si una acción llamara a Supabase, queda registrado (el control de abajo).
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { SIN_ORGANIZACION_VINCULADA } from "@/lib/auth/bootstrap";
import { CUENTA_DESACTIVADA_MESSAGE } from "@/lib/auth/cuenta-desactivada";
import { ErrorEsperable } from "@/lib/server/action-result";
import {
  agregarNotaDelLeadAction,
  asignarResponsableDelLeadAction,
  marcarAvanceDelLeadAction,
} from "../actions";

const LEAD = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const LANZAMIENTO = "8f0e7c52-3a1b-4c6d-9e2f-1a2b3c4d5e6f";
const SETTER = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";

/** Las tres acciones con una entrada válida, para los casos que valen en las tres. */
const ACCIONES = {
  marcarAvance: () =>
    marcarAvanceDelLeadAction({ leadId: LEAD, launchId: LANZAMIENTO, etapaActual: "raised_hand" }),
  asignarResponsable: () =>
    asignarResponsableDelLeadAction({ leadId: LEAD, launchId: LANZAMIENTO, responsableUserId: SETTER }),
  agregarNota: () => agregarNotaDelLeadAction({ leadId: LEAD, launchId: LANZAMIENTO, texto: "Llamar mañana" }),
};

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  sim.organizacionActiva = "org-webinar";
  sim.resolverLanza = null;
  reportarFalla.mockClear();
  createClient.mockClear();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("éxito sin escribir (AC-9)", () => {
  it("marcar avance devuelve la etapa siguiente del mapa", async () => {
    expect(
      await marcarAvanceDelLeadAction({ leadId: LEAD, launchId: LANZAMIENTO, etapaActual: "raised_hand" })
    ).toEqual({ success: true, data: { etapa: "contacted" } });
    expect(
      await marcarAvanceDelLeadAction({ leadId: LEAD, launchId: LANZAMIENTO, etapaActual: "contacted" })
    ).toEqual({ success: true, data: { etapa: "qualified" } });
  });

  it("asignar responsable devuelve el responsable (o null para quitarlo)", async () => {
    expect(
      await asignarResponsableDelLeadAction({ leadId: LEAD, launchId: LANZAMIENTO, responsableUserId: SETTER })
    ).toEqual({ success: true, data: { responsableUserId: SETTER } });
    expect(
      await asignarResponsableDelLeadAction({ leadId: LEAD, launchId: LANZAMIENTO, responsableUserId: null })
    ).toEqual({ success: true, data: { responsableUserId: null } });
  });

  it("agregar nota devuelve el texto recortado y la fecha", async () => {
    const r = await agregarNotaDelLeadAction({ leadId: LEAD, launchId: LANZAMIENTO, texto: "  Llamar mañana  " });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.texto).toBe("Llamar mañana");
    expect(Number.isNaN(new Date(r.data.creadaAt).getTime())).toBe(false);
  });

  it("⭐ control: ninguna de las tres llama a Supabase", async () => {
    for (const correr of Object.values(ACCIONES)) {
      expect((await correr()).success).toBe(true);
    }
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("⭐ AC-10: los cuatro casos en las tres acciones", () => {
  for (const [nombre, correr] of Object.entries(ACCIONES)) {
    describe(nombre, () => {
      it("sin sesión: el texto del ErrorEsperable, sin aviso ni Sentry", async () => {
        sim.resolverLanza = new ErrorEsperable("Sesión no válida");
        expect(await correr()).toEqual({ success: false, error: "Sesión no válida" });
        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
        expect(reportarFalla).not.toHaveBeenCalled();
      });

      it("cuenta desactivada: el texto del ErrorEsperable, sin aviso ni Sentry", async () => {
        sim.resolverLanza = new ErrorEsperable(CUENTA_DESACTIVADA_MESSAGE);
        expect(await correr()).toEqual({ success: false, error: CUENTA_DESACTIVADA_MESSAGE });
        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
        expect(reportarFalla).not.toHaveBeenCalled();
      });

      it("sin organización: el texto de SIN_ORGANIZACION_VINCULADA, aviso en logs y sin Sentry", async () => {
        sim.organizacionActiva = null;
        expect(await correr()).toEqual({ success: false, error: SIN_ORGANIZACION_VINCULADA });
        // Primero lo de Sentry: es el control que mata el mutante de TEXTO_DE_INFRAESTRUCTURA.
        expect(reportarFalla).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith("[runMutation] rechazo sin marcar:", SIN_ORGANIZACION_VINCULADA);
      });

      it("control vivo: una falla de infraestructura sí va a Sentry", async () => {
        sim.resolverLanza = new Error("fetch failed");
        expect(await correr()).toEqual({ success: false, error: "fetch failed" });
        expect(warn).not.toHaveBeenCalled();
        expect(reportarFalla).toHaveBeenCalledTimes(1);
      });
    });
  }
});

describe("entrada inválida (AC-10)", () => {
  const sinAvisos = () => {
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(reportarFalla).not.toHaveBeenCalled();
  };

  it("marcar avance: lead, lanzamiento y etapa", async () => {
    expect(
      await marcarAvanceDelLeadAction({ leadId: "no-uuid", launchId: LANZAMIENTO, etapaActual: "raised_hand" })
    ).toEqual({ success: false, error: "ID inválido" });
    expect(
      await marcarAvanceDelLeadAction({ leadId: LEAD, launchId: "no-uuid", etapaActual: "raised_hand" })
    ).toEqual({ success: false, error: "ID inválido" });
    expect(
      await marcarAvanceDelLeadAction({
        leadId: LEAD,
        launchId: LANZAMIENTO,
        etapaActual: "inventada" as "raised_hand",
      })
    ).toEqual({ success: false, error: "Etapa inválida" });
    sinAvisos();
  });

  it("marcar avance: una etapa sin paso siguiente no devuelve éxito", async () => {
    for (const etapaActual of ["registered", "qualified", "purchased"] as const) {
      expect(
        await marcarAvanceDelLeadAction({ leadId: LEAD, launchId: LANZAMIENTO, etapaActual })
      ).toEqual({ success: false, error: "Esta etapa no tiene un paso siguiente." });
    }
    sinAvisos();
  });

  it("asignar responsable: lead, lanzamiento y responsable", async () => {
    expect(
      await asignarResponsableDelLeadAction({ leadId: "x", launchId: LANZAMIENTO, responsableUserId: SETTER })
    ).toEqual({ success: false, error: "ID inválido" });
    expect(
      await asignarResponsableDelLeadAction({ leadId: LEAD, launchId: "x", responsableUserId: SETTER })
    ).toEqual({ success: false, error: "ID inválido" });
    expect(
      await asignarResponsableDelLeadAction({ leadId: LEAD, launchId: LANZAMIENTO, responsableUserId: "x" })
    ).toEqual({ success: false, error: "ID inválido" });
    sinAvisos();
  });

  it("agregar nota: lead, lanzamiento, vacía y larga", async () => {
    expect(
      await agregarNotaDelLeadAction({ leadId: "x", launchId: LANZAMIENTO, texto: "Hola" })
    ).toEqual({ success: false, error: "ID inválido" });
    expect(
      await agregarNotaDelLeadAction({ leadId: LEAD, launchId: "x", texto: "Hola" })
    ).toEqual({ success: false, error: "ID inválido" });
    expect(
      await agregarNotaDelLeadAction({ leadId: LEAD, launchId: LANZAMIENTO, texto: "   " })
    ).toEqual({ success: false, error: "Escribí la nota antes de agregarla" });
    expect(
      await agregarNotaDelLeadAction({ leadId: LEAD, launchId: LANZAMIENTO, texto: "a".repeat(5001) })
    ).toEqual({ success: false, error: "Máximo 5.000 caracteres" });
    expect(
      (await agregarNotaDelLeadAction({ leadId: LEAD, launchId: LANZAMIENTO, texto: "a".repeat(5000) })).success
    ).toBe(true);
    sinAvisos();
  });

  it("primero la organización, después la entrada", async () => {
    sim.organizacionActiva = null;
    expect(
      await marcarAvanceDelLeadAction({ leadId: "x", launchId: "x", etapaActual: "qualified" })
    ).toEqual({ success: false, error: SIN_ORGANIZACION_VINCULADA });
    expect(
      await asignarResponsableDelLeadAction({ leadId: "x", launchId: "x", responsableUserId: "x" })
    ).toEqual({ success: false, error: SIN_ORGANIZACION_VINCULADA });
    expect(await agregarNotaDelLeadAction({ leadId: "x", launchId: "x", texto: "" })).toEqual({
      success: false,
      error: SIN_ORGANIZACION_VINCULADA,
    });
  });
});

describe("lectura del fuente", () => {
  const raiz = process.cwd();

  it("bootstrap.ts sigue lanzando los tres textos que esta prueba simula", () => {
    const fuente = readFileSync(join(raiz, "lib", "auth", "bootstrap.ts"), "utf8");
    expect(fuente).toContain('throw new ErrorEsperable("Sesión no válida")');
    expect(fuente).toContain("throw new ErrorEsperable(CUENTA_DESACTIVADA_MESSAGE)");
    expect(fuente).toContain("throw new Error(SIN_ORGANIZACION_VINCULADA)");
  });

  it("actions.ts no importa Supabase, no revalida y sólo exporta funciones async (CD-15)", () => {
    const fuente = readFileSync(join(raiz, "app", "leads", "actions.ts"), "utf8");
    expect(fuente.startsWith('"use server";')).toBe(true);
    expect(fuente).not.toContain("lib/supabase");
    expect(fuente).not.toContain("revalidatePath");
    const exportaciones = fuente.match(/^export .*$/gm) ?? [];
    expect(exportaciones).toHaveLength(3);
    for (const linea of exportaciones) expect(linea).toMatch(/^export async function \w+Action\(/);
  });
});

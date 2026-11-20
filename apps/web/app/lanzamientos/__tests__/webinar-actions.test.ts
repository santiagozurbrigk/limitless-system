/**
 * SCRUM-529 · Crear y editar un lanzamiento, acciones simuladas: exigen
 * organización, validan la entrada y devuelven éxito sin escribir nada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({ org: "org-1" as string | null }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/bootstrap", () => ({
  requireOrganizationId: async () => {
    if (!sim.org) throw new Error("Sin organización vinculada");
    return sim.org;
  },
}));
vi.mock("@/lib/webinar/vistas/leer", () => ({ leerListaDeLanzamientos: vi.fn() }));
vi.mock("@/lib/observability/reportar-falla", () => ({ reportarFalla: vi.fn() }));

import { crearLanzamientoAction, guardarLanzamientoAction } from "../webinar-actions";
import { leerListaDeLanzamientos } from "@/lib/webinar/vistas/leer";

const DATOS = {
  nombre: "Webinar de diciembre",
  variante: "paid" as const,
  moneda: "USD",
  precioDeLaOferta: 997,
  captaDesde: "2026-11-20",
  cierraEl: "2026-12-05",
  sesiones: [],
};

beforeEach(() => {
  sim.org = "org-1";
  vi.mocked(leerListaDeLanzamientos).mockClear();
});

describe("crearLanzamientoAction", () => {
  it("⭐ con datos válidos devuelve éxito simulado, sin leer ni escribir nada (sin regla de paralelos todavía)", async () => {
    const r = await crearLanzamientoAction(DATOS);
    expect(r).toMatchObject({ success: true, data: { simulado: true } });
    expect(leerListaDeLanzamientos).not.toHaveBeenCalled();
  });

  it("con datos inválidos devuelve el motivo", async () => {
    const r = await crearLanzamientoAction({ ...DATOS, nombre: "" });
    expect(r).toEqual({ success: false, error: "Poné un nombre al lanzamiento" });
  });

  it("sin organización no sigue", async () => {
    sim.org = null;
    const r = await crearLanzamientoAction(DATOS);
    expect(r.success).toBe(false);
  });
});

describe("guardarLanzamientoAction", () => {
  it("exige un id de lanzamiento válido", async () => {
    expect((await guardarLanzamientoAction({ launchId: "no", datos: DATOS })).success).toBe(false);
    expect(
      await guardarLanzamientoAction({ launchId: "8f0e7c52-3a1b-4c6d-9e2f-1a2b3c4d5e6f", datos: DATOS })
    ).toMatchObject({ success: true, data: { simulado: true } });
  });
});

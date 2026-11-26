/**
 * SCRUM-529 · Con la regla de paralelos activada (`LANZAMIENTOS_EN_PARALELO`
 * en 1): una cuenta que todavía no lee lanzamientos (sin fuente, toda org que
 * no es la de demo hasta SCRUM-550) puede crear; una lectura con error, no
 * (revisión de #153).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conError, sinFuente } from "@/lib/webinar/vistas/dato";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/bootstrap", () => ({ requireOrganizationId: async () => "org-1" }));
vi.mock("@/lib/webinar/vistas/leer", () => ({ leerListaDeLanzamientos: vi.fn() }));
vi.mock("@/lib/observability/reportar-falla", () => ({ reportarFalla: vi.fn() }));
vi.mock("@/lib/webinar/lanzamientos/esquemas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/webinar/lanzamientos/esquemas")>()),
  LANZAMIENTOS_EN_PARALELO: 1,
}));

import { crearLanzamientoAction } from "../webinar-actions";
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

type Lista = Awaited<ReturnType<typeof leerListaDeLanzamientos>>;

beforeEach(() => vi.mocked(leerListaDeLanzamientos).mockReset());

describe("⭐ regla de paralelos activada", () => {
  it("sin fuente (todavía no hay lanzamientos guardados): crea", async () => {
    vi.mocked(leerListaDeLanzamientos).mockResolvedValue({
      esEjemplo: false,
      lanzamientos: sinFuente("configuracion", "Todavía no leemos lanzamientos."),
    } as Lista);
    await expect(crearLanzamientoAction(DATOS)).resolves.toMatchObject({ success: true });
  });

  it("con error al leer: no crea a ciegas", async () => {
    vi.mocked(leerListaDeLanzamientos).mockResolvedValue({
      esEjemplo: false,
      lanzamientos: conError("configuracion", "Falló la base."),
    } as Lista);
    await expect(crearLanzamientoAction(DATOS)).resolves.toMatchObject({ success: false });
  });
});

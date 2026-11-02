/**
 * SCRUM-542: las funciones de lectura. Sólo la organización de demo (por
 * variable de entorno) recibe el escenario de ejemplo; cualquier otra recibe
 * el estado "sin fuente" honesto y nunca un dato del ejemplo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const requireOrganizationId = vi.fn<() => Promise<string>>();
vi.mock("@/lib/auth/bootstrap", () => ({ requireOrganizationId: () => requireOrganizationId() }));
const zona = vi.fn<() => Promise<string | null>>(async () => null);
vi.mock("@/lib/fechas/organizacion-activa", () => ({ zonaDeLaOrganizacionActiva: () => zona() }));
vi.mock("@/lib/observability/reportar-falla", () => ({ reportarFalla: vi.fn() }));

import { ErrorEsperable } from "@/lib/server/error-esperable";
import { PREFIJO_DE_IDS_DE_EJEMPLO, escenarioDeEjemplo } from "../escenario-de-ejemplo";
import {
  leerConfiguracionDelLanzamiento,
  leerDetalleDelLanzamiento,
  leerFichaDelLead,
  leerInicio,
  leerLeads,
  leerListaDeLanzamientos,
} from "../leer";
import { esOrgDeDemo, idDeLaOrgDeDemo, VARIABLE_DE_LA_ORG_DE_DEMO } from "../org-de-demo";
import { MOTIVO_SIN_LECTURA_REAL } from "../sin-lectura-real";

const DEMO = "11111111-2222-4333-8444-555555555555";
const REAL = "99999999-8888-4777-8666-555555555555";
const ejemplo = escenarioDeEjemplo(new Date());
const LANZAMIENTO = ejemplo.lanzamientos[0].id;
const LEAD = ejemplo.leads[0].id;

async function todas() {
  return {
    inicio: await leerInicio(),
    lista: await leerListaDeLanzamientos(),
    detalle: await leerDetalleDelLanzamiento(LANZAMIENTO),
    leads: await leerLeads({ launchId: LANZAMIENTO }),
    ficha: await leerFichaDelLead(LEAD, LANZAMIENTO),
    configuracion: await leerConfiguracionDelLanzamiento(LANZAMIENTO),
  };
}

/** ¿Hay algún rastro del escenario en lo que recibió la pantalla? */
function tieneRastroDelEjemplo(vistas: unknown): boolean {
  const texto = JSON.stringify(vistas);
  return (
    texto.includes(PREFIJO_DE_IDS_DE_EJEMPLO) ||
    texto.includes("example.com") ||
    texto.includes("de ejemplo") ||
    texto.includes('"esEjemplo":true')
  );
}

beforeEach(() => {
  vi.stubEnv(VARIABLE_DE_LA_ORG_DE_DEMO, DEMO);
});
afterEach(() => {
  vi.unstubAllEnvs();
  requireOrganizationId.mockReset();
});

describe("la organización de demo", () => {
  it("recibe el escenario en las seis pantallas, marcado como ejemplo", async () => {
    requireOrganizationId.mockResolvedValue(DEMO);
    const v = await todas();
    expect(v.inicio.esEjemplo).toBe(true);
    expect(v.inicio.activo.value?.lanzamiento.id).toBe(LANZAMIENTO);
    expect(v.lista.lanzamientos.value).toHaveLength(2);
    expect(v.detalle).toMatchObject({ ok: true, data: { esEjemplo: true } });
    expect(v.leads.esEjemplo).toBe(true);
    expect(v.leads.total.value).toBe(210);
    expect(v.ficha).toMatchObject({ ok: true, data: { lead: { id: LEAD } } });
    expect(v.configuracion).toMatchObject({ ok: true, data: { esEjemplo: true } });
    // Un ID que no es del escenario: no existe.
    expect(await leerDetalleDelLanzamiento(REAL)).toEqual({ ok: true, data: null });
  });

  it("si no se puede leer la zona de la org, Inicio sale igual con la de por defecto", async () => {
    requireOrganizationId.mockResolvedValue(DEMO);
    zona.mockRejectedValueOnce(new Error("fetch failed"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const v = await leerInicio();
    expect(v.activo.value?.diasParaElCierre).toBeTypeOf("number");
  });
});

describe("el escenario de la demo se arma en la zona de la org", () => {
  // Entre las dos, a cualquier hora del día una tiene otra fecha que UTC.
  it.each(["Pacific/Kiritimati", "Pacific/Honolulu"])("%s: cierra en 3 días y todas las pantallas dicen la misma fecha", async (z) => {
    requireOrganizationId.mockResolvedValue(DEMO);
    zona.mockResolvedValue(z);
    try {
      const inicio = (await leerInicio()).activo.value!;
      expect(inicio.diasParaElCierre).toBe(3);
      const lista = (await leerListaDeLanzamientos()).lanzamientos.value!;
      expect(lista[0].lanzamiento.cierraEl).toBe(inicio.lanzamiento.cierraEl);
      const detalle = await leerDetalleDelLanzamiento(LANZAMIENTO);
      expect(detalle.ok && detalle.data!.lanzamiento.cierraEl).toBe(inicio.lanzamiento.cierraEl);
      const configuracion = await leerConfiguracionDelLanzamiento(LANZAMIENTO);
      expect(configuracion.ok && configuracion.data!.lanzamiento.cierraEl).toBe(inicio.lanzamiento.cierraEl);
    } finally {
      zona.mockReset();
      zona.mockImplementation(async () => null);
    }
  });
});

describe("cualquier otra organización nunca recibe el ejemplo", () => {
  const casos: [string, Record<string, string | undefined>][] = [
    ["con la variable apuntando a la demo", { [VARIABLE_DE_LA_ORG_DE_DEMO]: DEMO }],
    ["sin la variable", { [VARIABLE_DE_LA_ORG_DE_DEMO]: undefined }],
    ["con la variable vacía", { [VARIABLE_DE_LA_ORG_DE_DEMO]: "" }],
  ];
  for (const [nombre, env] of casos) {
    it(nombre, async () => {
      for (const [k, valor] of Object.entries(env)) vi.stubEnv(k, valor as string);
      requireOrganizationId.mockResolvedValue(REAL);
      const v = await todas();
      expect(tieneRastroDelEjemplo(v)).toBe(false);
      expect(v.inicio).toEqual({
        esEjemplo: false,
        activo: { state: "sin_fuente", value: null, source: "configuracion", reason: MOTIVO_SIN_LECTURA_REAL, measuredAt: null },
      });
      expect(v.lista.lanzamientos.state).toBe("sin_fuente");
      expect(v.leads.filas.state).toBe("sin_fuente");
      expect(v.leads.total.state).toBe("sin_fuente");
      expect(v.leads.filtros.every((f) => f.personas.state === "sin_fuente")).toBe(true);
      expect(v.leads.lanzamientoElegido).toBeNull();
      // Con un ID del ejemplo, la pantalla responde "no encontrado".
      expect(v.detalle).toEqual({ ok: true, data: null });
      expect(v.ficha).toEqual({ ok: true, data: null });
      expect(v.configuracion).toEqual({ ok: true, data: null });
    });
  }

  it("sin la variable, ni siquiera la org que sería la demo ve el ejemplo", async () => {
    vi.stubEnv(VARIABLE_DE_LA_ORG_DE_DEMO, "");
    requireOrganizationId.mockResolvedValue(DEMO);
    expect(tieneRastroDelEjemplo(await todas())).toBe(false);
  });

  it("la búsqueda y el filtro de la URL se devuelven tal cual, sin datos", async () => {
    requireOrganizationId.mockResolvedValue(REAL);
    const v = await leerLeads({ filtro: "agendado_sin_cerrar", busqueda: "  ana " });
    expect(v.filtroElegido).toBe("agendado_sin_cerrar");
    expect(v.busqueda).toBe("ana");
  });
});

describe("la organización sale siempre de requireOrganizationId", () => {
  it("sin sesión, la lectura lanza el rechazo esperable (como toda pantalla)", async () => {
    requireOrganizationId.mockRejectedValue(new ErrorEsperable("Sesión no válida"));
    await expect(leerInicio()).rejects.toThrow("Sesión no válida");
    await expect(leerLeads()).rejects.toThrow("Sesión no válida");
  });

  it("cada función la pide", async () => {
    requireOrganizationId.mockResolvedValue(REAL);
    await todas();
    expect(requireOrganizationId).toHaveBeenCalledTimes(6);
  });
});

describe("esOrgDeDemo", () => {
  it("sólo con un UUID exacto en la variable", () => {
    expect(esOrgDeDemo(DEMO, { [VARIABLE_DE_LA_ORG_DE_DEMO]: DEMO })).toBe(true);
    expect(esOrgDeDemo(DEMO, { [VARIABLE_DE_LA_ORG_DE_DEMO]: ` ${DEMO.toUpperCase()} ` })).toBe(true);
    expect(esOrgDeDemo(REAL, { [VARIABLE_DE_LA_ORG_DE_DEMO]: DEMO })).toBe(false);
    expect(esOrgDeDemo(DEMO, {})).toBe(false);
    expect(esOrgDeDemo(DEMO, { [VARIABLE_DE_LA_ORG_DE_DEMO]: "demo" })).toBe(false);
    expect(esOrgDeDemo(DEMO, { [VARIABLE_DE_LA_ORG_DE_DEMO]: `${DEMO},${REAL}` })).toBe(false);
    expect(esOrgDeDemo(null, { [VARIABLE_DE_LA_ORG_DE_DEMO]: DEMO })).toBe(false);
    expect(esOrgDeDemo("", { [VARIABLE_DE_LA_ORG_DE_DEMO]: "" })).toBe(false);
    expect(idDeLaOrgDeDemo({ [VARIABLE_DE_LA_ORG_DE_DEMO]: DEMO })).toBe(DEMO);
  });
});

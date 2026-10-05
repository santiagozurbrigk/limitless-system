import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-36 · lectura de la ventana de Fathom por tramos: presupuesto de páginas
 * compartido, reuniones en el borde entre tramos, tope de tramos por corrida y
 * cortes de Fathom (429 o falla de su lado) a mitad de la lectura.
 */

vi.mock("@/lib/observability/reportar-falla", () => ({ reportarFalla: () => {} }));

import { leerVentanaDeFathom, TRAMOS_CERRADOS_POR_CORRIDA } from "@/lib/fathom/leer-ventana";
import { FathomApiError, leerRetryAfter } from "@/lib/fathom/api";

const AHORA = new Date("2026-10-05T12:00:00.000Z");
const DESDE = "2026-10-01T00:00:00.000Z";
const HORA = 60 * 60 * 1000;

type Reunion = { recording_id: number; created_at: string };

const sim = {
  reuniones: [] as Reunion[],
  pedidos: [] as URL[],
  tamanoDePagina: 10,
  /** Número de pedido (1, 2, ...) que responde con este status. */
  fallas: new Map<number, { status: number; retryAfter?: string }>(),
};

function fathomFetch(input: string | URL) {
  const url = new URL(String(input));
  sim.pedidos.push(url);
  const falla = sim.fallas.get(sim.pedidos.length);
  if (falla) {
    const headers = falla.retryAfter ? { "Retry-After": falla.retryAfter } : undefined;
    return Promise.resolve(new Response("Too Many Requests", { status: falla.status, headers }));
  }
  const despues = url.searchParams.get("created_after");
  const antes = url.searchParams.get("created_before");
  const items = sim.reuniones
    .filter((r) => !despues || Date.parse(r.created_at) > Date.parse(despues))
    .filter((r) => !antes || Date.parse(r.created_at) < Date.parse(antes))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const offset = Number(url.searchParams.get("cursor") ?? 0);
  const fin = offset + sim.tamanoDePagina;
  const body = JSON.stringify({
    limit: sim.tamanoDePagina,
    next_cursor: fin < items.length ? String(fin) : null,
    items: items.slice(offset, fin),
  });
  return Promise.resolve(new Response(body, { status: 200 }));
}

function en(horas: number, extraMs = 0): string {
  return new Date(Date.parse(DESDE) + horas * HORA + extraMs).toISOString();
}

function leer(maxPages = 20, esperar = vi.fn(async () => {})) {
  return leerVentanaDeFathom("key", { desde: DESDE, ahora: AHORA, maxPages, esperar });
}

beforeEach(() => {
  sim.reuniones = [];
  sim.pedidos = [];
  sim.tamanoDePagina = 10;
  sim.fallas = new Map();
  vi.stubGlobal("fetch", vi.fn(fathomFetch));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("leerVentanaDeFathom: presupuesto y bordes", () => {
  it("⭐ un tramo no gasta más páginas que las que le quedan al presupuesto", async () => {
    sim.tamanoDePagina = 1;
    // Tramo 1 (0 a 6 h): 2 reuniones, 2 páginas. Tramo 2: 5 reuniones.
    sim.reuniones = [1, 2].map((h, i) => ({ recording_id: i, created_at: en(h) }));
    sim.reuniones.push(...[7, 8, 9, 10, 11].map((h, i) => ({ recording_id: 10 + i, created_at: en(h) })));

    const lectura = await leer(3);

    // 2 páginas del tramo 1 y la única que quedaba para el tramo 2.
    expect(sim.pedidos).toHaveLength(3);
    expect(lectura.cortada).toBe(true);
    expect(lectura.completaHasta).toBe(en(6));
    expect(lectura.tramoCortado).toHaveLength(1);
  });

  it("⭐ la reunión que cae en el segundo de solape entre tramos llega una sola vez", async () => {
    // Medio segundo antes del fin del tramo 1: entra en el tramo 1 y en el 2.
    const borde = { recording_id: 77, created_at: en(6, -500) };
    sim.reuniones = [borde];

    const lectura = await leer();

    const pedidosQueLaTraen = sim.pedidos.filter((url) => {
      const despues = Date.parse(url.searchParams.get("created_after")!);
      const antes = Date.parse(url.searchParams.get("created_before") ?? AHORA.toISOString());
      return despues < Date.parse(borde.created_at) && Date.parse(borde.created_at) < antes;
    });
    expect(pedidosQueLaTraen).toHaveLength(2);
    expect(lectura.meetings.map((m) => m.recording_id)).toEqual(["77"]);
  });

  it(`como mucho ${TRAMOS_CERRADOS_POR_CORRIDA} tramos cerrados por corrida`, async () => {
    const lectura = await leer();
    expect(sim.pedidos).toHaveLength(TRAMOS_CERRADOS_POR_CORRIDA);
    expect(lectura.cortada).toBe(true);
    expect(Date.parse(lectura.completaHasta!)).toBeGreaterThan(Date.parse(en(23)));
  });

  it("al día: un solo pedido abierto, lectura completa", async () => {
    const lectura = await leerVentanaDeFathom("key", {
      desde: new Date(AHORA.getTime() - 2 * HORA).toISOString(),
      ahora: AHORA,
      maxPages: 20,
    });
    expect(sim.pedidos).toHaveLength(1);
    expect(sim.pedidos[0].searchParams.get("created_before")).toBeNull();
    expect(lectura).toMatchObject({ cortada: false, completaHasta: null });
  });
});

describe("leerVentanaDeFathom: Fathom corta a mitad de la lectura", () => {
  function tresTramosConVariasPaginas() {
    // Con páginas de 1: tramo 1 = 3 pedidos, tramo 2 = 2 pedidos; el sexto es el tramo 3.
    sim.tamanoDePagina = 1;
    sim.reuniones = [
      ...[1, 2, 3].map((h, i) => ({ recording_id: i, created_at: en(h) })),
      ...[7, 8].map((h, i) => ({ recording_id: 10 + i, created_at: en(h) })),
      { recording_id: 20, created_at: en(13) },
    ];
  }

  it("⭐ un 429 al sexto pedido no pierde lo leído: corta con lo completo hasta el tramo 2", async () => {
    tresTramosConVariasPaginas();
    sim.fallas.set(6, { status: 429 });

    const lectura = await leer();

    expect(sim.pedidos).toHaveLength(6);
    expect(lectura.cortada).toBe(true);
    // El fin del tramo 2: 6 h más 6 h, menos el segundo de solape del arranque del tramo 2.
    expect(lectura.completaHasta).toBe(en(12, -1000));
    expect(lectura.meetings.map((m) => m.recording_id).sort()).toEqual(["0", "1", "10", "11", "2"]);
    expect(lectura.tramoCortado).toEqual([]);
  });

  it("una falla de Fathom (5xx) a mitad también corta con lo completo", async () => {
    tresTramosConVariasPaginas();
    sim.fallas.set(6, { status: 503 });
    const lectura = await leer();
    expect(lectura).toMatchObject({ cortada: true, completaHasta: en(12, -1000) });
  });

  it("⭐ un 429 con Retry-After corto: espera lo que pide Fathom y reintenta el mismo tramo una vez", async () => {
    tresTramosConVariasPaginas();
    sim.fallas.set(6, { status: 429, retryAfter: "2" });
    const esperar = vi.fn(async () => {});

    const lectura = await leer(20, esperar);

    expect(esperar).toHaveBeenCalledTimes(1);
    expect(esperar).toHaveBeenCalledWith(2000);
    expect(sim.pedidos[6].searchParams.get("created_after")).toBe(
      sim.pedidos[5].searchParams.get("created_after")
    );
    expect(lectura.meetings.map((m) => m.recording_id)).toContain("20");
  });

  it("un 429 con Retry-After largo no se espera: corta", async () => {
    tresTramosConVariasPaginas();
    sim.fallas.set(6, { status: 429, retryAfter: "60" });
    const esperar = vi.fn(async () => {});
    const lectura = await leer(20, esperar);
    expect(esperar).not.toHaveBeenCalled();
    expect(lectura.cortada).toBe(true);
  });

  it("sólo se espera una vez por corrida", async () => {
    tresTramosConVariasPaginas();
    sim.fallas.set(6, { status: 429, retryAfter: "1" });
    sim.fallas.set(7, { status: 429, retryAfter: "1" });
    const esperar = vi.fn(async () => {});
    const lectura = await leer(20, esperar);
    expect(esperar).toHaveBeenCalledTimes(1);
    expect(sim.pedidos).toHaveLength(7);
    expect(lectura).toMatchObject({ cortada: true, completaHasta: en(12, -1000) });
  });

  it("sin ningún tramo cerrado, el 429 se propaga como antes", async () => {
    sim.fallas.set(1, { status: 429 });
    await expect(leer()).rejects.toBeInstanceOf(FathomApiError);
  });

  it("una key rechazada (401) se propaga aunque haya tramos cerrados", async () => {
    sim.fallas.set(2, { status: 401 });
    await expect(leer()).rejects.toMatchObject({ status: 401 });
  });
});

describe("leerRetryAfter", () => {
  it("segundos, fecha HTTP, vacío e ilegible", () => {
    expect(leerRetryAfter("7")).toBe(7);
    expect(leerRetryAfter("Mon, 05 Oct 2026 12:00:30 GMT", Date.parse("2026-10-05T12:00:00Z"))).toBe(30);
    expect(leerRetryAfter(null)).toBeUndefined();
    expect(leerRetryAfter("pronto")).toBeUndefined();
  });
});

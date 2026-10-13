import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

/**
 * SCRUM-516: la importación desde Excel devuelve sus errores esperables como
 * valor. Antes, con `runMutation`, el texto crudo de la base o de la librería
 * de Excel ("Unsupported ZIP encryption") llegaba al asistente; y si la lectura
 * de los clientes existentes fallaba, se importaba igual: duplicados.
 *
 * Sólo el contrato de errores: los montos y fechas que el import completa
 * cuando faltan no cambian (SCRUM-30, SCRUM-382).
 */

vi.mock("@/lib/observability/reportar-falla", async () => {
  const { base } = await import("./supabase-falso");
  return {
    reportarFalla: (error: unknown, contexto: unknown) => base.reportes.push({ error, contexto }),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", async () => {
  const { base } = await import("./supabase-falso");
  return { createClient: async () => base.cliente() };
});
vi.mock("@/lib/auth/bootstrap", async () => {
  const { base, ORG } = await import("./supabase-falso");
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (!base.sesion) throw new ErrorEsperable("Sesión no válida");
      return ORG;
    },
  };
});
const sim = vi.hoisted(() => ({ leer: null as null | (() => never) }));
// La librería real; `sim.leer` simula que lanza otra cosa (un bug).
vi.mock("xlsx", async (original) => {
  const real = await original<typeof import("xlsx")>();
  return {
    ...real,
    read: (...args: Parameters<typeof real.read>) => (sim.leer ? sim.leer() : real.read(...args)),
  };
});
vi.mock("@/lib/fechas/organizacion", () => ({
  fechaDeHoyDeLaOrganizacion: async () => "2026-10-12",
}));

import {
  getExcelPreviewAction,
  importClientsFromExcelAction,
  importClosingCallsFromExcelAction,
  importFinanceMetricsFromExcelAction,
  importFinanceMetricsTransposedAction,
  importSalesMetricsFromExcelAction,
  importSalesMetricsManualAction,
  importSalesMetricsTransposedAction,
} from "../import-actions";
import type { ColumnMapping } from "@/lib/clients/excel-parser";
import { base, ORG, OTRA_ORG, TEXTO_FIJO } from "./supabase-falso";

const ARCHIVO_ILEGIBLE =
  "No se pudo leer el archivo. Revisá que sea una planilla de Excel (.xlsx o .xls) o un CSV.";
const FETCH_FAILED = { message: "TypeError: fetch failed" };

function planilla(filas: unknown[][], hoja = "Clientes"): string {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), hoja);
  return (XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer).toString("base64");
}

/** Un .xlsx dañado: la librería lanza "Unsupported ZIP encryption". */
const DANADO = Buffer.concat([Buffer.from("PK\x03\x04"), Buffer.alloc(40, 1)]).toString("base64");

const CLIENTES = planilla([
  ["Nombre", "Email"],
  ["Ana", "ana@x.com"],
  ["Beto", "beto@x.com"],
]);
const MAPEO = { name: "Nombre", email: "Email" } as unknown as ColumnMapping;

let consola: ReturnType<typeof vi.spyOn>;
let info: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  base.reiniciar();
  base.tablas.clients = [
    { id: "c1", organization_id: ORG, name: "Ana" },
    { id: "c2", organization_id: OTRA_ORG, name: "Beto" },
  ];
  base.tablas.plans = [];
  sim.leer = null;
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  info = vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  consola.mockRestore();
  info.mockRestore();
});

describe("getExcelPreviewAction", () => {
  it("devuelve las columnas y las primeras filas", async () => {
    const r = await getExcelPreviewAction(CLIENTES);
    expect(r).toMatchObject({ success: true, data: { headers: ["Nombre", "Email"], activeSheet: "Clientes" } });
  });

  it("⭐ un archivo dañado vuelve con el motivo, no con el texto de la librería, y no se reporta", async () => {
    const r = await getExcelPreviewAction(DANADO);
    expect(r).toEqual({ success: false, error: ARCHIVO_ILEGIBLE });
    expect(JSON.stringify(r)).not.toContain("ZIP");
    expect(base.reportes).toEqual([]);
  });

  it("sin sesión devuelve el motivo", async () => {
    base.sesion = false;
    await expect(getExcelPreviewAction(CLIENTES)).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });
});

describe("importClientsFromExcelAction", () => {
  it("importa en la organización de la sesión y saltea los que ya existen en ella", async () => {
    const r = await importClientsFromExcelAction(CLIENTES, MAPEO);
    // "Ana" ya existe en la org; "Beto" existe sólo en otra org: se importa.
    expect(r).toMatchObject({ success: true, data: { inserted: 1, skipped: 1 } });
    const alta = base.escrituras()[0];
    expect(alta).toMatchObject({ tabla: "clients", op: "insert" });
    expect(alta.valores).toEqual([expect.objectContaining({ organization_id: ORG, name: "Beto" })]);
    expect(base.operaciones[0].filtros).toEqual([["organization_id", ORG]]);
  });

  it("⭐ un archivo dañado vuelve con el motivo, sin escribir", async () => {
    await expect(importClientsFromExcelAction(DANADO, MAPEO)).resolves.toEqual({
      success: false,
      error: ARCHIVO_ILEGIBLE,
    });
    expect(base.escrituras()).toEqual([]);
  });

  it("⭐ si no se pueden leer los clientes existentes no importa (duplicaría): texto fijo y se reporta", async () => {
    base.errores["clients:select"] = FETCH_FAILED;
    await expect(importClientsFromExcelAction(CLIENTES, MAPEO)).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(base.escrituras()).toEqual([]);
    expect(base.reportes).toHaveLength(1);
  });

  it("si no se pueden leer los planes no importa sin plan: texto fijo", async () => {
    base.errores.plans = FETCH_FAILED;
    await expect(importClientsFromExcelAction(CLIENTES, MAPEO)).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(base.escrituras()).toEqual([]);
  });

  it("⭐ si falla un lote después de guardar otro, dice cuántos se importaron y registra la falla", async () => {
    const filas = [["Nombre", "Email"], ...Array.from({ length: 60 }, (_, i) => [`Cliente ${i}`, ""])];
    base.erroresDesdeLaLlamada["clients:insert"] = { desde: 2, error: FETCH_FAILED };
    const r = await importClientsFromExcelAction(planilla(filas), MAPEO);
    expect(r).toMatchObject({
      success: true,
      data: {
        inserted: 50,
        incompleta:
          "Se importaron 50 de 60: el resto no se pudo guardar. Volvé a importar el archivo: los que ya se cargaron se saltean.",
      },
    });
    expect(base.reportes).toEqual([
      {
        error: expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" }),
        contexto: { accion: "[importClientsFromExcel]" },
      },
    ]);
  });

  it("si falla el primer lote no hay nada guardado: texto fijo", async () => {
    base.erroresDesdeLaLlamada["clients:insert"] = { desde: 1, error: FETCH_FAILED };
    await expect(importClientsFromExcelAction(CLIENTES, MAPEO)).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
  });

  it("los errores por fila siguen viniendo en el dato", async () => {
    const sinNombres = planilla([["Nombre", "Email"], ["", "x@x.com"]]);
    const r = await importClientsFromExcelAction(sinNombres, MAPEO);
    expect(r.success).toBe(true);
    expect(r.success && r.data.inserted).toBe(0);
    expect(r.success && r.data.errors.length).toBeGreaterThan(0);
  });
});

describe("importSalesMetricsManualAction", () => {
  it("guarda los meses en la organización de la sesión", async () => {
    const r = await importSalesMetricsManualAction([{ period: "2026-09", cierres: 3 }]);
    expect(r).toMatchObject({ success: true, data: { inserted: 1 } });
    expect(base.escrituras()[0].valores).toEqual([
      expect.objectContaining({ organization_id: ORG, category: "sales", period_start: "2026-09-01" }),
    ]);
  });

  it("sin períodos válidos, el motivo en el dato, sin escribir", async () => {
    const r = await importSalesMetricsManualAction([{ period: "septiembre" }]);
    expect(r).toMatchObject({ success: true, data: { inserted: 0 } });
    expect(base.escrituras()).toEqual([]);
  });

  it("sin sesión devuelve el motivo", async () => {
    base.sesion = false;
    await expect(importSalesMetricsManualAction([{ period: "2026-09" }])).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });
});

describe("las importaciones sin pantalla (llamadas y métricas desde Excel)", () => {
  const casos = [
    ["importClosingCallsFromExcelAction", (b: string) => importClosingCallsFromExcelAction(b)],
    ["importSalesMetricsFromExcelAction", (b: string) => importSalesMetricsFromExcelAction(b, {} as never)],
    ["importFinanceMetricsFromExcelAction", (b: string) => importFinanceMetricsFromExcelAction(b, {} as never)],
    ["importSalesMetricsTransposedAction", (b: string) => importSalesMetricsTransposedAction(b, {})],
    ["importFinanceMetricsTransposedAction", (b: string) => importFinanceMetricsTransposedAction(b, {})],
  ] as const;

  it.each(casos)("⭐ %s: un archivo dañado vuelve con el motivo", async (_n, correr) => {
    await expect(correr(DANADO)).resolves.toEqual({ success: false, error: ARCHIVO_ILEGIBLE });
    expect(base.reportes).toEqual([]);
  });

  it.each(casos)("%s: sin sesión devuelve el motivo", async (_n, correr) => {
    base.sesion = false;
    await expect(correr(CLIENTES)).resolves.toEqual({ success: false, error: "Sesión no válida" });
  });

  it.each(casos)("%s: un archivo sin filas que importar vuelve en el dato, sin escribir", async (_n, correr) => {
    const vacia = planilla([["a"]]);
    const r = await correr(vacia);
    expect(r).toMatchObject({ success: true, data: { inserted: 0 } });
    expect(base.escrituras()).toEqual([]);
  });

  it("importClosingCallsFromExcelAction: guarda en la organización y un error de la base no llega crudo", async () => {
    const llamadas = planilla([
      ["Nombre prospecto", "Fecha y hora"],
      ["Ana", "2026-10-01 10:00"],
    ]);
    const ok = await importClosingCallsFromExcelAction(llamadas);
    expect(ok).toMatchObject({ success: true, data: { inserted: 1 } });
    expect(base.escrituras()[0].valores).toEqual([expect.objectContaining({ organization_id: ORG })]);
    base.errores.closing_calls = FETCH_FAILED;
    await expect(importClosingCallsFromExcelAction(llamadas)).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(base.reportes).toEqual([
      {
        error: expect.objectContaining({ message: "TypeError: fetch failed" }),
        contexto: { accion: "[importClosingCallsFromExcel]" },
      },
    ]);
  });
});

describe("lo inesperado (SCRUM-516)", () => {
  it.each([
    ["getExcelPreviewAction", () => getExcelPreviewAction(CLIENTES), "[getExcelPreview]"],
    ["importClientsFromExcelAction", () => importClientsFromExcelAction(CLIENTES, MAPEO), "[importClientsFromExcel]"],
    ["importSalesMetricsManualAction", () => importSalesMetricsManualAction([{ period: "2026-09" }]), "[importSalesMetricsManual]"],
  ] as const)(
    "⭐ %s: una excepción inesperada devuelve el texto fijo y se registra y reporta",
    async (_n, correr, etiqueta) => {
      const falla = new TypeError("fetch failed");
      const espia = vi.spyOn(Buffer, "from").mockImplementationOnce(() => {
        throw falla;
      });
      base.lanza = falla;
      const r = await correr();
      espia.mockRestore();
      expect(r).toEqual({ success: false, error: TEXTO_FIJO });
      expect(consola).toHaveBeenCalledWith(etiqueta, falla);
      expect(base.reportes).toEqual([{ error: falla, contexto: { accion: etiqueta } }]);
    }
  );

  it.each([
    ["importClientsFromExcelAction", () => importClientsFromExcelAction(CLIENTES, MAPEO), "[importClientsFromExcel]", "clients:insert"],
    ["importSalesMetricsManualAction", () => importSalesMetricsManualAction([{ period: "2026-09" }]), "[importSalesMetricsManual]", "metrics_snapshots"],
  ] as const)(
    "⭐ %s: el error de supabase-js al guardar devuelve el texto fijo y se reporta",
    async (_n, correr, etiqueta, clave) => {
      base.errores[clave] = FETCH_FAILED;
      const r = await correr();
      expect(r).toEqual({ success: false, error: TEXTO_FIJO });
      expect(base.reportes).toEqual([
        { error: expect.objectContaining({ message: "TypeError: fetch failed" }), contexto: { accion: etiqueta } },
      ]);
    }
  );

  it("⭐ un bug del parser (TypeError) no se confunde con un archivo dañado", async () => {
    const falla = new TypeError("Cannot read properties of undefined");
    sim.leer = () => {
      throw falla;
    };
    const r = await getExcelPreviewAction(CLIENTES);
    expect(r).toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.reportes).toEqual([{ error: falla, contexto: { accion: "[getExcelPreview]" } }]);
  });
});

describe("⭐ cada consulta lleva el filtro de la organización de la sesión (MAYOR-2 de la AR pasada 2)", () => {
  it("los planes para el auto-match se leen de la org", async () => {
    await expect(importClientsFromExcelAction(CLIENTES, MAPEO)).resolves.toMatchObject({ success: true });
    expect(base.filtrosDe("plans", "select")).toEqual([["organization_id", ORG]]);
  });
});

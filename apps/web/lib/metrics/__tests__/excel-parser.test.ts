/**
 * SCRUM-493: una fila de métricas cuyo período no es una fecha ("Semana 1")
 * toma `hoy`, el de la organización; y un mes sin año toma el año de ese hoy.
 * Antes los dos salían del reloj del servidor (UTC).
 */
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseSalesMetricsExcel, parseSalesMetricsTransposed } from "../excel-parser";

function planilla(filas: (string | number)[][]): Buffer {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), "Ventas");
  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("métricas importadas: fechas por defecto", () => {
  it("⭐ un período que no es fecha usa el hoy que recibe", () => {
    const { rows } = parseSalesMetricsExcel(
      planilla([
        ["Período", "Leads"],
        ["Semana 1", 10],
        ["2026-09-07", 12],
      ]),
      "2026-10-01",
      { period: "Período", leadsTotales: "Leads" }
    );
    expect(rows.map((r) => r.periodStart)).toEqual(["2026-10-01", "2026-09-07"]);
  });

  it("⭐ en la planilla transpuesta, un mes sin año toma el año del hoy que recibe", () => {
    const { rows } = parseSalesMetricsTransposed(
      planilla([
        ["Métrica", "Enero", "Febrero"],
        ["Leads", 10, 20],
      ]),
      "2027-01-01",
      { leadsTotales: "Leads" }
    );
    expect(rows.map((r) => r.periodStart)).toEqual(["2027-01-01", "2027-02-01"]);
  });
});

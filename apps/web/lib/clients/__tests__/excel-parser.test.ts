/**
 * SCRUM-493: una fila de la planilla de clientes sin fecha de inicio (o con una
 * que no se entiende) toma `hoy`, el de la organización. Antes era el "hoy" de
 * UTC del servidor: de noche en Argentina, un día adelantado.
 */
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseClientsExcel } from "../excel-parser";

function planilla(filas: Record<string, string>[]): Buffer {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), "Clientes");
  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseClientsExcel: fecha de inicio", () => {
  const hoy = "2026-10-01";

  it("⭐ sin fecha o con una que no se entiende, usa el hoy que recibe", () => {
    const { rows } = parseClientsExcel(
      planilla([
        { Nombre: "Sin fecha", "Fecha inicio": "" },
        { Nombre: "Fecha rara", "Fecha inicio": "el mes pasado" },
      ]),
      hoy
    );
    expect(rows.map((r) => r.joinDate)).toEqual([hoy, hoy]);
  });

  it("una fecha que se entiende se respeta", () => {
    const { rows } = parseClientsExcel(
      planilla([
        { Nombre: "ISO", "Fecha inicio": "2026-09-15" },
        { Nombre: "Argentina", "Fecha inicio": "15/09/2026" },
      ]),
      hoy
    );
    expect(rows.map((r) => r.joinDate)).toEqual(["2026-09-15", "2026-09-15"]);
  });
});

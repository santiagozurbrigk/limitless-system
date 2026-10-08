import { describe, expect, it } from "vitest";
import { formatearDuracion } from "../duracion";

/** SCRUM-503 (revisión 4, MENOR-4): la duración del modal de tiempo y del aviso al cancelar. */
describe("formatearDuracion", () => {
  it.each([
    [0, "0 minutos"],
    [1, "1 minuto"],
    [45, "45 minutos"],
    [60, "1 hora"],
    [90, "1h 30m"],
    [120, "2 horas"],
  ])("⭐ %i → %s", (minutos, texto) => {
    expect(formatearDuracion(minutos)).toBe(texto);
  });
});

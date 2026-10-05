/**
 * Cambiar la zona horaria del proceso en un test, y volverla atrás.
 *
 * Cambiar `process.env.TZ` en tiempo de ejecución funciona con el pool `forks`
 * de vitest (el de por defecto). `conZona` comprueba que la zona cambió de
 * verdad comparando el desfase de `Date` con el que da `Intl` para esa zona: si
 * no cambió, el test falla en vez de pasar sin probar nada.
 */
import { expect } from "vitest";

let guardada: { valor: string | undefined } | null = null;

/** Desfase de la zona con UTC en minutos, con el signo de `getTimezoneOffset`. */
function desfaseEsperado(zona: string, instante: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);
  const n = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((p) => p.type === tipo)?.value);
  const relojLocal = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return (instante.getTime() - relojLocal) / 60_000;
}

export function conZona(zona: string): void {
  if (guardada === null) guardada = { valor: process.env.TZ };
  process.env.TZ = zona;
  for (const muestra of [new Date("2026-01-15T12:00:00Z"), new Date("2026-07-15T12:00:00Z")]) {
    expect(muestra.getTimezoneOffset(), `la zona del proceso no cambió a ${zona}`).toBe(
      desfaseEsperado(zona, muestra)
    );
  }
}

/** Para `afterEach`: deja la zona como estaba antes del primer `conZona`. */
export function restaurarZona(): void {
  if (guardada === null) return;
  // Asignar `undefined` dejaría el texto "undefined" (en la práctica, UTC): si
  // no había TZ, se borra.
  if (guardada.valor === undefined) delete process.env.TZ;
  else process.env.TZ = guardada.valor;
  guardada = null;
}

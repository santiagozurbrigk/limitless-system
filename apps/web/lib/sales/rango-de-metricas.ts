/**
 * El rango del selector de métricas de ventas, en la zona de la organización
 * (SCRUM-493).
 *
 * El rango son dos instantes (`from`, `to`) con los que se filtran instantes
 * (último mensaje de una conversación, turno de una llamada) y que viajan a la
 * action como ISO. Se arman desde fechas calendario de la org: `from` es el
 * primer instante del día "desde" y `to`, el último instante del día "hasta",
 * los dos en la zona de la org. Así un miembro en otra zona elige, ve y filtra
 * los mismos días que la organización, y el tope del campo (el hoy de la org)
 * coincide con lo que se puede elegir.
 *
 * Lógica pura: no toca base ni red.
 */
import {
  fechaDeHoyEnZona,
  fechaDeInstanteEnZona,
  inicioDelDiaEnZona,
  sumarDias,
} from "@/lib/fechas/calendario";

export interface DateRange {
  from: Date;
  to: Date;
}

/** El rango que va del día `desde` al día `hasta` (ambos incluidos) en la zona de la org. */
export function rangoDeDias(desde: string, hasta: string, zona: string | null): DateRange {
  return {
    from: new Date(inicioDelDiaEnZona(desde, zona)),
    to: new Date(new Date(inicioDelDiaEnZona(sumarDias(hasta, 1), zona)).getTime() - 1),
  };
}

/** Los días (`YYYY-MM-DD`) de un rango, en la zona de la org: lo que muestran los campos. */
export function diasDelRango(
  rango: DateRange,
  zona: string | null
): { desde: string; hasta: string } {
  return {
    desde: fechaDeInstanteEnZona(rango.from.toISOString(), zona),
    hasta: fechaDeInstanteEnZona(rango.to.toISOString(), zona),
  };
}

/** Los atajos del selector. Cada uno termina hoy (en la org). */
export const PRESETS_DE_RANGO = [
  { label: "Este mes", desde: (hoy: string) => `${hoy.slice(0, 8)}01` },
  { label: "Últimos 30 d", desde: (hoy: string) => sumarDias(hoy, -30) },
  { label: "Últimos 90 d", desde: (hoy: string) => sumarDias(hoy, -90) },
] as const;

/** El rango de un atajo, hasta hoy en la org. */
export function rangoDelPreset(
  preset: (typeof PRESETS_DE_RANGO)[number],
  zona: string | null,
  ahora: Date = new Date()
): DateRange {
  const hoy = fechaDeHoyEnZona(zona, ahora);
  return rangoDeDias(preset.desde(hoy), hoy, zona);
}

/** El rango inicial: "este mes" en la org, del día 1 a hoy. */
export function rangoPorDefecto(zona: string | null, ahora: Date = new Date()): DateRange {
  return rangoDelPreset(PRESETS_DE_RANGO[0], zona, ahora);
}

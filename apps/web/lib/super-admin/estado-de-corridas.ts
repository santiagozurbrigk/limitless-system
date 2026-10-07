import type { UltimaCorridaDeProceso } from "@/types/super-admin";

/**
 * Cómo se muestra la última corrida de un cron en la página de Infraestructura
 * del super admin (SCRUM-85). Pura, para testearla sin la base.
 */

/**
 * Una corrida que sigue `en_curso` pasado este tiempo se cortó (el plazo de
 * Vercel la mató antes de cerrar) o quedó colgada. El cron más largo
 * (`daily-signals`) tiene 600 s de `maxDuration`; el monitor de Sentry usa 15 min.
 */
export const CORRIDA_SIN_CIERRE_MS = 15 * 60 * 1000;

export type TonoDeEstado = "ok" | "aviso" | "error" | "neutro";

export type VistaDeCorrida = {
  tono: TonoDeEstado;
  etiqueta: string;
  /** Orgs fallidas, mensaje de error o aclaración; `null` si no hay nada que agregar. */
  detalle: string | null;
};

function nombresDeFallidas(corrida: NonNullable<UltimaCorridaDeProceso["corrida"]>): string {
  const nombres = corrida.organizacionesFallidas.map((org) => org.nombre ?? org.id);
  const sinNombre = (corrida.orgsFallidas ?? 0) - nombres.length;
  if (sinNombre > 0) nombres.push(`${sinNombre} sin identificar`);
  return nombres.join(", ");
}

export function vistaDeCorrida(
  corrida: UltimaCorridaDeProceso["corrida"],
  ahora: Date
): VistaDeCorrida {
  if (!corrida) {
    return { tono: "neutro", etiqueta: "Sin corridas registradas", detalle: null };
  }

  if (corrida.estado === "en_curso") {
    const transcurrido = ahora.getTime() - new Date(corrida.inicio).getTime();
    return transcurrido > CORRIDA_SIN_CIERRE_MS
      ? {
          tono: "error",
          etiqueta: "Sin cierre",
          detalle: "Se cortó antes de terminar (por ejemplo, por el plazo de Vercel) o quedó colgada.",
        }
      : { tono: "neutro", etiqueta: "En curso", detalle: null };
  }

  const orgs =
    corrida.orgsProcesadas === null
      ? null
      : `${corrida.orgsProcesadas} ${corrida.orgsProcesadas === 1 ? "org procesada" : "orgs procesadas"}`;

  if (corrida.estado === "fallo") {
    return { tono: "error", etiqueta: "Falló", detalle: corrida.error ?? orgs };
  }

  if (corrida.estado === "parcial") {
    const fallidas = corrida.orgsFallidas ?? 0;
    return {
      tono: "aviso",
      etiqueta: `Parcial: ${fallidas} de ${corrida.orgsProcesadas ?? fallidas} orgs fallaron`,
      detalle: `Fallaron: ${nombresDeFallidas(corrida)}`,
    };
  }

  return { tono: "ok", etiqueta: "OK", detalle: orgs };
}

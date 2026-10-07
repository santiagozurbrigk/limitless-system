import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Las organizaciones que tocó la corrida de cron en curso (SCRUM-85).
 *
 * `conMonitorDeCron` abre una corrida por cada ejecución autorizada de un cron y
 * corre el handler dentro de este contexto. Lo que pasa por organización se
 * anota acá sin cambiar la firma de nadie:
 *   - `reportarFalla(error, { organizationId })` anota la org como fallida;
 *   - `publishCronFanout` anota cada job encolado (o no) por org: encolado no
 *     es terminado, lo que haga el worker va a Sentry;
 *   - las syncs de GHL, Calendly y Fathom anotan la org que terminó bien.
 *
 * Fuera de un cron (un worker de QStash, un botón, un test) no hay corrida y
 * anotar no hace nada. Sólo servidor: usa `node:async_hooks`.
 */
export type AnotacionesDeCorrida = {
  procesadas: Set<string>;
  fallidas: Set<string>;
  /** Orgs con su job de QStash publicado (crons con fan-out). */
  encoladas: Set<string>;
  /** La corrida publicó jobs por org (fan-out), aunque ninguno haya salido. */
  fanOut: boolean;
};

const corridaActual = new AsyncLocalStorage<AnotacionesDeCorrida>();

export function nuevasAnotaciones(): AnotacionesDeCorrida {
  return { procesadas: new Set(), fallidas: new Set(), encoladas: new Set(), fanOut: false };
}

/** Corre `trabajo` con `anotaciones` como la corrida en curso. */
export function correrEnCorrida<T>(anotaciones: AnotacionesDeCorrida, trabajo: () => Promise<T>): Promise<T> {
  return corridaActual.run(anotaciones, trabajo);
}

/**
 * Anota el resultado de una organización en la corrida en curso. Una org que
 * falló en algún paso queda fallida aunque otro paso la anote como `ok`.
 * No tira nunca.
 */
export function anotarOrganizacion(
  organizationId: string | null | undefined,
  resultado: "ok" | "fallo"
): void {
  const anotaciones = corridaActual.getStore();
  if (!anotaciones || !organizationId) return;
  anotaciones.procesadas.add(organizationId);
  if (resultado === "fallo") anotaciones.fallidas.add(organizationId);
}

/**
 * Anota el job de QStash de una org en la corrida en curso (fan-out). Si se
 * publicó, la org queda procesada y encolada; si no, fallida. No tira nunca.
 */
export function anotarJobDeOrganizacion(organizationId: string | null | undefined, publicado: boolean): void {
  const anotaciones = corridaActual.getStore();
  if (!anotaciones || !organizationId) return;
  anotaciones.fanOut = true;
  anotaciones.procesadas.add(organizationId);
  if (publicado) anotaciones.encoladas.add(organizationId);
  else anotaciones.fallidas.add(organizationId);
}

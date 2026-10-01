/**
 * lib/webhooks/reclamar.ts
 *
 * [EMBUDOS-WEBHOOK-PERDIDA] (SCRUM-6): "reclamar" un evento de webhook ya
 * guardado para volver a procesarlo, sin que dos procesos lo tomen a la vez.
 *
 * Se puede reclamar un evento que:
 *   - quedó en `error` (falló después de guardarlo);
 *   - quedó trabado en `pending`: el proceso se cortó entre guardarlo y
 *     terminar (timeout, deploy) y lleva más de `MINUTOS_PENDIENTE_TRABADO`.
 *
 * Reclamar es un UPDATE condicionado al estado que se leyó, que deja el evento
 * en `pending` con `processed_at = ahora`. Ese `processed_at` es la marca: otro
 * proceso que intente reclamar el mismo `pending` ya no cumple la condición
 * hasta que pasen otros `MINUTOS_PENDIENTE_TRABADO`. Al terminar,
 * `finish()` pisa `status` y `processed_at` con los definitivos.
 */

import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type TablaDeEventos = "payment_webhook_events" | "ghl_webhook_events";

/** Holgado, para no pisar un procesamiento que todavía está en curso. */
export const MINUTOS_PENDIENTE_TRABADO = 5;

export function limiteDePendienteTrabado(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - MINUTOS_PENDIENTE_TRABADO * 60_000).toISOString();
}

export type Reclamo<T> =
  /** Se tomó: procesarlo. */
  | { tipo: "reclamado"; fila: T }
  /** Ya terminó (`processed`/`unmapped`) o no hay fila de esta org: es un duplicado. */
  | { tipo: "terminado" }
  /** Lo está procesando otro proceso ahora: que el proveedor reintente más tarde. */
  | { tipo: "en_curso" };

const ESTADOS_TERMINADOS = ["processed", "unmapped", "duplicate"];

/**
 * Reclama el evento que cumpla `filtros` (columna → valor) y esté en `error` o
 * trabado en `pending`. Si no se puede, dice si es porque ya terminó o porque
 * otro proceso lo tiene en curso.
 */
export async function reclamarEvento<T>(
  admin: AdminClient,
  tabla: TablaDeEventos,
  filtros: Record<string, string>,
  columnas: string,
  ahora: Date = new Date()
): Promise<Reclamo<T>> {
  const limite = limiteDePendienteTrabado(ahora);
  const variantes = [
    { status: "error" },
    { status: "pending", processed_at: null },
    { status: "pending", processed_at: limite },
  ] as const;

  for (const variante of variantes) {
    let query = admin
      .from(tabla)
      .update({ status: "pending", error_message: null, processed_at: ahora.toISOString() });
    for (const [columna, valor] of Object.entries(filtros)) query = query.eq(columna, valor);
    query = query.eq("status", variante.status);
    if (variante.status === "pending") {
      query = query.lt("received_at", limite);
      query =
        variante.processed_at === null
          ? query.is("processed_at", null)
          : query.lt("processed_at", variante.processed_at);
    }

    const { data, error } = await query.select(columnas).maybeSingle();
    if (error) throw new Error(`No se pudo reclamar el evento en ${tabla}: ${error.message}`);
    if (data) return { tipo: "reclamado", fila: data as T };
  }

  let actual = admin.from(tabla).select("status");
  for (const [columna, valor] of Object.entries(filtros)) actual = actual.eq(columna, valor);
  const { data, error } = await actual.maybeSingle();
  if (error) throw new Error(`No se pudo leer el evento en ${tabla}: ${error.message}`);
  if (!data || ESTADOS_TERMINADOS.includes((data as { status: string }).status)) {
    return { tipo: "terminado" };
  }
  return { tipo: "en_curso" };
}

/** Error de la base que conserva el SQLSTATE, para decidir si reintentar sirve. */
export class ErrorDeBase extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ErrorDeBase";
  }
}

/**
 * Un error de datos (clase 22: fecha o número inválido) o de restricción
 * (clase 23) va a fallar igual en cada reintento. Responder 500 ahí sólo
 * genera reintentos inútiles: se responde 200, el evento queda en `error` y lo
 * recupera el reproceso cuando se corrija la causa.
 */
export function esErrorPermanente(error: unknown): boolean {
  const code = error instanceof ErrorDeBase ? error.code : undefined;
  return typeof code === "string" && (code.startsWith("22") || code.startsWith("23"));
}

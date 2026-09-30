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

/**
 * Reclama el evento que cumpla `filtros` (columna → valor) y esté en `error` o
 * trabado en `pending`. Devuelve la fila con `columnas`, o `null` si no había
 * nada para reclamar (ya procesado, en curso, o lo tomó otro proceso).
 */
export async function reclamarEvento<T>(
  admin: AdminClient,
  tabla: TablaDeEventos,
  filtros: Record<string, string>,
  columnas: string,
  ahora: Date = new Date()
): Promise<T | null> {
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
    if (data) return data as T;
  }
  return null;
}

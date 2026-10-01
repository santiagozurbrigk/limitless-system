/**
 * lib/webhooks/reprocesar.ts
 *
 * [EMBUDOS-WEBHOOK-PERDIDA] (SCRUM-6): reproceso de los eventos de pagos (Whop,
 * Commas) y de oportunidades de GHL que quedaron guardados en `unmapped`
 * (no se supo interpretar) o `error` (falló después de guardarlos), y los que
 * quedaron trabados en `pending` (ver `lib/webhooks/reclamar.ts`).
 *
 * Usa las mismas funciones que el webhook, sobre el payload guardado. Cada
 * evento se "reclama" antes de procesarlo, así que un reintento del proveedor
 * que llegue a la vez no lo procesa dos veces. Lo corre
 * `scripts/reprocesar-webhooks.ts`.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { procesarEventoDePago } from "@/lib/payments/ingest";
import { procesarEventoGHL } from "@/lib/ghl/ingest-opportunity-event";
import type { PaymentProvider } from "@/lib/payments/types";
import {
  limiteDePendienteTrabado,
  reclamarEvento,
  type TablaDeEventos,
} from "./reclamar";

type AdminClient = ReturnType<typeof createAdminClient>;

export const ESTADOS_A_REPROCESAR = ["unmapped", "error"] as const;

export type OpcionesReproceso = {
  /** Sin esto sólo se cuenta lo que se reprocesaría. */
  aplicar: boolean;
  organizationId?: string;
  limite: number;
};

export type ResumenReproceso = {
  tabla: TablaDeEventos;
  encontrados: number;
  procesados: number;
  siguenSinInterpretar: number;
  conError: number;
  /** Otro proceso lo tomó entre la lectura y el reclamo, o no tiene org. */
  omitidos: number;
};

type Fila = {
  id: string;
  organization_id: string | null;
  status: string;
  payload: Record<string, unknown>;
  received_at: string;
  provider?: PaymentProvider;
};

async function leerPendientes(
  admin: AdminClient,
  tabla: TablaDeEventos,
  opciones: OpcionesReproceso
): Promise<Fila[]> {
  const columnas =
    tabla === "payment_webhook_events"
      ? "id, organization_id, status, payload, received_at, provider"
      : "id, organization_id, status, payload, received_at";

  const base = () => admin.from(tabla).select(columnas);
  const consulta = (aplicarEstado: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    let q = aplicarEstado(base());
    if (opciones.organizationId) q = q.eq("organization_id", opciones.organizationId);
    return q.order("received_at", { ascending: true }).limit(opciones.limite);
  };

  const [fallidos, trabados] = await Promise.all([
    consulta((q) => q.in("status", [...ESTADOS_A_REPROCESAR])),
    consulta((q) => q.eq("status", "pending").lt("received_at", limiteDePendienteTrabado())),
  ]);
  const error = fallidos.error ?? trabados.error;
  if (error) throw new Error(`No se pudo leer ${tabla}: ${error.message}`);

  return ([...(fallidos.data ?? []), ...(trabados.data ?? [])] as unknown as Fila[])
    .sort((a, b) => a.received_at.localeCompare(b.received_at))
    .slice(0, opciones.limite);
}

/** `unmapped` se reclama acá; `error` y `pending` trabado, con `reclamarEvento`. */
async function reclamar(admin: AdminClient, tabla: TablaDeEventos, fila: Fila): Promise<boolean> {
  if (fila.status !== "unmapped") {
    return (await reclamarEvento(admin, tabla, { id: fila.id }, "id")).tipo === "reclamado";
  }
  const { data, error } = await admin
    .from(tabla)
    .update({ status: "pending", error_message: null, processed_at: new Date().toISOString() })
    .eq("id", fila.id)
    .eq("status", "unmapped")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`No se pudo reclamar el evento en ${tabla}: ${error.message}`);
  return Boolean(data);
}

async function reprocesarTabla(
  admin: AdminClient,
  tabla: TablaDeEventos,
  opciones: OpcionesReproceso
): Promise<ResumenReproceso> {
  const filas = await leerPendientes(admin, tabla, opciones);
  const resumen: ResumenReproceso = {
    tabla,
    encontrados: filas.length,
    procesados: 0,
    siguenSinInterpretar: 0,
    conError: 0,
    omitidos: 0,
  };
  if (!opciones.aplicar) return resumen;

  for (const fila of filas) {
    if (!fila.organization_id || !(await reclamar(admin, tabla, fila))) {
      resumen.omitidos++;
      continue;
    }
    const resultado =
      tabla === "payment_webhook_events"
        ? await procesarEventoDePago(admin, fila.id, fila.provider!, fila.organization_id, fila.payload)
        : await procesarEventoGHL(admin, fila.id, fila.organization_id, fila.payload, fila.received_at);

    if (resultado.status === "processed") resumen.procesados++;
    else if (resultado.status === "unmapped") resumen.siguenSinInterpretar++;
    else resumen.conError++;
  }
  return resumen;
}

export async function reprocesarWebhooks(
  admin: AdminClient,
  opciones: OpcionesReproceso
): Promise<ResumenReproceso[]> {
  return [
    await reprocesarTabla(admin, "payment_webhook_events", opciones),
    await reprocesarTabla(admin, "ghl_webhook_events", opciones),
  ];
}

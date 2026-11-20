/**
 * La lectura del Panel en el servidor (SCRUM-540). La llama la página del
 * Panel después de su guardia; no es un archivo `"use server"`, así que no se
 * puede invocar desde el navegador.
 */

import { repairClosingConversationLinks } from "@/lib/conversations/repair-links";
import { leerEntradasDelResumen } from "@/lib/finance/leer-configuracion";
import { fechaDeHoyEnZona } from "@/lib/fechas/calendario";
import { zonaDeLaOrganizacionActiva } from "@/lib/fechas/organizacion-activa";
import {
  leerConversaciones,
  leerMetricasImportadas,
} from "@/lib/marco/lecturas-de-servidor";
import { registrarFallaDeAccion } from "@/lib/server/action-result";
import { createClient } from "@/lib/supabase/server";
import { calcularDatosDelPanel, type DatosDelPanel } from "@/lib/dashboard/datos-del-panel";
import type { FrequentObjectionSummary } from "@/types/sales";

export async function leerDatosDelPanel(
  organizationId: string,
  frequentObjections: FrequentObjectionSummary[]
): Promise<DatosDelPanel & { pagosSinLeer: boolean }> {
  const supabase = await createClient();
  // Lo que hacían las actions del marco antes de leer llamadas y conversaciones.
  await repairClosingConversationLinks(supabase, organizationId);

  const [resumen, conversations, snapshots, zona] = await Promise.all([
    leerEntradasDelResumen(supabase, organizationId),
    leerConversaciones(supabase, organizationId),
    // Opcional, como en el navegador: si falla, se registra y el Panel sigue sin respaldo.
    leerMetricasImportadas(supabase, organizationId).catch((e: unknown) => {
      registrarFallaDeAccion("[leerDatosDelPanel] métricas importadas", e);
      return [];
    }),
    zonaDeLaOrganizacionActiva().catch((e: unknown) => {
      registrarFallaDeAccion("[leerDatosDelPanel] zona", e);
      return null;
    }),
  ]);

  const datos = calcularDatosDelPanel({
    ...resumen.entradas,
    conversations,
    metricasImportadas: snapshots[0]?.metrics ?? null,
    hoy: fechaDeHoyEnZona(zona),
    frequentObjections,
  });
  return { ...datos, pagosSinLeer: resumen.pagosSinLeer };
}

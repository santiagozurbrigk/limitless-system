/**
 * La última sesión 1-1 de cada cliente.
 *
 * ⭐ Una llamada cuenta como 1-1 cuando el clasificador resolvió que la
 * contraparte era **ese cliente** y que el propósito era **entrega**. Las dos
 * condiciones juntas: `purpose = 'delivery'` sin `client_id` es una entrega con
 * alguien que no se sabe quién es, y no sirve para llenar una columna que dice
 * el nombre de un cliente.
 *
 * ⭐ Lo que **no** cuenta: la llamada de cierre. Es con un lead, su propósito es
 * `sales`, y mostrarla como "última 1-1" sería decir que hubo una sesión de
 * acompañamiento el día que se firmó el contrato.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaDeHoyDeLaOrganizacion } from "@/lib/fechas/organizacion";
import {
  computeOneOnOneRhythm,
  computeOneOnOneStats,
  type LastOneOnOne,
  type OneOnOneStats,
} from "@/lib/fathom/one-on-one-types";

export type { LastOneOnOne, OneOnOneStats };

/**
 * La última 1-1 de cada cliente de la organización, en una consulta.
 *
 * Trae las entregas ordenadas de la más nueva a la más vieja y se queda con la
 * primera de cada cliente. Una consulta por cliente sería una por fila de la
 * tabla.
 */
export async function loadLastOneOnOneByClient(
  organizationId: string
): Promise<Record<string, LastOneOnOne>> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("fathom_calls")
    .select("client_id, call_date, resolution_method, title, fathom_url")
    .eq("organization_id", organizationId)
    .eq("purpose", "delivery")
    .not("client_id", "is", null)
    .not("call_date", "is", null)
    .order("call_date", { ascending: false });

  if (error) {
    // Sin esta columna la tabla muestra un guion. No se rompe la pantalla
    // entera por un dato que es un agregado.
    console.error("[fathom:one-on-ones]", error.message);
    return {};
  }

  const rows = (data ?? []) as {
    client_id: string;
    call_date: string;
    resolution_method: string | null;
    title: string | null;
    fathom_url: string | null;
  }[];

  const result: Record<string, LastOneOnOne> = {};
  /** Todas las fechas de cada cliente, para el total y el ritmo. */
  const fechasPorCliente: Record<string, string[]> = {};

  for (const row of rows) {
    (fechasPorCliente[row.client_id] ??= []).push(row.call_date);

    // Vienen ordenadas: la primera de cada cliente es la más reciente.
    if (result[row.client_id]) continue;
    result[row.client_id] = {
      date: row.call_date.slice(0, 10),
      resolutionMethod: row.resolution_method,
      title: row.title,
      fathomUrl: row.fathom_url,
      // Se completan abajo, cuando ya están todas las fechas del cliente.
      totalCalls: 0,
      everyDays: null,
    };
  }

  for (const [clientId, fechas] of Object.entries(fechasPorCliente)) {
    const stats = computeOneOnOneRhythm(fechas);
    const entrada = result[clientId];
    if (!entrada) continue;
    entrada.totalCalls = stats.totalCalls;
    entrada.everyDays = stats.everyDays;
  }

  return result;
}

/**
 * El contador de 1-1 de **un** cliente, para su ficha.
 *
 * Trae sólo las fechas: el listado completo de las llamadas lo carga aparte la
 * sección que las muestra, y traerlas dos veces sería pagar el transcript de
 * cada una para contar filas.
 */
export async function loadClientOneOnOneStats(
  organizationId: string,
  clientId: string
): Promise<OneOnOneStats> {
  const admin = createAdminClient();

  // "Hace cuántos días" se cuenta desde el hoy de la organización, no desde el
  // de UTC del servidor (SCRUM-493). Una lectura de la zona por pedido.
  const [{ data, error }, hoy] = await Promise.all([
    admin
      .from("fathom_calls")
      .select("call_date")
      .eq("organization_id", organizationId)
      .eq("client_id", clientId)
      .eq("purpose", "delivery")
      .not("call_date", "is", null),
    fechaDeHoyDeLaOrganizacion(admin, organizationId),
  ]);

  if (error) {
    console.error("[fathom:one-on-ones] stats", error.message);
    return computeOneOnOneStats([], hoy);
  }

  return computeOneOnOneStats(
    ((data ?? []) as { call_date: string }[]).map((row) => row.call_date),
    hoy
  );
}

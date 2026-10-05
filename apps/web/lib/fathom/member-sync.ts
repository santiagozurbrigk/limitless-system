/**
 * Sincronización de las grabaciones de Fathom de cada miembro con su propia key.
 *
 * ⭐ La usan el botón "Sincronizar mis llamadas" y, desde el 2026-10-03
 * (SCRUM-448), el cron horario `/api/integrations/fathom/sync`. El aviso de
 * Fathom (webhook) sigue siendo la vía instantánea, pero en la prueba real con
 * una cuenta de Fathom el aviso no llegó nunca aunque la grabación ya estaba
 * lista. Con el cron, cada grabación entra sola como mucho una hora después,
 * llegue o no el aviso.
 */
import { resolverVentanaDeSync } from "@/lib/fathom/sync-window";
import { calcularNuevoCursor, type ResultadoDeReunion } from "@/lib/fathom/cursor";
import { leerVentanaDeFathom, reportarDecisionDeCursor } from "@/lib/fathom/leer-ventana";
import { quedaTiempo, rotar } from "@/lib/fathom/plazo-del-cron";
import { marcarDescartadas, registrarFallasDeSync } from "@/lib/fathom/fallas-de-sync";
import { mensajeDeFathom } from "@/lib/fathom/api";
import { upsertFathomCallFromMeeting } from "@/lib/fathom/sync";
import { readMemberFathomKey } from "@/lib/fathom/member-key";
import { reportarFalla } from "@/lib/observability/reportar-falla";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type FilaMiembroFathom = {
  id: string;
  organization_id: string;
  user_id: string;
  encrypted_api_key: string | null;
  last_sync_at: string | null;
  connected_at: string | null;
  status: string | null;
  webhook_token: string | null;
};

/**
 * Qué conexiones sincroniza el cron.
 *
 * ⚠️ Sólo las que el miembro conectó desde la sección por miembro (tienen
 * `webhook_token`). Las filas que crea la conexión de la organización
 * (`connectFathomAction`) llevan la misma key que la cuenta del negocio: ya las
 * trae la sync de la organización, y sincronizarlas acá pondría a quien conectó
 * como dueño de todas las llamadas del negocio, que pasarían a ser privadas suyas.
 */
export function miembrosParaSincronizar(filas: FilaMiembroFathom[]): FilaMiembroFathom[] {
  return filas.filter(
    (fila) =>
      Boolean(fila.encrypted_api_key) &&
      Boolean(fila.webhook_token) &&
      fila.status !== "revoked"
  );
}

export async function sincronizarMiembroFathom(
  admin: Admin,
  fila: Pick<
    FilaMiembroFathom,
    "organization_id" | "user_id" | "encrypted_api_key" | "last_sync_at" | "connected_at"
  >,
  /** Plazo de la corrida del cron (`lib/fathom/plazo-del-cron.ts`). El botón no lo pasa. */
  plazo?: number
): Promise<{ synced: number; fallidas: number }> {
  if (!fila.encrypted_api_key) throw new Error("No tenés Fathom conectado");

  const apiKey = readMemberFathomKey(fila.encrypted_api_key, fila.organization_id, fila.user_id);
  const ventana = resolverVentanaDeSync(fila.last_sync_at, fila.connected_at);

  const ahora = new Date();
  let lectura;
  try {
    // Desde la conexión en adelante, igual que la sync de la organización.
    lectura = await leerVentanaDeFathom(apiKey, {
      desde: ventana.desde,
      ahora,
      maxPages: 5,
      plazo,
    });
  } catch (fallo) {
    throw new Error(mensajeDeFathom(fallo));
  }

  let synced = 0;
  let fallidas = 0;
  const resultados: ResultadoDeReunion[] = [];
  for (const meeting of lectura.meetings) {
    // El mismo upsert que la sync de la organización, con el dueño de la
    // grabación: una llamada sin vincular la ve sólo quien la grabó.
    const ok = await upsertFathomCallFromMeeting(admin, fila.organization_id, meeting, {
      userId: fila.user_id,
    });
    resultados.push({ meeting, guardada: ok });
    if (ok) synced += 1;
    else fallidas += 1;
  }

  // ⭐ La misma regla que la sync de la organización (SCRUM-36): el cursor
  // avanza con el `created_at` de lo guardado, nunca pasa de una que falló ni
  // de lo que quedó sin leer por el tope de páginas.
  // Cuenta las fallas por reunión desde la primera (`fathom_sync_fallas`): con
  // eso se decide cuándo dejar de reintentar una que falla siempre.
  const conexion = { organizationId: fila.organization_id, userId: fila.user_id };
  const conFallas = await registrarFallasDeSync(admin, conexion, resultados, ahora);
  const decision = calcularNuevoCursor({
    cursorAnterior: ventana.desde,
    lectura,
    resultados: conFallas,
    ahora,
  });
  await marcarDescartadas(admin, conexion, decision.descartadas, ahora);
  reportarDecisionDeCursor(decision, {
    organizationId: fila.organization_id,
    conexion: "miembro",
    userId: fila.user_id,
  });

  if (decision.avanza) {
    await admin
      .from("team_member_integrations")
      .update({ last_sync_at: decision.cursor })
      .eq("organization_id", fila.organization_id)
      .eq("user_id", fila.user_id)
      .eq("integration_type", "fathom");
  }

  return { synced, fallidas };
}

/**
 * Todas las conexiones por miembro, una por una. Una que falla no corta las
 * demás. Con `plazo`, pasado ese momento no se arranca ninguna más; con
 * `corrida`, el orden rota para que ningún miembro quede siempre último.
 */
export async function sincronizarTodosLosMiembrosFathom(options?: {
  plazo?: number;
  corrida?: number;
}): Promise<{
  miembros: number;
  ingested: number;
  fallidos: number;
  /** Los que no se empezaron por falta de tiempo; van en la próxima corrida. */
  postergados: number;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("team_member_integrations")
    .select(
      "id, organization_id, user_id, encrypted_api_key, last_sync_at, connected_at, status, webhook_token"
    )
    .eq("integration_type", "fathom");

  if (error) throw new Error(error.message);

  const filas = rotar(
    miembrosParaSincronizar((data ?? []) as FilaMiembroFathom[]),
    options?.corrida ?? 0
  );
  let ingested = 0;
  let fallidos = 0;
  let postergados = 0;

  for (const fila of filas) {
    if (!quedaTiempo(options?.plazo)) {
      postergados += 1;
      continue;
    }
    try {
      const resultado = await sincronizarMiembroFathom(admin, fila, options?.plazo);
      ingested += resultado.synced;
      if (resultado.fallidas > 0) fallidos += 1;
      await admin
        .from("team_member_integrations")
        .update({ status: "connected", last_error: null, last_error_at: null })
        .eq("id", fila.id)
        .eq("status", "error");
    } catch (fallo) {
      fallidos += 1;
      const mensaje = fallo instanceof Error ? fallo.message : String(fallo);
      console.error("[Fathom:member-sync]", fila.organization_id, mensaje);
      // El panel lo muestra en la fila del miembro, y Sentry avisa.
      await admin
        .from("team_member_integrations")
        .update({ status: "error", last_error: mensaje, last_error_at: new Date().toISOString() })
        .eq("id", fila.id);
      reportarFalla(fallo, {
        cron: "/api/integrations/fathom/sync",
        organizationId: fila.organization_id,
        provider: "fathom",
        extra: { conexion: "miembro" },
      });
    }
  }

  if (postergados) {
    console.warn("[Fathom:member-sync] Sin tiempo en esta corrida; quedan para la próxima:", postergados);
  }
  return { miembros: filas.length, ingested, fallidos, postergados };
}

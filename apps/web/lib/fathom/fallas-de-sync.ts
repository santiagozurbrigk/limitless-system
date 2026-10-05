/**
 * Registro persistido de las reuniones de Fathom que la sincronización no pudo
 * guardar (`fathom_sync_fallas`, SCRUM-36). Lleva la cuenta de intentos desde la
 * primera falla, que es con lo que `lib/fathom/cursor.ts` decide cuándo dejar de
 * reintentar una reunión.
 *
 * Si la tabla no se puede leer o escribir, la reunión que falló queda sin
 * registro: frena el cursor y no se descarta. Ante la duda se reintenta.
 */
import type { ResultadoDeReunion } from "@/lib/fathom/cursor";
import type { FathomMeetingRecord } from "@/lib/fathom/api";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/** De quién es la conexión: `userId` nulo = la de la organización. */
export type ConexionDeSync = { organizationId: string; userId: string | null };

type FilaDeFalla = {
  id: string;
  fathom_call_id: string;
  primera_falla_at: string;
  intentos: number;
  descartada_at: string | null;
};

/** La misma clave con la que se guarda la llamada (`fathom_calls.fathom_call_id`). */
export function claveDeReunion(meeting: FathomMeetingRecord): string {
  return String(meeting.recording_id ?? meeting.id);
}


/**
 * Anota el resultado de la corrida: suma un intento a cada reunión que falló
 * (o abre su registro) y borra el registro de las que se guardaron. Devuelve los
 * resultados con `falla` completo para `calcularNuevoCursor`.
 */
export async function registrarFallasDeSync(
  admin: Admin,
  conexion: ConexionDeSync,
  resultados: ResultadoDeReunion[],
  ahora: Date
): Promise<ResultadoDeReunion[]> {
  if (!resultados.length) return resultados;
  const claves = resultados.map((r) => claveDeReunion(r.meeting));

  let lectura = admin
    .from("fathom_sync_fallas")
    .select("id, fathom_call_id, primera_falla_at, intentos, descartada_at")
    .eq("organization_id", conexion.organizationId)
    .in("fathom_call_id", claves);
  lectura =
    conexion.userId === null
      ? lectura.is("user_id", null)
      : lectura.eq("user_id", conexion.userId);
  const { data, error } = await lectura;

  if (error) {
    console.error("[Fathom:sync] fathom_sync_fallas: no se pudo leer:", error.message);
    return resultados;
  }

  const existentes = new Map(
    ((data ?? []) as FilaDeFalla[]).map((fila) => [fila.fathom_call_id, fila])
  );
  const momento = ahora.toISOString();
  const salida: ResultadoDeReunion[] = [];
  const guardadasConRegistro: string[] = [];

  for (const resultado of resultados) {
    const clave = claveDeReunion(resultado.meeting);
    const existente = existentes.get(clave);

    if (resultado.guardada) {
      if (existente) guardadasConRegistro.push(existente.id);
      salida.push(resultado);
      continue;
    }

    // Una ya descartada que vuelve a llegar es porque alguien rebobinó el cursor
    // para recuperarla: la cuenta arranca de cero.
    if (existente && !existente.descartada_at) {
      const intentos = existente.intentos + 1;
      const { error: errorUpdate } = await admin
        .from("fathom_sync_fallas")
        .update({ intentos, ultima_falla_at: momento })
        .eq("id", existente.id);
      if (errorUpdate) {
        console.error("[Fathom:sync] fathom_sync_fallas: no se pudo actualizar:", errorUpdate.message);
        salida.push(resultado);
        continue;
      }
      salida.push({ ...resultado, falla: { primeraFallaAt: existente.primera_falla_at, intentos } });
      continue;
    }

    const nueva = {
      primera_falla_at: momento,
      ultima_falla_at: momento,
      intentos: 1,
      descartada_at: null,
      fathom_created_at: resultado.meeting.created_at ?? null,
    };
    const { error: errorEscritura } = existente
      ? await admin.from("fathom_sync_fallas").update(nueva).eq("id", existente.id)
      : await admin.from("fathom_sync_fallas").insert({
          ...nueva,
          organization_id: conexion.organizationId,
          user_id: conexion.userId,
          fathom_call_id: clave,
        });
    if (errorEscritura) {
      console.error("[Fathom:sync] fathom_sync_fallas: no se pudo registrar:", errorEscritura.message);
      salida.push(resultado);
      continue;
    }
    salida.push({ ...resultado, falla: { primeraFallaAt: momento, intentos: 1 } });
  }

  if (guardadasConRegistro.length) {
    const { error: errorBorrado } = await admin
      .from("fathom_sync_fallas")
      .delete()
      .in("id", guardadasConRegistro);
    if (errorBorrado) {
      // Queda un registro de más; si la reunión vuelve a fallar, sigue la cuenta.
      console.error("[Fathom:sync] fathom_sync_fallas: no se pudo borrar:", errorBorrado.message);
    }
  }

  return salida;
}

/** Marca las reuniones que se dejan de reintentar. Quedan para rastrearlas. */
export async function marcarDescartadas(
  admin: Admin,
  conexion: ConexionDeSync,
  descartadas: FathomMeetingRecord[],
  ahora: Date
): Promise<void> {
  if (!descartadas.length) return;
  let marca = admin
    .from("fathom_sync_fallas")
    .update({ descartada_at: ahora.toISOString() })
    .eq("organization_id", conexion.organizationId)
    .in("fathom_call_id", descartadas.map(claveDeReunion));
  marca =
    conexion.userId === null ? marca.is("user_id", null) : marca.eq("user_id", conexion.userId);
  const { error } = await marca;
  if (error) {
    console.error("[Fathom:sync] fathom_sync_fallas: no se pudo marcar descartadas:", error.message);
  }
}

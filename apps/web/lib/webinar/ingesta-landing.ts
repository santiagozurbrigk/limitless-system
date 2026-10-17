import type { SupabaseClient } from "@supabase/supabase-js";
import { FallaDeLaBase } from "@/lib/server/action-result";
import { validarEventoDeLanding, type EventoDeLanding } from "@/lib/webinar/normalize/evento";
import {
  datosQueCompletan,
  filaDeLaVisita,
  filaDelEventoRegistrado,
  filaDelLead,
  filaDelRegistro,
  motivoParaNoAsignar,
  MOTIVO_PAYLOAD_FUERA_DE_CONTRATO,
  type LanzamientoLeido,
  type RegistroGuardado,
} from "@/lib/webinar/normalize/filas";
import { mensajeDeFalla, type PasoDeNormalizacion } from "@/lib/webinar/normalize/reproceso";

/**
 * Ingesta de la landing de Limitless Webinars (SCRUM-528): guardar el crudo y
 * normalizarlo. Crudo primero (P2): el endpoint guarda el evento tal cual
 * llegó en `landing_events` y responde; la normalización corre después, fuera
 * del camino de la respuesta, y si falla el crudo queda y lo reprocesa el cron.
 *
 * Todas las consultas filtran (o escriben) `organization_id`: el que sale de
 * la clave de ingesta. El cliente es el admin (service role, sin RLS), así que
 * ese filtro es lo único que separa una organización de otra.
 *
 * Nada de acá manda a un log o a Sentry datos personales: los errores llevan
 * el paso y el SQLSTATE, nunca el texto de la base (que puede repetir valores
 * de la fila).
 */

/** Unique violation: la fila ya estaba (reenvío o reproceso). */
const YA_EXISTE = "23505";

export type EventoCrudo = {
  id: string;
  organization_id: string;
  kind: string;
  payload: unknown;
  received_at: string;
};

const COLUMNAS_DEL_CRUDO = "id, organization_id, kind, payload, received_at";

/**
 * Guarda el evento crudo en `pending`. Si la base falla, lanza `FallaDeLaBase`
 * con un texto fijo: el endpoint responde 500 y la landing reintenta.
 */
export async function guardarEventoCrudo(
  admin: SupabaseClient,
  organizationId: string,
  tipo: EventoDeLanding["type"],
  payload: unknown,
): Promise<EventoCrudo> {
  const { data, error } = await admin
    .from("landing_events")
    .insert({ organization_id: organizationId, kind: tipo, payload, status: "pending" })
    .select(COLUMNAS_DEL_CRUDO)
    .single();
  if (error || !data) {
    throw new FallaDeLaBase({
      message: "No se pudo guardar el evento crudo de la landing.",
      code: (error as { code?: string | null } | null)?.code ?? null,
    });
  }
  return data as EventoCrudo;
}

/** Falla de la base en un paso de la normalización: lleva el paso y el SQLSTATE, nada más. */
export class FallaDeNormalizacion extends Error {
  constructor(
    readonly paso: PasoDeNormalizacion,
    readonly codigo: string | null,
  ) {
    super(mensajeDeFalla(paso, codigo));
    this.name = "FallaDeNormalizacion";
  }
}

function fallo(paso: PasoDeNormalizacion, error: unknown): FallaDeNormalizacion {
  const codigo = (error as { code?: unknown } | null)?.code;
  return new FallaDeNormalizacion(paso, typeof codigo === "string" ? codigo : null);
}

export type ResultadoDeNormalizacion =
  | { estado: "processed" }
  | { estado: "unmapped"; motivo: string };

/**
 * ⭐ Normaliza un evento guardado: escribe el lead, el registro y su evento
 * `registered`, o la visita. No toca el estado del crudo (eso es
 * `cerrarEventoCrudo`). Si la base falla en un paso, lanza
 * `FallaDeNormalizacion`.
 *
 * Idempotente: se puede correr dos veces sobre el mismo evento (reenvío de la
 * landing o reproceso) sin duplicar nada. Cada escritura tiene su llave única
 * y un 23505 quiere decir "ya estaba"; el registro se queda con el primero.
 */
export async function normalizarEventoCrudo(
  admin: SupabaseClient,
  crudo: EventoCrudo,
): Promise<ResultadoDeNormalizacion> {
  const evento = validarEventoDeLanding(crudo.payload);
  if (!evento) return { estado: "unmapped", motivo: MOTIVO_PAYLOAD_FUERA_DE_CONTRATO };

  const organizationId = crudo.organization_id;
  const { data: lanzamiento, error: errorLanzamiento } = await admin
    .from("webinar_launches")
    .select("id, status")
    .eq("organization_id", organizationId)
    .eq("public_id", evento.launch_public_id)
    .maybeSingle();
  if (errorLanzamiento) throw fallo("lanzamiento", errorLanzamiento);

  const motivo = motivoParaNoAsignar(lanzamiento as LanzamientoLeido | null);
  if (motivo) return { estado: "unmapped", motivo };
  const launchId = (lanzamiento as LanzamientoLeido).id;

  if (evento.type === "visit") {
    const { error } = await admin
      .from("landing_visits")
      .insert(filaDeLaVisita(evento, { organizationId, launchId, recibidoEn: crudo.received_at }));
    if (error && error.code !== YA_EXISTE) throw fallo("visita", error);
    return { estado: "processed" };
  }

  const leadId = await asegurarLead(admin, evento, organizationId, crudo.received_at);

  const { error: errorRegistro } = await admin.from("launch_registrations").insert(
    filaDelRegistro(evento, {
      organizationId,
      launchId,
      leadId,
      eventoCrudoId: crudo.id,
      recibidoEn: crudo.received_at,
    }),
  );
  if (errorRegistro && errorRegistro.code !== YA_EXISTE) throw fallo("registro", errorRegistro);

  const guardado = await registroGuardado(
    admin,
    organizationId,
    evento.client_registration_id,
    launchId,
    leadId,
  );

  const { error: errorEvento } = await admin
    .from("lead_events")
    .insert(filaDelEventoRegistrado(guardado));
  if (errorEvento && errorEvento.code !== YA_EXISTE) throw fallo("evento", errorEvento);

  return { estado: "processed" };
}

/**
 * El id del lead de este email en la organización, creándolo si no existe
 * (`insert ... on conflict (organization_id, email_normalized) do nothing`).
 * Si ya existía, sólo se completan el nombre o el teléfono que le faltaban.
 */
async function asegurarLead(
  admin: SupabaseClient,
  evento: Extract<EventoDeLanding, { type: "registration" }>,
  organizationId: string,
  recibidoEn: string,
): Promise<string> {
  const fila = filaDelLead(evento, organizationId, recibidoEn);
  const { data: creados, error } = await admin
    .from("leads")
    .upsert(fila, { onConflict: "organization_id,email_normalized", ignoreDuplicates: true })
    .select("id");
  if (error) throw fallo("lead", error);
  const creado = (creados as Array<{ id: string }> | null)?.[0];
  if (creado) return creado.id;

  const { data: existente, error: errorLectura } = await admin
    .from("leads")
    .select("id, name, phone_e164")
    .eq("organization_id", organizationId)
    .eq("email_normalized", fila.email_normalized)
    .maybeSingle();
  if (errorLectura || !existente) throw fallo("lead", errorLectura);

  const lead = existente as { id: string; name: string | null; phone_e164: string | null };
  const cambios = datosQueCompletan(lead, fila);
  if (Object.keys(cambios).length > 0) {
    const { error: errorCambio } = await admin
      .from("leads")
      .update(cambios)
      .eq("organization_id", organizationId)
      .eq("id", lead.id);
    if (errorCambio) throw fallo("lead", errorCambio);
  }
  return lead.id;
}

const COLUMNAS_DEL_REGISTRO =
  "organization_id, launch_id, lead_id, client_registration_id, registered_at";

/**
 * El registro que quedó: el de este `client_registration_id` (un reenvío) o,
 * si no hay, el del lead en este lanzamiento con otro id (se queda el primero).
 */
async function registroGuardado(
  admin: SupabaseClient,
  organizationId: string,
  clientRegistrationId: string,
  launchId: string,
  leadId: string,
): Promise<RegistroGuardado> {
  const porId = await admin
    .from("launch_registrations")
    .select(COLUMNAS_DEL_REGISTRO)
    .eq("organization_id", organizationId)
    .eq("client_registration_id", clientRegistrationId)
    .maybeSingle();
  if (porId.error) throw fallo("registro", porId.error);
  if (porId.data) return porId.data as RegistroGuardado;

  const porLead = await admin
    .from("launch_registrations")
    .select(COLUMNAS_DEL_REGISTRO)
    .eq("organization_id", organizationId)
    .eq("launch_id", launchId)
    .eq("lead_id", leadId)
    .maybeSingle();
  if (porLead.error || !porLead.data) throw fallo("registro", porLead.error);
  return porLead.data as RegistroGuardado;
}

export type CierreDelEvento =
  | { status: "processed" }
  | { status: "unmapped"; motivo: string }
  | { status: "error"; mensaje: string };

/**
 * Deja el crudo en su estado final, sólo si sigue en `pending` (el que lo
 * reclamó es quien lo cierra). `processed` y `unmapped` llevan `processed_at`;
 * `unmapped` y `error`, su motivo en `error_message` (texto fijo). Devuelve si
 * se cerró; si la base falla, `false`: el evento queda en `pending` y el cron
 * lo levanta como trabado.
 */
export async function cerrarEventoCrudo(
  admin: SupabaseClient,
  crudo: Pick<EventoCrudo, "id" | "organization_id">,
  cierre: CierreDelEvento,
  ahora: Date = new Date(),
): Promise<boolean> {
  const cambios =
    cierre.status === "processed"
      ? { status: "processed", error_message: null, processed_at: ahora.toISOString() }
      : cierre.status === "unmapped"
        ? { status: "unmapped", error_message: cierre.motivo, processed_at: ahora.toISOString() }
        : { status: "error", error_message: cierre.mensaje, processed_at: ahora.toISOString() };
  try {
    const { data, error } = await admin
      .from("landing_events")
      .update(cambios)
      .eq("organization_id", crudo.organization_id)
      .eq("id", crudo.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    return !error && Boolean(data);
  } catch {
    return false;
  }
}

export type ResultadoDeProceso =
  | { status: "processed" }
  | { status: "unmapped" }
  | { status: "error"; paso: PasoDeNormalizacion; codigo: string | null }
  /** Normalizó (o no) pero no pudo escribir el estado final. */
  | { status: "sin_cerrar" };

/**
 * Normaliza y cierra el crudo. `reproceso` es el número de reproceso del
 * cron (0 para el intento del endpoint): define el texto del error. No lanza
 * nunca: corre en `after` o en el cron, donde una excepción no tiene quién la
 * atienda.
 */
export async function procesarEventoCrudo(
  admin: SupabaseClient,
  crudo: EventoCrudo,
  reproceso: number = 0,
): Promise<ResultadoDeProceso> {
  let cierre: CierreDelEvento;
  let resultado: ResultadoDeProceso;
  try {
    const normalizado = await normalizarEventoCrudo(admin, crudo);
    if (normalizado.estado === "processed") {
      cierre = { status: "processed" };
      resultado = { status: "processed" };
    } else {
      cierre = { status: "unmapped", motivo: normalizado.motivo };
      resultado = { status: "unmapped" };
    }
  } catch (error) {
    const paso = error instanceof FallaDeNormalizacion ? error.paso : "desconocido";
    const codigo = error instanceof FallaDeNormalizacion ? error.codigo : null;
    cierre = { status: "error", mensaje: mensajeDeFalla(paso, codigo, reproceso) };
    resultado = { status: "error", paso, codigo };
  }
  const cerrado = await cerrarEventoCrudo(admin, crudo, cierre);
  return cerrado ? resultado : { status: "sin_cerrar" };
}

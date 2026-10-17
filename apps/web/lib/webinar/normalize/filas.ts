import { normalizarEmail, telefonoE164 } from "@/lib/webinar/identity";
import type { RegistroDeLanding, VisitaDeLanding } from "./evento";

/**
 * De un evento de la landing ya validado a las filas que se escriben
 * (SCRUM-528). Puro: no lee la base ni el reloj; la hora en que llegó el
 * evento la pasa quien llama.
 */

/** Cuándo pasó: lo que dice la landing, o la hora en que llegó si no lo dice. */
export function momentoDelEvento(
  evento: { occurred_at: string | null },
  recibidoEn: string,
): string {
  return new Date(evento.occurred_at ?? recibidoEn).toISOString();
}

/**
 * El día de una visita, en UTC (`YYYY-MM-DD`). Es parte de la llave
 * `(launch_id, visitor_id, day)`: tiene que dar lo mismo en cualquier servidor
 * y con cualquier `TZ`, así que no usa la zona local.
 */
export function diaUtc(momento: string): string {
  return new Date(momento).toISOString().slice(0, 10);
}

export type LanzamientoLeido = { id: string; status: string };

export const MOTIVO_LANZAMIENTO_DESCONOCIDO =
  "Lanzamiento desconocido: el launch_public_id no es de un lanzamiento de esta organización.";
export const MOTIVO_LANZAMIENTO_CERRADO = "Lanzamiento cerrado: no recibe registros ni visitas.";
export const MOTIVO_PAYLOAD_FUERA_DE_CONTRATO =
  "El payload guardado no cumple el contrato de la landing.";

/**
 * Por qué un evento no se puede asignar a su lanzamiento, o `null` si se
 * puede. Desconocido (no existe en la organización de la clave) o cerrado:
 * el evento queda `unmapped` con este motivo, sin descartarlo. Un borrador
 * (`draft`) sí recibe: es como se prueba la landing antes de abrir.
 */
export function motivoParaNoAsignar(lanzamiento: LanzamientoLeido | null): string | null {
  if (!lanzamiento) return MOTIVO_LANZAMIENTO_DESCONOCIDO;
  if (lanzamiento.status === "closed") return MOTIVO_LANZAMIENTO_CERRADO;
  return null;
}

export type FilaDeLead = {
  organization_id: string;
  email: string;
  email_normalized: string;
  name: string | null;
  phone_e164: string | null;
  first_seen_at: string;
};

export function filaDelLead(
  evento: RegistroDeLanding,
  organizationId: string,
  recibidoEn: string,
): FilaDeLead {
  return {
    organization_id: organizationId,
    email: evento.email,
    email_normalized: normalizarEmail(evento.email),
    name: evento.name,
    phone_e164: telefonoE164(evento.phone),
    first_seen_at: momentoDelEvento(evento, recibidoEn),
  };
}

/**
 * Qué datos le faltan a un lead que ya existía y trae este registro. El lead
 * se queda con lo primero que se supo de él; un registro posterior sólo
 * completa lo que estaba vacío (nunca pisa un nombre ni un teléfono).
 */
export function datosQueCompletan(
  existente: { name: string | null; phone_e164: string | null },
  nuevo: Pick<FilaDeLead, "name" | "phone_e164">,
): Partial<Pick<FilaDeLead, "name" | "phone_e164">> {
  const cambios: Partial<Pick<FilaDeLead, "name" | "phone_e164">> = {};
  if (!existente.name && nuevo.name) cambios.name = nuevo.name;
  if (!existente.phone_e164 && nuevo.phone_e164) cambios.phone_e164 = nuevo.phone_e164;
  return cambios;
}

export type FilaDeRegistro = {
  organization_id: string;
  launch_id: string;
  lead_id: string;
  client_registration_id: string;
  registered_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  sl: string | null;
  ab_variant: string | null;
  qualification: string | null;
  raw_event_id: string;
};

export function filaDelRegistro(
  evento: RegistroDeLanding,
  contexto: {
    organizationId: string;
    launchId: string;
    leadId: string;
    eventoCrudoId: string;
    recibidoEn: string;
  },
): FilaDeRegistro {
  const t = evento.tracking;
  return {
    organization_id: contexto.organizationId,
    launch_id: contexto.launchId,
    lead_id: contexto.leadId,
    client_registration_id: evento.client_registration_id,
    registered_at: momentoDelEvento(evento, contexto.recibidoEn),
    utm_source: t?.utm_source ?? null,
    utm_medium: t?.utm_medium ?? null,
    utm_campaign: t?.utm_campaign ?? null,
    utm_content: t?.utm_content ?? null,
    utm_term: t?.utm_term ?? null,
    fbclid: t?.fbclid ?? null,
    sl: t?.sl ?? null,
    ab_variant: evento.ab_variant,
    qualification: evento.qualification,
    raw_event_id: contexto.eventoCrudoId,
  };
}

/** El registro que quedó en la base (el primero), del que sale el evento `registered`. */
export type RegistroGuardado = {
  organization_id: string;
  launch_id: string;
  lead_id: string;
  client_registration_id: string;
  registered_at: string;
};

export type FilaDeEventoDelLead = {
  organization_id: string;
  lead_id: string;
  launch_id: string;
  kind: "registered";
  occurred_at: string;
  source: "landing";
  source_ref: string;
};

/**
 * El evento `registered` sale del registro guardado, no del que acaba de
 * llegar: si el lead ya estaba registrado en el lanzamiento con otro
 * `client_registration_id`, el evento es el de aquel registro y la llave
 * `(organization_id, source, source_ref, kind)` no deja un segundo.
 */
export function filaDelEventoRegistrado(registro: RegistroGuardado): FilaDeEventoDelLead {
  return {
    organization_id: registro.organization_id,
    lead_id: registro.lead_id,
    launch_id: registro.launch_id,
    kind: "registered",
    occurred_at: registro.registered_at,
    source: "landing",
    source_ref: registro.client_registration_id,
  };
}

export type FilaDeVisita = {
  organization_id: string;
  launch_id: string;
  visitor_id: string;
  day: string;
};

export function filaDeLaVisita(
  evento: VisitaDeLanding,
  contexto: { organizationId: string; launchId: string; recibidoEn: string },
): FilaDeVisita {
  return {
    organization_id: contexto.organizationId,
    launch_id: contexto.launchId,
    visitor_id: evento.visitor_id,
    day: diaUtc(momentoDelEvento(evento, contexto.recibidoEn)),
  };
}

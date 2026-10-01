/**
 * lib/ghl/opportunity-event.ts
 *
 * Normaliza un webhook de oportunidad de GoHighLevel a una forma estable.
 *
 * Puro: no toca la base ni la red. Todo lo que hace IO vive en
 * `ingest-opportunity-event.ts`.
 *
 * ⚠️ DOS FORMAS DE PAYLOAD, UNA SOLA VERIFICADA
 *
 * 1. **Webhook de plataforma** (app del Marketplace). Verificado el 2026-08-30
 *    contra docs/external-apis/gohighlevel/webhook/OpportunityStageUpdate.md:
 *    el objeto llega **plano en la raíz**, con
 *    `type, locationId, id, assignedTo, contactId, monetaryValue, name,
 *    pipelineId, pipelineStageId, source, status, dateAdded`.
 *
 * 2. **Webhook de Workflow** (acción "Webhook" dentro de un Workflow de GHL).
 *    Es la vía que no necesita app del Marketplace, y **su payload no está
 *    documentado**: lo arma quien configura el workflow. Por eso el normalizador
 *    busca los campos también bajo `data`, `customData` y `opportunity`.
 *    Anotado en `docs/integraciones/apis-sin-documentacion.md` — hay que fijarlo con el primer
 *    payload real.
 *
 * Un evento del que no se puede sacar el id de la oportunidad se devuelve como
 * `unmapped` con su motivo. No se inventa un id ni se asume una etapa: un
 * conteo derivado de un evento mal leído es peor que un conteo faltante.
 */

/** Tipos de evento de oportunidad que GHL publica. */
export const GHL_OPPORTUNITY_EVENT_TYPES = [
  "OpportunityCreate",
  "OpportunityUpdate",
  "OpportunityStageUpdate",
  "OpportunityStatusUpdate",
  "OpportunityMonetaryValueUpdate",
  "OpportunityAssignedToUpdate",
  "OpportunityDelete",
] as const;

export type GHLOpportunityEventType = (typeof GHL_OPPORTUNITY_EVENT_TYPES)[number];

export type NormalizedOpportunityEvent = {
  eventType: GHLOpportunityEventType;
  /** Id del evento en GHL, para deduplicar reentregas. `null` si no vino. */
  eventId: string | null;
  opportunityId: string;
  locationId: string | null;
  contactId: string | null;
  pipelineId: string | null;
  stageId: string | null;
  status: string | null;
  name: string | null;
  source: string | null;
  monetaryValue: number | null;
  /** Fecha de creación de la oportunidad. NO es la fecha del cambio de etapa. */
  dateAdded: string | null;
  isDelete: boolean;
};

export type NormalizeResult =
  | { kind: "event"; event: NormalizedOpportunityEvent }
  | { kind: "unmapped"; reason: string };

type Bag = Record<string, unknown>;

function isBag(value: unknown): value is Bag {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Capas donde puede estar el objeto de la oportunidad, en orden de preferencia.
 *
 * La raíz primero porque es la única forma verificada (webhook de plataforma).
 */
function layers(body: Bag): Bag[] {
  const found: Bag[] = [body];
  for (const key of ["data", "opportunity", "customData"]) {
    const nested = body[key];
    if (isBag(nested)) found.push(nested);
  }
  return found;
}

function pickString(body: Bag, keys: string[]): string | null {
  for (const layer of layers(body)) {
    for (const key of keys) {
      const value = layer[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
  }
  return null;
}

function pickNumber(body: Bag, keys: string[]): number | null {
  for (const layer of layers(body)) {
    for (const key of keys) {
      const value = layer[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return null;
}

export function isOpportunityEventType(value: string): value is GHLOpportunityEventType {
  return (GHL_OPPORTUNITY_EVENT_TYPES as readonly string[]).includes(value);
}

/** Id del evento, para deduplicar. GHL lo manda como `webhookId`. */
export function extractGHLEventId(body: unknown): string | null {
  if (!isBag(body)) return null;
  return pickString(body, ["webhookId", "webhook_id", "eventId", "id_event"]);
}

export function extractGHLEventType(body: unknown): string | null {
  if (!isBag(body)) return null;
  return pickString(body, ["type", "event", "eventType"]);
}

/**
 * [EMBUDOS-WEBHOOK-PERDIDA] (SCRUM-6): `dateAdded` de la vía Workflow lo arma
 * el cliente y puede venir en cualquier formato. Si no es una fecha, se guarda
 * `null` en vez de mandar a la base un valor que hace fallar todo el evento.
 */
function fechaValida(valor: string | null): string | null {
  if (!valor) return null;
  const ms = Date.parse(valor);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function normalizeOpportunityEvent(body: unknown): NormalizeResult {
  if (!isBag(body)) return { kind: "unmapped", reason: "El cuerpo no es un objeto" };

  const rawType = extractGHLEventType(body);
  if (!rawType) return { kind: "unmapped", reason: "El evento no declara tipo" };
  if (!isOpportunityEventType(rawType)) {
    return { kind: "unmapped", reason: `Tipo no es de oportunidad: ${rawType}` };
  }

  // `id` en la raíz es el id de la oportunidad en el webhook de plataforma.
  // `opportunityId` cubre la vía de workflow, donde `id` puede ser el contacto.
  const opportunityId = pickString(body, ["opportunityId", "opportunity_id", "id"]);
  if (!opportunityId) {
    return { kind: "unmapped", reason: "El evento no trae id de oportunidad" };
  }

  return {
    kind: "event",
    event: {
      eventType: rawType,
      eventId: extractGHLEventId(body),
      opportunityId,
      locationId: pickString(body, ["locationId", "location_id"]),
      contactId: pickString(body, ["contactId", "contact_id"]),
      pipelineId: pickString(body, ["pipelineId", "pipeline_id"]),
      stageId: pickString(body, ["pipelineStageId", "pipeline_stage_id", "stageId"]),
      status: pickString(body, ["status"]),
      name: pickString(body, ["name"]),
      source: pickString(body, ["source"]),
      monetaryValue: pickNumber(body, ["monetaryValue", "monetary_value"]),
      dateAdded: fechaValida(pickString(body, ["dateAdded", "date_added"])),
      isDelete: rawType === "OpportunityDelete",
    },
  };
}

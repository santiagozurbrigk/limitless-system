import { describe, expect, it } from "vitest";
import {
  extractGHLEventId,
  extractGHLEventType,
  normalizeOpportunityEvent,
} from "../opportunity-event";

/**
 * El payload de referencia es el que la doc de GHL publica literalmente en
 * webhook/OpportunityStageUpdate.md.
 */
const PLATFORM_EVENT = {
  type: "OpportunityStageUpdate",
  locationId: "ve9EPM428h8vShlRW1KT",
  id: "wWhVuzqpRuOA1ZVWi4FC",
  assignedTo: "bNl8QNGXhIQJLv8eeASQ",
  contactId: "cJAWDskpkJHbRbhAT7bs",
  monetaryValue: 40,
  name: "Loram ipsu",
  pipelineId: "VDm7RPYC2GLUvdpKmBfC",
  pipelineStageId: "e93ba61a-53b3-45e7-985a-c7732dbcdb69",
  source: "Loram ipsu",
  status: "open",
  dateAdded: "2021-11-26T12:41:02.193Z",
};

describe("normalizeOpportunityEvent", () => {
  it("lee el payload plano del webhook de plataforma", () => {
    const result = normalizeOpportunityEvent(PLATFORM_EVENT);
    expect(result.kind).toBe("event");
    if (result.kind !== "event") return;

    expect(result.event.opportunityId).toBe("wWhVuzqpRuOA1ZVWi4FC");
    expect(result.event.pipelineId).toBe("VDm7RPYC2GLUvdpKmBfC");
    expect(result.event.stageId).toBe("e93ba61a-53b3-45e7-985a-c7732dbcdb69");
    expect(result.event.status).toBe("open");
    expect(result.event.monetaryValue).toBe(40);
    expect(result.event.isDelete).toBe(false);
  });

  it("lee la oportunidad anidada bajo data (vía de workflow)", () => {
    const result = normalizeOpportunityEvent({
      type: "OpportunityStageUpdate",
      data: { opportunityId: "opp_1", pipelineStageId: "stage_2" },
    });
    expect(result.kind).toBe("event");
    if (result.kind !== "event") return;
    expect(result.event.opportunityId).toBe("opp_1");
    expect(result.event.stageId).toBe("stage_2");
  });

  it("prefiere opportunityId sobre id cuando vienen los dos", () => {
    // En la vía de workflow, `id` puede ser el id del contacto: leerlo como
    // oportunidad mezclaría dos entidades distintas en la misma tabla.
    const result = normalizeOpportunityEvent({
      type: "OpportunityUpdate",
      id: "contacto_no_es_oportunidad",
      opportunityId: "opp_real",
    });
    expect(result.kind).toBe("event");
    if (result.kind !== "event") return;
    expect(result.event.opportunityId).toBe("opp_real");
  });

  it("marca unmapped un evento sin id de oportunidad", () => {
    const result = normalizeOpportunityEvent({ type: "OpportunityCreate" });
    expect(result.kind).toBe("unmapped");
    if (result.kind !== "unmapped") return;
    expect(result.reason).toContain("id de oportunidad");
  });

  it("marca unmapped un evento que no es de oportunidad", () => {
    const result = normalizeOpportunityEvent({ type: "ContactCreate", id: "c1" });
    expect(result.kind).toBe("unmapped");
  });

  it("marca unmapped un cuerpo que no es objeto", () => {
    expect(normalizeOpportunityEvent(null).kind).toBe("unmapped");
    expect(normalizeOpportunityEvent("texto").kind).toBe("unmapped");
    expect(normalizeOpportunityEvent([1, 2]).kind).toBe("unmapped");
  });

  it("reconoce la baja", () => {
    const result = normalizeOpportunityEvent({ ...PLATFORM_EVENT, type: "OpportunityDelete" });
    expect(result.kind).toBe("event");
    if (result.kind !== "event") return;
    expect(result.event.isDelete).toBe(true);
  });

  it("no inventa valores: lo que no vino queda en null", () => {
    const result = normalizeOpportunityEvent({ type: "OpportunityCreate", id: "opp_1" });
    expect(result.kind).toBe("event");
    if (result.kind !== "event") return;
    expect(result.event.stageId).toBeNull();
    expect(result.event.monetaryValue).toBeNull();
    expect(result.event.status).toBeNull();
    expect(result.event.pipelineId).toBeNull();
  });
});

describe("extractGHLEventId / extractGHLEventType", () => {
  it("saca el webhookId para deduplicar", () => {
    expect(extractGHLEventId({ webhookId: "wh_1" })).toBe("wh_1");
  });

  it("devuelve null si no hay id de evento", () => {
    expect(extractGHLEventId(PLATFORM_EVENT)).toBeNull();
  });

  it("saca el tipo aunque el evento no sea de oportunidad", () => {
    expect(extractGHLEventType({ type: "ContactCreate" })).toBe("ContactCreate");
  });
});

describe("dateAdded (SCRUM-6)", () => {
  it("una fecha que no se puede leer queda en null, sin descartar el evento", () => {
    const r = normalizeOpportunityEvent({ ...PLATFORM_EVENT, dateAdded: "26/11/2021" });
    expect(r.kind).toBe("event");
    if (r.kind === "event") expect(r.event.dateAdded).toBeNull();
  });

  it("una fecha válida se normaliza a ISO", () => {
    const r = normalizeOpportunityEvent(PLATFORM_EVENT);
    if (r.kind === "event") expect(r.event.dateAdded).toBe("2021-11-26T12:41:02.193Z");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-504 (AR pasada 2, MAYOR-2): el recorrido del lead ya no descarta los
 * errores de la base. La conversación es la lectura principal: si falla, lanza
 * `FallaDeLaBase` (la acción devuelve el texto fijo). Cada fuente opcional que
 * falla se registra una vez y va a `faltan`; el resto del recorrido llega
 * igual. Zernio sin conectar no es una falla.
 */

type Fila = Record<string, unknown>;

const sim = vi.hoisted(() => ({
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
  tablas: {} as Record<string, Fila[]>,
  errores: {} as Record<string, { message: string } | null>,
  filtrosOrg: {} as Record<string, unknown[]>,
  apiKeyZernio: null as string | null,
  comentariosFallan: false,
  comentarios: [] as unknown[],
}));

vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));
vi.mock("@/lib/zernio/integration", () => ({
  getZernioApiKeyForOrganization: async () => sim.apiKeyZernio,
}));
vi.mock("@/lib/zernio/client", () => ({
  createZernioClient: () => ({
    getPostComments: async () => {
      if (sim.comentariosFallan) throw new Error("Zernio 500");
      return { comments: sim.comentarios };
    },
  }),
}));

function clienteFalso() {
  return {
    from(tabla: string) {
      const filtros: Array<[string, unknown]> = [];
      const leer = () => {
        const error = sim.errores[tabla] ?? null;
        if (error) return { data: null, error };
        return {
          data: (sim.tablas[tabla] ?? []).filter((f) => filtros.every(([c, v]) => f[c] === v)),
          error: null,
        };
      };
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        ilike: () => builder,
        not: () => builder,
        eq(columna: string, valor: unknown) {
          filtros.push([columna, valor]);
          if (columna === "organization_id") (sim.filtrosOrg[tabla] ??= []).push(valor);
          return builder;
        },
        maybeSingle: async () => {
          const { data, error } = leer();
          return { data: data?.[0] ?? null, error };
        },
        then(resolver: (r: unknown) => void) {
          resolver(leer());
        },
      };
      return builder;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => clienteFalso() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => clienteFalso() }));

import { getLeadJourney, getZernioLeadJourney } from "../lead-journey";
import { FallaDeLaBase } from "@/lib/server/action-result";

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.reportes = [];
  sim.errores = {};
  sim.filtrosOrg = {};
  sim.apiKeyZernio = null;
  sim.comentariosFallan = false;
  sim.comentarios = [];
  sim.tablas = {
    conversations: [
      {
        id: "conv-1",
        organization_id: "org-1",
        lead_name: "Ana",
        source: "instagram",
        source_video_title: "Mi video",
        utm_campaign: null,
        utm_link_id: "utm-1",
        external_ref: "manychat:sub-1",
        created_at: "2026-09-01T10:00:00Z",
        messages: [{ sender: "lead", content: "Hola", timestamp: "2026-09-01T11:00:00Z" }],
        utm_link: null,
      },
      { id: "conv-ajena", organization_id: "org-2", lead_name: "Ana", messages: [], created_at: "2026-09-01T10:00:00Z" },
    ],
    closing_calls: [
      { id: "call-1", organization_id: "org-1", conversation_id: "conv-1", scheduled_at: "2026-09-05T15:00:00Z", status: "closed", lead_name: "Ana" },
    ],
    clients: [
      { id: "cli-1", organization_id: "org-1", closing_call_id: "call-1", name: "Ana", created_at: "2026-09-06T10:00:00Z", total_amount: 1000 },
    ],
    manychat_events: [
      { organization_id: "org-1", subscriber_id: "sub-1", event_type: "tag_added", tag: "interesado", flow_name: null, triggered_at: "2026-09-01T10:30:00Z" },
    ],
    utm_links: [],
    content_assets: [],
    content_pieces: [
      { id: "p1", organization_id: "org-1", platform_post_id: "post-1", type: "reel", title: "Reel", caption: null },
      { id: "p2", organization_id: "org-1", platform_post_id: "post-2", type: "reel", title: "Reel 2", caption: null },
      { id: "p3", organization_id: "org-1", platform_post_id: "post-3", type: "reel", title: "Reel 3", caption: null },
    ],
    utm_booking_attributions: [{ organization_id: "org-1", utm_link_id: "utm-1", booked_at: "2026-09-04T10:00:00Z" }],
  };
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consola.mockRestore());

const tipos = (r: { pasos: Array<{ type: string }> }) => r.pasos.map((p) => p.type);
const zernio = { zernioAccountId: "acc", zernioParticipantId: "ig-1", zernioParticipantName: "Ana" };

describe("getLeadJourney", () => {
  it("con todo bien arma el recorrido completo de la organización, sin faltantes", async () => {
    const r = await getLeadJourney("org-1", "conv-1");
    expect(tipos(r)).toEqual(["content", "cta", "dm", "booking", "sale"]);
    expect(r.faltan).toEqual([]);
    expect(sim.reportes).toEqual([]);
  });

  it("una conversación de otra organización no existe: recorrido vacío", async () => {
    await expect(getLeadJourney("org-1", "conv-ajena")).resolves.toEqual({ pasos: [], faltan: [] });
  });

  it("⭐ si la lectura de la conversación falla, lanza FallaDeLaBase (antes: \"Sin recorrido registrado\")", async () => {
    sim.errores.conversations = { message: "TypeError: fetch failed" };
    await expect(getLeadJourney("org-1", "conv-1")).rejects.toBeInstanceOf(FallaDeLaBase);
  });

  it.each([
    // Sin poder leer la llamada, la agenda sale de la atribución por UTM.
    ["closing_calls", "la llamada", ["content", "cta", "dm", "booking"]],
    ["clients", "la venta", ["content", "cta", "dm", "booking"]],
    ["manychat_events", "los CTA de ManyChat", ["content", "dm", "booking", "sale"]],
    ["utm_links", "el contenido", ["content", "cta", "dm", "booking", "sale"]],
  ])("⭐ con %s caído, el resto llega, falta %s y se reporta una vez", async (tabla, fuente, esperados) => {
    sim.errores[tabla] = { message: "TypeError: fetch failed" };
    const r = await getLeadJourney("org-1", "conv-1");
    expect(tipos(r)).toEqual(esperados);
    expect(r.faltan).toEqual([fuente]);
    expect(sim.reportes).toEqual([
      {
        error: expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" }),
        contexto: { accion: `[getLeadJourney] ${fuente}` },
      },
    ]);
  });

  it("⭐ sin llamada, la atribución caída falta y se reporta", async () => {
    sim.tablas.closing_calls = [];
    sim.errores.utm_booking_attributions = { message: "TypeError: fetch failed" };
    const r = await getLeadJourney("org-1", "conv-1");
    expect(r.faltan).toEqual(["la atribución"]);
    expect(sim.reportes).toHaveLength(1);
  });

  it("sin llamada, la atribución por UTM suma el paso de agenda", async () => {
    sim.tablas.closing_calls = [];
    const r = await getLeadJourney("org-1", "conv-1");
    expect(tipos(r)).toContain("booking");
  });

  it("⭐ Zernio sin conectar no es falla: no avisa ni reporta", async () => {
    sim.apiKeyZernio = null;
    const r = await getLeadJourney("org-1", "conv-1", zernio);
    expect(r.faltan).toEqual([]);
    expect(sim.reportes).toEqual([]);
  });

  it("con Zernio conectado suma los comentarios del lead", async () => {
    sim.apiKeyZernio = "clave";
    sim.comentarios = [{ id: "c1", from: { id: "ig-1" }, message: "Me interesa", createdTime: "2026-09-01T09:00:00Z" }];
    const r = await getLeadJourney("org-1", "conv-1", zernio);
    expect(tipos(r).filter((t) => t === "comment")).toHaveLength(3);
    expect(r.faltan).toEqual([]);
  });

  it("⭐ si fallan los comentarios de varias piezas, falta \"los comentarios\" y se reporta una sola vez", async () => {
    sim.apiKeyZernio = "clave";
    sim.comentariosFallan = true;
    const r = await getLeadJourney("org-1", "conv-1", zernio);
    expect(r.faltan).toEqual(["los comentarios"]);
    expect(sim.reportes).toHaveLength(1);
    expect(sim.reportes[0].contexto).toEqual({ accion: "[getLeadJourney] los comentarios" });
  });

  it("⭐ si las piezas de contenido no se pueden leer, falta \"los comentarios\"", async () => {
    sim.apiKeyZernio = "clave";
    sim.errores.content_pieces = { message: "TypeError: fetch failed" };
    const r = await getLeadJourney("org-1", "conv-1", zernio);
    expect(r.faltan).toEqual(["los comentarios"]);
  });
});

describe("getZernioLeadJourney", () => {
  it("⭐ si la búsqueda de la conversación falla, lanza FallaDeLaBase", async () => {
    sim.errores.conversations = { message: "TypeError: fetch failed" };
    await expect(getZernioLeadJourney("org-1", zernio)).rejects.toBeInstanceOf(FallaDeLaBase);
  });

  it("con una conversación que coincide, delega en el recorrido completo", async () => {
    const r = await getZernioLeadJourney("org-1", zernio);
    expect(tipos(r)).toContain("dm");
    expect(sim.filtrosOrg.conversations).toContain("org-1");
  });

  it("⭐ sin conversación, sólo comentarios; si fallan, faltan", async () => {
    sim.tablas.conversations = [];
    sim.apiKeyZernio = "clave";
    sim.comentariosFallan = true;
    const r = await getZernioLeadJourney("org-1", zernio);
    expect(r).toEqual({ pasos: [], faltan: ["los comentarios"] });
    expect(sim.reportes[0].contexto).toEqual({ accion: "[getZernioLeadJourney] los comentarios" });
  });
});

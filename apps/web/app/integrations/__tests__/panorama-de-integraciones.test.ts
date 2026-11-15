/**
 * SCRUM-541 (corte C) · El panorama de Integraciones (`getIntegrationsOverviewAction`)
 * chequea `integrations` y propaga el rechazo de sus lecturas internas.
 *
 * Sin el módulo, devuelve el rechazo sin llamar a ninguna de sus 15 lecturas.
 *
 * Por dentro llama a 7 actions del corte que viven en otros archivos y que
 * también chequean `integrations`. Si una vuelve rechazada (los permisos
 * cambiaron entre su lectura y la del panorama), el panorama devuelve ese mismo
 * rechazo: no lo toma como un estado ("sin conectar") ni como un arreglo.
 *
 * Para quien tiene el módulo arma lo mismo de siempre, también cuando una
 * lectura interna lanza: las 6 que tienen `.catch` quedan en `null`/`[]`, y si
 * lanza la de ManyChat, que no lo tiene, el panorama lanza.
 *
 * Las 15 lecturas internas se simulan: cada una devuelve lo que diga `sim` y
 * cuenta sus llamadas. Sin Supabase, los conteos dan 0.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";

const sim = vi.hoisted(() => ({
  permisos: null as unknown as UserPermissions,
  valores: {} as Record<string, unknown>,
  /** Las que lanzan en vez de devolver. */
  lanzan: new Set<string>(),
  llamadas: {} as Record<string, number>,
}));

const { lectura } = vi.hoisted(() => ({
  lectura: (nombre: string) => async () => {
    sim.llamadas[nombre] = (sim.llamadas[nombre] ?? 0) + 1;
    if (sim.lanzan.has(nombre)) throw new Error(`falló ${nombre}`);
    return sim.valores[nombre];
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/get-current-permissions", () => ({
  getCurrentUserPermissions: async () => sim.permisos,
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => false }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/bootstrap", () => ({ requireOrganizationId: async () => "org-1" }));
vi.mock("@/lib/auth/require-org-role", () => ({
  requireOrgRole: async () => undefined,
  ROLES_CONFIG_ORG: [],
  SIN_PERMISO_CONFIG_ORG: "",
}));
// ManyChat está escondida en el catálogo; acá se lista para ver su tarjeta.
vi.mock("@/lib/release/escondido", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/release/escondido")>();
  return { ...original, ESCONDIDO: { ...original.ESCONDIDO, integracionManyChat: false } };
});

vi.mock("@/app/calendly/actions", () => ({
  getCalendlyIntegrationStatusAction: lectura("getCalendlyIntegrationStatusAction"),
}));
vi.mock("@/app/ghl/actions", () => ({
  getGHLIntegrationStatusAction: lectura("getGHLIntegrationStatusAction"),
}));
vi.mock("@/app/ghl/opportunity-actions", () => ({
  getGHLOpportunitiesStatusAction: lectura("getGHLOpportunitiesStatusAction"),
}));
vi.mock("@/app/manychat/actions", () => ({
  getManyChatIntegrationStatusAction: lectura("getManyChatIntegrationStatusAction"),
}));
vi.mock("@/app/fathom/actions", () => ({
  getFathomIntegrationStatusAction: lectura("getFathomIntegrationStatusAction"),
}));
vi.mock("@/app/fathom/sales-call-actions", () => ({
  listUnlinkedRecordingsAction: lectura("listUnlinkedRecordingsAction"),
}));
vi.mock("@/app/marketing/actions", () => ({
  getYoutubeIntegrationStatusAction: lectura("getYoutubeIntegrationStatusAction"),
}));
vi.mock("@/app/forms/actions", () => ({
  getTypeformIntegrationStatusAction: lectura("getTypeformIntegrationStatusAction"),
  getGoogleFormsIntegrationStatusAction: lectura("getGoogleFormsIntegrationStatusAction"),
}));
vi.mock("@/app/integrations/zernio/actions", () => ({
  getZernioIntegrationStatusAction: lectura("getZernioIntegrationStatusAction"),
}));
vi.mock("@/app/discord/actions", () => ({
  getDiscordIntegrationStatusAction: lectura("getDiscordIntegrationStatusAction"),
}));
vi.mock("@/app/vturb/actions", () => ({
  getVTurbStatusAction: lectura("getVTurbStatusAction"),
}));
vi.mock("@/app/webinarjam/actions", () => ({
  getWebinarJamStatusAction: lectura("getWebinarJamStatusAction"),
}));
vi.mock("@/app/hyros/actions", () => ({
  getHyrosStatusAction: lectura("getHyrosStatusAction"),
}));
vi.mock("@/app/payments/actions", () => ({
  getPaymentIntegrationsStatusAction: lectura("getPaymentIntegrationsStatusAction"),
}));

import { esRechazoPorModulo } from "@/lib/auth/regla-de-modulo";
import { getIntegrationsOverviewAction } from "../actions";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const RECHAZO = {
  success: false,
  error: "No tenés acceso a Integraciones.",
  motivo: "sin-acceso",
  moduleId: "integrations",
};

const FOUNDER: UserPermissions = {
  role: "founder",
  isFounder: true,
  modules: emptyPermissions(),
  hasRoleConfigured: true,
  enabledAddOns: [],
};

function memberSinIntegraciones(): UserPermissions {
  return {
    role: "member",
    isFounder: false,
    modules: { ...emptyPermissions(), funnels: "full", marketing: "full" },
    hasRoleConfigured: true,
    enabledAddOns: [],
  };
}

const sinConectar = { connected: false, lastSyncAt: null };

/** Las 8 que no son del corte: sin conectar, salvo GHL (los turnos) y Fathom. */
const FUERA_DEL_CORTE: Record<string, unknown> = {
  getCalendlyIntegrationStatusAction: { connected: false, webhookEnabled: false },
  getGHLIntegrationStatusAction: {
    connected: true,
    locationId: "loc-1",
    lastSyncAt: "2026-11-10T00:00:00Z",
    selectedCalendarIds: ["cal-1"],
  },
  getFathomIntegrationStatusAction: { connected: true, lastSyncAt: "2026-11-09T00:00:00Z" },
  getYoutubeIntegrationStatusAction: {
    success: true,
    data: { connected: false, channelName: null, lastSyncAt: null },
  },
  getTypeformIntegrationStatusAction: sinConectar,
  getGoogleFormsIntegrationStatusAction: sinConectar,
  getZernioIntegrationStatusAction: {
    connected: false,
    accountName: null,
    lastSyncAt: null,
    connectedAccounts: [],
  },
  getDiscordIntegrationStatusAction: {
    connected: false,
    integration: null,
    stats: { linkedClientsCount: 0, messagesCount: 0, testimonialsCount: 0 },
  },
};

/** Las 7 del corte, conectadas y con datos. */
const DEL_CORTE: Record<string, unknown> = {
  getGHLOpportunitiesStatusAction: {
    connected: true,
    stageHistorySince: null,
    pipelinesSyncedAt: null,
    pipelineCount: 0,
    stageCount: 0,
    transitionCount: 0,
    workflowWebhookUrl: null,
    hasWebhookSecret: false,
  },
  getManyChatIntegrationStatusAction: {
    connected: true,
    pageName: "Mi página",
    lastSyncAt: "2026-11-11T10:00:00Z",
    webhookUrl: "https://app.ejemplo.test/api/integrations/manychat/webhook/tok-1",
  },
  listUnlinkedRecordingsAction: [
    {
      id: "rec-1",
      title: "Llamada con Ana",
      callDate: "2026-11-10T15:00:00Z",
      fathomUrl: null,
      participantEmails: [],
      noMatchReason: null,
    },
    {
      id: "rec-2",
      title: "Reunión de equipo",
      callDate: "2026-11-09T15:00:00Z",
      fathomUrl: null,
      participantEmails: [],
      noMatchReason: null,
    },
  ],
  getVTurbStatusAction: {
    connected: true,
    playersSyncedAt: "2026-11-10T08:00:00Z",
    playerCount: 3,
    playersWithoutPitchTime: 1,
    lastError: null,
  },
  getWebinarJamStatusAction: {
    connected: true,
    webinarsSyncedAt: "2026-11-09T08:00:00Z",
    registrantsSyncedAt: "2026-11-10T09:00:00Z",
    webinarCount: 2,
    registrantCount: 40,
    webinarsWithoutPitch: 0,
    lastError: "401 de la API",
  },
  getHyrosStatusAction: {
    connected: true,
    attributionModel: "last_click",
    adAccountsSyncedAt: "2026-11-08T08:00:00Z",
    adAccounts: [{ externalId: "a-1", name: "Meta", accountType: "facebook", isActive: true }],
    lastError: null,
  },
  getPaymentIntegrationsStatusAction: [
    {
      provider: "whop",
      connected: true,
      connectedAt: "2026-11-01T00:00:00Z",
      lastEventAt: null,
      webhookUrl: "https://app.ejemplo.test/api/webhooks/whop?organizationId=org-1",
      unmappedEvents: 2,
    },
    {
      provider: "fanbasis",
      connected: false,
      connectedAt: null,
      lastEventAt: null,
      webhookUrl: null,
      unmappedEvents: 0,
    },
  ],
};

const LAS_7_DEL_CORTE = Object.keys(DEL_CORTE);
const LAS_15 = [...Object.keys(FUERA_DEL_CORTE), ...LAS_7_DEL_CORTE];

/** Lo que el panorama arma de las 7 con los datos de `DEL_CORTE` (copiado del cuerpo). */
const TARJETAS_DEL_CORTE = {
  ghl: {
    state: "attention",
    accountLabel: "loc-1",
    lastSyncAt: "2026-11-10T00:00:00Z",
    records: 0,
    issues: [
      {
        level: "warning",
        message: "El catálogo de pipelines y etapas está vacío.",
        action:
          "Sincronizalo: sin él no se puede configurar ningún paso del embudo contra una etapa.",
      },
      {
        level: "warning",
        message:
          "Falta el secreto del webhook de oportunidades, así que los cambios de etapa no llegan.",
        action:
          "Generalo acá y pegá la URL en una acción «Webhook» de un Workflow de la sub-cuenta.",
      },
    ],
  },
  manychat: {
    state: "connected",
    accountLabel: "Mi página",
    lastSyncAt: "2026-11-11T10:00:00Z",
    records: 0,
    issues: [
      {
        level: "info",
        message: "Todavía no llegó ningún mensaje.",
        action:
          "Los mensajes entran por una External Request de ManyChat: revisá que el flujo apunte a la URL del webhook.",
      },
    ],
  },
  fathom: {
    state: "connected",
    lastSyncAt: "2026-11-09T00:00:00Z",
    records: 0,
    issues: [
      {
        level: "info",
        message: "Todavía no llegó ninguna grabación.",
        action: "Sincronizá para traer las reuniones de los últimos 90 días.",
      },
      {
        level: "info",
        message: "2 grabaciones no cruzaron con ningún turno agendado.",
        action:
          "Estar en esa lista no es un error: una reunión de equipo no es una llamada de venta. Vinculá a mano las que sí lo eran.",
      },
    ],
  },
  vturb: {
    state: "attention",
    lastSyncAt: "2026-11-10T08:00:00Z",
    records: 3,
    issues: [
      {
        level: "warning",
        message:
          '1 de 3 videos no tienen configurado el pitch time en VTurb. Sin eso, la medida "llegaron al CTA" no se puede calcular: VTurb devuelve un número que parece el correcto y cuenta a casi todo el que abrió el video.',
      },
    ],
  },
  webinarjam: {
    state: "error",
    lastSyncAt: "2026-11-10T09:00:00Z",
    records: 40,
    issues: [
      { level: "error", message: "El último intento contra el proveedor falló: 401 de la API" },
    ],
  },
  hyros: {
    state: "connected",
    accountLabel: "last_click",
    lastSyncAt: "2026-11-08T08:00:00Z",
    records: 1,
    issues: [],
  },
  whop: {
    state: "attention",
    lastSyncAt: null,
    records: null,
    issues: [
      { level: "warning", message: "Llegaron 2 eventos que no se supieron interpretar." },
      { level: "info", message: "Todavía no llegó ningún evento." },
    ],
  },
  fanbasis: { state: "not_connected", lastSyncAt: null, records: null, issues: [] },
};

function angostar(resultado: Awaited<ReturnType<typeof getIntegrationsOverviewAction>>) {
  if (esRechazoPorModulo(resultado)) throw new Error("el panorama vino rechazado");
  return resultado;
}

type Panorama = ReturnType<typeof angostar>;

async function panorama(): Promise<Panorama> {
  return angostar(await getIntegrationsOverviewAction());
}

function tarjeta(resultado: Panorama, provider: string) {
  return resultado.healths.find((health) => health.provider === provider);
}

beforeEach(() => {
  sim.permisos = FOUNDER;
  sim.valores = { ...FUERA_DEL_CORTE, ...DEL_CORTE };
  sim.lanzan = new Set();
  sim.llamadas = {};
});

describe("el panorama de Integraciones", () => {
  it("⭐ sin Integraciones devuelve el rechazo y no llama a ninguna de sus 15 lecturas", async () => {
    sim.permisos = memberSinIntegraciones();
    expect(await getIntegrationsOverviewAction()).toEqual(RECHAZO);
    expect(LAS_15).toHaveLength(15);
    expect(sim.llamadas).toEqual({});
  });

  it("con Integraciones y las 7 del corte con datos, arma las mismas tarjetas y el mismo resumen", async () => {
    const resultado = await panorama();
    for (const [provider, esperada] of Object.entries(TARJETAS_DEL_CORTE)) {
      expect(tarjeta(resultado, provider), provider).toMatchObject(esperada);
    }
    expect(resultado.summary).toEqual({
      total: 15,
      connected: 7,
      needAttention: 4,
      notConnected: 8,
    });
    for (const nombre of LAS_15) expect(sim.llamadas[nombre], nombre).toBe(1);
  });

  const conCatch: Array<[string, Record<string, object>]> = [
    ["getGHLOpportunitiesStatusAction", { ghl: { state: "connected", issues: [] } }],
    [
      "listUnlinkedRecordingsAction",
      { fathom: { state: "connected", issues: [TARJETAS_DEL_CORTE.fathom.issues[0]] } },
    ],
    ["getVTurbStatusAction", { vturb: { state: "not_connected", records: null, issues: [] } }],
    [
      "getWebinarJamStatusAction",
      { webinarjam: { state: "not_connected", records: null, issues: [] } },
    ],
    ["getHyrosStatusAction", { hyros: { state: "not_connected", records: null, issues: [] } }],
    [
      "getPaymentIntegrationsStatusAction",
      {
        whop: { state: "not_connected", issues: [] },
        fanbasis: { state: "not_connected", issues: [] },
      },
    ],
  ];

  it.each(conCatch)(
    "si %s lanza, el panorama no es un rechazo y ese proveedor queda como siempre (sin conectar o sin sus datos)",
    async (nombre, tarjetas) => {
      sim.lanzan.add(nombre);
      const resultado = await getIntegrationsOverviewAction();
      expect(resultado).not.toMatchObject({ motivo: "sin-acceso" });
      for (const [provider, esperada] of Object.entries(tarjetas)) {
        expect(tarjeta(angostar(resultado), provider), provider).toMatchObject(esperada);
      }
    }
  );

  it("si getManyChatIntegrationStatusAction lanza (no tiene .catch), el panorama lanza", async () => {
    sim.lanzan.add("getManyChatIntegrationStatusAction");
    await expect(getIntegrationsOverviewAction()).rejects.toThrow(
      "falló getManyChatIntegrationStatusAction"
    );
  });

  it.each(LAS_7_DEL_CORTE)(
    "⭐ si %s devuelve el rechazo, el panorama devuelve ese mismo rechazo",
    async (nombre) => {
      sim.valores[nombre] = RECHAZO;
      expect(await getIntegrationsOverviewAction()).toEqual(RECHAZO);
    }
  );
});

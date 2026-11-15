/**
 * SCRUM-541 (corte C) · Las 2 pantallas de Integraciones dibujan `SinAcceso`
 * cuando una de sus lecturas del corte vuelve rechazada.
 *
 * Pasa si los permisos cambian entre el guardia de la página y la lectura del
 * mismo render: los permisos no se cachean, cada lectura los vuelve a mirar. La
 * página dibuja lo mismo que el guardia («No tenés acceso a Integraciones») y
 * nada más. En `/integrations/discord` el rechazo corta antes del `redirect`:
 * no manda a la persona a `/integrations` como si Discord no estuviera conectado.
 *
 * Con datos, cada pantalla le pasa a sus componentes lo mismo que devolvieron
 * las lecturas. Las actions se simulan (su lógica se prueba en
 * `app/integrations/__tests__/lecturas-de-integraciones-por-modulo.test.ts`) y
 * los componentes se reemplazan por una marca que anota sus props.
 */

import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SinAcceso } from "@/components/platform/sin-acceso";
import { paths } from "@/routes";

const sim = vi.hoisted(() => ({
  lecturas: {} as Record<string, unknown>,
  llamadas: {} as Record<string, number>,
  props: {} as Record<string, Record<string, unknown>>,
  redirecciones: [] as string[],
}));

const REDIRECT = "REDIRECT_DE_PRUEBA";

// SCRUM-540: la página arranca con el guardia del módulo; acá entra alguien con el módulo.
vi.mock("@/lib/auth/acceso-a-modulo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/acceso-a-modulo")>()),
  exigirModuloDeLaPagina: async () => null,
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    sim.redirecciones.push(destino);
    throw new Error("REDIRECT_DE_PRUEBA");
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as never),
}));
vi.mock("@ai-coo/ui", async () => {
  const { createElement: h } = await vi.importActual<typeof import("react")>("react");
  return {
    Button: ({ children }: { children?: unknown }) => h("span", null, children as never),
  };
});

function lectura(nombre: string) {
  return async () => {
    sim.llamadas[nombre] = (sim.llamadas[nombre] ?? 0) + 1;
    return sim.lecturas[nombre];
  };
}

/** Una marca con sus props serializadas: acá alcanza con ver qué recibe. */
function marca(nombre: string) {
  function Marca(props: Record<string, unknown>) {
    sim.props[nombre] = props;
    return createElement("div", {
      "data-componente": nombre,
      "data-props": JSON.stringify(props),
    });
  }
  return Marca;
}

vi.mock("@/app/integrations/actions", () => ({
  getIntegrationsOverviewAction: lectura("getIntegrationsOverviewAction"),
}));
vi.mock("@/app/payments/actions", () => ({
  getPaymentIntegrationsStatusAction: lectura("getPaymentIntegrationsStatusAction"),
}));
vi.mock("@/app/ghl/opportunity-actions", () => ({
  getGHLOpportunitiesStatusAction: lectura("getGHLOpportunitiesStatusAction"),
}));
vi.mock("@/app/vturb/actions", () => ({ getVTurbStatusAction: lectura("getVTurbStatusAction") }));
vi.mock("@/app/webinarjam/actions", () => ({
  getWebinarJamStatusAction: lectura("getWebinarJamStatusAction"),
  listWebinarJamWebinarOptionsAction: lectura("listWebinarJamWebinarOptionsAction"),
}));
vi.mock("@/app/hyros/actions", () => ({ getHyrosStatusAction: lectura("getHyrosStatusAction") }));
vi.mock("@/app/fathom/sales-call-actions", () => ({
  listUnlinkedRecordingsAction: lectura("listUnlinkedRecordingsAction"),
}));
vi.mock("@/app/auth/current-user-actions", () => ({
  getCurrentUserIdAction: lectura("getCurrentUserIdAction"),
}));
vi.mock("@/app/manychat/actions", () => ({
  getManyChatIntegrationStatusAction: lectura("getManyChatIntegrationStatusAction"),
}));
vi.mock("@/app/discord/actions", () => ({
  getDiscordSettingsAction: lectura("getDiscordSettingsAction"),
}));

vi.mock("@/components/integrations", () => ({ IntegrationsBoard: marca("IntegrationsBoard") }));
vi.mock("@/components/integrations/settings/vturb-settings", () => ({
  VTurbSettings: marca("VTurbSettings"),
}));
vi.mock("@/components/integrations/settings/hyros-settings", () => ({
  HyrosSettings: marca("HyrosSettings"),
}));
vi.mock("@/components/integrations/settings/webinarjam-settings", () => ({
  WebinarJamSettings: marca("WebinarJamSettings"),
}));
vi.mock("@/components/integrations/settings/ghl-opportunities-settings", () => ({
  GHLOpportunitiesSettings: marca("GHLOpportunitiesSettings"),
}));
vi.mock("@/components/integrations/settings/payment-settings", () => ({
  PaymentSettings: marca("PaymentSettings"),
}));
vi.mock("@/components/integrations/settings/fathom-settings", () => ({
  FathomSettings: marca("FathomSettings"),
}));
vi.mock("@/components/integrations/settings/manychat-settings", () => ({
  ManyChatSettings: marca("ManyChatSettings"),
}));
vi.mock("@/components/shared/page-header", () => ({ PageHeader: marca("PageHeader") }));
vi.mock("@/components/integrations/discord-settings", () => ({
  DiscordSettings: marca("DiscordSettings"),
}));

import IntegrationsPage from "../page";
import DiscordIntegrationPage from "../discord/page";
import { VTurbSettings } from "@/components/integrations/settings/vturb-settings";
import { HyrosSettings } from "@/components/integrations/settings/hyros-settings";
import { WebinarJamSettings } from "@/components/integrations/settings/webinarjam-settings";
import { GHLOpportunitiesSettings } from "@/components/integrations/settings/ghl-opportunities-settings";
import { PaymentSettings } from "@/components/integrations/settings/payment-settings";
import { FathomSettings } from "@/components/integrations/settings/fathom-settings";
import { ManyChatSettings } from "@/components/integrations/settings/manychat-settings";

// ─── Datos que devuelven las lecturas ────────────────────────────────────────

const RECHAZO = {
  success: false,
  error: "No tenés acceso a Integraciones.",
  motivo: "sin-acceso",
  moduleId: "integrations",
};

const SOLO_SIN_ACCESO = renderToStaticMarkup(
  createElement(SinAcceso, { moduleLabel: "Integraciones" })
);

const HEALTHS = [
  { provider: "fathom", state: "connected", accountLabel: null, lastSyncAt: null, records: 4, recordsLabel: "grabaciones", issues: [] },
  { provider: "vturb", state: "not_connected", accountLabel: null, lastSyncAt: null, records: null, recordsLabel: "videos", issues: [] },
];
const SUMMARY = { total: 2, connected: 1, needAttention: 0, notConnected: 1 };
const PAGOS = [
  { provider: "whop", connected: true, connectedAt: null, lastEventAt: null, webhookUrl: null, unmappedEvents: 0 },
  { provider: "fanbasis", connected: false, connectedAt: null, lastEventAt: null, webhookUrl: null, unmappedEvents: 0 },
];
const GHL = { connected: true, pipelineCount: 1, hasWebhookSecret: true };
const VTURB = { connected: true, playerCount: 2 };
const WEBINARJAM = { connected: false, webinarCount: 0 };
const WEBINARS = [{ product: "webinarjam", webinarId: "w-1", name: "Clase", scheduleCount: 1, pitchSecond: null }];
const HYROS = { connected: true, adAccounts: [] };
const GRABACIONES = [{ id: "rec-1", title: "Llamada con Ana" }];
const MANYCHAT = { connected: true, webhookUrl: "https://app.ejemplo.test/api/integrations/manychat/webhook/tok-1" };

const DISCORD = {
  integration: { id: "di-1", guild_name: "Servidor de prueba", status: "connected", monitored_channels: [] },
  linkedClients: [{ id: "link-1" }],
  pendingLinks: [{ id: "pend-1" }],
  clients: [{ id: "cl-1", name: "Beto Gómez" }],
  channelClients: { "c-1": ["cl-1"] },
  channelPeople: { "c-1": [] },
  team: [{ id: "p-1", name: "Fer" }],
};

function conDatos() {
  sim.lecturas = {
    getIntegrationsOverviewAction: { healths: HEALTHS, summary: SUMMARY },
    getPaymentIntegrationsStatusAction: PAGOS,
    getGHLOpportunitiesStatusAction: GHL,
    getVTurbStatusAction: VTURB,
    getWebinarJamStatusAction: WEBINARJAM,
    listWebinarJamWebinarOptionsAction: WEBINARS,
    getHyrosStatusAction: HYROS,
    listUnlinkedRecordingsAction: GRABACIONES,
    getCurrentUserIdAction: "user-1",
    getManyChatIntegrationStatusAction: MANYCHAT,
    getDiscordSettingsAction: DISCORD,
  };
}

/** Las 9 lecturas del corte que hace `/integrations`, en el orden del destructuring. */
const LAS_9 = [
  "getIntegrationsOverviewAction",
  "getPaymentIntegrationsStatusAction",
  "getGHLOpportunitiesStatusAction",
  "getVTurbStatusAction",
  "getWebinarJamStatusAction",
  "getHyrosStatusAction",
  "listUnlinkedRecordingsAction",
  "getCurrentUserIdAction",
  "getManyChatIntegrationStatusAction",
];

function elemento(valor: unknown): ReactElement<Record<string, unknown>> {
  if (!isValidElement(valor)) throw new Error("no es un elemento");
  return valor as ReactElement<Record<string, unknown>>;
}

beforeEach(() => {
  conDatos();
  sim.llamadas = {};
  sim.props = {};
  sim.redirecciones = [];
});

describe("una lectura del corte vuelve rechazada", () => {
  it.each(LAS_9)(
    "⭐ %s rechazada: /integrations dibuja solo «No tenés acceso a Integraciones»",
    async (accion) => {
      sim.lecturas[accion] = RECHAZO;
      expect(renderToStaticMarkup(await IntegrationsPage())).toBe(SOLO_SIN_ACCESO);
      expect(sim.props).toEqual({});
      // Las 10 lecturas siguen en paralelo: se piden todas.
      expect(Object.keys(sim.llamadas)).toHaveLength(10);
    }
  );

  it("⭐ getDiscordSettingsAction rechazada: /integrations/discord dibuja solo «No tenés acceso a Integraciones», sin redirect", async () => {
    sim.lecturas.getDiscordSettingsAction = RECHAZO;
    expect(renderToStaticMarkup(await DiscordIntegrationPage())).toBe(SOLO_SIN_ACCESO);
    expect(sim.redirecciones).toEqual([]);
    expect(sim.props).toEqual({});
  });

  it("el HTML de comparación es el de SinAcceso con la etiqueta de Integraciones", () => {
    expect(SOLO_SIN_ACCESO).toContain(
      '<h1 class="text-lg font-medium text-foreground">No tenés acceso a Integraciones</h1>'
    );
  });
});

describe("con datos, cada pantalla dibuja lo mismo que antes", () => {
  it("/integrations le pasa al tablero las tarjetas, el resumen y la configuración de cada proveedor", async () => {
    const html = renderToStaticMarkup(await IntegrationsPage());
    expect(html).not.toContain("No tenés acceso");
    const tablero = sim.props.IntegrationsBoard;
    expect(tablero.healths).toEqual(HEALTHS);
    expect(tablero.summary).toEqual(SUMMARY);
    const settings = tablero.settings as Record<string, unknown>;
    expect(Object.keys(settings).sort()).toEqual(
      ["fanbasis", "fathom", "ghl", "hyros", "manychat", "vturb", "webinarjam", "whop"]
    );
    const esperado: Record<string, [unknown, Record<string, unknown>]> = {
      vturb: [VTurbSettings, { status: VTURB }],
      hyros: [HyrosSettings, { status: HYROS }],
      webinarjam: [WebinarJamSettings, { status: WEBINARJAM, webinars: WEBINARS }],
      ghl: [GHLOpportunitiesSettings, { status: GHL }],
      manychat: [ManyChatSettings, { webhookUrl: MANYCHAT.webhookUrl }],
      fathom: [FathomSettings, { currentUserId: "user-1", unlinkedRecordings: GRABACIONES }],
      whop: [PaymentSettings, { integration: PAGOS[0] }],
      fanbasis: [PaymentSettings, { integration: PAGOS[1] }],
    };
    for (const [clave, [tipo, props]] of Object.entries(esperado)) {
      const el = elemento(settings[clave]);
      expect(el.type, clave).toBe(tipo);
      expect(el.props, clave).toEqual(props);
    }
    expect(sim.llamadas).toEqual(
      Object.fromEntries(
        [...LAS_9, "listWebinarJamWebinarOptionsAction"].map((nombre) => [nombre, 1])
      )
    );
  });

  it("/integrations sin GHL ni ManyChat conectados ni Fathom con estado no monta su configuración", async () => {
    sim.lecturas.getGHLOpportunitiesStatusAction = { ...GHL, connected: false };
    sim.lecturas.getManyChatIntegrationStatusAction = { connected: false };
    sim.lecturas.getIntegrationsOverviewAction = {
      healths: HEALTHS.filter((h) => h.provider !== "fathom"),
      summary: SUMMARY,
    };
    await IntegrationsPage().then((el) => renderToStaticMarkup(el));
    const settings = sim.props.IntegrationsBoard.settings as Record<string, unknown>;
    expect(Object.keys(settings).sort()).toEqual(["fanbasis", "hyros", "vturb", "webinarjam", "whop"]);
  });

  it("/integrations/discord con Discord conectado le pasa a DiscordSettings las 7 props", async () => {
    const html = renderToStaticMarkup(await DiscordIntegrationPage());
    expect(html).toContain("Servidor de prueba");
    expect(sim.props.DiscordSettings).toEqual(DISCORD);
    expect(sim.redirecciones).toEqual([]);
  });

  it("/integrations/discord sin Discord conectado manda a /integrations", async () => {
    sim.lecturas.getDiscordSettingsAction = { ...DISCORD, integration: null };
    await expect(DiscordIntegrationPage()).rejects.toThrow(REDIRECT);
    expect(sim.redirecciones).toEqual([paths.platform.integrations]);
  });
});

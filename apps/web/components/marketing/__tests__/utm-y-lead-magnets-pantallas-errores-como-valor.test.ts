import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * SCRUM-520: las pantallas y componentes que usan las acciones de UTMs, lead
 * magnets y automatizaciones muestran el motivo que la acción devuelve como
 * valor, y el texto fijo si la acción lanzó (en producción el navegador sólo
 * recibe un digest). Antes: el funnel salía vacío, borrar un UTM fallaba en
 * silencio, la tabla decía "Todavía no creaste UTMs", el generador pedía
 * configurar una URL que no se pudo leer, los leads de un lead magnet salían
 * vacíos y el selector de flujos decía "Sin flujos disponibles".
 */

const ERROR_INESPERADO = "Ocurrió un error inesperado. Intentá de nuevo.";

const sim = vi.hoisted(() => ({ resultados: {} as Record<string, unknown>, llamadas: [] as unknown[][] }));

/** Devuelve el resultado simulado de la acción, o lo lanza si es una excepción. */
function responder(nombre: string) {
  return (...args: unknown[]) => {
    sim.llamadas.push([nombre, ...args]);
    const valor = sim.resultados[nombre];
    return valor instanceof Error ? Promise.reject(valor) : Promise.resolve(valor);
  };
}

vi.mock("@/app/marketing/utm-actions", () => ({
  getUTMLinksAction: responder("getUTMLinksAction"),
  getOrganizationWebsiteAction: responder("getOrganizationWebsiteAction"),
  getUTMFunnelAction: responder("getUTMFunnelAction"),
  createUTMLinkAction: responder("createUTMLinkAction"),
  updateUTMLinkAction: responder("updateUTMLinkAction"),
  deleteUTMLinkAction: responder("deleteUTMLinkAction"),
}));
vi.mock("@/app/marketing/actions", () => ({
  listContentAssetsAction: responder("listContentAssetsAction"),
}));
vi.mock("@/app/marketing/lead-magnets-actions", () => ({
  getLeadMagnetsAction: responder("getLeadMagnetsAction"),
  createLeadMagnetAction: responder("createLeadMagnetAction"),
  updateLeadMagnetAction: responder("updateLeadMagnetAction"),
  deleteLeadMagnetAction: responder("deleteLeadMagnetAction"),
  getLeadMagnetLeadsAction: responder("getLeadMagnetLeadsAction"),
}));
vi.mock("@/app/marketing/automations-actions", () => ({
  listAutomationFlowsAction: responder("listAutomationFlowsAction"),
}));
vi.mock("@/components/marketing/automations-dashboard", () => ({
  AutomationsDashboard: (props: unknown) => props,
}));
vi.mock("@/components/marketing/lead-magnets/lead-magnets-overview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/marketing/lead-magnets/lead-magnets-overview")>()),
  LeadMagnetsOverview: (props: unknown) => props,
}));

import MarketingUTMsPage from "@/app/(platform)/marketing/utms/page";
import LeadMagnetsPage from "@/app/(platform)/marketing/lead-magnets/page";
import AutomatizacionesPage from "@/app/(platform)/marketing/automatizaciones/page";
import { EmptyState } from "@/components/shared/empty-state";
import { ToastProvider } from "@/providers/toast-provider";
import { UTMPageContent } from "../utm-page-content";
import { UTMTable, cargarFunnelDelUtm, eliminarUtm, guardarEdicionDeUtm } from "../utm-table";
import { UTMLeadsSheet } from "../utm-leads-sheet";
import { UTMGenerator, guardarUtmNuevo } from "../utm-generator";
import { recargarLeadMagnets } from "../lead-magnets/lead-magnets-overview";
import {
  LeadsRecientes,
  cambiarEstadoDelLeadMagnet,
  cargarLeadsDelLeadMagnet,
  eliminarLeadMagnet,
} from "../lead-magnets/lead-magnet-detail-panel";
import {
  SelectorDeFlujos,
  cargarFlujosDeManyChat,
  crearLeadMagnet,
} from "../lead-magnets/lead-magnet-form-modal";

const LINK = "44444444-4444-4444-8444-444444444444";
const LM = "77777777-7777-4777-8777-777777777777";
const MOTIVO = "Sesión no válida";
const SIN_ACCESO_MANYCHAT =
  "ManyChat rechazó la API key de tu organización. Hay que volver a conectarlo.";
const UN_LINK = {
  id: LINK,
  utm_campaign: "lanzamiento",
  youtube_video_title: "Video",
  full_url: "https://propia.com?utm_campaign=lanzamiento",
  manychat_url: null,
  clicks: 0,
  leads_captured: 0,
  bookings_attributed: 0,
  sales_attributed: 0,
  revenue_attributed: 0,
};

let consola: ReturnType<typeof vi.spyOn>;
let avisos: Array<{ title: string; description?: string; variant?: string }>;
const avisar = (aviso: { title: string; description?: string; variant?: "default" | "success" }) =>
  void avisos.push(aviso);
beforeEach(() => {
  sim.resultados = {};
  sim.llamadas = [];
  avisos = [];
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consola.mockRestore());

function html(el: ReactElement) {
  return renderToStaticMarkup(createElement(ToastProvider, null, el));
}

// ─── UTMs ─────────────────────────────────────────────────────────────────────

describe("/marketing/utms", () => {
  beforeEach(() => {
    sim.resultados.getUTMLinksAction = { success: true, data: [UN_LINK] };
    sim.resultados.listContentAssetsAction = { success: true, data: [] };
    sim.resultados.getOrganizationWebsiteAction = { success: true, data: "https://propia.com" };
  });

  function contenido(el: ReactElement) {
    return (el.props as { children: ReactElement[] }).children[2] as ReactElement<
      Parameters<typeof UTMPageContent>[0]
    >;
  }

  it("con todo bien, los links y la URL sin motivos", async () => {
    const props = contenido((await MarketingUTMsPage()) as ReactElement).props;
    expect(props).toMatchObject({
      initialLinks: [UN_LINK],
      motivoDeLinks: null,
      orgWebsiteUrl: "https://propia.com",
      motivoDeUrlDelSitio: null,
    });
  });

  it("⭐ si fallan los links, la tabla recibe el motivo (antes, una lista vacía)", async () => {
    sim.resultados.getUTMLinksAction = { success: false, error: ERROR_INESPERADO };
    const props = contenido((await MarketingUTMsPage()) as ReactElement).props;
    expect(props).toMatchObject({ initialLinks: [], motivoDeLinks: ERROR_INESPERADO });
  });

  it("⭐ si falla la URL del sitio, el generador recibe el motivo (antes, null)", async () => {
    sim.resultados.getOrganizationWebsiteAction = { success: false, error: ERROR_INESPERADO };
    const props = contenido((await MarketingUTMsPage()) as ReactElement).props;
    expect(props).toMatchObject({
      initialLinks: [UN_LINK],
      orgWebsiteUrl: null,
      motivoDeUrlDelSitio: ERROR_INESPERADO,
    });
  });
});

describe("UTMPageContent, UTMTable y UTMGenerator: el motivo en pantalla", () => {
  const base = { youtubeVideos: [], orgWebsiteUrl: "https://propia.com" };

  it("⭐ sin links y con motivo, el motivo en vez de «Todavía no creaste UTMs»", () => {
    const salida = html(createElement(UTMPageContent, { ...base, initialLinks: [], motivoDeLinks: MOTIVO }));
    expect(salida).toContain("No se pudieron cargar los UTMs");
    expect(salida).toContain(MOTIVO);
    expect(salida).not.toContain("Todavía no creaste UTMs");
  });

  it("sin links y sin motivo, el texto de siempre", () => {
    const salida = html(createElement(UTMTable, { links: [] }));
    expect(salida).toContain("Todavía no creaste UTMs");
    expect(salida).not.toContain("No se pudieron cargar los UTMs");
  });

  it("con links y motivo (se creó uno después de la falla), el aviso y la tabla", () => {
    const salida = html(
      createElement(UTMTable, { links: [UN_LINK as never], motivoDeCarga: ERROR_INESPERADO })
    );
    expect(salida).toContain("No se pudieron cargar los UTMs");
    expect(salida).toContain(ERROR_INESPERADO);
    expect(salida).toContain("lanzamiento");
  });

  it("⭐ el generador muestra el motivo de la URL en vez de pedir configurarla", () => {
    const salida = html(
      createElement(UTMGenerator, {
        youtubeVideos: [],
        orgWebsiteUrl: null,
        motivoDeUrlDelSitio: ERROR_INESPERADO,
        onCreated: () => {},
      })
    );
    expect(salida).toContain("No se pudo leer la URL de tu sitio web");
    expect(salida).toContain(ERROR_INESPERADO);
    expect(salida).not.toContain("Configurá la URL de tu sitio web");
  });

  it("sin URL y sin motivo, el aviso de configurarla, como antes", () => {
    const salida = html(
      createElement(UTMGenerator, { youtubeVideos: [], orgWebsiteUrl: null, onCreated: () => {} })
    );
    expect(salida).toContain("Configurá la URL de tu sitio web");
    expect(salida).not.toContain("No se pudo leer la URL");
  });

  it("⭐ el panel del funnel muestra el motivo en vez del funnel vacío", () => {
    const salida = html(
      createElement(UTMLeadsSheet, {
        open: true,
        onOpenChange: () => {},
        link: UN_LINK as never,
        funnel: null,
        motivo: ERROR_INESPERADO,
      })
    );
    expect(salida).toContain("No se pudo cargar el funnel");
    expect(salida).toContain(ERROR_INESPERADO);
    expect(salida).not.toContain("Todavía no hay leads para este UTM");
  });
});

describe("UTMs: acciones desde la tabla y el generador", () => {
  it("⭐ el funnel vuelve con el motivo, el texto fijo si lanzó, o el dato", async () => {
    sim.resultados.getUTMFunnelAction = { success: false, error: "ID inválido" };
    await expect(cargarFunnelDelUtm(LINK)).resolves.toEqual({ ok: false, motivo: "ID inválido" });
    expect(sim.llamadas).toEqual([["getUTMFunnelAction", LINK]]);
    sim.resultados.getUTMFunnelAction = new Error("digest 123");
    await expect(cargarFunnelDelUtm(LINK)).resolves.toEqual({ ok: false, motivo: ERROR_INESPERADO });
    expect(consola).toHaveBeenCalledWith("[UTMTable] funnel", expect.anything());
    sim.resultados.getUTMFunnelAction = { success: true, data: { leads: [] } };
    await expect(cargarFunnelDelUtm(LINK)).resolves.toEqual({ ok: true, data: { leads: [] } });
  });

  it("⭐ guardar la edición vuelve con el motivo o el texto fijo", async () => {
    sim.resultados.updateUTMLinkAction = { success: false, error: "Ya existe un UTM con esa campaña." };
    await expect(guardarEdicionDeUtm(LINK, { utm_campaign: "x" })).resolves.toEqual({
      ok: false,
      motivo: "Ya existe un UTM con esa campaña.",
    });
    expect(sim.llamadas).toEqual([["updateUTMLinkAction", LINK, { utm_campaign: "x" }]]);
    sim.resultados.updateUTMLinkAction = new Error("digest");
    await expect(guardarEdicionDeUtm(LINK, {})).resolves.toEqual({ ok: false, motivo: ERROR_INESPERADO });
  });

  it("⭐ borrar avisa el motivo y no saca el link (antes, nada)", async () => {
    const alExito = vi.fn();
    sim.resultados.deleteUTMLinkAction = { success: false, error: "UTM no encontrado." };
    await eliminarUtm(LINK, avisar, alExito);
    expect(avisos).toEqual([
      { title: "No se pudo eliminar el UTM", description: "UTM no encontrado.", variant: "default" },
    ]);
    expect(alExito).not.toHaveBeenCalled();
    sim.resultados.deleteUTMLinkAction = new Error("digest");
    await eliminarUtm(LINK, avisar, alExito);
    expect(avisos[1]).toMatchObject({ description: ERROR_INESPERADO });
    sim.resultados.deleteUTMLinkAction = { success: true, data: undefined };
    await eliminarUtm(LINK, avisar, alExito);
    expect(alExito).toHaveBeenCalledTimes(1);
    expect(avisos).toHaveLength(2);
  });

  it("⭐ crear vuelve con el motivo o el texto fijo (antes, «No se pudo guardar el UTM.» sin registrar)", async () => {
    sim.resultados.createUTMLinkAction = { success: false, error: "La campaña UTM es obligatoria." };
    await expect(guardarUtmNuevo({ utm_campaign: "" })).resolves.toEqual({
      ok: false,
      motivo: "La campaña UTM es obligatoria.",
    });
    sim.resultados.createUTMLinkAction = new Error("digest");
    await expect(guardarUtmNuevo({ utm_campaign: "x" })).resolves.toEqual({
      ok: false,
      motivo: ERROR_INESPERADO,
    });
    expect(consola).toHaveBeenCalledWith("[UTMGenerator] crear UTM", expect.anything());
  });
});

// ─── Lead magnets ─────────────────────────────────────────────────────────────

describe("/marketing/lead-magnets", () => {
  it("con la lista bien, la pantalla con los lead magnets", async () => {
    sim.resultados.getLeadMagnetsAction = { success: true, data: [{ id: LM }] };
    const el = (await LeadMagnetsPage()) as ReactElement<{ initialLeadMagnets: unknown }>;
    expect(el.props.initialLeadMagnets).toEqual([{ id: LM }]);
  });

  it("⭐ si la lista falla, el motivo en vez de «Sin lead magnets registrados»", async () => {
    sim.resultados.getLeadMagnetsAction = { success: false, error: ERROR_INESPERADO };
    const el = (await LeadMagnetsPage()) as ReactElement<{ children: ReactElement }>;
    const aviso = el.props.children as ReactElement<{ title: string; description: string }>;
    expect(aviso.type).toBe(EmptyState);
    expect(aviso.props).toMatchObject({
      title: "No se pudieron cargar los lead magnets",
      description: ERROR_INESPERADO,
    });
  });
});

describe("lead magnets: acciones desde la pantalla", () => {
  it("⭐ recargar avisa el motivo y no pisa la lista (antes, el error era la lista)", async () => {
    const alExito = vi.fn();
    sim.resultados.getLeadMagnetsAction = { success: false, error: MOTIVO };
    await recargarLeadMagnets(avisar, alExito);
    expect(avisos).toEqual([
      { title: "Error al recargar lead magnets", description: MOTIVO, variant: "default" },
    ]);
    expect(alExito).not.toHaveBeenCalled();
    sim.resultados.getLeadMagnetsAction = { success: true, data: [{ id: LM }] };
    await recargarLeadMagnets(avisar, alExito);
    expect(alExito).toHaveBeenCalledWith([{ id: LM }]);
  });

  it("⭐ los leads vuelven con el motivo o el texto fijo (antes, «Todavía no hay leads»)", async () => {
    sim.resultados.getLeadMagnetLeadsAction = { success: false, error: "ID inválido" };
    await expect(cargarLeadsDelLeadMagnet(LM)).resolves.toEqual({ ok: false, motivo: "ID inválido" });
    sim.resultados.getLeadMagnetLeadsAction = new Error("digest");
    await expect(cargarLeadsDelLeadMagnet(LM)).resolves.toEqual({ ok: false, motivo: ERROR_INESPERADO });
    sim.resultados.getLeadMagnetLeadsAction = { success: true, data: [{ id: "lead" }] };
    await expect(cargarLeadsDelLeadMagnet(LM)).resolves.toEqual({ ok: true, data: [{ id: "lead" }] });
  });

  it("⭐ pausar con un error avisa el motivo y no dice «pausado»", async () => {
    const alExito = vi.fn();
    sim.resultados.updateLeadMagnetAction = { success: false, error: "No encontramos ese lead magnet." };
    await cambiarEstadoDelLeadMagnet(LM, "paused", avisar, alExito);
    expect(avisos).toEqual([
      { title: "Error", description: "No encontramos ese lead magnet.", variant: "default" },
    ]);
    expect(alExito).not.toHaveBeenCalled();
    expect(sim.llamadas).toEqual([["updateLeadMagnetAction", LM, { status: "paused" }]]);
    sim.resultados.updateLeadMagnetAction = { success: true, data: undefined };
    await cambiarEstadoDelLeadMagnet(LM, "active", avisar, alExito);
    expect(avisos[1]).toEqual({ title: "Lead Magnet activado", variant: "success" });
    expect(alExito).toHaveBeenCalledTimes(1);
  });

  it("⭐ eliminar con un error avisa el motivo y no dice «eliminado» (antes, siempre éxito)", async () => {
    const alExito = vi.fn();
    sim.resultados.deleteLeadMagnetAction = new Error("digest");
    await eliminarLeadMagnet(LM, avisar, alExito);
    expect(avisos).toEqual([
      { title: "Error al eliminar", description: ERROR_INESPERADO, variant: "default" },
    ]);
    expect(alExito).not.toHaveBeenCalled();
    sim.resultados.deleteLeadMagnetAction = { success: true, data: undefined };
    await eliminarLeadMagnet(LM, avisar, alExito);
    expect(avisos[1]).toEqual({ title: "Lead Magnet eliminado", variant: "success" });
    expect(alExito).toHaveBeenCalledTimes(1);
  });

  it("⭐ crear con un rechazo avisa el motivo y no recarga", async () => {
    sim.resultados.createLeadMagnetAction = { success: false, error: "Ingresá un nombre para el lead magnet." };
    await expect(
      crearLeadMagnet({ name: "", type: "documento", channel: "manual" }, avisar)
    ).resolves.toEqual({ creado: false, leadMagnet: null });
    expect(avisos).toEqual([
      { title: "Error al crear LM", description: "Ingresá un nombre para el lead magnet.", variant: "default" },
    ]);
    expect(sim.llamadas.map(([nombre]) => nombre)).toEqual(["createLeadMagnetAction"]);
  });

  it("crear con éxito devuelve el más reciente de la recarga, como antes", async () => {
    sim.resultados.createLeadMagnetAction = { success: true, data: { id: LM } };
    sim.resultados.getLeadMagnetsAction = { success: true, data: [{ id: LM }, { id: "viejo" }] };
    await expect(
      crearLeadMagnet({ name: "Guía", type: "documento", channel: "manual" }, avisar)
    ).resolves.toEqual({ creado: true, leadMagnet: { id: LM } });
    expect(avisos).toEqual([]);
  });

  it("⭐ si se creó pero la recarga falla, avisa el motivo y dice que se creó", async () => {
    sim.resultados.createLeadMagnetAction = { success: true, data: { id: LM } };
    sim.resultados.getLeadMagnetsAction = new Error("digest");
    await expect(
      crearLeadMagnet({ name: "Guía", type: "documento", channel: "manual" }, avisar)
    ).resolves.toEqual({ creado: true, leadMagnet: null });
    expect(avisos).toEqual([
      {
        title: "El Lead Magnet se creó, pero no se pudo recargar la lista",
        description: ERROR_INESPERADO,
        variant: "default",
      },
    ]);
  });

  it("⭐ los flujos de ManyChat vuelven con el motivo (antes, «Sin flujos disponibles»)", async () => {
    sim.resultados.listAutomationFlowsAction = { success: false, error: "ManyChat rechazó la API key" };
    await expect(cargarFlujosDeManyChat()).resolves.toEqual({
      ok: false,
      motivo: "ManyChat rechazó la API key",
    });
    sim.resultados.listAutomationFlowsAction = new Error("digest");
    await expect(cargarFlujosDeManyChat()).resolves.toEqual({ ok: false, motivo: ERROR_INESPERADO });
    sim.resultados.listAutomationFlowsAction = {
      success: true,
      data: { manychatConnected: true, flows: [{ id: "f1", name: "Bienvenida", status: "active" }] },
    };
    await expect(cargarFlujosDeManyChat()).resolves.toEqual({
      ok: true,
      data: [{ id: "f1", name: "Bienvenida" }],
    });
  });
});

describe("lead magnets: el motivo en pantalla", () => {
  it("⭐ los leads recientes muestran el motivo en vez de «Todavía no hay leads»", () => {
    const salida = html(createElement(LeadsRecientes, { loading: false, motivo: ERROR_INESPERADO, leads: [] }));
    expect(salida).toContain("No se pudieron cargar los leads");
    expect(salida).toContain(ERROR_INESPERADO);
    expect(salida).not.toContain("Todavía no hay leads registrados");
  });

  it("sin motivo y sin leads, el texto de siempre", () => {
    const salida = html(createElement(LeadsRecientes, { loading: false, motivo: null, leads: [] }));
    expect(salida).toContain("Todavía no hay leads registrados para este LM");
  });

  it("⭐ el selector de flujos muestra el motivo en vez de «Sin flujos disponibles»", () => {
    const props = { loading: false, flows: [], value: "", onChange: () => {} };
    const conMotivo = html(createElement(SelectorDeFlujos, { ...props, motivo: SIN_ACCESO_MANYCHAT }));
    expect(conMotivo).toContain(`No se pudieron cargar los flujos: ${SIN_ACCESO_MANYCHAT}`);
    expect(conMotivo).not.toContain("Sin flujos disponibles");
    const sinMotivo = html(createElement(SelectorDeFlujos, { ...props, motivo: null }));
    expect(sinMotivo).toContain("Sin flujos disponibles");
  });
});

// ─── Automatizaciones ─────────────────────────────────────────────────────────

describe("/marketing/automatizaciones", () => {
  function cuerpo(el: ReactElement) {
    return (el.props as { children: ReactElement[] }).children[1] as ReactElement<Record<string, unknown>>;
  }

  it("con los flujos bien, el tablero con los flujos", async () => {
    sim.resultados.listAutomationFlowsAction = {
      success: true,
      data: { flows: [{ id: "f1" }], manychatConnected: true },
    };
    const tablero = cuerpo((await AutomatizacionesPage()) as ReactElement);
    expect(tablero.props).toMatchObject({ flows: [{ id: "f1" }], manychatConnected: true });
  });

  it("⭐ si fallan, el motivo en vez de «No hay flujos configurados en ManyChat»", async () => {
    sim.resultados.listAutomationFlowsAction = { success: false, error: ERROR_INESPERADO };
    const aviso = cuerpo((await AutomatizacionesPage()) as ReactElement);
    expect(aviso.type).toBe(EmptyState);
    expect(aviso.props).toMatchObject({
      title: "No se pudieron cargar los flujos",
      description: ERROR_INESPERADO,
    });
  });
});

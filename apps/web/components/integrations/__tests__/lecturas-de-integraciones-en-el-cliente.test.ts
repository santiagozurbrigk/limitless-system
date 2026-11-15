/**
 * SCRUM-541 (corte C) · Los componentes de cliente que piden datos con las
 * lecturas de Integraciones no rompen cuando una vuelve rechazada.
 *
 * Pasa si a la persona le quitan Integraciones con la pantalla abierta y el
 * componente vuelve a pedir datos. `DiscordSettings`, las cuentas de Fathom por
 * miembro y las métricas de CTA de ManyChat dibujan `SinAcceso` en lugar del
 * componente; las grabaciones sin turno, en lugar del panel entero (las otras
 * filas también muestran datos). Ninguno muestra lo que tenía ni lanza. El
 * asistente de ClickUp no cambia: el rechazo ya se ve en su aviso de error.
 *
 * Con datos, cada uno se comporta como antes.
 *
 * Sin DOM no hay React que guarde el estado entre renders, así que los hooks se
 * reemplazan por unos mínimos que sí lo guardan (copiados de
 * `components/operations/__tests__/lecturas-rechazadas-en-el-cliente.test.ts`):
 * un "render" es llamar al componente y pasar lo que devuelve por
 * `renderToStaticMarkup`, y después corren los efectos cuyas deps cambiaron.
 * Los hijos que no importan se reemplazan por marcas. Las filas de las
 * grabaciones sí se dibujan de verdad: usan los mismos hooks, en orden, dentro
 * del render del panel.
 */

import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SinAcceso } from "@/components/platform/sin-acceso";
import type { DiscordIntegration } from "@/types/discord";

// ─── Arnés de hooks ──────────────────────────────────────────────────────────

const hooks = vi.hoisted(() => {
  type Efecto = { deps: unknown[] | undefined; limpiar: unknown };
  let celdas: unknown[] = [];
  let i = 0;
  let porCorrer: Array<() => void> = [];
  const mismasDeps = (a: unknown[] | undefined, b: unknown[] | undefined) =>
    a !== undefined &&
    b !== undefined &&
    a.length === b.length &&
    a.every((d, j) => Object.is(d, b[j]));
  const api = {
    /** Lo que se lanzó con `startTransition`: se espera entre pasos. */
    pendientes: [] as Promise<unknown>[],
    reiniciar() {
      celdas = [];
      i = 0;
      porCorrer = [];
      api.pendientes = [];
    },
    empezarRender() {
      i = 0;
      porCorrer = [];
    },
    /** Como React después de pintar: limpieza anterior y efecto, por orden. */
    correrEfectos() {
      const lista = porCorrer;
      porCorrer = [];
      for (const correr of lista) correr();
    },
    useState(inicial: unknown) {
      const k = i++;
      if (!(k in celdas)) {
        celdas[k] = typeof inicial === "function" ? (inicial as () => unknown)() : inicial;
      }
      const set = (v: unknown) => {
        celdas[k] = typeof v === "function" ? (v as (x: unknown) => unknown)(celdas[k]) : v;
      };
      return [celdas[k], set];
    },
    useRef(inicial: unknown) {
      const k = i++;
      if (!(k in celdas)) celdas[k] = { current: inicial };
      return celdas[k];
    },
    // Devuelve el valor guardado mientras las deps no cambien (Object.is una por una).
    useMemo(calcular: () => unknown, deps: unknown[]) {
      const k = i++;
      const guardado = celdas[k] as { valor: unknown; deps: unknown[] } | undefined;
      if (guardado && mismasDeps(guardado.deps, deps)) return guardado.valor;
      const valor = calcular();
      celdas[k] = { valor, deps };
      return valor;
    },
    useEffect(efecto: () => unknown, deps?: unknown[]) {
      const k = i++;
      const previo = celdas[k] as Efecto | undefined;
      if (previo && mismasDeps(previo.deps, deps)) return;
      celdas[k] = { deps, limpiar: previo?.limpiar };
      porCorrer.push(() => {
        const actual = celdas[k] as Efecto;
        if (typeof actual.limpiar === "function") (actual.limpiar as () => void)();
        actual.limpiar = efecto();
      });
    },
    useTransition() {
      return [
        false,
        (cb: () => unknown) => {
          api.pendientes.push(Promise.resolve(cb()));
        },
      ];
    },
  };
  return api;
});

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: hooks.useState,
  useRef: hooks.useRef,
  useMemo: hooks.useMemo,
  useCallback: (f: unknown, deps: unknown[]) => hooks.useMemo(() => f, deps),
  useEffect: hooks.useEffect,
  useTransition: hooks.useTransition,
}));

// ─── Simulación ──────────────────────────────────────────────────────────────

const sim = vi.hoisted(() => ({
  acciones: {} as Record<string, (...args: unknown[]) => Promise<unknown>>,
  llamadas: {} as Record<string, number>,
  props: {} as Record<string, Record<string, unknown>>,
  /** Los `onClick` de los botones del último render, por texto y en orden. */
  botones: {} as Record<string, Array<() => unknown>>,
  /** Las props de los `Input`, por `id`. */
  inputs: {} as Record<string, Record<string, unknown>>,
  avisos: [] as Array<{ title: string; description?: string }>,
  // Estable entre renders, como el `push` real (useCallback en toast-provider).
  push: (aviso: { title: string; description?: string }) => sim.avisos.push(aviso),
}));

function acciones(nombres: string[]) {
  return Object.fromEntries(
    nombres.map((n) => [
      n,
      (...args: unknown[]) => {
        sim.llamadas[n] = (sim.llamadas[n] ?? 0) + 1;
        const accion = sim.acciones[n];
        if (!accion) throw new Error(`${n} no tiene simulación`);
        return accion(...args);
      },
    ])
  );
}
vi.mock("@/app/discord/actions", () =>
  acciones([
    "addDiscordMonitoredChannelAction",
    "dismissDiscordPendingLinkAction",
    "linkDiscordClientManuallyAction",
    "listDiscordGuildChannelsAction",
    "removeDiscordBotAvatarAction",
    "removeDiscordMonitoredChannelAction",
    "updateDiscordAutoPatternAction",
    "updateDiscordBotAvatarAction",
    "updateDiscordBotCanSpeakAction",
    "updateDiscordBotNameAction",
  ])
);
vi.mock("@/app/fathom/member-actions", () =>
  acciones([
    "connectMemberFathomAction",
    "disconnectMemberFathomAction",
    "listFathomMemberStatusesAction",
    "syncMemberFathomAction",
  ])
);
vi.mock("@/app/fathom/sales-call-actions", () =>
  acciones(["linkRecordingToAppointmentAction", "listLinkableAppointmentsAction"])
);
vi.mock("@/app/integrations/clickup/import-actions", () =>
  acciones([
    "fetchClickUpListsAction",
    "fetchClickUpPreviewAction",
    "importClickUpClientsAction",
    "validateClickUpKeyAction",
  ])
);
vi.mock("@/app/manychat/cta-actions", () =>
  acciones([
    "getManyChatCTAStatsAction",
    "syncManyChatCtaEventsAction",
    "updateManyChatCtaTagsAction",
  ])
);

vi.mock("@/providers/toast-provider", () => ({
  useToast: () => ({ push: sim.push }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
vi.mock("@/providers", () => ({
  usePlatformData: () => ({ refreshClients: async () => {} }),
}));
vi.mock("@/lib/hooks/use-auto-refresh", () => ({ useAutoRefresh: () => {} }));

/** El texto de un botón, sin los íconos. */
function textoDe(nodo: unknown): string {
  if (typeof nodo === "string" || typeof nodo === "number") return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(textoDe).join("");
  if (isValidElement(nodo)) {
    return textoDe((nodo.props as { children?: unknown }).children);
  }
  return "";
}

vi.mock("@ai-coo/ui", async () => {
  const { createElement: h, Fragment } = await vi.importActual<typeof import("react")>("react");
  const pasa = ({ children }: { children?: unknown }) => h(Fragment, null, children as never);
  return {
    Dialog: pasa,
    DialogContent: pasa,
    DialogDescription: ({ children }: { children?: unknown }) => h("p", null, children as never),
    DialogHeader: pasa,
    DialogTitle: ({ children }: { children?: unknown }) => h("h2", null, children as never),
    Label: ({ children }: { children?: unknown }) => h("label", null, children as never),
    Badge: ({ children }: { children?: unknown }) => h("span", null, children as never),
    GlassPanel: ({ children }: { children?: unknown }) =>
      h("div", { "data-componente": "GlassPanel" }, children as never),
    Button: (props: { children?: unknown; onClick?: () => unknown; disabled?: boolean }) => {
      if (props.onClick) {
        const texto = textoDe(props.children).trim();
        (sim.botones[texto] ??= []).push(props.onClick);
      }
      return h("button", { disabled: props.disabled }, props.children as never);
    },
    Input: (props: Record<string, unknown>) => {
      if (typeof props.id === "string") sim.inputs[props.id] = props;
      return h("input", { id: props.id as string, value: props.value as string, readOnly: true });
    },
  };
});

function marca(nombre: string) {
  function Marca(props: Record<string, unknown>) {
    sim.props[nombre] = props;
    return createElement("div", { "data-componente": nombre });
  }
  return Marca;
}
vi.mock("@/components/shared/switch-row", () => ({ SwitchRow: marca("SwitchRow") }));
vi.mock("@/components/integrations/discord-channel-card", () => ({
  DiscordChannelCard: marca("DiscordChannelCard"),
}));

import { DiscordSettings } from "../discord-settings";
import { FathomMemberAccountsSection } from "../fathom-member-accounts";
import { UnlinkedRecordingsPanel } from "../unlinked-recordings-panel";
import { ManyChatCtaPanel } from "../manychat-cta-panel";
import { ClickUpImportWizard } from "../clickup-import-wizard";

// ─── Render ──────────────────────────────────────────────────────────────────

let ultimo: ReactNode = null;

function dibujar<P>(Componente: (props: P) => ReactNode, props: P): string {
  hooks.empezarRender();
  sim.botones = {};
  ultimo = Componente(props);
  const html = renderToStaticMarkup(createElement("div", null, ultimo));
  hooks.correrEfectos();
  // Sin el `div` de afuera, para comparar con el render de `SinAcceso` solo.
  return html.slice("<div>".length, -"</div>".length);
}

/** Espera lo lanzado con `startTransition` y vacía la cola de microtareas. */
async function vaciar(): Promise<void> {
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    await Promise.all(hooks.pendientes.splice(0));
    for (let tick = 0; tick < 10; tick++) await Promise.resolve();
  }
}

/** Monta y deja correr efectos y recargas hasta que el estado se asienta. */
async function asentar<P>(Componente: (props: P) => ReactNode, props: P): Promise<string> {
  let html = dibujar(Componente, props);
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    await vaciar();
    html = dibujar(Componente, props);
  }
  return html;
}

/** El primer elemento del último render que cumple `cumple`. */
function buscar(
  nodo: ReactNode,
  cumple: (elemento: ReactElement<Record<string, unknown>>) => boolean
): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) {
      const encontrado = buscar(hijo as ReactNode, cumple);
      if (encontrado) return encontrado;
    }
    return null;
  }
  if (!isValidElement(nodo)) return null;
  const elemento = nodo as ReactElement<Record<string, unknown>>;
  if (cumple(elemento)) return elemento;
  return buscar(elemento.props.children as ReactNode, cumple);
}

/** Aprieta el botón `texto` del último render (el `n`-ésimo, si hay varios). */
async function apretar(texto: string, n = 0): Promise<void> {
  const onClick = sim.botones[texto]?.[n];
  if (!onClick) throw new Error(`no hay botón «${texto}»`);
  await onClick();
  await vaciar();
}

// ─── Datos ───────────────────────────────────────────────────────────────────

const RECHAZO = {
  success: false,
  error: "No tenés acceso a Integraciones.",
  motivo: "sin-acceso",
  moduleId: "integrations",
};
const rechazada = async () => RECHAZO;

const SOLO_SIN_ACCESO = renderToStaticMarkup(
  createElement(SinAcceso, { moduleLabel: "Integraciones" })
);

const INTEGRACION: DiscordIntegration = {
  id: "di-1",
  organization_id: "org-1",
  guild_id: "g-1",
  guild_name: "Servidor de prueba",
  bot_name: "Asistente de prueba",
  bot_avatar_url: null,
  bot_profile_applied_at: null,
  bot_profile_error: null,
  bot_can_speak: true,
  monitored_channels: [
    { channel_id: "c-1", channel_name: "general", purpose: "community", wins: false },
  ],
  auto_monitor_pattern: "cliente-",
  status: "connected",
  last_event_at: null,
};
const PROPS_DE_DISCORD = {
  integration: INTEGRACION,
  linkedClients: [],
  pendingLinks: [],
  clients: [{ id: "cl-1", name: "Beto Gómez" }],
  channelClients: {},
  channelPeople: {},
  team: [],
};
const CANALES = [
  { id: "c-1", name: "general", monitored: true },
  { id: "c-2", name: "testimonios-del-mes", monitored: false },
];

const MIEMBROS = [
  { userId: "user-1", name: "Fer Equipo", connected: true, lastSyncAt: null },
  { userId: "user-2", name: "Ana Vendedora", connected: false, lastSyncAt: null },
];
const PROPS_DE_FATHOM = { currentUserId: "user-1" };

const GRABACIONES = [
  {
    id: "rec-1",
    title: "Llamada con Ana",
    callDate: null,
    fathomUrl: null,
    participantEmails: ["ana@ejemplo.com"],
    noMatchReason: null,
  },
  {
    id: "rec-2",
    title: "Reunión de equipo semanal",
    callDate: null,
    fathomUrl: null,
    participantEmails: ["equipo@ejemplo.com"],
    noMatchReason: null,
  },
];
const PROPS_DE_GRABACIONES = { recordings: GRABACIONES };
const TURNOS = [
  { id: "cc-1", leadName: "Ana Prospecto", scheduledAt: "2026-11-10T15:30:00Z", leadEmail: null },
];

const METRICAS = {
  cta_responses: 17,
  flows_triggered: 23,
  top_flows: [{ name: "Bienvenida", count: 9 }],
};
const PROPS_DE_MANYCHAT = { initialTags: "cta_reel" };

const PROPS_DE_CLICKUP = { open: true, onOpenChange: () => {} };
const LISTAS = [
  { id: "l-1", name: "Clientes" },
  { id: "l-2", name: "Ex clientes" },
];
const VISTA_PREVIA = {
  success: true,
  fields: [{ name: "Nombre de tarea", isBuiltin: true }],
  mapping: [{ clickupField: "Nombre de tarea", clientField: "name" }],
  preview: [{ "Nombre de tarea": "Ana Pérez" }],
  totalTasks: 42,
};

beforeEach(() => {
  hooks.reiniciar();
  ultimo = null;
  sim.llamadas = {};
  sim.props = {};
  sim.botones = {};
  sim.inputs = {};
  sim.avisos = [];
  sim.acciones = {
    listDiscordGuildChannelsAction: async () => ({ ok: true, channels: CANALES }),
    listFathomMemberStatusesAction: async () => MIEMBROS,
    disconnectMemberFathomAction: async () => ({ ok: true }),
    listLinkableAppointmentsAction: async () => TURNOS,
    getManyChatCTAStatsAction: async () => METRICAS,
    syncManyChatCtaEventsAction: async () => ({ synced: 3 }),
    validateClickUpKeyAction: async () => ({
      success: true,
      workspaces: [{ id: "ws-1", name: "Mi workspace" }],
    }),
    fetchClickUpListsAction: async () => ({ success: true, lists: LISTAS }),
    fetchClickUpPreviewAction: async () => VISTA_PREVIA,
  };
});

// Las anclas de HTML están copiadas de un render real impreso con este arnés
// (CD-15; `scrum-541/corte-c/w0-render-real.txt`).

// ─── DiscordSettings ─────────────────────────────────────────────────────────

describe("DiscordSettings, al abrir el selector de canales", () => {
  it("⭐ con los canales rechazados dibuja solo «No tenés acceso a Integraciones», sin lanzar", async () => {
    await asentar(DiscordSettings, PROPS_DE_DISCORD);
    sim.acciones.listDiscordGuildChannelsAction = rechazada;
    await apretar("Elegir canales");
    expect(dibujar(DiscordSettings, PROPS_DE_DISCORD)).toBe(SOLO_SIN_ACCESO);
  });

  it("con datos, el selector lista los canales del servidor", async () => {
    await asentar(DiscordSettings, PROPS_DE_DISCORD);
    await apretar("Elegir canales");
    const html = dibujar(DiscordSettings, PROPS_DE_DISCORD);
    expect(html).toContain('<span class="truncate text-sm">general</span>');
    expect(html).toContain('<span class="truncate text-sm">testimonios-del-mes</span>');
    expect(html).not.toContain("No tenés acceso");
    expect(sim.llamadas).toEqual({ listDiscordGuildChannelsAction: 1 });
  });
});

// ─── FathomMemberAccountsSection ─────────────────────────────────────────────

describe("FathomMemberAccountsSection", () => {
  it("⭐ con la carga rechazada al montar dibuja solo «No tenés acceso a Integraciones»", async () => {
    sim.acciones.listFathomMemberStatusesAction = rechazada;
    expect(await asentar(FathomMemberAccountsSection, PROPS_DE_FATHOM)).toBe(SOLO_SIN_ACCESO);
  });

  it("⭐ desconectar con la recarga rechazada dibuja solo «No tenés acceso a Integraciones» y avisa lo desconectado", async () => {
    await asentar(FathomMemberAccountsSection, PROPS_DE_FATHOM);
    sim.acciones.listFathomMemberStatusesAction = rechazada;
    await apretar("Desconectar");
    expect(dibujar(FathomMemberAccountsSection, PROPS_DE_FATHOM)).toBe(SOLO_SIN_ACCESO);
    expect(sim.avisos.map((a) => a.title)).toContain("Fathom desconectado");
  });

  it("con datos lista los miembros y quién está conectado", async () => {
    const html = await asentar(FathomMemberAccountsSection, PROPS_DE_FATHOM);
    expect(html).toContain(
      '<span class="truncate">Fer Equipo</span><span class="text-emerald-600 dark:text-emerald-400">Conectado</span>'
    );
    expect(html).toContain('<span class="truncate">Ana Vendedora</span>');
    expect(html).not.toContain("No tenés acceso");
  });
});

// ─── UnlinkedRecordingsPanel ─────────────────────────────────────────────────

describe("UnlinkedRecordingsPanel, al vincular una grabación", () => {
  it("⭐ con los turnos rechazados dibuja solo «No tenés acceso a Integraciones» en lugar del panel entero", async () => {
    await asentar(UnlinkedRecordingsPanel, PROPS_DE_GRABACIONES);
    sim.acciones.listLinkableAppointmentsAction = rechazada;
    await apretar("Vincular a un turno", 0);
    const html = dibujar(UnlinkedRecordingsPanel, PROPS_DE_GRABACIONES);
    expect(html).toBe(SOLO_SIN_ACCESO);
    expect(html).not.toContain("Reunión de equipo semanal");
  });

  it("con datos, la fila muestra los turnos y las otras filas siguen igual", async () => {
    await asentar(UnlinkedRecordingsPanel, PROPS_DE_GRABACIONES);
    await apretar("Vincular a un turno", 0);
    const html = dibujar(UnlinkedRecordingsPanel, PROPS_DE_GRABACIONES);
    expect(html).toContain('<span class="min-w-0 flex-1 truncate font-medium">Ana Prospecto</span>');
    expect(html).toContain('<p class="truncate text-sm font-medium">Reunión de equipo semanal</p>');
    expect(html).not.toContain("No tenés acceso");
    expect(sim.llamadas).toEqual({ listLinkableAppointmentsAction: 1 });
  });
});

// ─── ManyChatCtaPanel ────────────────────────────────────────────────────────

describe("ManyChatCtaPanel", () => {
  it("⭐ con las métricas rechazadas al montar dibuja solo «No tenés acceso a Integraciones»", async () => {
    sim.acciones.getManyChatCTAStatsAction = rechazada;
    expect(await asentar(ManyChatCtaPanel, PROPS_DE_MANYCHAT)).toBe(SOLO_SIN_ACCESO);
  });

  it("⭐ sincronizar con la recarga rechazada dibuja solo «No tenés acceso a Integraciones» y avisa el sync", async () => {
    await asentar(ManyChatCtaPanel, PROPS_DE_MANYCHAT);
    sim.acciones.getManyChatCTAStatsAction = rechazada;
    await apretar("Sincronizar CTAs");
    expect(dibujar(ManyChatCtaPanel, PROPS_DE_MANYCHAT)).toBe(SOLO_SIN_ACCESO);
    expect(sim.avisos.map((a) => a.title)).toContain("Sync de CTAs completado");
  });

  it("con datos muestra las métricas", async () => {
    const html = await asentar(ManyChatCtaPanel, PROPS_DE_MANYCHAT);
    expect(html).toContain('<p class="mt-1 text-xl font-semibold">17</p>');
    expect(html).toContain('<p class="mt-1 text-xl font-semibold">23</p>');
    expect(html).toContain(
      '<span class="truncate">Bienvenida</span><span class="font-medium tabular-nums">9</span>'
    );
    expect(html).not.toContain("No tenés acceso");
  });
});

// ─── ClickUpImportWizard ─────────────────────────────────────────────────────

const AVISO_DEL_RECHAZO = "<span>No tenés acceso a Integraciones.</span>";

/** Escribe la API key y aprieta «Continuar» en el paso de la key y en el de la lista. */
async function llegarALasListas(): Promise<string> {
  dibujar(ClickUpImportWizard, PROPS_DE_CLICKUP);
  const escribir = sim.inputs["cu-apikey"]?.onChange as ((evento: unknown) => void) | undefined;
  if (!escribir) throw new Error("no hay campo para la API key");
  escribir({ target: { value: "pk_prueba" } });
  dibujar(ClickUpImportWizard, PROPS_DE_CLICKUP);
  await apretar("Continuar");
  dibujar(ClickUpImportWizard, PROPS_DE_CLICKUP);
  await apretar("Continuar");
  return dibujar(ClickUpImportWizard, PROPS_DE_CLICKUP);
}

describe("ClickUpImportWizard (no cambia: el rechazo se ve en su aviso de error)", () => {
  it("con las listas rechazadas muestra el aviso y sigue en el paso de la lista", async () => {
    sim.acciones.fetchClickUpListsAction = rechazada;
    const html = await llegarALasListas();
    expect(html).toContain(AVISO_DEL_RECHAZO);
    expect(html).toContain("<p>Elegí el workspace y la lista que contiene tus clientes.</p>");
    expect(hooks.pendientes).toHaveLength(0);
    expect(sim.llamadas).toMatchObject({ validateClickUpKeyAction: 1, fetchClickUpListsAction: 1 });
    expect(sim.llamadas.fetchClickUpPreviewAction).toBeUndefined();
  });

  it("al cambiar de lista con la vista previa rechazada muestra el mismo aviso", async () => {
    await llegarALasListas();
    sim.acciones.fetchClickUpPreviewAction = rechazada;
    const lista = buscar(ultimo, (e) => e.type === "select" && e.props.id === "cu-list");
    if (!lista) throw new Error("no hay selector de lista");
    (lista.props.onChange as (evento: unknown) => void)({ target: { value: "l-2" } });
    await vaciar();
    const html = dibujar(ClickUpImportWizard, PROPS_DE_CLICKUP);
    expect(html).toContain(AVISO_DEL_RECHAZO);
    expect(hooks.pendientes).toHaveLength(0);
    expect(sim.llamadas.fetchClickUpPreviewAction).toBe(2);
  });

  it("con datos llega al paso de mapeo con el total de tareas", async () => {
    const html = await llegarALasListas();
    expect(html).toContain("<p>Mapeá los campos de ClickUp a Limitless. 42 tareas encontradas.</p>");
    expect(html).toContain("<button>Importar 42 clientes</button>");
    expect(html).not.toContain("No tenés acceso");
  });
});

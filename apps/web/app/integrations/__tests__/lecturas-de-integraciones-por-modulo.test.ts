/**
 * SCRUM-541 (corte C) · Las 16 Server Actions de lectura de Integraciones
 * chequean `integrations`.
 *
 * Se pueden invocar a mano sin abrir ninguna pantalla, así que el guardia de la
 * página no alcanza: sin el módulo, cada una devuelve el rechazo como valor y no
 * lee nada (ni la org, ni el usuario, ni la base, ni las librerías de cada
 * integración, ni ClickUp, ni Discord).
 *
 * Con el módulo, cada una devuelve lo mismo que antes: el valor exacto que arma
 * su cuerpo con estas fixtures. Las de ClickUp y Discord, además, le piden a su
 * cliente lo mismo que antes. El panorama (`getIntegrationsOverviewAction`)
 * tiene su propio test: `panorama-de-integraciones.test.ts`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { PermissionLevel } from "@/types/team";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";
import { normalizarCanales } from "@/lib/discord/channels";
import { buildAutoMapping } from "@/lib/clickup/field-mapper";

const sim = vi.hoisted(() => ({
  permisos: null as unknown as UserPermissions,
  llamadasAPermisos: 0,
  lecturas: [] as string[],
  tablas: {} as Record<string, unknown[]>,
  /** Lo que se le pidió a ClickUp y a Discord, con sus argumentos. */
  clientes: [] as unknown[][],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/get-current-permissions", () => ({
  getCurrentUserPermissions: async () => {
    sim.llamadasAPermisos += 1;
    return sim.permisos;
  },
}));
vi.mock("@/lib/auth/bootstrap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/bootstrap")>()),
  requireOrganizationId: async () => {
    sim.lecturas.push("requireOrganizationId");
    return "org-1";
  },
}));
vi.mock("@/lib/auth/require-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-auth")>()),
  requireAuthContext: async () => {
    sim.lecturas.push("requireAuthContext");
    return { user: { id: "user-1" }, orgId: "org-1", role: "member", supabase: {} };
  },
}));
vi.mock("@/lib/supabase/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/env")>()),
  isSupabaseConfigured: () => {
    sim.lecturas.push("isSupabaseConfigured");
    return true;
  },
}));

const { supabaseFalso } = vi.hoisted(() => ({
  supabaseFalso: () => ({
    from(tabla: string) {
      sim.lecturas.push(`from:${tabla}`);
      const filas = sim.tablas[tabla] ?? [];
      const builder: Record<string, unknown> = {};
      for (const metodo of ["select", "eq", "is", "not", "like", "gte", "lte", "order", "limit"]) {
        builder[metodo] = () => builder;
      }
      builder.maybeSingle = async () => ({ data: filas[0] ?? null, error: null });
      builder.then = (
        resolver: (valor: { data: unknown[]; error: null; count: number }) => unknown,
        rechazar?: (motivo: unknown) => unknown
      ) =>
        Promise.resolve({ data: filas, error: null, count: filas.length }).then(resolver, rechazar);
      return builder;
    },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    sim.lecturas.push("createClient");
    return supabaseFalso();
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    sim.lecturas.push("createAdminClient");
    return supabaseFalso();
  },
}));

vi.mock("@/lib/vturb/integration", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/vturb/integration")>()),
  getVTurbIntegrationForOrg: async () => {
    sim.lecturas.push("getVTurbIntegrationForOrg");
    return {
      organization_id: "org-1",
      api_key_encrypted: "enc",
      timezone: "America/Argentina/Buenos_Aires",
      players_synced_at: "2026-11-10T08:00:00Z",
      last_error: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-11-10T08:00:00Z",
    };
  },
}));
vi.mock("@/lib/webinarjam/integration", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/webinarjam/integration")>()),
  getWebinarJamIntegrationForOrg: async () => {
    sim.lecturas.push("getWebinarJamIntegrationForOrg");
    return {
      organization_id: "org-1",
      api_key_encrypted: "enc",
      webinars_synced_at: "2026-11-09T08:00:00Z",
      registrants_synced_at: "2026-11-10T09:00:00Z",
      last_error: "401 de la API",
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-11-10T09:00:00Z",
    };
  },
}));
vi.mock("@/lib/hyros/integration", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hyros/integration")>()),
  getHyrosIntegrationForOrg: async () => {
    sim.lecturas.push("getHyrosIntegrationForOrg");
    return {
      organization_id: "org-1",
      api_key_encrypted: "enc",
      accessible_account_id: null,
      attribution_model: "last_click",
      ad_accounts_synced_at: "2026-11-08T08:00:00Z",
      last_error: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-11-08T08:00:00Z",
    };
  },
}));
vi.mock("@/lib/ghl/integration", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ghl/integration")>()),
  getGHLIntegrationForOrg: async () => {
    sim.lecturas.push("getGHLIntegrationForOrg");
    return {
      organization_id: "org-1",
      api_key_encrypted: "enc",
      location_id: "loc-1",
      default_calendar_id: null,
      selected_calendar_ids: [],
      connected_calendars: [],
      last_sync_at: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
      webhook_secret_encrypted: "secreto-cifrado",
      pipelines_synced_at: "2026-11-02T00:00:00Z",
    };
  },
  getGHLStageHistorySince: async () => {
    sim.lecturas.push("getGHLStageHistorySince");
    return "2026-10-15T00:00:00Z";
  },
}));
vi.mock("@/lib/manychat/integration", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/manychat/integration")>()),
  getManyChatIntegrationForOrganization: async () => {
    sim.lecturas.push("getManyChatIntegrationForOrganization");
    return {
      organization_id: "org-1",
      api_token: "token",
      page_id: "page-1",
      page_name: "Mi página",
      webhook_token: "tok-1",
      updated_at: "2026-11-11T10:00:00Z",
    };
  },
}));
vi.mock("@/lib/clickup/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/clickup/client")>()),
  fetchClickUpLists: async (...args: unknown[]) => {
    sim.lecturas.push("fetchClickUpLists");
    sim.clientes.push(["fetchClickUpLists", ...args]);
    return LISTAS_DE_CLICKUP;
  },
  fetchAllClickUpTasks: async (...args: unknown[]) => {
    sim.lecturas.push("fetchAllClickUpTasks");
    sim.clientes.push(["fetchAllClickUpTasks", ...args]);
    return TAREAS_DE_CLICKUP;
  },
}));
vi.mock("@/lib/discord/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/discord/api")>()),
  listGuildTextChannels: async (...args: unknown[]) => {
    sim.lecturas.push("listGuildTextChannels");
    sim.clientes.push(["listGuildTextChannels", ...args]);
    return [
      { id: "c-1", name: "general" },
      { id: "c-2", name: "wins" },
    ];
  },
}));

const { LISTAS_DE_CLICKUP, TAREAS_DE_CLICKUP } = vi.hoisted(() => ({
  LISTAS_DE_CLICKUP: [{ id: "l-1", name: "Clientes", space: { name: "Ventas" } }],
  TAREAS_DE_CLICKUP: [
    {
      id: "t-1",
      name: "Ana Pérez",
      custom_fields: [{ id: "f-1", name: "Email", type: "email", value: "ana@ejemplo.com" }],
    },
  ],
}));

import { getIntegrationsOverviewAction } from "../actions";
import { getPaymentIntegrationsStatusAction } from "@/app/payments/actions";
import { getGHLOpportunitiesStatusAction } from "@/app/ghl/opportunity-actions";
import { getVTurbStatusAction } from "@/app/vturb/actions";
import { getWebinarJamStatusAction } from "@/app/webinarjam/actions";
import { getHyrosStatusAction } from "@/app/hyros/actions";
import {
  listLinkableAppointmentsAction,
  listUnlinkedRecordingsAction,
} from "@/app/fathom/sales-call-actions";
import { listFathomMemberStatusesAction } from "@/app/fathom/member-actions";
import { getCurrentUserIdAction } from "@/app/auth/current-user-actions";
import { getManyChatIntegrationStatusAction } from "@/app/manychat/actions";
import { getManyChatCTAStatsAction } from "@/app/manychat/cta-actions";
import {
  getDiscordSettingsAction,
  listDiscordGuildChannelsAction,
} from "@/app/discord/actions";
import {
  fetchClickUpListsAction,
  fetchClickUpPreviewAction,
} from "../clickup/import-actions";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const APP_URL = "https://app.ejemplo.test";

const CANALES_GUARDADOS = [{ channel_id: "c-1", channel_name: "general" }];

const INTEGRACION_DE_DISCORD = {
  id: "di-1",
  organization_id: "org-1",
  guild_id: "g-1",
  guild_name: "Servidor de prueba",
  bot_name: null,
  bot_avatar_url: null,
  bot_profile_applied_at: null,
  bot_profile_error: null,
  bot_can_speak: true,
  monitored_channels: CANALES_GUARDADOS,
  auto_monitor_pattern: "cliente-",
  status: "connected",
  last_event_at: "2026-11-10T12:00:00Z",
};

const VINCULO_DE_DISCORD = {
  id: "link-1",
  organization_id: "org-1",
  client_id: "cl-1",
  discord_user_id: "u-1",
  discord_username: "beto",
  discord_display_name: "Beto",
  link_method: "manual",
  link_confidence: null,
  linked_at: "2026-11-01T00:00:00Z",
  clients: { id: "cl-1", name: "Beto Gómez" },
};

const TABLAS: Record<string, unknown[]> = {
  payment_integrations: [
    {
      provider: "whop",
      connected_at: "2026-11-01T00:00:00Z",
      last_event_at: "2026-11-10T00:00:00Z",
      is_active: true,
    },
  ],
  payment_webhook_events: [{ provider: "whop" }, { provider: "whop" }, { provider: "fanbasis" }],
  ghl_pipelines: [{ id: "pi-1" }, { id: "pi-2" }],
  ghl_pipeline_stages: [{ id: "st-1" }, { id: "st-2" }, { id: "st-3" }],
  ghl_stage_transitions: [{ id: "tr-1" }],
  vturb_players: [
    { external_id: "p-1", name: "VSL principal", duration_seconds: 600, pitch_time: 300 },
    { external_id: "p-2", name: null, duration_seconds: null, pitch_time: null },
  ],
  webinarjam_webinars: [
    {
      product: "webinarjam",
      external_id: "w-1",
      name: "Clase en vivo",
      title: null,
      schedules: [1, 2],
      pitch_second: 1200,
    },
    { product: "everwebinar", external_id: "w-2", name: null, title: "Evergreen", schedules: null, pitch_second: null },
  ],
  webinarjam_registrants: [{ id: "r-1" }, { id: "r-2" }, { id: "r-3" }],
  hyros_ad_accounts: [{ external_id: "a-1", name: "Meta", account_type: "facebook", is_active: 1 }],
  fathom_calls: [
    {
      id: "rec-1",
      title: "Llamada con Ana",
      call_date: "2026-11-10T15:00:00Z",
      fathom_url: "https://fathom.video/rec-1",
      calendar_invitees: [{ email: "ana@ejemplo.com" }, { email: "" }],
      appointment_match: { status: "no_match", reason: "no_candidates" },
    },
  ],
  closing_calls: [
    { id: "cc-1", lead_name: "Ana", scheduled_at: "2026-11-10T15:30:00Z", lead_email: "ana@ejemplo.com" },
  ],
  profiles: [{ id: "p-1", full_name: "Fer", email: "fer@ejemplo.com" }],
  team_member_integrations: [{ user_id: "p-1", last_sync_at: "2026-11-09T00:00:00Z" }],
  manychat_events: [
    { event_type: "cta_response", flow_name: null, tag: "cta_reel", triggered_at: "2026-11-05T00:00:00Z" },
    { event_type: "flow_triggered", flow_name: "Bienvenida", tag: null, triggered_at: "2026-11-06T00:00:00Z" },
    { event_type: "flow_triggered", flow_name: "Bienvenida", tag: null, triggered_at: "2026-11-07T00:00:00Z" },
  ],
  discord_integrations: [INTEGRACION_DE_DISCORD],
  discord_client_links: [VINCULO_DE_DISCORD],
  discord_pending_links: [],
  clients: [{ id: "cl-1", name: "Beto Gómez" }],
  discord_channel_clients: [{ channel_id: "c-1", client_id: "cl-1" }],
  discord_messages: [
    { channel_id: "c-1", discord_user_id: "u-1", discord_username: "beto", discord_display_name: "Beto" },
    { channel_id: "c-1", discord_user_id: "u-1", discord_username: "beto", discord_display_name: "Beto" },
  ],
  discord_team_members: [],
};

const RECHAZO = {
  success: false,
  error: "No tenés acceso a Integraciones.",
  motivo: "sin-acceso",
  moduleId: "integrations",
};

function member(
  modulos: Partial<UserPermissions["modules"]>,
  hasRoleConfigured = true
): UserPermissions {
  return {
    role: "member",
    isFounder: false,
    modules: { ...emptyPermissions(), ...modulos },
    hasRoleConfigured,
    enabledAddOns: [],
  };
}

/** Todos los módulos en `full` salvo Integraciones. */
function memberSinIntegraciones(): UserPermissions {
  const modulos = Object.fromEntries(
    Object.keys(emptyPermissions()).map((id) => [id, "full" as PermissionLevel])
  ) as UserPermissions["modules"];
  return member({ ...modulos, integrations: "none" });
}

const FOUNDER: UserPermissions = {
  role: "founder",
  isFounder: true,
  modules: emptyPermissions(),
  hasRoleConfigured: true,
  enabledAddOns: [],
};

// ─── Lo que devuelve cada cuerpo con estas fixtures ─────────────────────────

type Caso = {
  nombre: string;
  llamar: () => Promise<unknown>;
  valor: unknown;
  /** Lo que se le pidió a ClickUp o a Discord. */
  clientes?: unknown[][];
};

const CASOS: Caso[] = [
  {
    nombre: "getPaymentIntegrationsStatusAction",
    llamar: () => getPaymentIntegrationsStatusAction(),
    valor: [
      {
        provider: "whop",
        connected: true,
        connectedAt: "2026-11-01T00:00:00Z",
        lastEventAt: "2026-11-10T00:00:00Z",
        webhookUrl: `${APP_URL}/api/webhooks/whop?organizationId=org-1`,
        unmappedEvents: 2,
      },
      {
        provider: "fanbasis",
        connected: false,
        connectedAt: null,
        lastEventAt: null,
        webhookUrl: null,
        unmappedEvents: 1,
      },
    ],
  },
  {
    nombre: "getGHLOpportunitiesStatusAction",
    llamar: () => getGHLOpportunitiesStatusAction(),
    valor: {
      connected: true,
      stageHistorySince: "2026-10-15T00:00:00Z",
      pipelinesSyncedAt: "2026-11-02T00:00:00Z",
      pipelineCount: 2,
      stageCount: 3,
      transitionCount: 1,
      workflowWebhookUrl: `${APP_URL}/api/webhooks/ghl?organizationId=org-1`,
      hasWebhookSecret: true,
    },
  },
  {
    nombre: "getVTurbStatusAction",
    llamar: () => getVTurbStatusAction(),
    valor: {
      connected: true,
      playersSyncedAt: "2026-11-10T08:00:00Z",
      playerCount: 2,
      playersWithoutPitchTime: 1,
      lastError: null,
    },
  },
  {
    nombre: "getWebinarJamStatusAction",
    llamar: () => getWebinarJamStatusAction(),
    valor: {
      connected: true,
      webinarsSyncedAt: "2026-11-09T08:00:00Z",
      registrantsSyncedAt: "2026-11-10T09:00:00Z",
      webinarCount: 2,
      registrantCount: 3,
      webinarsWithoutPitch: 1,
      lastError: "401 de la API",
    },
  },
  {
    nombre: "getHyrosStatusAction",
    llamar: () => getHyrosStatusAction(),
    valor: {
      connected: true,
      attributionModel: "last_click",
      adAccountsSyncedAt: "2026-11-08T08:00:00Z",
      adAccounts: [{ externalId: "a-1", name: "Meta", accountType: "facebook", isActive: true }],
      lastError: null,
    },
  },
  {
    nombre: "listUnlinkedRecordingsAction",
    llamar: () => listUnlinkedRecordingsAction(),
    valor: [
      {
        id: "rec-1",
        title: "Llamada con Ana",
        callDate: "2026-11-10T15:00:00Z",
        fathomUrl: "https://fathom.video/rec-1",
        participantEmails: ["ana@ejemplo.com"],
        noMatchReason: "no_candidates",
      },
    ],
  },
  {
    nombre: "listLinkableAppointmentsAction",
    llamar: () => listLinkableAppointmentsAction("rec-1"),
    valor: [
      { id: "cc-1", leadName: "Ana", scheduledAt: "2026-11-10T15:30:00Z", leadEmail: "ana@ejemplo.com" },
    ],
  },
  {
    nombre: "listFathomMemberStatusesAction",
    llamar: () => listFathomMemberStatusesAction(),
    valor: [{ userId: "p-1", name: "Fer", connected: true, lastSyncAt: "2026-11-09T00:00:00Z" }],
  },
  {
    nombre: "getCurrentUserIdAction",
    llamar: () => getCurrentUserIdAction(),
    valor: "user-1",
  },
  {
    nombre: "getManyChatIntegrationStatusAction",
    llamar: () => getManyChatIntegrationStatusAction(),
    valor: {
      connected: true,
      pageName: "Mi página",
      lastSyncAt: "2026-11-11T10:00:00Z",
      webhookUrl: `${APP_URL}/api/integrations/manychat/webhook/tok-1`,
    },
  },
  {
    nombre: "getManyChatCTAStatsAction",
    llamar: () => getManyChatCTAStatsAction(),
    valor: {
      cta_responses: 1,
      flows_triggered: 2,
      top_flows: [
        { name: "Bienvenida", count: 2 },
        { name: "cta_reel", count: 1 },
      ],
    },
  },
  {
    nombre: "getDiscordSettingsAction",
    llamar: () => getDiscordSettingsAction(),
    valor: {
      integration: {
        ...INTEGRACION_DE_DISCORD,
        monitored_channels: normalizarCanales(CANALES_GUARDADOS),
      },
      linkedClients: [VINCULO_DE_DISCORD],
      pendingLinks: [],
      channelClients: { "c-1": ["cl-1"] },
      channelPeople: {
        "c-1": [
          {
            discordUserId: "u-1",
            name: "Beto",
            messages: 2,
            clientId: "cl-1",
            isTeam: false,
            profileId: null,
            suggestion: null,
          },
        ],
      },
      team: [{ id: "p-1", name: "Fer" }],
      clients: [{ id: "cl-1", name: "Beto Gómez" }],
    },
  },
  {
    nombre: "listDiscordGuildChannelsAction",
    llamar: () => listDiscordGuildChannelsAction(),
    valor: {
      ok: true,
      channels: [
        { id: "c-1", name: "general", monitored: true },
        { id: "c-2", name: "wins", monitored: false },
      ],
    },
    clientes: [["listGuildTextChannels", "g-1"]],
  },
  {
    nombre: "fetchClickUpListsAction",
    llamar: () => fetchClickUpListsAction("pk_prueba", "ws-1"),
    valor: { success: true, lists: LISTAS_DE_CLICKUP },
    clientes: [["fetchClickUpLists", "pk_prueba", "ws-1"]],
  },
  {
    nombre: "fetchClickUpPreviewAction",
    llamar: () => fetchClickUpPreviewAction("pk_prueba", "l-1"),
    valor: {
      success: true,
      fields: [
        { name: "Nombre de tarea", isBuiltin: true },
        { name: "Email", isBuiltin: false },
      ],
      mapping: buildAutoMapping([
        { name: "Nombre de tarea", isBuiltin: true },
        { name: "Email", isBuiltin: false },
      ]),
      preview: [{ "Nombre de tarea": "Ana Pérez", Email: "ana@ejemplo.com" }],
      totalTasks: 1,
    },
    clientes: [["fetchAllClickUpTasks", "pk_prueba", "l-1"]],
  },
];

/** Las 16, llamadas a mano con argumentos cualquiera, como en `lecturas-rechazan-sin-modulo`. */
const LAS_16: Array<[string, (...args: unknown[]) => Promise<unknown>]> = [
  ["getIntegrationsOverviewAction", getIntegrationsOverviewAction],
  ["getPaymentIntegrationsStatusAction", getPaymentIntegrationsStatusAction],
  ["getGHLOpportunitiesStatusAction", getGHLOpportunitiesStatusAction],
  ["getVTurbStatusAction", getVTurbStatusAction],
  ["getWebinarJamStatusAction", getWebinarJamStatusAction],
  ["getHyrosStatusAction", getHyrosStatusAction],
  ["listUnlinkedRecordingsAction", listUnlinkedRecordingsAction as (...args: unknown[]) => Promise<unknown>],
  ["listLinkableAppointmentsAction", listLinkableAppointmentsAction as (...args: unknown[]) => Promise<unknown>],
  ["listFathomMemberStatusesAction", listFathomMemberStatusesAction],
  ["getCurrentUserIdAction", getCurrentUserIdAction],
  ["getManyChatIntegrationStatusAction", getManyChatIntegrationStatusAction],
  ["getManyChatCTAStatsAction", getManyChatCTAStatsAction as (...args: unknown[]) => Promise<unknown>],
  ["getDiscordSettingsAction", getDiscordSettingsAction],
  ["listDiscordGuildChannelsAction", listDiscordGuildChannelsAction],
  ["fetchClickUpListsAction", fetchClickUpListsAction as (...args: unknown[]) => Promise<unknown>],
  ["fetchClickUpPreviewAction", fetchClickUpPreviewAction as (...args: unknown[]) => Promise<unknown>],
];

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
  sim.llamadasAPermisos = 0;
  sim.lecturas = [];
  sim.clientes = [];
  sim.tablas = TABLAS;
});

describe("las 16 lecturas de Integraciones", () => {
  it("son 16 y 15 de ellas tienen su caso con datos (el panorama, en su test)", () => {
    expect(LAS_16).toHaveLength(16);
    expect(CASOS.map((caso) => caso.nombre)).toEqual(
      LAS_16.map(([nombre]) => nombre).filter((n) => n !== "getIntegrationsOverviewAction")
    );
  });

  it.each(LAS_16)(
    "⭐ %s, llamada a mano por un member sin Integraciones: devuelve el rechazo y no lee nada",
    async (_nombre, accion) => {
      sim.permisos = memberSinIntegraciones();
      expect(await accion("x", "y", "z")).toEqual(RECHAZO);
      expect(sim.lecturas).toEqual([]);
      expect(sim.llamadasAPermisos).toBe(1);
    }
  );

  const quienesTienenIntegraciones: Array<[string, () => UserPermissions]> = [
    ["el founder", () => FOUNDER],
    ["un member con Integraciones", () => member({ integrations: "view" })],
    ["alguien sin rol", () => member({}, false)],
  ];

  describe.each(quienesTienenIntegraciones)("%s", (_quien, permisos) => {
    it.each(CASOS.map((caso) => [caso.nombre, caso] as const))(
      "%s devuelve lo mismo que antes del chequeo",
      async (_nombre, caso) => {
        sim.permisos = permisos();
        expect(await caso.llamar()).toEqual(caso.valor);
        expect(sim.clientes).toEqual(caso.clientes ?? []);
      }
    );
  });
});

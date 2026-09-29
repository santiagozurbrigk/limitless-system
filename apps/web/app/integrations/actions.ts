"use server";

import { revalidatePath } from "next/cache";
import { getCalendlyIntegrationStatusAction } from "@/app/calendly/actions";
import { getFathomIntegrationStatusAction } from "@/app/fathom/actions";
import {
  getGoogleFormsIntegrationStatusAction,
  getTypeformIntegrationStatusAction,
} from "@/app/forms/actions";
import { getManyChatIntegrationStatusAction } from "@/app/manychat/actions";
import { getYoutubeIntegrationStatusAction } from "@/app/marketing/actions";
import { getZernioIntegrationStatusAction } from "@/app/integrations/zernio/actions";
import { getDiscordIntegrationStatusAction } from "@/app/discord/actions";
import { getGHLIntegrationStatusAction } from "@/app/ghl/actions";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { GoogleIntegrationProvider } from "@/lib/google/oauth-paths";
import { paths } from "@/routes";
import { getVTurbStatusAction } from "@/app/vturb/actions";
import { getWebinarJamStatusAction } from "@/app/webinarjam/actions";
import { getHyrosStatusAction } from "@/app/hyros/actions";
import { getPaymentIntegrationsStatusAction } from "@/app/payments/actions";
import { getGHLOpportunitiesStatusAction } from "@/app/ghl/opportunity-actions";
import { listUnlinkedRecordingsAction } from "@/app/fathom/sales-call-actions";
import {
  buildHealth,
  lastErrorIssue,
  missingConfigIssue,
  noDataYetIssue,
  summarize,
  unmappedEventsIssue,
  type IntegrationHealth,
  type IntegrationIssue,
  type IntegrationsSummary,
} from "@/lib/integrations/health";
import { LISTED_INTEGRATIONS } from "@/lib/integrations/registry";
import {
  requireOrgRole,
  ROLES_CONFIG_ORG,
  SIN_PERMISO_CONFIG_ORG,
} from "@/lib/auth/require-org-role";

const GOOGLE_INTEGRATION_TABLE: Record<
  GoogleIntegrationProvider,
  "google_forms_integrations"
> = {
  google_forms: "google_forms_integrations",
};

/** Desconecta una integración Google (revoca tokens en DB). */
export async function disconnectGoogleIntegrationAction(
  provider: GoogleIntegrationProvider,
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    const admin = createAdminClient();
    const { error } = await admin
      .from(GOOGLE_INTEGRATION_TABLE[provider])
      .update({
        status: "disconnected",
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        last_sync_at: null,
      })
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrations);
  });
}

export async function disconnectInstagramAction(): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    const admin = createAdminClient();
    const { error } = await admin
      .from("instagram_integrations")
      .delete()
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrations);
  });
}

export async function disconnectFathomAction(): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    const admin = createAdminClient();
    const { error } = await admin
      .from("fathom_integrations")
      .delete()
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrations);
  });
}

export async function disconnectManyChatAction(): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    const admin = createAdminClient();
    const { error } = await admin
      .from("manychat_integrations")
      .delete()
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrations);
  });
}

export async function disconnectCalendlyAction(): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    const admin = createAdminClient();

    // Cancelar la suscripción webhook en Calendly antes de borrar la fila
    const { data: integration } = await admin
      .from("calendly_integrations")
      .select("access_token, webhook_subscription_uri")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (integration?.webhook_subscription_uri && integration?.access_token) {
      try {
        await fetch(integration.webhook_subscription_uri, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${integration.access_token}` },
        });
      } catch {
        // No bloquear la desconexión si Calendly no responde
      }
    }

    const { error } = await admin
      .from("calendly_integrations")
      .delete()
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrations);
  });
}

export async function disconnectTypeformAction(): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    const admin = createAdminClient();
    const { error } = await admin
      .from("typeform_integrations")
      .delete()
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrations);
  });
}

export async function disconnectZernioAction(): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    const admin = createAdminClient();
    const { error } = await admin
      .from("zernio_integrations")
      .delete()
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrations);
  });
}

export async function disconnectGHLIntegrationAction(): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    const admin = createAdminClient();
    const { error } = await admin
      .from("ghl_integrations")
      .delete()
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrations);
  });
}

// ─── Conteos ──────────────────────────────────────────────────────────────────
//
// Cuántas filas hay en Limitless gracias a cada integración. Es la respuesta a "¿esto
// está trayendo algo?", que es distinta de "¿está conectado?": una integración
// puede estar conectada y no haber traído nunca nada, y eso es exactamente lo
// que hay que poder ver.
//
// Todos comparten la misma resolución de organización, que ahora está memoizada
// por request (`requireOrganizationId`), así que las ~30 resoluciones que esta
// pantalla disparaba pasaron a ser una.

/**
 * Base común de los conteos.
 *
 * No devuelve el query builder de Postgrest: es un *thenable*, así que una
 * función `async` que lo retornara lo ejecutaría al salir y las funciones de
 * abajo no podrían encadenarle sus filtros.
 */
async function countScope() {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();
  return { supabase, organizationId };
}

function baseCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  table: string,
) {
  return supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
}

async function countManyChatConversations(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { supabase, organizationId } = await countScope();
  const { count } = await baseCount(
    supabase,
    organizationId,
    "conversations",
  ).like("external_ref", "manychat:%");
  return count ?? 0;
}

async function countCalendlyClosingCalls(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { supabase, organizationId } = await countScope();
  const { count } = await baseCount(
    supabase,
    organizationId,
    "closing_calls",
  ).not("calendly_event_id", "is", null);
  return count ?? 0;
}

async function countGHLAppointments(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { supabase, organizationId } = await countScope();
  const { count } = await baseCount(
    supabase,
    organizationId,
    "closing_calls",
  ).not("ghl_appointment_id", "is", null);
  return count ?? 0;
}

async function countFathomCalls(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { supabase, organizationId } = await countScope();
  const { count } = await baseCount(supabase, organizationId, "fathom_calls");
  return count ?? 0;
}

async function countContentAssets(platform: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { supabase, organizationId } = await countScope();
  const { count } = await baseCount(
    supabase,
    organizationId,
    "content_assets",
  ).eq("platform", platform);
  return count ?? 0;
}

/**
 * Mensajes de Discord guardados **sin texto**.
 *
 * Es el modo de falla que el runbook del bot marca como el peligroso: si el
 * intent MESSAGE CONTENT no está activado en el portal de Discord, el bot
 * arranca, se conecta y guarda una fila por mensaje — todas en blanco. Parece
 * que anda. Contarlas es la única forma de verlo desde acá.
 */
async function countDiscordEmptyMessages(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { supabase, organizationId } = await countScope();
  const { count } = await baseCount(
    supabase,
    organizationId,
    "discord_messages",
  ).or("content.is.null,content.eq.");
  return count ?? 0;
}

async function countForms(platform: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { supabase, organizationId } = await countScope();
  const { count } = await baseCount(supabase, organizationId, "forms").eq(
    "platform",
    platform,
  );
  return count ?? 0;
}

// ─── Panorama ─────────────────────────────────────────────────────────────────

export type IntegrationsOverview = {
  healths: IntegrationHealth[];
  summary: IntegrationsSummary;
};

/**
 * Estado de todas las integraciones ofrecidas, con la misma forma para todas.
 *
 * Reemplaza a `listIntegrationsAction`, que devolvía filas del catálogo mock con
 * el estado pegado encima y sólo cubría nueve proveedores: los otros cinco
 * (VTurb, WebinarJam, Hyros, Whop y Commas) vivían en paneles sueltos debajo del
 * grid, cada uno con su propia forma y su propio diseño.
 *
 * Las incidencias que devuelve son todas **estado real leído de la base**, nunca
 * heurísticas. En particular **no** se deriva ninguna alarma de la antigüedad de
 * `last_sync_at`: varios syncs sólo lo escriben cuando ingestaron algo, así que
 * una fecha vieja puede ser una semana tranquila y no una falla.
 */
export async function getIntegrationsOverviewAction(): Promise<IntegrationsOverview> {
  const [
    calendlyStatus,
    ghlStatus,
    ghlOpportunities,
    manychatStatus,
    fathomStatus,
    unlinkedRecordings,
    youtubeStatus,
    typeformStatus,
    googleFormsStatus,
    zernioStatus,
    discordStatus,
    vturbStatus,
    webinarJamStatus,
    hyrosStatus,
    paymentStatuses,
  ] = await Promise.all([
    getCalendlyIntegrationStatusAction(),
    getGHLIntegrationStatusAction(),
    getGHLOpportunitiesStatusAction().catch(() => null),
    getManyChatIntegrationStatusAction(),
    getFathomIntegrationStatusAction(),
    listUnlinkedRecordingsAction().catch(() => []),
    getYoutubeIntegrationStatusAction(),
    getTypeformIntegrationStatusAction(),
    getGoogleFormsIntegrationStatusAction(),
    getZernioIntegrationStatusAction(),
    getDiscordIntegrationStatusAction().catch(() => null),
    getVTurbStatusAction().catch(() => null),
    getWebinarJamStatusAction().catch(() => null),
    getHyrosStatusAction().catch(() => null),
    getPaymentIntegrationsStatusAction().catch(() => []),
  ]);

  const [
    calendlyRecords,
    ghlRecords,
    manychatRecords,
    fathomRecords,
    youtubeRecords,
    typeformRecords,
    googleFormsRecords,
    discordEmptyMessages,
  ] = await Promise.all([
    calendlyStatus.connected ? countCalendlyClosingCalls() : 0,
    ghlStatus.connected ? countGHLAppointments() : 0,
    manychatStatus.connected ? countManyChatConversations() : 0,
    fathomStatus.connected ? countFathomCalls() : 0,
    youtubeStatus.connected ? countContentAssets("youtube") : 0,
    typeformStatus.connected ? countForms("typeform") : 0,
    googleFormsStatus.connected ? countForms("google_forms") : 0,
    discordStatus?.connected ? countDiscordEmptyMessages() : 0,
  ]);

  const byProvider = new Map<string, IntegrationHealth>();

  // ── Ventas y conversaciones ────────────────────────────────────────────────

  byProvider.set(
    "zernio",
    buildHealth({
      provider: "zernio",
      connected: zernioStatus.connected,
      accountLabel: zernioStatus.accountName,
      lastSyncAt: zernioStatus.lastSyncAt,
      records: zernioStatus.connectedAccounts.length,
      recordsLabel: "cuentas vinculadas",
      issues:
        zernioStatus.connectedAccounts.length === 0
          ? [
              {
                level: "warning",
                message:
                  "La cuenta está conectada pero no tiene ningún canal vinculado.",
                action:
                  "Vinculá Instagram o WhatsApp en Zernio: sin canales, el inbox llega vacío.",
              },
            ]
          : [],
    }),
  );

  byProvider.set(
    "manychat",
    buildHealth({
      provider: "manychat",
      connected: manychatStatus.connected,
      accountLabel: manychatStatus.pageName ?? null,
      lastSyncAt: manychatStatus.lastSyncAt ?? null,
      records: manychatRecords,
      recordsLabel: "conversaciones",
      issues: [
        ...noDataYetIssue(
          manychatRecords,
          "ningún mensaje",
          "Los mensajes entran por una External Request de ManyChat: revisá que el flujo apunte a la URL del webhook.",
        ),
      ],
    }),
  );

  byProvider.set(
    "calendly",
    buildHealth({
      provider: "calendly",
      connected: calendlyStatus.connected,
      lastSyncAt: calendlyStatus.lastSyncAt ?? null,
      records: calendlyRecords,
      recordsLabel: "turnos",
      issues: calendlyStatus.webhookEnabled
        ? []
        : [
            {
              level: "warning",
              message:
                "Calendly no aceptó registrar el webhook, así que los turnos nuevos no entran solos.",
              action:
                "Sincronizá a mano desde acá, o pasá la cuenta a un plan Standard o superior.",
            },
          ],
    }),
  );

  byProvider.set(
    "ghl",
    buildHealth({
      provider: "ghl",
      connected: ghlStatus.connected,
      accountLabel: ghlStatus.locationId,
      lastSyncAt: ghlStatus.lastSyncAt,
      records: ghlRecords,
      recordsLabel: "turnos",
      issues: ghlIssues(ghlStatus, ghlOpportunities),
    }),
  );

  byProvider.set(
    "fathom",
    buildHealth({
      provider: "fathom",
      connected: fathomStatus.connected,
      lastSyncAt: fathomStatus.lastSyncAt,
      records: fathomRecords,
      recordsLabel: "grabaciones",
      issues: [
        ...noDataYetIssue(
          fathomRecords,
          "ninguna grabación",
          "Sincronizá para traer las reuniones de los últimos 90 días.",
        ),
        ...(unlinkedRecordings.length > 0
          ? [
              {
                level: "info" as const,
                message: `${unlinkedRecordings.length} grabaciones no cruzaron con ningún turno agendado.`,
                action:
                  "Estar en esa lista no es un error: una reunión de equipo no es una llamada de venta. Vinculá a mano las que sí lo eran.",
              },
            ]
          : []),
      ],
    }),
  );

  // ── Marketing y contenido ──────────────────────────────────────────────────

  // El estado del Ecosistema Google es el del consentimiento OAuth, que es lo
  // único que ese flujo escribe. La versión anterior lo daba por conectado
  // también cuando había YouTube, y YouTube se conecta por su cuenta con una API
  // key: un canal cargado a mano dejaba a Drive y Forms marcados como conectados
  // sin que nadie hubiera aceptado ningún permiso.
  byProvider.set(
    "google_ecosystem",
    buildHealth({
      provider: "google_ecosystem",
      connected: googleFormsStatus.connected,
      lastSyncAt: googleFormsStatus.lastSyncAt,
      records: googleFormsRecords,
      recordsLabel: "formularios",
      issues: noDataYetIssue(
        googleFormsRecords,
        "ningún formulario",
        "Drive funciona igual: los formularios aparecen cuando el sync horario encuentra alguno en la cuenta.",
      ),
    }),
  );

  byProvider.set(
    "youtube",
    buildHealth({
      provider: "youtube",
      connected: youtubeStatus.connected,
      accountLabel: youtubeStatus.channelName,
      lastSyncAt: youtubeStatus.lastSyncAt,
      records: youtubeRecords,
      recordsLabel: "videos",
      issues: noDataYetIssue(youtubeRecords, "ningún video del canal"),
    }),
  );

  byProvider.set(
    "typeform",
    buildHealth({
      provider: "typeform",
      connected: typeformStatus.connected,
      lastSyncAt: typeformStatus.lastSyncAt,
      records: typeformRecords,
      recordsLabel: "formularios",
      issues: noDataYetIssue(typeformRecords, "ningún formulario"),
    }),
  );

  // ── Medición de embudos ────────────────────────────────────────────────────

  byProvider.set(
    "vturb",
    buildHealth({
      provider: "vturb",
      connected: Boolean(vturbStatus?.connected),
      lastSyncAt: vturbStatus?.playersSyncedAt ?? null,
      records: vturbStatus?.playerCount ?? 0,
      recordsLabel: "videos",
      issues: [
        ...lastErrorIssue(vturbStatus?.lastError),
        ...missingConfigIssue({
          missing: vturbStatus?.playersWithoutPitchTime ?? 0,
          total: vturbStatus?.playerCount ?? 0,
          what: "videos no tienen configurado el pitch time en VTurb",
          breaks:
            'la medida "llegaron al CTA" no se puede calcular: VTurb devuelve un número que parece el correcto y cuenta a casi todo el que abrió el video',
          action:
            "Se arregla en VTurb, no acá: entrá a cada player y marcá en qué segundo aparece la oferta.",
        }),
      ],
    }),
  );

  byProvider.set(
    "webinarjam",
    buildHealth({
      provider: "webinarjam",
      connected: Boolean(webinarJamStatus?.connected),
      lastSyncAt:
        webinarJamStatus?.registrantsSyncedAt ??
        webinarJamStatus?.webinarsSyncedAt ??
        null,
      records: webinarJamStatus?.registrantCount ?? 0,
      recordsLabel: "registrados",
      issues: [
        ...lastErrorIssue(webinarJamStatus?.lastError),
        ...missingConfigIssue({
          missing: webinarJamStatus?.webinarsWithoutPitch ?? 0,
          total: webinarJamStatus?.webinarCount ?? 0,
          what: "webinars no tienen cargado el segundo en que aparece la oferta",
          breaks: "no se puede medir cuántos se quedaron hasta la oferta",
          action: "Cargá ese segundo en el detalle de cada webinar.",
        }),
      ],
    }),
  );

  byProvider.set(
    "hyros",
    buildHealth({
      provider: "hyros",
      connected: Boolean(hyrosStatus?.connected),
      accountLabel: hyrosStatus?.attributionModel ?? null,
      lastSyncAt: hyrosStatus?.adAccountsSyncedAt ?? null,
      records: hyrosStatus?.adAccounts.length ?? 0,
      recordsLabel: "cuentas publicitarias",
      issues: [
        ...lastErrorIssue(hyrosStatus?.lastError),
        ...noDataYetIssue(
          hyrosStatus?.adAccounts.length ?? 0,
          "ninguna cuenta publicitaria",
          "Sin cuentas no se puede pedir ningún número de atribución: sincronizá el catálogo.",
        ),
      ],
    }),
  );

  // ── Cobros ─────────────────────────────────────────────────────────────────

  for (const provider of ["whop", "fanbasis"] as const) {
    const status = paymentStatuses.find((row) => row.provider === provider);
    byProvider.set(
      provider,
      buildHealth({
        provider,
        connected: Boolean(status?.connected),
        lastSyncAt: status?.lastEventAt ?? null,
        records: null,
        recordsLabel: null,
        issues: [
          ...unmappedEventsIssue(status?.unmappedEvents ?? 0),
          ...(status?.connected && !status.lastEventAt
            ? [
                {
                  level: "info" as const,
                  message: "Todavía no llegó ningún evento.",
                  action:
                    "Registrá la URL del webhook en el panel del proveedor y hacé un cobro de prueba.",
                },
              ]
            : []),
        ],
      }),
    );
  }

  // ── Operación y datos ──────────────────────────────────────────────────────

  byProvider.set(
    "discord",
    buildHealth({
      provider: "discord",
      connected: Boolean(discordStatus?.connected),
      accountLabel: discordStatus?.integration?.guild_name ?? null,
      lastSyncAt: discordStatus?.integration?.last_event_at ?? null,
      records: discordStatus?.stats.messagesCount ?? 0,
      recordsLabel: "mensajes",
      issues: discordIssues(discordStatus, discordEmptyMessages),
    }),
  );

  byProvider.set(
    "clickup",
    buildHealth({
      provider: "clickup",
      // ClickUp no mantiene conexión: es una importación puntual con un token
      // que se pide en el momento. No hay estado que persistir.
      connected: false,
    }),
  );

  const healths = LISTED_INTEGRATIONS.map(
    (definition) =>
      byProvider.get(definition.provider) ??
      buildHealth({ provider: definition.provider, connected: false }),
  );

  return { healths, summary: summarize(healths) };
}

/**
 * Estado del bot de Discord.
 *
 * Entrar el bot al servidor no alcanza: hay que elegir qué canales lee. Sin esa
 * segunda mitad el bot está adentro y mudo, y desde afuera se ve igual que si
 * funcionara.
 */
function discordIssues(
  status: {
    connected: boolean;
    integration: { monitored_channels?: unknown[] | null } | null;
    stats: { messagesCount: number };
  } | null,
  emptyMessages: number,
): IntegrationIssue[] {
  if (!status?.connected) return [];

  const issues: IntegrationIssue[] = [];
  const monitored = status.integration?.monitored_channels?.length ?? 0;

  if (monitored === 0) {
    issues.push({
      level: "warning",
      message:
        "El bot está en el servidor pero no hay ningún canal marcado para monitorear.",
      action:
        "Elegí los canales en la configuración: hasta entonces el bot está adentro y no lee nada.",
    });
  }

  if (emptyMessages > 0) {
    issues.push({
      level: "error",
      message: `${emptyMessages} mensajes se guardaron sin texto.`,
      action:
        "Falta activar MESSAGE CONTENT INTENT en discord.com/developers → tu app → Bot. Sin eso el bot guarda una fila por mensaje y todas quedan en blanco.",
    });
  }

  issues.push(
    ...noDataYetIssue(
      status.stats.messagesCount,
      "ningún mensaje",
      monitored > 0
        ? "El bot sólo lee los canales monitoreados: escribí uno para probar."
        : undefined,
    ),
  );

  return issues;
}

/**
 * Las oportunidades de GHL son el mismo proveedor que los turnos, pero otro
 * recurso: se configuran aparte y pueden estar a medias mientras los turnos
 * funcionan. Por eso sus avisos cuelgan de la misma tarjeta.
 */
function ghlIssues(
  status: { connected: boolean; selectedCalendarIds: string[] },
  opportunities: {
    pipelineCount: number;
    hasWebhookSecret: boolean;
    transitionCount: number;
  } | null,
): IntegrationIssue[] {
  if (!status.connected) return [];

  const issues: IntegrationIssue[] = [];

  if (status.selectedCalendarIds.length === 0) {
    issues.push({
      level: "warning",
      message: "No hay ningún calendario seleccionado para sincronizar.",
      action: "Elegí los calendarios de los que salen las llamadas de venta.",
    });
  }

  if (opportunities && opportunities.pipelineCount === 0) {
    issues.push({
      level: "warning",
      message: "El catálogo de pipelines y etapas está vacío.",
      action:
        "Sincronizalo: sin él no se puede configurar ningún paso del embudo contra una etapa.",
    });
  }

  if (opportunities && !opportunities.hasWebhookSecret) {
    issues.push({
      level: "warning",
      message:
        "Falta el secreto del webhook de oportunidades, así que los cambios de etapa no llegan.",
      action:
        "Generalo acá y pegá la URL en una acción «Webhook» de un Workflow de la sub-cuenta.",
    });
  }

  if (
    opportunities &&
    opportunities.hasWebhookSecret &&
    opportunities.transitionCount === 0
  ) {
    issues.push({
      level: "info",
      message: "Todavía no llegó ningún cambio de etapa.",
      action:
        "El historial de etapas arranca con el primer evento: GHL no lo expone hacia atrás.",
    });
  }

  return issues;
}

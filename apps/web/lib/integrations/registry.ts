import type { IntegrationProvider } from "@/constants/integrations";
import { ESCONDIDO } from "@/lib/release/escondido";

/**
 * lib/integrations/registry.ts — **registro único de integraciones**.
 *
 * Antes esta información estaba repartida en cuatro lugares que se contradecían:
 * `mocks/integrations.ts` (el catálogo, con filas inventadas mezcladas con las
 * reales), `integration-groups.ts` (agrupación y descripciones), dos `Set`
 * hardcodeados en `app/integrations/actions.ts` y una cascada de `if (provider
 * === …)` en la tarjeta. Agregar una integración obligaba a tocar los cuatro, y
 * olvidarse de uno la dejaba a medias sin que nada fallara.
 *
 * Acá vive **qué es** cada integración. El estado en vivo —si está conectada,
 * cuándo sincronizó, qué se rompió— es otra cosa y vive en `health.ts`.
 *
 * ⚠️ Reglas para agregar una integración:
 *  1. Agregar el id en `constants/integrations.ts`.
 *  2. Agregar su entrada acá (el tipo obliga a completarla entera).
 *  3. Agregar su color en `brand-colors.ts`.
 *  4. Devolver su `IntegrationHealth` en `app/integrations/actions.ts`.
 * Nada más. La UI se arma sola a partir de esto.
 */

// ─── Taxonomía ────────────────────────────────────────────────────────────────

export const INTEGRATION_CATEGORIES = [
  "ventas",
  "marketing",
  "embudos",
  "pagos",
  "operacion",
] as const;

export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  ventas: "Ventas y conversaciones",
  marketing: "Marketing y contenido",
  embudos: "Medición de embudos",
  pagos: "Cobros",
  operacion: "Operación y datos",
};

export const CATEGORY_DESCRIPTIONS: Record<IntegrationCategory, string> = {
  ventas: "De dónde salen los turnos, las llamadas y las conversaciones.",
  marketing: "Contenido publicado, formularios y su rendimiento.",
  embudos: "Las medidas que el módulo de Embudos no puede calcular solo.",
  pagos: "Cobros, reembolsos y valor contratado.",
  operacion: "Comunidad, importaciones y datos internos.",
};

/** Cómo se autentica la integración. Define la superficie de conexión. */
export type IntegrationAuth =
  | "oauth"
  | "api_key"
  | "webhook"
  | "bot"
  | "import";

export const AUTH_LABELS: Record<IntegrationAuth, string> = {
  oauth: "OAuth",
  api_key: "API key",
  webhook: "Webhook firmado",
  bot: "Bot OAuth",
  import: "Importación manual",
};

/** Cómo llegan los datos, que es lo que decide qué tan fresco está todo. */
export type IntegrationTransport =
  | "webhook"
  | "cron"
  | "manual"
  | "live"
  | "oneshot";

export const TRANSPORT_LABELS: Record<IntegrationTransport, string> = {
  webhook: "Webhook en tiempo real",
  cron: "Sincronización programada",
  manual: "Sincronización manual",
  live: "Consulta en vivo",
  oneshot: "Importación puntual",
};

/**
 * Cómo se abre la conexión desde la UI.
 *
 * `redirect` manda al navegador a una ruta del servidor que arma el `state`;
 * `dialog` abre un formulario propio; `panel` usa el panel de detalle de la
 * tarjeta, porque el proveedor necesita configuración además de credenciales.
 */
export type IntegrationConnectSurface = "redirect" | "dialog" | "panel";

// ─── Definición ───────────────────────────────────────────────────────────────

export type IntegrationDataFlow = {
  /** `in` = Limitless lee del proveedor · `out` = Limitless escribe en el proveedor. */
  direction: "in" | "out";
  /** Qué se mueve, en palabras del negocio. */
  label: string;
  /** Dónde queda en Limitless (tabla, o "en vivo" si no se persiste). */
  lands: string;
  transport: IntegrationTransport;
};

export type IntegrationDefinition = {
  provider: IntegrationProvider;
  name: string;
  category: IntegrationCategory;
  auth: IntegrationAuth;
  /** Una línea: qué resuelve. Se ve en la tarjeta. */
  summary: string;
  /** Qué módulos de Limitless dejan de funcionar sin esto. */
  feeds: string[];
  /** El detalle de qué datos se mueven, en qué dirección y cómo. */
  dataFlows: IntegrationDataFlow[];
  connect: IntegrationConnectSurface;
  /** Ruta a la que redirige `connect: "redirect"`. */
  connectUrl?: string;
  /** Documentación oficial capturada en el repo, si la hay. */
  localDocs?: string;
  /**
   * `false` cuando la integración existe en el código pero todavía no se ofrece
   * en la pantalla. Reemplaza a los dos `Set` que antes decidían esto en dos
   * lugares distintos y podían discrepar.
   */
  listed: boolean;
  /** Por qué no se lista. Obliga a justificar el ocultamiento. */
  unlistedReason?: string;
};

// ─── El registro ──────────────────────────────────────────────────────────────

const DEFINITIONS: IntegrationDefinition[] = [
  // ── Ventas y conversaciones ────────────────────────────────────────────────
  {
    provider: "zernio",
    name: "Zernio",
    category: "ventas",
    auth: "api_key",
    summary:
      "Inbox unificado de Instagram Direct y WhatsApp, más el contenido publicado y sus anuncios.",
    feeds: ["Inbox de ventas", "Contenido", "Anuncios"],
    dataFlows: [
      {
        direction: "in",
        label: "Conversaciones y mensajes",
        lands: "En vivo — no se duplican en la base",
        transport: "live",
      },
      {
        direction: "in",
        label: "Posts publicados y sus métricas",
        lands: "content_pieces",
        transport: "cron",
      },
      {
        direction: "in",
        label: "Comentarios y anuncios de Meta vinculados",
        lands: "En vivo — no se duplican en la base",
        transport: "live",
      },
      {
        direction: "out",
        label: "Respuestas a mensajes y comentarios",
        lands: "Zernio",
        transport: "live",
      },
    ],
    connect: "dialog",
    listed: true,
  },
  {
    provider: "manychat",
    name: "ManyChat",
    category: "ventas",
    auth: "api_key",
    summary:
      "DMs de Instagram con scoring de IA. Los mensajes nuevos entran por External Request.",
    feeds: ["Inbox de ventas", "Scoring de leads"],
    dataFlows: [
      {
        direction: "in",
        label: "Mensajes nuevos",
        lands: "conversations",
        transport: "webhook",
      },
      {
        direction: "in",
        label: "Contactos importados a mano",
        lands: "conversations",
        transport: "manual",
      },
    ],
    connect: "dialog",
    // Escondida para el release (SCRUM-490): lo que trae va a una bandeja que
    // ninguna pantalla muestra. Las orgs conectadas siguen recibiendo igual.
    listed: !ESCONDIDO.integracionManyChat,
    unlistedReason: ESCONDIDO.integracionManyChat
      ? "Escondida para el release de octubre: los mensajes no se muestran en ninguna pantalla."
      : undefined,
  },
  {
    provider: "calendly",
    name: "Calendly",
    category: "ventas",
    auth: "oauth",
    summary:
      "Turnos agendados y cancelaciones. Es una de las dos fuentes de llamadas de cierre.",
    feeds: ["Closing", "Seguimiento de leads"],
    dataFlows: [
      {
        direction: "in",
        label: "Turnos agendados y cancelados",
        lands: "closing_calls",
        transport: "webhook",
      },
      {
        direction: "in",
        label: "Respaldo horario de los turnos",
        lands: "closing_calls",
        transport: "cron",
      },
    ],
    connect: "redirect",
    connectUrl: "/api/integrations/calendly/oauth/start",
    listed: true,
  },
  {
    provider: "ghl",
    name: "GoHighLevel",
    category: "ventas",
    auth: "api_key",
    summary:
      "Turnos del calendario y oportunidades del pipeline. Alternativa a Calendly.",
    feeds: ["Closing", "Embudos", "Seguimiento de leads"],
    dataFlows: [
      {
        direction: "in",
        label: "Turnos del calendario",
        lands: "closing_calls",
        transport: "cron",
      },
      {
        direction: "in",
        label: "Catálogo de pipelines y etapas",
        lands: "ghl_pipelines · ghl_pipeline_stages",
        transport: "manual",
      },
      {
        direction: "in",
        label: "Altas y cambios de etapa de oportunidades",
        lands: "ghl_opportunities · ghl_stage_transitions",
        transport: "webhook",
      },
    ],
    connect: "dialog",
    localDocs: "docs/external-apis/gohighlevel/RESUMEN-LIMITLESS.md",
    listed: true,
  },
  {
    provider: "fathom",
    name: "Fathom",
    category: "ventas",
    auth: "api_key",
    summary:
      "Grabaciones y transcripciones de las llamadas de venta, cruzadas contra los turnos agendados.",
    feeds: ["Closing", "Llamadas de venta", "Contexto del agente"],
    dataFlows: [
      {
        direction: "in",
        label: "Reuniones y transcripciones",
        lands: "fathom_calls",
        transport: "cron",
      },
      {
        direction: "in",
        label: "Grabaciones nuevas",
        lands: "fathom_calls",
        transport: "webhook",
      },
      {
        direction: "in",
        label: "Análisis de la llamada con IA",
        lands: "fathom_calls",
        transport: "cron",
      },
      {
        // Alguien pega el link de «Compartir» en la ficha de un cliente y la
        // sesión 1-1 entra con su transcripción. Es el único camino que anda
        // cuando la grabación es de la cuenta de otro —un coach externo— porque
        // no usa la clave de API de la organización.
        direction: "in",
        label: "Sesión 1-1 desde un link compartido",
        lands: "fathom_calls",
        transport: "manual",
      },
    ],
    connect: "dialog",
    localDocs: "docs/external-apis/fathom/RESUMEN-LIMITLESS.md",
    listed: true,
  },
  {
    provider: "unipile_whatsapp",
    name: "WhatsApp",
    category: "ventas",
    auth: "oauth",
    summary: "WhatsApp personal en el inbox de ventas, vía Unipile.",
    feeds: ["Inbox de ventas"],
    dataFlows: [
      {
        direction: "in",
        label: "Mensajes de WhatsApp",
        lands: "conversations",
        transport: "webhook",
      },
    ],
    connect: "redirect",
    connectUrl: "/api/integrations/unipile/connect?provider=whatsapp",
    listed: false,
    unlistedReason:
      "Reemplazado por el inbox de Zernio, que cubre el mismo canal.",
  },
  {
    provider: "unipile_instagram",
    name: "Instagram DMs",
    category: "ventas",
    auth: "oauth",
    summary: "DMs de Instagram personal en el inbox de ventas, vía Unipile.",
    feeds: ["Inbox de ventas"],
    dataFlows: [
      {
        direction: "in",
        label: "Mensajes directos",
        lands: "conversations",
        transport: "webhook",
      },
    ],
    connect: "redirect",
    connectUrl: "/api/integrations/unipile/connect?provider=instagram",
    listed: false,
    unlistedReason:
      "Reemplazado por el inbox de Zernio, que cubre el mismo canal.",
  },

  // ── Marketing y contenido ──────────────────────────────────────────────────
  {
    provider: "google_ecosystem",
    name: "Ecosistema Google",
    category: "marketing",
    auth: "oauth",
    summary:
      "Drive y Forms en un solo consentimiento, más YouTube si el canal está en la misma cuenta.",
    feeds: ["Contenido", "Formularios", "Base de conocimiento"],
    dataFlows: [
      {
        direction: "in",
        label: "Archivos y carpetas de Drive",
        lands: "En vivo — no se duplican en la base",
        transport: "live",
      },
      {
        direction: "in",
        label: "Formularios y respuestas",
        lands: "forms · form_responses",
        transport: "cron",
      },
      {
        direction: "out",
        label: "Carpetas creadas desde Contenido",
        lands: "Google Drive",
        transport: "manual",
      },
    ],
    connect: "dialog",
    listed: true,
  },
  {
    provider: "youtube",
    name: "YouTube",
    category: "marketing",
    auth: "api_key",
    summary:
      "Videos del canal y su rendimiento, cuando el canal no está en la cuenta de Google conectada.",
    feeds: ["Contenido"],
    dataFlows: [
      {
        direction: "in",
        label: "Videos del canal y sus métricas",
        lands: "content_assets",
        transport: "cron",
      },
    ],
    connect: "dialog",
    listed: true,
  },
  {
    provider: "typeform",
    name: "Typeform",
    category: "marketing",
    auth: "oauth",
    summary: "Formularios, respuestas y calificación de leads.",
    feeds: ["Formularios", "Scoring de leads"],
    dataFlows: [
      {
        direction: "in",
        label: "Formularios y respuestas",
        lands: "forms · form_responses",
        transport: "cron",
      },
    ],
    connect: "redirect",
    connectUrl: "/api/integrations/typeform/oauth/start",
    listed: true,
  },
  {
    provider: "instagram",
    name: "Instagram",
    category: "marketing",
    auth: "oauth",
    summary: "Rendimiento del contenido publicado, vía Instagram Graph.",
    feeds: ["Contenido"],
    dataFlows: [
      {
        direction: "in",
        label: "Publicaciones y métricas",
        lands: "content_assets",
        transport: "cron",
      },
      {
        direction: "in",
        label: "Mensajes directos",
        lands: "conversations",
        transport: "cron",
      },
    ],
    connect: "redirect",
    connectUrl: "/api/integrations/instagram/connect",
    listed: false,
    unlistedReason:
      "Zernio cubre contenido y mensajes de Instagram sin pedir una app de Meta propia.",
  },
  {
    provider: "google_forms",
    name: "Google Forms",
    category: "marketing",
    auth: "oauth",
    summary: "Formularios y respuestas de Google Forms.",
    feeds: ["Formularios"],
    dataFlows: [
      {
        direction: "in",
        label: "Formularios y respuestas",
        lands: "forms · form_responses",
        transport: "cron",
      },
    ],
    connect: "redirect",
    connectUrl: "/api/integrations/google-forms/oauth/start",
    listed: false,
    unlistedReason:
      "Se conecta dentro del Ecosistema Google, que pide los permisos de Drive y Forms juntos.",
  },

  // ── Medición de embudos ────────────────────────────────────────────────────
  {
    provider: "vturb",
    name: "VTurb",
    category: "embudos",
    auth: "api_key",
    summary:
      "Hosting de los VSL. Da las reproducciones, la retención y cuántos llegaron a la oferta.",
    feeds: ["Embudos — etapa Engaged del VSL"],
    dataFlows: [
      {
        direction: "in",
        label: "Catálogo de videos y su pitch time",
        lands: "vturb_players",
        transport: "manual",
      },
      {
        direction: "in",
        label: "Reproducciones, retención y llegadas al CTA",
        lands: "En vivo — consultado al abrir el embudo",
        transport: "live",
      },
    ],
    connect: "panel",
    localDocs: "docs/external-apis/vturb/RESUMEN-LIMITLESS.md",
    listed: true,
  },
  {
    provider: "webinarjam",
    name: "WebinarJam",
    category: "embudos",
    auth: "api_key",
    summary:
      "Registrados, asistencia y permanencia hasta la oferta. Cubre también EverWebinar.",
    feeds: ["Embudos — etapa Webinar"],
    dataFlows: [
      {
        direction: "in",
        label: "Catálogo de webinars y sus fechas",
        lands: "webinarjam_webinars",
        transport: "manual",
      },
      {
        direction: "in",
        label: "Registrados y asistencia",
        lands: "webinarjam_registrants",
        transport: "manual",
      },
    ],
    connect: "panel",
    localDocs: "docs/external-apis/webinarjam/RESUMEN-LIMITLESS.md",
    listed: true,
  },
  {
    provider: "hyros",
    name: "Hyros",
    category: "embudos",
    auth: "api_key",
    summary:
      "Atribución por fuente: qué anuncio trajo cada lead y cada venta. Es lo que separa el ROAS por fuente del blended.",
    feeds: ["Embudos — atribución", "Reportes ejecutivos"],
    dataFlows: [
      {
        direction: "in",
        label: "Cuentas publicitarias",
        lands: "hyros_ad_accounts",
        transport: "manual",
      },
      {
        direction: "in",
        label: "Recorrido de cada lead y su atribución",
        lands: "En vivo — consultado al abrir el reporte",
        transport: "live",
      },
    ],
    connect: "panel",
    localDocs: "docs/external-apis/hyros/RESUMEN-LIMITLESS.md",
    listed: true,
  },

  // ── Cobros ─────────────────────────────────────────────────────────────────
  {
    provider: "whop",
    name: "Whop",
    category: "pagos",
    auth: "webhook",
    summary:
      "Cobros, reembolsos y altas de membresía. Los montos llegan en decimales de la moneda.",
    feeds: ["Embudos — etapa Cash", "Finanzas"],
    dataFlows: [
      {
        direction: "in",
        label: "Cobros y reembolsos",
        lands: "payment_transactions",
        transport: "webhook",
      },
      {
        direction: "in",
        label: "Altas de membresía y facturas pagas",
        lands: "payment_orders",
        transport: "webhook",
      },
    ],
    connect: "panel",
    localDocs: "docs/external-apis/whop/RESUMEN-LIMITLESS.md",
    listed: true,
  },
  {
    provider: "fanbasis",
    name: "Commas",
    category: "pagos",
    auth: "webhook",
    summary:
      "Cobros, reembolsos y suscripciones. Antes se llamaba Fanbasis; los montos llegan en centavos.",
    feeds: ["Embudos — etapa Cash", "Finanzas"],
    dataFlows: [
      {
        direction: "in",
        label: "Cobros, reembolsos y compras de producto",
        lands: "payment_transactions",
        transport: "webhook",
      },
      {
        direction: "in",
        label: "Altas de suscripción",
        lands: "payment_orders",
        transport: "webhook",
      },
    ],
    connect: "panel",
    localDocs: "docs/external-apis/commas/RESUMEN-LIMITLESS.md",
    listed: true,
  },
  {
    provider: "stripe",
    name: "Stripe",
    category: "pagos",
    auth: "oauth",
    summary: "Cobros con Stripe Connect.",
    feeds: ["Finanzas"],
    dataFlows: [
      {
        direction: "in",
        label: "Cobros",
        lands: "payments",
        transport: "webhook",
      },
    ],
    connect: "redirect",
    connectUrl: "/api/integrations/stripe/connect",
    listed: false,
    unlistedReason:
      "Los cobros de los clientes actuales pasan por Whop y Commas. Queda conectable, pero no se ofrece.",
  },
  {
    provider: "mercadopago",
    name: "Mercado Pago",
    category: "pagos",
    auth: "oauth",
    summary: "Cobros con Mercado Pago.",
    feeds: ["Finanzas"],
    dataFlows: [
      {
        direction: "in",
        label: "Cobros",
        lands: "payments",
        transport: "webhook",
      },
    ],
    connect: "redirect",
    connectUrl: "/api/integrations/mercadopago/connect",
    listed: false,
    unlistedReason:
      "Los cobros de los clientes actuales pasan por Whop y Commas. Queda conectable, pero no se ofrece.",
  },

  // ── Operación y datos ──────────────────────────────────────────────────────
  {
    provider: "discord",
    name: "Discord",
    category: "operacion",
    auth: "bot",
    summary:
      "Conversaciones con clientes en el servidor, con detección automática de testimonios.",
    feeds: ["Clientes", "Testimonios"],
    dataFlows: [
      {
        direction: "in",
        label: "Mensajes de los canales vinculados",
        lands: "discord_messages",
        transport: "webhook",
      },
    ],
    connect: "redirect",
    connectUrl: "/api/integrations/discord/oauth/start",
    listed: true,
  },
  {
    provider: "clickup",
    name: "ClickUp",
    category: "operacion",
    auth: "import",
    summary:
      "Importación puntual de clientes desde ClickUp, con mapeo de campos personalizados.",
    feeds: ["Clientes"],
    dataFlows: [
      {
        direction: "in",
        label: "Tareas convertidas en clientes",
        lands: "clients",
        transport: "oneshot",
      },
    ],
    connect: "dialog",
    listed: true,
  },
];

// ─── Acceso ───────────────────────────────────────────────────────────────────

const BY_PROVIDER = new Map<IntegrationProvider, IntegrationDefinition>(
  DEFINITIONS.map((definition) => [definition.provider, definition]),
);

export const INTEGRATION_DEFINITIONS: readonly IntegrationDefinition[] =
  DEFINITIONS;

/** Las que se ofrecen en la pantalla. */
export const LISTED_INTEGRATIONS: readonly IntegrationDefinition[] =
  DEFINITIONS.filter((definition) => definition.listed);

export function getIntegrationDefinition(
  provider: IntegrationProvider,
): IntegrationDefinition {
  const definition = BY_PROVIDER.get(provider);
  if (!definition) {
    throw new Error(
      `Falta la entrada de "${provider}" en lib/integrations/registry.ts`,
    );
  }
  return definition;
}

/**
 * Agrupa por categoría respetando el orden de `INTEGRATION_CATEGORIES` y
 * omitiendo las categorías que quedaron vacías después de filtrar.
 */
export function groupByCategory<T extends { provider: IntegrationProvider }>(
  items: T[],
): { category: IntegrationCategory; label: string; items: T[] }[] {
  return INTEGRATION_CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    items: items.filter(
      (item) => getIntegrationDefinition(item.provider).category === category,
    ),
  })).filter((group) => group.items.length > 0);
}

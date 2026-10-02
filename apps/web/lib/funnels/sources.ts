/**
 * lib/funnels/sources.ts
 *
 * Catálogo de fuentes de datos que pueden alimentar un step de embudo.
 *
 * Cada fuente declara de dónde sale el número y con qué procedencia, para poder
 * etiquetar cada figura como pide el documento ("label each figure with its
 * source"). El binding step → fuente vive en `funnel_step_bindings`.
 *
 * Un step SIN binding resuelve a `null`, nunca a `0` (§9.1).
 *
 * Sólo se listan fuentes respaldadas por tablas que existen hoy en Limitless. Las
 * etapas que dependen de integraciones faltantes (webinar, VSL) no tienen fuente
 * y por diseño quedan en "sin datos" hasta que esas integraciones existan — ver
 * docs/specs/FUNNELS_ARCHITECTURE.md §7.
 */

import type { SpineStageId } from "./spine";
import type { InstrumentationToolId } from "./instrumentation";

/** Tipo de dato que pide un parámetro de fuente, para que la UI sepa qué mostrar. */
export type FunnelSourceConfigKind =
  | "ghl_stage"
  | "ghl_pipeline"
  | "vturb_player"
  | "webinarjam_webinar"
  | "form";

export type FunnelSourceConfigField = {
  key: string;
  label: string;
  kind: FunnelSourceConfigKind;
  required: boolean;
};

export const FUNNEL_SOURCES = [
  {
    id: "ad_clicks",
    label: "Clicks en anuncios",
    description: "Clicks de Meta capturados por día en el período (M04).",
    provenance: "meta_ads",
    suitableFor: ["click"],
  },
  {
    id: "zernio_comment_triggers",
    label: "Comentarios que disparan un DM (Zernio)",
    description:
      "Comentarios recibidos en el período, como disparador de conversación (M34). Las historias no se pueden contar: Meta sólo expone las vigentes de las últimas 24 h.",
    provenance: "crm_pipeline",
    // Etapa Click: el trigger ocurre ANTES de que exista la conversación.
    suitableFor: ["click"],
  },
  {
    id: "hyros_landing_visitors",
    label: "Visitantes de la página (Hyros)",
    description:
      "Visitantes nuevos atribuidos por Hyros en el período (M08). Sirve para landings sin VSL, donde VTurb no llega.",
    provenance: "hyros",
    suitableFor: ["click"],
  },
  {
    id: "hyros_optins",
    label: "Opt-ins atribuidos (Hyros)",
    description:
      "Leads atribuidos a las fuentes pagas en el período (M06 y M09). Es el número [Hyros], que no tiene por qué coincidir con el de la plataforma.",
    provenance: "hyros",
    suitableFor: ["lead"],
  },
  {
    id: "conversations_opened",
    label: "Conversaciones abiertas",
    description: "Conversaciones del inbox creadas dentro del período.",
    provenance: "crm_pipeline",
    // Sólo `lead`. Una conversación abierta NO es un disparador: en el documento
    // la etapa Click del DM es el "Trigger (comment / story / ad)", que es lo que
    // ocurre ANTES de que el hilo exista.
    suitableFor: ["lead"],
  },
  {
    id: "conversations_replied",
    label: "Conversaciones con respuesta del lead",
    description: "Conversaciones con más de un mensaje: hubo ida y vuelta real.",
    provenance: "crm_pipeline",
    suitableFor: ["engaged"],
  },
  {
    id: "conversations_booked",
    label: "Conversaciones agendadas",
    description: 'Conversaciones en estado "booked" o etiquetadas como agendado/closeado.',
    provenance: "crm_pipeline",
    suitableFor: ["intent"],
  },
  {
    id: "closing_calls_scheduled",
    label: "Llamadas agendadas",
    description: "Llamadas de cierre con fecha dentro del período, en cualquier estado.",
    provenance: "calendly",
    suitableFor: ["intent"],
  },
  {
    id: "closing_calls_attended",
    label: "Llamadas a las que asistieron",
    description: 'Llamadas a las que el lead asistió: excluye "no_show" y canceladas.',
    provenance: "calendly",
    suitableFor: ["sales_conv"],
  },
  {
    id: "closing_calls_closed",
    label: "Llamadas cerradas",
    description: 'Llamadas de cierre en estado "closed".',
    provenance: "crm_pipeline",
    suitableFor: ["sales_conv", "cash"],
  },
  {
    id: "clients_new",
    label: "Clientes nuevos",
    description: "Clientes con fecha de alta dentro del período.",
    provenance: "checkout",
    suitableFor: ["cash"],
  },
  {
    id: "client_payments_count",
    label: "Pagos registrados",
    description: "Cantidad de pagos de clientes con fecha dentro del período.",
    provenance: "checkout",
    suitableFor: ["cash"],
  },
  {
    id: "ghl_opportunities_created",
    label: "Oportunidades abiertas (GHL)",
    description:
      "Oportunidades que Limitless vio nacer dentro del período, según el historial propio de transiciones (M21).",
    provenance: "crm_pipeline",
    suitableFor: ["lead"],
    configFields: [],
  },
  {
    id: "ghl_stage_entered",
    label: "Entraron a una etapa del pipeline (GHL)",
    description:
      "Oportunidades distintas que entraron a la etapa elegida durante el período (M22, M23, M25). Cuenta el paso por la etapa, no quiénes están hoy en ella.",
    provenance: "crm_pipeline",
    // Sirve para cualquier etapa del spine porque la etapa concreta de GHL la
    // elige el usuario: el mismo mecanismo alimenta "respondió", "oferta
    // enviada" y "seguimiento".
    suitableFor: ["lead", "engaged", "intent", "sales_conv", "cash"],
    configFields: [
      { key: "stageId", label: "Etapa del pipeline", kind: "ghl_stage", required: true },
    ],
  },
  {
    id: "vturb_page_views",
    label: "Visitantes de la página del VSL (VTurb)",
    description:
      "Sesiones que cargaron la página donde está el video, en el período (M08).",
    provenance: "landing_page",
    suitableFor: ["click"],
    configFields: [
      { key: "playerId", label: "Video de VTurb", kind: "vturb_player", required: true },
    ],
  },
  {
    id: "vturb_plays",
    label: "Reproducciones del VSL (VTurb)",
    description: "Sesiones que le dieron play al video en el período (M10).",
    provenance: "landing_page",
    suitableFor: ["engaged"],
    configFields: [
      { key: "playerId", label: "Video de VTurb", kind: "vturb_player", required: true },
    ],
  },
  {
    id: "vturb_cta_clicks",
    label: "Clicks al CTA del video (VTurb)",
    description:
      "Clicks en el botón del reproductor durante el período (M16). Es intención, no compra: no confundir con una reserva ni con un pago.",
    provenance: "landing_page",
    // Sólo `intent`: un click al CTA es exactamente eso, la intención declarada.
    // No sirve para `sales_conv` — un click no es una venta.
    suitableFor: ["intent"],
    configFields: [
      { key: "playerId", label: "Video de VTurb", kind: "vturb_player", required: true },
    ],
  },
  {
    id: "vturb_reached_cta",
    label: "Llegaron al CTA del VSL (VTurb)",
    description:
      "Sesiones que vieron el video pasado el segundo de la oferta (M12). Necesita que el player tenga configurado su pitch time en VTurb.",
    provenance: "landing_page",
    suitableFor: ["engaged", "intent"],
    configFields: [
      { key: "playerId", label: "Video de VTurb", kind: "vturb_player", required: true },
    ],
  },
  {
    id: "form_submissions",
    label: "Aplicaciones enviadas (formulario)",
    description:
      "Respuestas completas del formulario elegido, por fecha de envío (M17). Sirve también como opt-in de registro cuando el formulario es la puerta de entrada (M13).",
    provenance: "application_form",
    // `lead` para el opt-in de registro del webinar; `intent` para la aplicación
    // del VSL. El documento le da los dos roles al mismo formulario.
    suitableFor: ["lead", "intent"],
    configFields: [
      { key: "formId", label: "Formulario", kind: "form", required: true },
    ],
  },
  {
    id: "form_qualified",
    label: "Aplicaciones calificadas (formulario)",
    description:
      'Respuestas que la IA marcó como "qualified" o "highly_qualified" (M18).',
    provenance: "application_form",
    suitableFor: ["intent"],
    configFields: [
      { key: "formId", label: "Formulario", kind: "form", required: true },
    ],
  },
  {
    id: "webinar_registrants",
    label: "Registrados al webinar (WebinarJam)",
    description:
      "Personas que se registraron dentro del período, por su fecha de registro (M13).",
    provenance: "webinar_platform",
    suitableFor: ["lead"],
    configFields: [
      { key: "webinarId", label: "Webinar", kind: "webinarjam_webinar", required: true },
    ],
  },
  {
    id: "webinar_attendees",
    label: "Asistieron al webinar (WebinarJam)",
    description:
      "Asistieron en vivo o al replay, contados por su fecha de asistencia (M14).",
    provenance: "webinar_platform",
    suitableFor: ["engaged"],
    configFields: [
      { key: "webinarId", label: "Webinar", kind: "webinarjam_webinar", required: true },
    ],
  },
  {
    id: "webinar_stayed_to_pitch",
    label: "Se quedaron hasta la oferta (WebinarJam)",
    description:
      "Asistentes que siguieron en la sala pasado el segundo de la oferta (M15). Necesita configurar ese segundo en el webinar.",
    provenance: "webinar_platform",
    suitableFor: ["engaged"],
    configFields: [
      { key: "webinarId", label: "Webinar", kind: "webinarjam_webinar", required: true },
    ],
  },
  {
    id: "ghl_opportunities_won",
    label: "Oportunidades ganadas (GHL)",
    description:
      'Oportunidades que pasaron a estado "won" durante el período.',
    provenance: "crm_pipeline",
    suitableFor: ["cash"],
    configFields: [],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  description: string;
  provenance: InstrumentationToolId;
  suitableFor: readonly SpineStageId[];
  /**
   * Parámetros que el usuario tiene que elegir para que la fuente signifique
   * algo. Se guardan en `funnel_step_bindings.config`.
   *
   * Una fuente con campos requeridos y sin configurar resuelve a `null`: no se
   * puede contar "entradas a una etapa" sin saber a cuál (§9.1).
   */
  configFields?: readonly FunnelSourceConfigField[];
}[];

export type FunnelSource = (typeof FUNNEL_SOURCES)[number];
export type FunnelSourceId = FunnelSource["id"];

const SOURCE_BY_ID = new Map(FUNNEL_SOURCES.map((s) => [s.id, s]));

export function getFunnelSource(id: string): FunnelSource | undefined {
  return SOURCE_BY_ID.get(id as FunnelSourceId);
}

export function isFunnelSourceId(value: string): value is FunnelSourceId {
  return SOURCE_BY_ID.has(value as FunnelSourceId);
}

/**
 * Parámetros requeridos que faltan en la config de un binding.
 *
 * Devuelve la lista de claves faltantes; vacía significa que la fuente está
 * lista para resolver. Un `ghl_stage_entered` sin `stageId` no puede contar
 * nada, y contar "todas las etapas" sería inventar una respuesta a una pregunta
 * que el usuario no hizo.
 */
export function missingSourceConfig(
  source: FunnelSource,
  config: Record<string, unknown> | null | undefined
): string[] {
  const fields = (source as { configFields?: readonly FunnelSourceConfigField[] }).configFields;
  if (!fields?.length) return [];
  return fields
    .filter((field) => {
      if (!field.required) return false;
      const value = config?.[field.key];
      return typeof value !== "string" || !value.trim();
    })
    .map((field) => field.key);
}

/** Fuentes que tienen sentido para una etapa dada, para la UI de configuración. */
export function sourcesForStage(stageId: SpineStageId): FunnelSource[] {
  return FUNNEL_SOURCES.filter((s) =>
    (s.suitableFor as readonly SpineStageId[]).includes(stageId)
  );
}

/**
 * Bindings por defecto del embudo DM.
 *
 * Apuntan al inbox de Limitless, que es lo que funciona sin configurar nada. Las
 * fuentes de GHL (`ghl_*`) son la alternativa fiel al documento —§05 asigna los
 * conteos del DM al pipeline del CRM— pero necesitan que el usuario elija a qué
 * etapa corresponde cada paso, así que no se pueden poner por defecto.
 *
 * `dm.trigger` queda deliberadamente SIN binding por defecto. Existe una fuente
 * para los comentarios (`zernio_comment_triggers`), pero necesita Zernio
 * conectado, y las historias y los anuncios que inician una conversación no
 * tienen fuente (Meta sólo expone las historias vigentes de las últimas 24 h).
 * El usuario la puede elegir; sin binding, el hueco se muestra como problema de
 * instrumentación, no como rotura de negocio.
 */
export const DEFAULT_DM_BINDINGS: Record<string, FunnelSourceId> = {
  "dm.conversation": "conversations_opened",
  "dm.replied": "conversations_replied",
  "dm.set": "conversations_booked",
  "dm.show": "closing_calls_attended",
  "dm.close": "closing_calls_closed",
};

/**
 * Bindings por defecto por plantilla.
 *
 * La etapa Click de los tres embudos ya se puede alimentar con los clicks de
 * Meta capturados por `ad_metrics_daily` (I-1 del mapa de fuentes). El resto de
 * webinar y VSL espera sus integraciones.
 */
export const DEFAULT_BINDINGS: Record<string, Record<string, FunnelSourceId>> = {
  dm: DEFAULT_DM_BINDINGS,
  webinar: { "webinar.click": "ad_clicks" },
  vsl_call: { "vsl.click": "ad_clicks" },
};

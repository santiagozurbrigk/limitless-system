/**
 * lib/funnels/instrumentation.ts
 *
 * Sección 05 del documento fuente: qué herramienta es dueña de qué etapa, y con
 * qué frecuencia se mira cada número.
 *
 * `otcStatus` hace legible por máquina el track de integraciones de
 * docs/specs/FUNNELS_ARCHITECTURE.md §7. Sirve para que la UI pueda decir "esta etapa
 * necesita WebinarJam y no está conectado" en vez de mostrar un cero, que es
 * exactamente el riesgo de §9.1.
 */

/** Estado de la herramienta dentro de Limitless. */
export type ToolAvailability =
  /** Existe una integración nativa que cubre lo que el documento le asigna. */
  | "available"
  /**
   * La integración existe pero NO cubre todo lo que el documento le asigna.
   * Las partes no cubiertas se comportan como `missing`.
   */
  | "partial"
  /** No existe, pero otra integración de Limitless cubre la misma función. */
  | "equivalent"
  /** No existe. Bloquea las etapas que alimenta. */
  | "missing";

export const INSTRUMENTATION_TOOLS = [
  {
    id: "meta_ads",
    label: "Meta Ads",
    owns: "Spend, CTR, CPC, cost/lead",
    otcStatus: "available",
    otcNote: "Vía Zernio. El cron capture-ad-metrics guarda las métricas de cada día en ad_metrics_daily.",
  },
  {
    id: "hyros",
    label: "Hyros",
    owns: "True attribution, ROAS, EPL, journeys",
    otcStatus: "partial",
    otcNote:
      "Conectado (I-8): revenue y spend atribuidos, leads, visitantes de landing y journeys. Falta conectar una cuenta real y contrastar los números contra el dashboard de Hyros.",
  },
  {
    id: "landing_page",
    label: "Landing / VSL page",
    owns: "Opt-in %, play rate, watch %",
    otcStatus: "partial",
    otcNote:
      "VTurb conectado (I-6): da visitantes, reproducciones, % promedio visto y llegadas al CTA. Los opt-ins de landing todavía no — salen de Hyros (I-8).",
  },
  {
    id: "webinar_platform",
    label: "WebinarJam / Zoom",
    owns: "Show-up, stick rate, CTA clicks",
    otcStatus: "partial",
    otcNote:
      'WebinarJam conectado (I-5): registrados, asistentes y stick rate. Los clicks al CTA NO se pueden medir — la API no los expone, y lo más cercano que da es "compró en la sala", que es conversión y no intención.',
  },
  {
    id: "application_form",
    label: "Typeform / application",
    owns: "Qualified rate, booking",
    otcStatus: "available",
    otcNote:
      "Typeform y Google Forms están integrados. El scoring de calificación queda pendiente.",
  },
  {
    id: "calendly",
    label: "Calendly",
    owns: "Booked calls, show rate",
    otcStatus: "available",
    otcNote: "Integración nativa + cron calendly-sync.",
  },
  {
    id: "crm_pipeline",
    label: "GHL pipeline",
    owns: "Stage counts, set/close, follow-up",
    otcStatus: "partial",
    otcNote:
      "Limitless trae los pipelines y las etapas de GHL y arma el historial de cambios de etapa con el webhook de oportunidades. " +
      "Para que un paso del embudo cuente, hay que asociarlo a una etapa en la configuración del embudo, y el historial empieza a contar desde que el webhook está conectado: lo anterior no se recupera.",
  },
  {
    id: "checkout",
    label: "Whop / Fanbasis",
    owns: "AOV, cash collected, refunds",
    otcStatus: "available",
    otcNote:
      "Whop y Fanbasis (Commas) están integrados por webhook. Stripe y Mercado Pago no alimentan los embudos. Falta verificar el mapeo con eventos reales.",
  },
] as const satisfies readonly {
  id: string;
  label: string;
  owns: string;
  otcStatus: ToolAvailability;
  otcNote: string;
}[];

export type InstrumentationTool = (typeof INSTRUMENTATION_TOOLS)[number];
export type InstrumentationToolId = InstrumentationTool["id"];

export function getInstrumentationTool(id: InstrumentationToolId): InstrumentationTool {
  const tool = INSTRUMENTATION_TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`Herramienta de instrumentación desconocida: ${id}`);
  return tool;
}

/**
 * Estados que hacen que una herramienta bloquee las etapas que alimenta.
 *
 * Se declara con el tipo ancho a propósito: desde el 2026-08-30 **ninguna
 * herramienta del documento está en `missing`** —todas tienen al menos una
 * integración parcial— y comparar contra el literal haría que TypeScript
 * marcara la comparación como imposible. El día que se sume una herramienta
 * nueva sin integrar, esta función tiene que seguir encontrándola.
 */
const BLOCKING_STATUSES: readonly ToolAvailability[] = ["missing", "partial"];

/**
 * Herramientas que bloquean etapas: las que no existen y las que existen pero no
 * cubren lo que el documento les asigna.
 */
export function blockingTools(): InstrumentationTool[] {
  return INSTRUMENTATION_TOOLS.filter((t) => BLOCKING_STATUSES.includes(t.otcStatus));
}

// ─── Cadencia de reporte ──────────────────────────────────────────────────────

export const REPORTING_CADENCE = [
  {
    id: "daily",
    label: "Diario",
    title: "Pulse",
    watches: "spend, leads, CPL, bookings, roturas obvias",
    note: "Lectura de 5 minutos. No se toman decisiones con un solo día de datos.",
    otcStatus: "partial",
    otcNote: "Existe el pulso diario de la organización (cron executive-report-daily), pero todavía no lee los números de los embudos.",
  },
  {
    id: "weekly",
    label: "Semanal",
    title: "Steering",
    watches: "show rate, close rate, costo por adquisición, ROAS by-source",
    note: "Acá se mueve presupuesto y se cortan creativos.",
    otcStatus: "available",
    otcNote: "Cron executive-report-weekly.",
  },
  {
    id: "monthly",
    label: "Mensual",
    title: "Truth",
    watches: "ROAS blended, LTV:CAC, retención por cohorte, cash collected vs contracted",
    note: "Los números que ve el cliente.",
    otcStatus: "available",
    otcNote: "Cron executive-report-monthly.",
  },
] as const;

export type ReportingCadenceId = (typeof REPORTING_CADENCE)[number]["id"];

// ─── Constantes de gobernanza (§3.7) ──────────────────────────────────────────

/**
 * El documento lo declara no negociable: todo se reporta en EST, porque el
 * dashboard de Hyros viene por defecto en Mountain Time.
 */
export const DEFAULT_REPORTING_TIMEZONE = "America/New_York";

/** Stack de atribución que el documento asume (decisión 7: tal cual el doc). */
export const ATTRIBUTION_STACK = ["hyros", "meta_ads", "crm_pipeline"] as const;

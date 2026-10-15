import type { IntegrationProvider } from "@/constants/integrations";

/**
 * lib/integrations/health.ts — **contrato único de estado de una integración**.
 *
 * Antes cada proveedor devolvía su propia forma: `{connected, lastSyncAt}`,
 * `{connected, webhookEnabled, lastSyncAt}`, `{connected, playersSyncedAt,
 * playersWithoutPitchTime, lastError}`… La pantalla no podía tratarlas igual, y
 * por eso las cinco integraciones con forma propia terminaron cada una en su
 * panel suelto debajo del grid.
 *
 * Consecuencia concreta de esa divergencia: el badge de la tarjeta declaraba un
 * estado `error` que **nunca se producía**. Los `last_error` de VTurb, Hyros y
 * WebinarJam estaban en la base y sólo se veían si abrías su panel.
 *
 * Todo lo de este archivo es puro: se testea sin red ni base de datos.
 */

// ─── Estado ───────────────────────────────────────────────────────────────────

export type IntegrationState =
  /** Conectada y sin nada pendiente. */
  | "connected"
  /** Conectada, pero hay algo que impide medir bien. Se puede usar. */
  | "attention"
  /** Conectada y el último intento contra el proveedor falló. */
  | "error"
  | "not_connected"
  | "syncing";

export type IntegrationIssueLevel = "error" | "warning" | "info";

export type IntegrationIssue = {
  level: IntegrationIssueLevel;
  /** Qué pasa, en una frase y en términos del negocio. */
  message: string;
  /** Qué hay que hacer para resolverlo. Hay avisos que sólo informan. */
  action?: string;
};

export type IntegrationHealth = {
  provider: IntegrationProvider;
  state: IntegrationState;
  /**
   * El estado no se pudo leer (`estadoSinLeer`, SCRUM-519): no se sabe si está
   * conectada. No cuenta como conectada ni como sin conectar.
   */
  sinLeer?: boolean;
  /** Cuenta, canal o ubicación conectada, cuando el proveedor lo informa. */
  accountLabel: string | null;
  /**
   * Última vez que **llegaron datos**, no la última vez que se consultó.
   *
   * ⚠️ La diferencia importa: varios syncs sólo escriben `last_sync_at` cuando
   * ingestaron algo (Fathom lo hace explícitamente). Una fecha vieja puede
   * significar "hace una semana que no hay llamadas", que no es una falla. Por
   * eso Limitless **no** deriva alarmas de antigüedad de este campo: sería inventar un
   * problema donde hay una semana tranquila.
   */
  lastSyncAt: string | null;
  /** Cuántas filas hay en Limitless gracias a esta integración. */
  records: number | null;
  /** Qué son esas filas ("turnos", "conversaciones", "videos"). */
  recordsLabel: string | null;
  issues: IntegrationIssue[];
};

// ─── Derivación del estado ────────────────────────────────────────────────────

const ISSUE_WEIGHT: Record<IntegrationIssueLevel, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

/** El aviso más grave primero; a igual gravedad, el orden en que se agregaron. */
export function sortIssues(issues: IntegrationIssue[]): IntegrationIssue[] {
  return [...issues].sort(
    (a, b) => ISSUE_WEIGHT[b.level] - ISSUE_WEIGHT[a.level],
  );
}

/**
 * Traduce "conectada + avisos" al estado que se pinta.
 *
 * Una integración desconectada no tiene avisos que mostrar: lo único que se le
 * puede decir al usuario es que la conecte. Devolver `attention` sobre algo
 * desconectado convertiría a todo el catálogo sin conectar en una pantalla
 * roja.
 */
export function deriveState(input: {
  connected: boolean;
  syncing?: boolean;
  issues: IntegrationIssue[];
}): IntegrationState {
  if (input.syncing) return "syncing";
  if (!input.connected) return "not_connected";
  if (input.issues.some((issue) => issue.level === "error")) return "error";
  if (input.issues.some((issue) => issue.level === "warning"))
    return "attention";
  return "connected";
}

/** Arma un `IntegrationHealth` completo aplicando las reglas de arriba. */
export function buildHealth(input: {
  provider: IntegrationProvider;
  connected: boolean;
  syncing?: boolean;
  accountLabel?: string | null;
  lastSyncAt?: string | null;
  records?: number | null;
  recordsLabel?: string | null;
  issues?: IntegrationIssue[];
}): IntegrationHealth {
  const issues = input.connected ? sortIssues(input.issues ?? []) : [];

  return {
    provider: input.provider,
    state: deriveState({
      connected: input.connected,
      syncing: input.syncing,
      issues,
    }),
    accountLabel: input.connected ? (input.accountLabel ?? null) : null,
    lastSyncAt: input.connected ? (input.lastSyncAt ?? null) : null,
    records: input.connected ? (input.records ?? null) : null,
    recordsLabel: input.recordsLabel ?? null,
    issues,
  };
}

/**
 * Una integración cuyo estado no se pudo leer (la lectura falló). No es "Sin
 * conectar": eso le ofrecería conectar algo que quizás ya está conectado y
 * escondería la falla (lección de Calendly, SCRUM-504). Se pinta como `error`
 * con el motivo, sin cuenta, fecha ni registros, que no se conocen
 * (SCRUM-519).
 */
export function estadoSinLeer(input: {
  provider: IntegrationProvider;
  recordsLabel?: string | null;
  motivo: string;
}): IntegrationHealth {
  return {
    provider: input.provider,
    state: "error",
    sinLeer: true,
    accountLabel: null,
    lastSyncAt: null,
    records: null,
    recordsLabel: input.recordsLabel ?? null,
    issues: [
      {
        level: "error",
        message: `No se pudo leer el estado de esta integración: ${input.motivo}`,
        action: "Recargá la página. Si se repite, avisá a soporte.",
      },
    ],
  };
}

// ─── Avisos reutilizables ─────────────────────────────────────────────────────

/**
 * El último error que el proveedor devolvió, guardado por su sync.
 *
 * Es el aviso que la pantalla vieja perdía: la columna existía en `vturb_`,
 * `hyros_` y `webinarjam_integrations`, y sólo se veía abriendo el panel del
 * proveedor.
 */
export function lastErrorIssue(
  lastError: string | null | undefined,
): IntegrationIssue[] {
  if (!lastError) return [];
  return [
    {
      level: "error",
      message: `El último intento contra el proveedor falló: ${lastError}`,
      action:
        "Volvé a sincronizar. Si repite, revisá que la API key siga vigente.",
    },
  ];
}

/**
 * Conectada pero sin nada ingestado todavía.
 *
 * Distinto de un error: una integración recién conectada está exactamente así,
 * y por eso el aviso es informativo.
 */
export function noDataYetIssue(
  records: number,
  what: string,
  hint?: string,
): IntegrationIssue[] {
  if (records > 0) return [];
  return [
    {
      level: "info",
      message: `Todavía no llegó ${what}.`,
      ...(hint ? { action: hint } : {}),
    },
  ];
}

/**
 * Una medida que no se puede calcular porque falta configurar algo **del lado
 * del proveedor**.
 *
 * Es el caso del pitch time de VTurb y del segundo de la oferta de WebinarJam:
 * sin ese número, la medida "llegaron al CTA" no devuelve "cero", devuelve un
 * número plausible y equivocado. Por eso es `warning` y no `info`.
 */
export function missingConfigIssue(input: {
  missing: number;
  total: number;
  what: string;
  breaks: string;
  action: string;
}): IntegrationIssue[] {
  if (input.missing <= 0) return [];
  return [
    {
      level: "warning",
      message: `${input.missing} de ${input.total} ${input.what}. Sin eso, ${input.breaks}.`,
      action: input.action,
    },
  ];
}

/** Eventos que llegaron y no se supieron interpretar. */
export function unmappedEventsIssue(count: number): IntegrationIssue[] {
  if (count <= 0) return [];
  return [
    {
      level: "warning",
      message:
        count === 1
          ? "Llegó 1 evento que no se supo interpretar."
          : `Llegaron ${count} eventos que no se supieron interpretar.`,
      action:
        "Quedaron guardados crudos: no se perdió nada y se pueden reprocesar cuando el mapeo se corrija.",
    },
  ];
}

// ─── Resumen para el encabezado ───────────────────────────────────────────────

export type IntegrationsSummary = {
  total: number;
  connected: number;
  /** Conectadas con algún aviso de nivel `warning` o `error`. */
  needAttention: number;
  notConnected: number;
};

/**
 * ¿Cuenta como conectada? Una integración cuyo estado no se pudo leer no
 * (SCRUM-519): tampoco cuenta como sin conectar, y su motivo se ve en
 * "Requieren atención" (estado `error`).
 */
export function estaConectada(health: IntegrationHealth): boolean {
  return health.state !== "not_connected" && !health.sinLeer;
}

export type FiltroDeIntegraciones = "todas" | "atencion" | "conectadas" | "sin_conectar";

/** El filtro de la pantalla de Integraciones (`integrations-board.tsx`). */
export function coincideConElFiltro(
  health: IntegrationHealth,
  filtro: FiltroDeIntegraciones,
): boolean {
  switch (filtro) {
    case "atencion":
      return health.state === "attention" || health.state === "error";
    case "conectadas":
      return estaConectada(health);
    case "sin_conectar":
      return health.state === "not_connected";
    default:
      return true;
  }
}

export function summarize(healths: IntegrationHealth[]): IntegrationsSummary {
  return {
    total: healths.length,
    connected: healths.filter(estaConectada).length,
    needAttention: healths.filter(
      (health) => health.state === "attention" || health.state === "error",
    ).length,
    notConnected: healths.filter((health) => health.state === "not_connected")
      .length,
  };
}

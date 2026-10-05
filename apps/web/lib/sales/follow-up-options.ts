/**
 * El vocabulario del seguimiento, ampliable por cada organización.
 *
 * ⭐ **Por qué existe.** El próximo paso y la calificación eran listas cerradas
 * en dos lugares a la vez —constantes de TypeScript y un CHECK en Postgres—, así
 * que agregar "Esperando pago" o "Derivado a socio" pedía migración y deploy. El
 * closer terminaba escribiendo eso en las notas, donde no se puede filtrar ni
 * contar. Acá los valores de fábrica y los propios de la organización se leen
 * igual: como filas de un catálogo.
 *
 * ⭐ **Un valor no es sólo una etiqueta: tiene consecuencia.** `lost` cierra el
 * hilo del lead; todo lo demás exige fecha, porque un próximo paso sin fecha
 * nunca vence y por lo tanto nunca vuelve a la cola — es una forma silenciosa de
 * perder el lead. Si un valor creado por el usuario fuera texto libre, el motor
 * que deriva el estado no sabría qué hacer con él. Por eso cada valor **declara
 * su comportamiento**, y el motor pregunta por el comportamiento en vez de
 * comparar contra el string `lost`.
 *
 * ⭐ **Los valores de fábrica no se siembran en la base.** Viven acá, como en
 * `knowledge_base_categories`. Así no hay que backfillear cada organización, una
 * organización nueva ya los tiene, y borrar una fila no puede dejar sin
 * vocabulario a nadie.
 */

import { fechaDeHoyLocal, sumarDias } from "@/lib/fechas/calendario";

export type FollowUpKind = "next_action" | "qualification";

/**
 * Qué le hace este valor al hilo del lead.
 *
 * - `needs_date`: es un compromiso. Pide fecha y vuelve a la cola al vencer.
 * - `closes_thread`: cierra el hilo. No pide fecha.
 * - `neutral`: sólo describe (las calificaciones). No mueve el estado.
 */
export type FollowUpBehavior = "needs_date" | "closes_thread" | "neutral";

export type FollowUpColor =
  | "slate"
  | "sky"
  | "amber"
  | "emerald"
  | "rose"
  | "violet"
  | "orange";

export const FOLLOW_UP_COLORS: readonly FollowUpColor[] = [
  "slate",
  "sky",
  "amber",
  "emerald",
  "rose",
  "violet",
  "orange",
] as const;

/** Clases del chip. Mismo formato que los badges de origen en `closing-overview`. */
export const FOLLOW_UP_COLOR_CLASS: Record<FollowUpColor, string> = {
  slate: "border-border bg-muted/50 text-muted-foreground",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  emerald:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  violet:
    "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  orange:
    "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
};

export type FollowUpOption = {
  kind: FollowUpKind;
  /** Lo que se guarda en `closing_calls`. Renombrar la etiqueta no lo cambia. */
  slug: string;
  label: string;
  color: FollowUpColor;
  behavior: FollowUpBehavior;
  sortOrder: number;
  /** De fábrica: no se puede editar ni archivar. */
  builtIn: boolean;
  archived: boolean;
  /** Sólo los propios de la organización tienen fila. */
  id: string | null;
};

// ─── Valores de fábrica ──────────────────────────────────────────────────────

export const BUILT_IN_NEXT_ACTIONS: readonly FollowUpOption[] = [
  {
    kind: "next_action",
    slug: "reschedule",
    label: "Reagendar",
    color: "sky",
    behavior: "needs_date",
    sortOrder: 0,
    builtIn: true,
    archived: false,
    id: null,
  },
  {
    kind: "next_action",
    slug: "follow_up",
    label: "Hacer seguimiento",
    color: "amber",
    behavior: "needs_date",
    sortOrder: 1,
    builtIn: true,
    archived: false,
    id: null,
  },
  {
    kind: "next_action",
    slug: "waiting_lead",
    label: "Esperando al lead",
    color: "violet",
    behavior: "needs_date",
    sortOrder: 2,
    builtIn: true,
    archived: false,
    id: null,
  },
  {
    kind: "next_action",
    slug: "lost",
    label: "Dar por perdido",
    color: "slate",
    behavior: "closes_thread",
    sortOrder: 3,
    builtIn: true,
    archived: false,
    id: null,
  },
] as const;

export const BUILT_IN_QUALIFICATIONS: readonly FollowUpOption[] = [
  {
    kind: "qualification",
    slug: "hot",
    label: "Caliente",
    color: "rose",
    behavior: "neutral",
    sortOrder: 0,
    builtIn: true,
    archived: false,
    id: null,
  },
  {
    kind: "qualification",
    slug: "warm",
    label: "Tibio",
    color: "amber",
    behavior: "neutral",
    sortOrder: 1,
    builtIn: true,
    archived: false,
    id: null,
  },
  {
    kind: "qualification",
    slug: "cold",
    label: "Frío",
    color: "sky",
    behavior: "neutral",
    sortOrder: 2,
    builtIn: true,
    archived: false,
    id: null,
  },
  {
    kind: "qualification",
    slug: "unqualified",
    label: "No calificado",
    color: "slate",
    behavior: "neutral",
    sortOrder: 3,
    builtIn: true,
    archived: false,
    id: null,
  },
] as const;

export type FollowUpCatalog = {
  nextActions: FollowUpOption[];
  qualifications: FollowUpOption[];
};

/** Catálogo sin opciones propias. Es el que se usa en tests y en fallbacks. */
export const BUILT_IN_CATALOG: FollowUpCatalog = {
  nextActions: [...BUILT_IN_NEXT_ACTIONS],
  qualifications: [...BUILT_IN_QUALIFICATIONS],
};

/**
 * Junta los valores de fábrica con los de la organización.
 *
 * Un valor propio con el slug de uno de fábrica no lo pisa: el de fábrica manda,
 * porque su comportamiento sostiene el motor de estados.
 */
export function buildFollowUpCatalog(custom: FollowUpOption[]): FollowUpCatalog {
  function merge(kind: FollowUpKind, builtIns: readonly FollowUpOption[]) {
    const taken = new Set(builtIns.map((o) => o.slug));
    const own = custom
      .filter((o) => o.kind === kind && !taken.has(o.slug))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
    return [...builtIns, ...own];
  }

  return {
    nextActions: merge("next_action", BUILT_IN_NEXT_ACTIONS),
    qualifications: merge("qualification", BUILT_IN_QUALIFICATIONS),
  };
}

/** Sólo los que se pueden elegir hoy. Los archivados siguen mostrándose en filas viejas. */
export function selectableOptions(options: FollowUpOption[]): FollowUpOption[] {
  return options.filter((o) => !o.archived);
}

export function findOption(
  options: FollowUpOption[],
  slug: string | null | undefined
): FollowUpOption | null {
  if (!slug) return null;
  return options.find((o) => o.slug === slug) ?? null;
}

/**
 * Etiqueta de un slug, incluso si ya no está en el catálogo.
 *
 * ⭐ Un valor que se archivó —o que quedó de una organización que lo borró antes
 * de que existiera el archivado— **no se muestra vacío**. Un dato que no se
 * entiende se marca como no mapeado; nunca se inventa ni se blanquea.
 */
export function optionLabel(
  options: FollowUpOption[],
  slug: string | null | undefined
): string | null {
  if (!slug) return null;
  return findOption(options, slug)?.label ?? slug;
}

/** ¿Este próximo paso cierra el hilo del lead? */
export function closesThread(
  options: FollowUpOption[],
  slug: string | null | undefined
): boolean {
  return findOption(options, slug)?.behavior === "closes_thread";
}

/**
 * ¿Este próximo paso necesita fecha?
 *
 * Un slug desconocido la necesita: es la respuesta prudente. Si el valor se
 * archivó o se perdió, exigir la fecha mantiene al lead en la cola en vez de
 * dejarlo caer sin que nadie se entere.
 */
export function needsDate(
  options: FollowUpOption[],
  slug: string | null | undefined
): boolean {
  if (!slug) return false;
  return findOption(options, slug)?.behavior !== "closes_thread";
}

/** Cuántos días después de hoy se propone un próximo paso nuevo: pasado mañana. */
export const DIAS_HASTA_EL_PROXIMO_PASO = 2;

/**
 * La fecha que se propone para un próximo paso nuevo (`YYYY-MM-DD`): hoy, en la
 * zona de quien lo carga, más `DIAS_HASTA_EL_PROXIMO_PASO`. La usan el modal de
 * resultado de la llamada, el seguimiento del lead y la tabla de leads, para
 * que las tres propongan el mismo día.
 */
export function fechaPropuestaDelProximoPaso(ahora: Date = new Date()): string {
  return sumarDias(fechaDeHoyLocal(ahora), DIAS_HASTA_EL_PROXIMO_PASO);
}

/** Los slugs que cierran el hilo, para el motor de estados. */
export function closingActionSlugs(options: FollowUpOption[]): string[] {
  return options.filter((o) => o.behavior === "closes_thread").map((o) => o.slug);
}

/**
 * Slug a partir de la etiqueta escrita por el usuario.
 *
 * Se normaliza el acento y se cae a un sufijo aleatorio si la etiqueta no deja
 * ningún carácter usable (un emoji suelto, por ejemplo), en vez de guardar "".
 */
export function slugifyOptionLabel(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return base || `valor_${Math.random().toString(36).slice(2, 8)}`;
}

export function isFollowUpBehavior(value: unknown): value is FollowUpBehavior {
  return value === "needs_date" || value === "closes_thread" || value === "neutral";
}

export function isFollowUpColor(value: unknown): value is FollowUpColor {
  return (FOLLOW_UP_COLORS as readonly string[]).includes(value as string);
}

export function isFollowUpKind(value: unknown): value is FollowUpKind {
  return value === "next_action" || value === "qualification";
}

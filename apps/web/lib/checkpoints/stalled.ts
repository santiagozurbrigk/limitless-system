/**
 * ⭐ Clientes trabados: el derivado que hace útil todo el módulo.
 *
 * Un cliente está trabado cuando su próximo hito pendiente **ya venció**:
 * pasaron más días que su plazo, contados desde el hito inmediatamente anterior
 * del recorrido (decisión de Santiago, 2026-09-03).
 *
 * Es una vista derivada, no un estado guardado — misma idea que el `stalled` del
 * módulo de leads. Se recalcula cada vez y no toca `clients.status`.
 *
 * Lógica pura: no toca base ni red.
 */
import type {
  CheckpointWithEvent,
  ClientJourneyStatus,
  JourneyStageWithCheckpoints,
} from "@/types/checkpoints";
import { buildClientProgress } from "@/lib/checkpoints/progress";
import { fechaDelHitoEnZona } from "@/lib/checkpoints/fecha-del-hito";
import { diasEntre, fechaEnZona, sumarDias } from "@/lib/fechas/calendario";
import type { CheckpointEvent } from "@/types/checkpoints";

/**
 * El estado del recorrido de un cliente.
 *
 * ⭐ Las tres razones por las que **no se puede saber** si está trabado, y en las
 * que devuelve `overdueDays` y `nextCheckpointDueAt` en `null` en vez de un
 * número o una fecha inventados:
 *
 *   1. El recorrido está completo — no hay próximo hito.
 *   2. El próximo hito **no tiene plazo** configurado.
 *   3. El hito **inmediatamente anterior no está registrado** — no hay desde
 *      cuándo contar. Incluye el caso del primer hito del recorrido, que no
 *      tiene anterior.
 *
 * El caso 3 es el límite consciente del diseño: un cliente que compró y nunca
 * arrancó **no aparece como trabado** hasta que se registre su primer hito.
 * Anclarlo a la fecha de alta sería otra decisión, no una corrección.
 *
 * ⭐ Los días se cuentan como **días calendario en la zona de la organización**
 * (`zona`; null = la de por defecto): el día del hito anterior más el plazo es
 * el día en que vence, y el atraso son los días que pasaron desde ahí hasta
 * hoy. Antes se contaban bloques de 24 horas y la fecha límite se cortaba en
 * UTC, así que un hito registrado de noche en Argentina corría un día el
 * "vence el" (SCRUM-493). Sin default de zona a propósito.
 */
export function deriveClientJourneyStatus(
  clientId: string,
  progress: readonly CheckpointWithEvent[],
  now: Date,
  zona: string | null
): ClientJourneyStatus {
  const total = progress.length;
  const reached = progress.filter((entry) => entry.event !== null).length;

  // La fase actual es la del hito más avanzado alcanzado, siguiendo el orden del
  // recorrido (no la fecha): un hito tardío de una fase temprana no hace
  // retroceder al cliente.
  let currentStage: CheckpointWithEvent["stage"] | null = null;
  for (const entry of progress) {
    if (entry.event !== null) currentStage = entry.stage;
  }

  /**
   * El "3 de 4": cuántos hitos de **la fase actual** están alcanzados.
   *
   * Se cuenta sobre la fase que la pantalla muestra, no sobre la del próximo
   * hito pendiente. Si contara la otra, una fila diría "Onboarding" al lado de
   * un progreso que en realidad es de Escala, y la fila se contradiría sola.
   *
   * Un cliente que completó su fase entera y todavía no arrancó la siguiente
   * muestra "4 de 4": es verdad y es útil —cerró la etapa—, y la columna de
   * próxima tarea es la que dice qué sigue.
   *
   * ⭐ Los hitos archivados no entran: `buildJourney` ya los sacó del recorrido
   * antes de llegar acá. Contarlos inflaría el denominador con trabajo que nadie
   * va a hacer.
   */
  let stageReached = 0;
  let stageTotal = 0;
  if (currentStage) {
    for (const entry of progress) {
      if (entry.stage.id !== currentStage.id) continue;
      stageTotal += 1;
      if (entry.event !== null) stageReached += 1;
    }
  }

  const base: ClientJourneyStatus = {
    clientId,
    currentStageId: currentStage?.id ?? null,
    currentStageName: currentStage?.name ?? null,
    currentStageColor: currentStage?.color ?? null,
    reached,
    total,
    stageReached,
    stageTotal,
    nextCheckpointId: null,
    nextCheckpointName: null,
    nextCheckpointDueAt: null,
    overdueDays: null,
    stalled: false,
  };

  const nextIndex = progress.findIndex((entry) => entry.event === null);
  // 1 · Recorrido completo (o vacío): no hay próximo hito.
  if (nextIndex === -1) return base;

  const next = progress[nextIndex]!;
  const withNext: ClientJourneyStatus = {
    ...base,
    nextCheckpointId: next.checkpoint.id,
    nextCheckpointName: next.checkpoint.name,
  };

  // 2 · Sin plazo configurado no hay vencimiento posible.
  if (next.checkpoint.expectedDays === null) return withNext;

  // 3 · Sin hito anterior registrado no hay desde cuándo contar.
  const previous = nextIndex > 0 ? progress[nextIndex - 1] : null;
  if (!previous || previous.event === null) return withNext;

  const anchorDay = fechaDelHitoEnZona(previous.event.reachedAt, zona);
  if (!anchorDay) return withNext;

  /**
   * La fecha límite es el mismo cálculo que el atraso, mirado al revés: el hito
   * anterior más su plazo. Se derivan juntas a propósito — dos funciones
   * separadas podrían discrepar, y una fila que dice "vence el 12" y "atrasado
   * hace 6 días" al mismo tiempo no se puede leer.
   *
   * Se corta en el día (`YYYY-MM-DD`) porque un plazo se mide en días, no en
   * horas: decir "vence el 12 a las 14:32" fingiría una precisión que el dato
   * no tiene.
   */
  const dueDay = sumarDias(anchorDay, next.checkpoint.expectedDays);
  const overdueDays = diasEntre(dueDay, fechaEnZona(now, zona));

  return {
    ...withNext,
    nextCheckpointDueAt: dueDay,
    overdueDays,
    stalled: overdueDays > 0,
  };
}

/**
 * El estado de todos los clientes de una organización, en una pasada.
 *
 * Recibe el recorrido una sola vez y los eventos agrupados por cliente: cargar
 * el recorrido por cliente haría una consulta por fila de la lista.
 */
export function deriveJourneyStatuses(
  stages: readonly JourneyStageWithCheckpoints[],
  eventsByClient: ReadonlyMap<string, readonly CheckpointEvent[]>,
  clientIds: readonly string[],
  now: Date,
  /** La zona de la organización (null = la de por defecto). */
  zona: string | null
): Map<string, ClientJourneyStatus> {
  const result = new Map<string, ClientJourneyStatus>();

  for (const clientId of clientIds) {
    const events = eventsByClient.get(clientId) ?? [];
    const progress = buildClientProgress(stages, events);
    result.set(clientId, deriveClientJourneyStatus(clientId, progress, now, zona));
  }

  return result;
}

/** Agrupa una lista plana de eventos por cliente. */
export function groupEventsByClient(
  events: readonly CheckpointEvent[]
): Map<string, CheckpointEvent[]> {
  const map = new Map<string, CheckpointEvent[]>();
  for (const event of events) {
    const list = map.get(event.clientId) ?? [];
    list.push(event);
    map.set(event.clientId, list);
  }
  return map;
}

/**
 * Cómo se lee la fecha límite: `12/09/2026`. `null` cuando no se puede saber.
 *
 * ⭐ Se parte la cadena a mano en vez de usar `Date` + `toLocaleDateString`.
 * `new Date("2026-09-12")` se interpreta como medianoche UTC, y en Buenos Aires
 * (UTC-3) eso se muestra como el 11. Un vencimiento corrido un día no rompe
 * nada visible: sólo miente.
 */
export function formatDueDate(status: ClientJourneyStatus): string | null {
  const iso = status.nextCheckpointDueAt;
  if (iso === null) return null;

  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return null;
  return `${day}/${month}/${year}`;
}

/** Cómo se lee el atraso. `null` cuando no se puede saber. */
export function formatOverdue(status: ClientJourneyStatus): string | null {
  if (!status.stalled || status.overdueDays === null) return null;
  return status.overdueDays === 1
    ? "trabado hace 1 día"
    : `trabado hace ${status.overdueDays} días`;
}

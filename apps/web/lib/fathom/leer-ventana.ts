/**
 * Lectura de la ventana de sincronización de Fathom, por tramos cuando viene
 * atrasada (SCRUM-36). Qué pedir y hasta dónde avanzar se decide en
 * `lib/fathom/cursor.ts`; aquí sólo se hacen los pedidos y se reportan las
 * decisiones que alguien tiene que mirar.
 */
import {
  inicioDelTramoSiguiente,
  siguienteTramo,
  type DecisionDeCursor,
  type LecturaDeVentana,
} from "@/lib/fathom/cursor";
import {
  FathomApiError,
  listFathomMeetings,
  type FathomMeetingRecord,
  type ListFathomMeetingsOptions,
} from "@/lib/fathom/api";
import { reportarFalla } from "@/lib/observability/reportar-falla";
import { cabeLaEspera, quedaTiempo } from "@/lib/fathom/plazo-del-cron";

/**
 * Tramos cerrados por corrida, como mucho. Cada pedido con transcript es
 * "pesado" para Fathom: 30 por minuto, y puede bajar a 5
 * (`docs/external-apis/fathom/api-overview.md`). Con 4 tramos más el pedido
 * abierto, una corrida de una cuenta al día o atrasada no pasa de 5 pedidos en
 * el caso normal de una página por tramo, y se pone al día a razón de 24 h por
 * corrida (el cron es horario).
 */
export const TRAMOS_CERRADOS_POR_CORRIDA = 4;

/**
 * Hasta cuánto se espera un `Retry-After` de Fathom dentro de una corrida, una
 * sola vez. El cron tiene 60 s para todas las organizaciones: una espera más
 * larga se deja para la corrida siguiente.
 */
export const ESPERA_MAXIMA_MS = 10_000;

/** 429 o una caída de Fathom: vale la pena reintentar más tarde. */
export function esFallaPasajera(fallo: unknown): fallo is FathomApiError {
  return (
    fallo instanceof FathomApiError &&
    fallo.status !== undefined &&
    (fallo.status === 429 || fallo.status >= 500)
  );
}

const esperarDeVerdad = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Lee desde `desde` hasta el presente con un presupuesto total de `maxPages`
 * páginas, repartido entre los tramos que haga falta pedir.
 *
 * ⭐ Si Fathom corta con un 429 o una falla de su lado después de haber cerrado
 * algún tramo, no se pierde lo leído: vuelve como lectura cortada con
 * `completaHasta`, y el cursor avanza hasta ahí. Antes de cortar, si el 429 trae
 * un `Retry-After` corto (hasta `ESPERA_MAXIMA_MS`), se espera y se reintenta el
 * mismo tramo una vez. Sin ningún tramo cerrado, la falla se propaga como antes.
 */
export async function leerVentanaDeFathom(
  apiKey: string,
  params: {
    desde: string | null;
    ahora: Date;
    maxPages: number;
    opciones?: Omit<
      ListFathomMeetingsOptions,
      "createdAfter" | "createdBefore" | "maxPages" | "plazo"
    >;
    /**
     * Plazo de la corrida del cron (ms). Pasado, no se pide otro tramo ni otra
     * página, y un `Retry-After` sólo se espera si cabe antes. Sin plazo
     * (sincronización manual), no hay límite de tiempo.
     */
    plazo?: number;
    /** Para los tests. */
    esperar?: (ms: number) => Promise<void>;
  }
): Promise<LecturaDeVentana> {
  const meetings: FathomMeetingRecord[] = [];
  const vistas = new Set<string>();
  const esperar = params.esperar ?? esperarDeVerdad;
  let restantes = params.maxPages;
  let desde = params.desde;
  let completaHasta: string | null = null;
  let tramosCerrados = 0;
  let yaEspero = false;

  for (;;) {
    if (restantes <= 0) {
      return { meetings, cortada: true, motivoDeCorte: "tope", completaHasta, tramoCortado: [] };
    }

    const tramo = siguienteTramo(desde, params.ahora);
    if (tramo.hasta && tramosCerrados >= TRAMOS_CERRADOS_POR_CORRIDA) {
      return { meetings, cortada: true, motivoDeCorte: "tramos", completaHasta, tramoCortado: [] };
    }
    // Se acabó el tiempo de la corrida: lo que falta, en la próxima.
    if (completaHasta !== null && !quedaTiempo(params.plazo)) {
      return { meetings, cortada: true, motivoDeCorte: "plazo", completaHasta, tramoCortado: [] };
    }

    let listado;
    try {
      listado = await listFathomMeetings(apiKey, {
        ...params.opciones,
        createdAfter: tramo.desde ?? undefined,
        createdBefore: tramo.hasta ?? undefined,
        maxPages: restantes,
        plazo: params.plazo,
      });
    } catch (fallo) {
      if (!esFallaPasajera(fallo)) throw fallo;
      // El pedido que falló también gasta presupuesto.
      restantes -= 1;
      const espera = (fallo.retryAfterSeconds ?? Number.POSITIVE_INFINITY) * 1000;
      if (
        fallo.status === 429 &&
        !yaEspero &&
        espera <= ESPERA_MAXIMA_MS &&
        cabeLaEspera(params.plazo, espera)
      ) {
        yaEspero = true;
        await esperar(espera);
        continue;
      }
      if (completaHasta === null) throw fallo;
      console.warn("[Fathom:sync] Lectura interrumpida por Fathom; avanza hasta el último tramo completo:", {
        status: fallo.status,
        completaHasta,
      });
      return { meetings, cortada: true, motivoDeCorte: "fathom", completaHasta, tramoCortado: [] };
    }
    restantes -= listado.pages;

    // Los tramos se pisan un segundo: la que cae en el borde llega dos veces.
    for (const meeting of listado.meetings) {
      const id = String(meeting.recording_id ?? meeting.id);
      if (vistas.has(id)) continue;
      vistas.add(id);
      meetings.push(meeting);
    }

    if (listado.truncated) {
      return {
        meetings,
        cortada: true,
        motivoDeCorte: listado.cortadaPorPlazo ? "plazo" : "tope",
        completaHasta,
        tramoCortado: listado.meetings,
      };
    }
    if (!tramo.hasta) {
      return { meetings, cortada: false, completaHasta, tramoCortado: [] };
    }
    completaHasta = tramo.hasta;
    tramosCerrados += 1;
    desde = inicioDelTramoSiguiente(tramo.hasta);
  }
}

/**
 * Manda a Sentry lo que la decisión del cursor deja para que mire una persona:
 * reuniones que se dejan de reintentar y una sync que no pudo avanzar.
 */
export function reportarDecisionDeCursor(
  decision: DecisionDeCursor,
  contexto: { organizationId: string; conexion: "organizacion" | "miembro"; userId?: string }
): void {
  const base = {
    organizationId: contexto.organizationId,
    provider: "fathom",
  };
  const extraBase = {
    conexion: contexto.conexion,
    ...(contexto.userId ? { user_id: contexto.userId } : {}),
  };

  for (const meeting of decision.descartadas) {
    reportarFalla(
      new Error(
        "Fathom: una reunión no se pudo guardar durante el plazo de reintentos y la sincronización sigue sin ella"
      ),
      {
        ...base,
        extra: {
          ...extraBase,
          recording_id: meeting.recording_id ?? meeting.id,
          created_at: meeting.created_at ?? null,
          como_recuperarla:
            "Arreglar la causa, borrar su fila de fathom_sync_fallas y rebobinar last_sync_at de la conexión a antes de created_at (docs/areas/ventas.md, Cómo recuperar una reunión descartada)",
        },
      }
    );
  }

  for (const meeting of decision.sinFecha) {
    reportarFalla(
      new Error(
        "Fathom: una reunión sin fecha no se pudo guardar y no hay dónde frenar la sincronización"
      ),
      { ...base, extra: { ...extraBase, recording_id: meeting.recording_id ?? meeting.id } }
    );
  }

  if (decision.trabada) {
    reportarFalla(
      new Error(
        "Fathom: la lectura se cortó en el tope de páginas y el cursor no pudo avanzar"
      ),
      { ...base, extra: { ...extraBase, cursor: decision.cursor, motivo: decision.motivo } }
    );
  }
}

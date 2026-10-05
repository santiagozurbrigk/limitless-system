/**
 * Lectura de la ventana de sincronización de Fathom, por tramos cuando viene
 * atrasada (SCRUM-36). Qué pedir y hasta dónde avanzar se decide en
 * `lib/fathom/cursor.ts`; acá sólo se hacen los pedidos y se reportan las
 * decisiones que alguien tiene que mirar.
 */
import {
  inicioDelTramoSiguiente,
  siguienteTramo,
  type DecisionDeCursor,
  type LecturaDeVentana,
} from "@/lib/fathom/cursor";
import {
  listFathomMeetings,
  type FathomMeetingRecord,
  type ListFathomMeetingsOptions,
} from "@/lib/fathom/api";
import { reportarFalla } from "@/lib/observability/reportar-falla";

/**
 * Lee desde `desde` hasta el presente con un presupuesto total de `maxPages`
 * páginas, repartido entre los tramos que haga falta pedir.
 */
export async function leerVentanaDeFathom(
  apiKey: string,
  params: {
    desde: string | null;
    ahora: Date;
    maxPages: number;
    opciones?: Omit<
      ListFathomMeetingsOptions,
      "createdAfter" | "createdBefore" | "maxPages"
    >;
  }
): Promise<LecturaDeVentana> {
  const meetings: FathomMeetingRecord[] = [];
  const vistas = new Set<string>();
  let restantes = params.maxPages;
  let desde = params.desde;
  let completaHasta: string | null = null;

  for (;;) {
    if (restantes <= 0) {
      return { meetings, cortada: true, completaHasta, tramoCortado: [] };
    }

    const tramo = siguienteTramo(desde, params.ahora);
    const listado = await listFathomMeetings(apiKey, {
      ...params.opciones,
      createdAfter: tramo.desde ?? undefined,
      createdBefore: tramo.hasta ?? undefined,
      maxPages: restantes,
    });
    restantes -= listado.pages;

    // Los tramos se pisan un segundo: la que cae en el borde llega dos veces.
    for (const meeting of listado.meetings) {
      const id = String(meeting.recording_id ?? meeting.id);
      if (vistas.has(id)) continue;
      vistas.add(id);
      meetings.push(meeting);
    }

    if (listado.truncated) {
      return { meetings, cortada: true, completaHasta, tramoCortado: listado.meetings };
    }
    if (!tramo.hasta) {
      return { meetings, cortada: false, completaHasta, tramoCortado: [] };
    }
    completaHasta = tramo.hasta;
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

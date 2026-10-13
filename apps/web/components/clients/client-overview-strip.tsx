"use client";

/**
 * Los cuatro números que contestan "¿cómo viene este cliente?" antes de
 * scrollear nada: sesiones, pendientes, recorrido, satisfacción.
 *
 * ⭐ Tres se cargan solos con una llamada; el cuarto —la satisfacción— ya viene
 * en el cliente. Se recarga cuando las tareas cambian (por el mismo aviso que
 * usa la sección de Tareas), así el número de arriba no contradice a la lista
 * de abajo.
 *
 * Una métrica sin dato dice «—», no cero: un cliente al que nunca se le marcó
 * la satisfacción no está "en cero de satisfacción".
 */

import { useCallback, useEffect, useState } from "react";
import { MetricStat, cn } from "@ai-coo/ui";
import { ClipboardList, Flag, Gauge, Phone } from "lucide-react";
import {
  getClientOverviewAction,
  type ClientOverview,
} from "@/app/clients/overview-actions";
import { CLIENT_TASKS_CHANGED } from "@/lib/clients/tasks-events";
import { leerConMotivo } from "@/lib/client/correr-accion";
import { AvisoDeLecturaFallida } from "@/components/shared/aviso-de-lectura-fallida";
import {
  ETIQUETAS_DE_SATISFACCION,
  type NivelDeSatisfaccion,
} from "@/lib/clients/satisfaction";

/**
 * El color del valor de satisfacción, como clase completa y estática.
 *
 * ⭐ Tailwind sólo genera las clases que encuentra escritas enteras en el
 * código: un `[&_.metric-stat-value]:${color}` armado en tiempo de ejecución
 * compila, no falla, y no pinta nada.
 */
const COLOR_DE_SATISFACCION: Record<NivelDeSatisfaccion, string> = {
  en_riesgo: "[&_.metric-stat-value]:text-destructive",
  disconforme: "[&_.metric-stat-value]:text-warning",
  neutral: "[&_.metric-stat-value]:text-muted-foreground",
  conforme: "[&_.metric-stat-value]:text-foreground",
  muy_conforme: "[&_.metric-stat-value]:text-success",
};

function antiguedad(dias: number | null): string {
  if (dias == null) return "todavía ninguna";
  if (dias === 0) return "la última fue hoy";
  if (dias === 1) return "la última fue ayer";
  return `la última hace ${dias} días`;
}

/**
 * El resumen del cliente (SCRUM-517): el dato o el motivo. Antes una falla
 * dejaba la franja en «cargando…» para siempre, sin decir nada.
 */
export function cargarResumenDelCliente(clientId: string) {
  return leerConMotivo(
    () => getClientOverviewAction(clientId),
    "[ClientOverviewStrip] resumen"
  );
}

const NO_SE_PUDO = "no se pudo cargar";

type Celda = { valor: string | number; detalle: string };

/**
 * Lo que dicen las tres celdas que vienen del servidor (SCRUM-517). Sin dato
 * todavía, «—» y "cargando…"; si la lectura entera falló, «—» y "no se pudo
 * cargar". Si sólo falló una celda (las sesiones 1-1 o el recorrido vienen en
 * `null`), esa celda dice "no se pudo cargar" y las otras se muestran: antes
 * una falla se leía como "0 sesiones" o "sin recorrido configurado".
 */
export function celdasDelResumen(
  data: ClientOverview | null,
  motivo: string | null
): { sesiones: Celda; tareas: Celda; recorrido: Celda } {
  const sinDato: Celda = { valor: "—", detalle: motivo ? NO_SE_PUDO : "cargando…" };
  if (!data) return { sesiones: sinDato, tareas: sinDato, recorrido: sinDato };

  const fallo: Celda = { valor: "—", detalle: NO_SE_PUDO };
  const { oneOnOne, tasks, journey } = data;

  return {
    sesiones: oneOnOne
      ? { valor: oneOnOne.total, detalle: antiguedad(oneOnOne.daysSinceLast) }
      : fallo,
    tareas: {
      valor: tasks.pending,
      detalle:
        tasks.pending === 0
          ? "al día"
          : tasks.coach > 0
            ? `${tasks.coach} le ${tasks.coach === 1 ? "toca" : "tocan"} al coach`
            : "todas del cliente",
    },
    recorrido: journey
      ? {
          valor:
            journey.configured && journey.total > 0
              ? `${journey.reached} de ${journey.total}`
              : "—",
          detalle: journey.next
            ? `sigue: ${journey.next}`
            : journey.configured && journey.total > 0
              ? "completo"
              : "sin recorrido configurado",
        }
      : fallo,
  };
}

export function ClientOverviewStrip({
  clientId,
  satisfaction,
}: {
  clientId: string;
  satisfaction: string | null | undefined;
}) {
  const [data, setData] = useState<ClientOverview | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);

  const cargar = useCallback(() => {
    let alive = true;
    // La franja es un resumen: si no se pudo cargar, queda en «—», dice por
    // qué, y la ficha sigue funcionando.
    void cargarResumenDelCliente(clientId).then((lectura) => {
      if (!alive) return;
      if (lectura.ok) {
        setData(lectura.data);
        setMotivo(null);
      } else {
        setMotivo(lectura.motivo);
      }
    });
    return () => {
      alive = false;
    };
  }, [clientId]);

  useEffect(() => cargar(), [cargar]);

  useEffect(() => {
    const alCambiar = () => cargar();
    window.addEventListener(CLIENT_TASKS_CHANGED, alCambiar);
    return () => window.removeEventListener(CLIENT_TASKS_CHANGED, alCambiar);
  }, [cargar]);

  const nivelId =
    satisfaction && satisfaction in ETIQUETAS_DE_SATISFACCION
      ? (satisfaction as NivelDeSatisfaccion)
      : null;
  const nivel = nivelId ? ETIQUETAS_DE_SATISFACCION[nivelId] : null;

  const { sesiones, tareas, recorrido } = celdasDelResumen(data, motivo);

  const celda =
    "bg-card/60 px-4 py-3.5 dark:bg-white/[0.02] sm:px-5 [&_.metric-stat-value]:text-[1.5rem] [&_.metric-stat-value]:leading-8";

  return (
    <div className="space-y-2">
      <div
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border/60 dark:border-white/[0.08] dark:bg-white/[0.06] lg:grid-cols-4"
        aria-label="Resumen del cliente"
      >
        <div className={celda}>
          <MetricStat
            icon={<Phone />}
            title="Sesiones 1-1"
            value={sesiones.valor}
            subtitle={sesiones.detalle}
          />
        </div>
        <div className={celda}>
          <MetricStat
            icon={<ClipboardList />}
            title="Tareas pendientes"
            value={tareas.valor}
            subtitle={tareas.detalle}
          />
        </div>
        <div className={celda}>
          <MetricStat
            icon={<Flag />}
            title="Recorrido"
            value={recorrido.valor}
            subtitle={recorrido.detalle}
          />
        </div>
        <div className={celda}>
          <MetricStat
            icon={<Gauge />}
            title="Satisfacción"
            value={nivel ? nivel.label : "—"}
            subtitle={nivel ? nivel.descripcion : "sin marcar"}
            className={cn(nivelId && COLOR_DE_SATISFACCION[nivelId])}
          />
        </div>
      </div>
      {motivo ? (
        <AvisoDeLecturaFallida
          titulo="No se pudo cargar el resumen del cliente."
          motivo={motivo}
        />
      ) : null}
    </div>
  );
}

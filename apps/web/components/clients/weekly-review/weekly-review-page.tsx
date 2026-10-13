"use client";

/**
 * ⭐ La revisión semanal.
 *
 * Cuatro preguntas, cuatro listas de nombres, y al lado de cada nombre el lugar
 * para anotar en qué anda. Es el ritual que los Excel tenían y el software no:
 * Limitless ya calculaba casi todas estas señales, pero no las mostraba juntas en
 * ningún lado, y una señal que nadie mira es una señal que no existe.
 *
 * Una lista vacía **se muestra vacía, con su motivo**: "nadie trabado" es una
 * respuesta, y esconder la sección haría parecer que la pregunta no se hizo.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button, GlassPanel, Input } from "@ai-coo/ui";
import { AlertTriangle, CalendarClock, Check, TrendingUp, Timer } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { useToast } from "@/providers/toast-provider";
import { correrMutacion, leerConMotivo, type Aviso } from "@/lib/client/correr-accion";
import { paths } from "@/routes";
import type { WeeklyReviewRow } from "@/lib/clients/weekly-review";
import type { WeeklyReviewPageData } from "@/app/clients/tracking-actions";
import {
  getWeeklyReviewAction,
  updateClientCurrentStatusAction,
} from "@/app/clients/tracking-actions";

/**
 * Vuelve a armar la revisión después de anotar un estado (SCRUM-517). Si no se
 * pudo, avisa el motivo (o el texto fijo si la acción lanzó) y devuelve
 * `null`: la pantalla se queda con lo que ya mostraba.
 */
export async function recargarRevision(
  avisar: (aviso: Aviso) => void
): Promise<WeeklyReviewPageData | null> {
  const lectura = await leerConMotivo(getWeeklyReviewAction, "[WeeklyReview] recargar");
  if (!lectura.ok) {
    avisar({ title: "No se pudo actualizar la revisión", description: lectura.motivo });
    return null;
  }
  return lectura.data;
}

/**
 * Guarda el estado actual de un cliente desde la revisión (SCRUM-517): el
 * motivo de un rechazo se avisa; si la acción lanzó, el texto fijo.
 */
export function guardarEstadoActual(
  clientId: string,
  nota: string,
  avisar: (aviso: Aviso) => void,
  alGuardar: () => Promise<void>
): Promise<void> {
  return correrMutacion({
    accion: () =>
      updateClientCurrentStatusAction(clientId, {
        note: nota.trim() || null,
        metricValue: null,
      }),
    avisar,
    tituloError: "No se pudo guardar",
    etiqueta: "[WeeklyReview] estado actual",
    alExito: async () => {
      await alGuardar();
      avisar({ title: "Estado actualizado", variant: "success" });
    },
  });
}

export function WeeklyReviewPage({
  initialData,
}: {
  initialData: WeeklyReviewPageData;
}) {
  const { push } = useToast();
  const [data, setData] = useState(initialData);

  async function refresh() {
    const next = await recargarRevision(push);
    if (next) setData(next);
  }

  const { review, tracking } = data;
  const total =
    review.stalled.length +
    review.aboutToWin.length +
    review.leavingSoon.length +
    review.atRisk.length;

  return (
    <div className="space-y-6">
      {/* El título ya lo pone el topbar (ver PageHeader). */}
      <PageHeader
        description="Cuatro preguntas, quince minutos. Termina en una lista de nombres con una acción para cada uno."
      />

      {total === 0 ? (
        <GlassPanel className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-emerald-500" />
          Ningún cliente pide atención esta semana según lo que hay cargado.
        </GlassPanel>
      ) : null}

      <Section
        icon={<Timer className="h-4 w-4" />}
        question="¿Quién no se movió?"
        hint="Su próximo hito venció: pasaron más días que su plazo."
        empty="Nadie está trabado. Si esperabas ver a alguien, fijate que su recorrido tenga los plazos cargados."
        rows={review.stalled}
        tracking={tracking}
        onSaved={refresh}
      />

      <Section
        icon={<TrendingUp className="h-4 w-4" />}
        question="¿Quién está por tener un resultado?"
        hint="Su medida subió y su último win es reciente. Es el momento de pedirle el permiso y la captura."
        empty="Nadie viene subiendo con un win reciente. Hace falta que sus wins lleven un número comparable."
        rows={review.aboutToWin}
        tracking={tracking}
        onSaved={refresh}
      />

      <Section
        icon={<CalendarClock className="h-4 w-4" />}
        question="¿Quién está cerca del egreso?"
        hint="Menos de dos meses para que termine su programa. Es la conversación de renovación."
        empty="Nadie egresa pronto. Si esperabas ver a alguien, cargale la fecha de egreso en su ficha."
        rows={review.leavingSoon}
        tracking={tracking}
        onSaved={refresh}
      />

      <Section
        icon={<AlertTriangle className="h-4 w-4" />}
        question="¿Quién está en riesgo?"
        hint="Dos señales juntas o más: trabado, en silencio, o con el pago atrasado. Una sola no alcanza."
        empty="Nadie con dos señales de riesgo al mismo tiempo."
        rows={review.atRisk}
        tracking={tracking}
        onSaved={refresh}
      />
    </div>
  );
}

function Section({
  icon,
  question,
  hint,
  empty,
  rows,
  tracking,
  onSaved,
}: {
  icon: React.ReactNode;
  question: string;
  hint: string;
  empty: string;
  rows: WeeklyReviewRow[];
  tracking: WeeklyReviewPageData["tracking"];
  onSaved: () => Promise<void>;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {question}
        </h2>
        <span className="text-xs text-muted-foreground">
          {rows.length === 0 ? "nadie" : `${rows.length}`}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>

      {rows.length === 0 ? (
        <GlassPanel className="p-3 text-xs text-muted-foreground">{empty}</GlassPanel>
      ) : (
        <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border bg-card">
          {rows.map((row) => (
            <ReviewRow
              key={row.clientId}
              row={row}
              note={tracking[row.clientId]?.currentStatusNote ?? ""}
              updatedAt={tracking[row.clientId]?.currentStatusUpdatedAt ?? null}
              onSaved={onSaved}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Un nombre, por qué está en la lista, y dónde anotar en qué anda. */
function ReviewRow({
  row,
  note,
  updatedAt,
  onSaved,
}: {
  row: WeeklyReviewRow;
  note: string;
  updatedAt: string | null;
  onSaved: () => Promise<void>;
}) {
  const { push } = useToast();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(note);

  const dirty = value.trim() !== note.trim();

  function save() {
    startTransition(() => guardarEstadoActual(row.clientId, value, push, onSaved));
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-[12rem] flex-1">
        <Link
          href={paths.platform.clients.detail(row.clientId)}
          className="text-sm font-medium hover:text-primary hover:underline"
        >
          {row.name}
        </Link>
        <p className="text-xs text-muted-foreground">{row.detail}</p>
      </div>

      <div className="flex flex-1 items-center gap-2">
        <Input
          className="h-8 text-sm"
          placeholder="En qué anda / qué hay que hacer"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && dirty) save();
          }}
        />
        {/* El botón aparece cuando hay algo que guardar: una fila de botones
            muertos hace que la pantalla parezca rota. */}
        {dirty ? (
          <Button
            size="sm"
            className="h-8 shrink-0 px-2 text-xs"
            disabled={pending}
            onClick={save}
          >
            {pending ? "…" : "Guardar"}
          </Button>
        ) : null}
      </div>

      {updatedAt ? (
        <span className="w-full text-[11px] text-muted-foreground sm:w-auto">
          anotado el{" "}
          {new Date(updatedAt).toLocaleDateString("es-AR", {
            day: "numeric",
            month: "short",
          })}
        </span>
      ) : null}
    </div>
  );
}

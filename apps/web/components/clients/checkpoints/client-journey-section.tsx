"use client";

/**
 * C2 · La sección "Recorrido" en la ficha del cliente.
 *
 * Dibuja los checkpoints del recorrido en orden, cada uno alcanzado (con fecha y
 * métricas) o pendiente (con botón "Registrar"). Un hueco —un pendiente entre
 * dos alcanzados— se muestra tal cual: la realidad es desprolija.
 */

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Badge, Button, GlassPanel, cn } from "@ai-coo/ui";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Flag,
  MinusCircle,
  Pencil,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { ACCION_DE_FILA, FichaSection } from "@/components/clients/ficha-section";
import { setClientManualStageAction } from "@/app/clients/stage-actions";
import {
  resolveEffectiveStage,
  skippedCheckpointIds,
} from "@/lib/checkpoints/effective-stage";
import { usePlatformData } from "@/providers";
import { useToast } from "@/providers/toast-provider";
import type {
  Checkpoint,
  CheckpointEvent,
  CheckpointProposal,
  CheckpointWithEvent,
} from "@/types/checkpoints";
import type { FieldDefinition } from "@/types/custom-fields";
import { fieldOptionColorVar, formatFieldValue } from "@/lib/custom-fields";
import { resolveMetricSchema, summarizeJourneyPosition } from "@/lib/checkpoints";
import {
  getClientJourneyAction,
  recordCheckpointAction,
  undoCheckpointAction,
} from "@/app/clients/checkpoint-event-actions";
import {
  acceptCheckpointProposalAction,
  listCheckpointProposalsAction,
  rejectCheckpointProposalAction,
} from "@/app/clients/checkpoint-derived-actions";
import { paths } from "@/routes";
import { RecordCheckpointDialog } from "@/components/clients/checkpoints/record-checkpoint-dialog";
import { fechaDelHitoEnZona } from "@/lib/checkpoints/fecha-del-hito";
import { useZonaDeLaOrganizacion } from "@/providers/zona-de-la-organizacion-provider";
import { diaLocal } from "@/lib/fechas/calendario";

/**
 * La fecha de un hito (o de una propuesta), en el día de la organización: ver
 * la convención de `reached_at` en `lib/checkpoints/fecha-del-hito.ts`. Antes
 * se mostraba con el día de UTC, que de noche en Argentina ya es mañana.
 */
function formatearFechaDelHito(reachedAt: string, zona: string | null): string {
  const fecha = fechaDelHitoEnZona(reachedAt, zona);
  if (!fecha) return "";
  return diaLocal(fecha).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type JourneyData = Awaited<ReturnType<typeof getClientJourneyAction>>;

const EMPTY: JourneyData = {
  progress: [],
  checkpointFields: [],
  journeyConfigured: false,
};

export function ClientJourneySection({
  clientId,
  manualStageId = null,
}: {
  clientId: string;
  /** La fase fijada a mano, si la hay. Viene del cliente. */
  manualStageId?: string | null;
}) {
  const { push } = useToast();
  const { refreshClients } = usePlatformData();
  const [data, setData] = useState<JourneyData>(EMPTY);
  const [proposals, setProposals] = useState<CheckpointProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  /**
   * Qué fases están desplegadas. `null` = todavía nadie tocó nada, así que
   * manda el criterio por defecto: abierta la fase en curso, cerradas las demás.
   */
  const [abiertas, setAbiertas] = useState<Set<string> | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      getClientJourneyAction(clientId),
      listCheckpointProposalsAction(clientId),
    ])
      .then(([next, pending]) => {
        if (!alive) return;
        setData(next);
        setProposals(pending);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [clientId]);
  const [dialog, setDialog] = useState<{
    open: boolean;
    checkpoint: Checkpoint | null;
    event: CheckpointEvent | null;
  }>({ open: false, checkpoint: null, event: null });
  const [dialogError, setDialogError] = useState<string | null>(null);

  const { progress, checkpointFields, journeyConfigured } = data;
  // La zona de la org: las fechas de los hitos se muestran y se eligen en ella.
  const timezone = useZonaDeLaOrganizacion();
  const summary = summarizeJourneyPosition(progress);

  // Mientras carga no se muestra nada. Si el recorrido no está configurado,
  // tampoco: mandar a configurarlo desde la ficha de un cliente sería ruido.
  // El lugar para configurarlo es su propia pantalla.
  if (loading || !journeyConfigured) return null;
  /**
   * ⭐ Las fases del recorrido, en orden, reconstruidas desde el progreso.
   *
   * `progress` ya viene ordenado por el recorrido, así que el orden en que
   * aparece cada fase **es** su orden. No hace falta pedir el catálogo aparte.
   */
  const stages = (() => {
    const vistas = new Map<string, { id: string; name: string; checkpoints: { id: string }[] }>();
    for (const entry of progress) {
      const actual = vistas.get(entry.stage.id) ?? {
        id: entry.stage.id,
        name: entry.stage.name,
        checkpoints: [],
      };
      actual.checkpoints.push({ id: entry.checkpoint.id });
      vistas.set(entry.stage.id, actual);
    }
    return [...vistas.values()];
  })();

  const alcanzados = new Set(
    progress.filter((entry) => entry.event !== null).map((entry) => entry.checkpoint.id)
  );

  const efectiva = resolveEffectiveStage(
    stages as never,
    summary.currentStageId,
    manualStageId
  );
  const salteados = skippedCheckpointIds(
    stages as never,
    efectiva.stageId,
    alcanzados
  );

  /**
   * Los hitos agrupados por fase, en el orden del recorrido.
   *
   * ⭐ Antes era una lista plana de quince renglones, cada uno con su botón y su
   * insignia de fase repetida. Quince acciones a la vista para una sola que
   * importa: la de la fase en curso. Agrupadas, la ficha muestra cuatro
   * renglones plegados y abre sólo donde hay algo que hacer.
   */
  const grupos = stages.map((stage) => {
    const entries = progress.filter((entry) => entry.stage.id === stage.id);
    return {
      stage,
      entries,
      reached: entries.filter((entry) => entry.event !== null).length,
      salteada: entries.every((entry) => salteados.has(entry.checkpoint.id)),
    };
  });

  const estaAbierta = (stageId: string) =>
    abiertas ? abiertas.has(stageId) : stageId === efectiva.stageId;

  const alternarFase = (stageId: string) => {
    setAbiertas((actuales) => {
      const base = new Set(
        actuales ?? (efectiva.stageId ? [efectiva.stageId] : [])
      );
      if (base.has(stageId)) base.delete(stageId);
      else base.add(stageId);
      return base;
    });
  };

  function fijarFase(stageId: string | null) {
    startTransition(async () => {
      const result = await setClientManualStageAction({ clientId, stageId });
      if (!result.success) {
        push({ title: "No se pudo cambiar la fase", description: result.error });
        return;
      }
      push({
        title: stageId ? "Fase actualizada" : "La fase vuelve a salir de los hitos",
        variant: "success",
      });
      /*
        ⭐ El proveedor de datos, y **no** `router.refresh()`.

        La ficha lee el cliente de `clients.find(...)`, no del prop que
        renderiza el servidor, así que refrescar el servidor no cambiaba nada:
        la fase quedaba guardada en la base y la pantalla seguía mostrando la
        anterior hasta recargar a mano.

        Refrescar además el servidor tampoco es gratis: vuelve a montar la
        columna de contexto entera y las tarjetas que cargan solas —la
        información del cliente, la facturación— desaparecen unos segundos por
        un cambio que no las toca. Las dos cosas se vieron probando contra el
        preview con datos reales.
      */
      await refreshClients();
    });
  }

  async function refresh() {
    const [next, pending] = await Promise.all([
      getClientJourneyAction(clientId),
      listCheckpointProposalsAction(clientId),
    ]);
    setData(next);
    setProposals(pending);
  }

  function submit(input: {
    reachedAt: string;
    metrics: Record<string, unknown>;
    note: string | null;
  }) {
    if (!dialog.checkpoint) return;
    setDialogError(null);
    startTransition(async () => {
      const result = await recordCheckpointAction({
        clientId,
        checkpointId: dialog.checkpoint!.id,
        ...input,
      });
      if (!result.success) {
        setDialogError(result.error);
        return;
      }
      setDialog({ open: false, checkpoint: null, event: null });
      await refresh();
      push({ title: "Checkpoint registrado", variant: "success" });
    });
  }

  function undo(entry: CheckpointWithEvent) {
    if (!entry.event) return;
    const warnsStatus = entry.checkpoint.setsClientStatus !== null;
    const message = warnsStatus
      ? `¿Deshacer "${entry.checkpoint.name}"? El estado del cliente no vuelve solo: si lo había cambiado, ajustalo a mano.`
      : `¿Deshacer "${entry.checkpoint.name}"?`;
    if (!window.confirm(message)) return;

    startTransition(async () => {
      const result = await undoCheckpointAction(entry.event!.id, clientId);
      if (!result.success) {
        push({ title: "No se pudo deshacer", description: result.error });
        return;
      }
      await refresh();
    });
  }

  return (
    <FichaSection
      icon={Flag}
      title="Recorrido"
      meta={
        journeyConfigured && summary.total > 0
          ? `${summary.reached} de ${summary.total}`
          : undefined
      }
      action={
        stages.length > 0 ? (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Fase
            <select
              className="h-8 max-w-[190px] rounded-md border border-border bg-background px-2 text-xs text-foreground"
              value={efectiva.stageId ?? ""}
              disabled={pending}
              onChange={(event) => fijarFase(event.target.value || null)}
              title="Elegí en qué fase está el cliente, sin tener que registrar los hitos anteriores"
            >
              <option value="">Sin empezar</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>
        ) : undefined
      }
    >
      {/*
        ⭐ El aviso existe porque fijar la fase a mano **no registra hitos**: el
        historial sigue diciendo la verdad sobre lo que el cliente hizo. Sin
        esta línea, los hitos en gris de arriba se leerían como un error.
      */}
      {efectiva.origin === "manual" ? (
        <p className="text-xs text-muted-foreground">
          La fase está fijada a mano. Los hitos de las fases anteriores quedan
          como salteados — no se dan por cumplidos.
        </p>
      ) : null}

      {proposals.length > 0 ? (
        <div className="space-y-2">
          {proposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              zona={timezone}
              checkpointName={
                progress.find((entry) => entry.checkpoint.id === proposal.checkpointId)
                  ?.checkpoint.name ?? "un checkpoint"
              }
              pending={pending}
              onAccept={() =>
                startTransition(async () => {
                  const result = await acceptCheckpointProposalAction(proposal.id);
                  if (!result.success) {
                    push({ title: "No se pudo aceptar", description: result.error });
                    return;
                  }
                  await refresh();
                  push({ title: "Checkpoint registrado", variant: "success" });
                })
              }
              onReject={() =>
                startTransition(async () => {
                  const result = await rejectCheckpointProposalAction(proposal.id);
                  if (!result.success) {
                    push({ title: "No se pudo descartar", description: result.error });
                    return;
                  }
                  await refresh();
                })
              }
            />
          ))}
        </div>
      ) : null}

      {summary.total === 0 ? (
        <GlassPanel className="p-4 text-sm text-muted-foreground">
          El recorrido tiene fases pero todavía ningún checkpoint.{" "}
          <Link
            href={paths.platform.clients.checkpoints}
            className="text-primary underline-offset-4 hover:underline"
          >
            Agregá el primero
          </Link>
          .
        </GlassPanel>
      ) : (
        <GlassPanel className="divide-y divide-border/40 p-0">
          {grupos.map((grupo) => {
            const abierta = estaAbierta(grupo.stage.id);
            const esActual = grupo.stage.id === efectiva.stageId;
            return (
              <div key={grupo.stage.id}>
                <button
                  type="button"
                  onClick={() => alternarFase(grupo.stage.id)}
                  aria-expanded={abierta}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 dark:hover:bg-white/[0.03]",
                    grupo.salteada && !abierta && "opacity-60"
                  )}
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      !abierta && "-rotate-90"
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {grupo.stage.name}
                  </span>
                  {esActual ? (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      en curso
                    </Badge>
                  ) : null}
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {grupo.reached} de {grupo.entries.length}
                  </span>
                </button>

                {abierta ? (
                  <div className="divide-y divide-border/30 border-t border-border/30">
                    {grupo.entries.map((entry) => (
                      <CheckpointLine
                        key={entry.checkpoint.id}
                        entry={entry}
                        zona={timezone}
                        checkpointFields={checkpointFields}
                        salteado={salteados.has(entry.checkpoint.id)}
                        pending={pending}
                        onRecord={() => {
                          setDialogError(null);
                          setDialog({
                            open: true,
                            checkpoint: entry.checkpoint,
                            event: entry.event,
                          });
                        }}
                        onUndo={() => undo(entry)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </GlassPanel>
      )}

      <RecordCheckpointDialog
        open={dialog.open}
        checkpoint={dialog.checkpoint}
        checkpointFields={checkpointFields}
        existingEvent={dialog.event}
        zona={timezone}
        saving={pending}
        error={dialogError}
        onClose={() => setDialog({ open: false, checkpoint: null, event: null })}
        onSubmit={submit}
      />
    </FichaSection>
  );
}

function CheckpointLine({
  entry,
  zona,
  checkpointFields,
  salteado,
  pending,
  onRecord,
  onUndo,
}: {
  entry: CheckpointWithEvent;
  /** La zona de la organización: la fecha del hito se muestra en ese día. */
  zona: string | null;
  checkpointFields: FieldDefinition[];
  /** De una fase anterior a la actual y sin registrar: el cliente ya pasó. */
  salteado: boolean;
  pending: boolean;
  onRecord: () => void;
  onUndo: () => void;
}) {
  const { checkpoint, stage, event } = entry;
  const reached = event !== null;

  return (
    <div className={cn("flex items-start gap-3 p-3", salteado && "opacity-50")}>
      <span
        className="mt-0.5 shrink-0"
        style={{ color: reached ? fieldOptionColorVar(stage.color) : undefined }}
      >
        {reached ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : salteado ? (
          <MinusCircle
            className="h-4 w-4 text-muted-foreground/60"
            aria-label="Salteado"
          />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground/50" />
        )}
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-sm", !reached && "text-muted-foreground")}>
            {checkpoint.name}
          </span>
          {salteado ? (
            <Badge variant="outline" className="text-[10px] font-normal">
              salteado
            </Badge>
          ) : null}
          {!reached && checkpoint.expectedDays !== null ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {checkpoint.expectedDays} d
            </span>
          ) : null}
        </div>

        {reached ? (
          <p className="text-xs text-muted-foreground">
            {formatearFechaDelHito(event.reachedAt, zona)}
          </p>
        ) : null}

        {reached ? (
          <ReachedMetrics event={event} checkpoint={checkpoint} checkpointFields={checkpointFields} />
        ) : null}

        {reached && event.note ? (
          <p className="text-xs text-muted-foreground">{event.note}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {reached ? (
          /*
            ⭐ Corregir un hito ya registrado es raro; registrarlo es lo
            frecuente. Con el borde naranja del botón `ghost`, cada hito
            cumplido ponía dos anillos encendidos al costado y la fila cumplida
            gritaba más que la pendiente, que es la que pide acción. Quietos
            —sin borde y en gris— se ven igual, pero ya no compiten.
          */
          <>
            <Button
              variant="ghost"
              size="icon"
              className={ACCION_DE_FILA}
              title="Editar la fecha y las métricas"
              disabled={pending}
              onClick={onRecord}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={ACCION_DE_FILA}
              title="Deshacer: el hito vuelve a quedar pendiente"
              disabled={pending}
              onClick={onUndo}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" disabled={pending} onClick={onRecord}>
            Registrar
          </Button>
        )}
      </div>
    </div>
  );
}

function ReachedMetrics({
  event,
  checkpoint,
  checkpointFields,
}: {
  event: CheckpointEvent;
  checkpoint: Checkpoint;
  checkpointFields: FieldDefinition[];
}) {
  const resolved = resolveMetricSchema(checkpoint.metricSchema, checkpointFields);
  const shown = resolved
    .filter((entry) => entry.field !== null)
    .map((entry) => {
      const formatted = formatFieldValue(entry.field!, event.metrics[entry.metric.fieldKey]);
      return { label: entry.field!.label, text: formatted.isEmpty ? null : formatted.parts.map((p) => p.text).join(", ") };
    })
    .filter((entry) => entry.text !== null);

  if (shown.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5">
      {shown.map((metric) => (
        <span key={metric.label} className="text-xs">
          <span className="text-muted-foreground">{metric.label}:</span> {metric.text}
        </span>
      ))}
    </div>
  );
}

const PROPOSAL_SOURCE_LABEL: Record<CheckpointProposal["source"], string> = {
  discord: "Discord",
  fathom: "una llamada",
  automatic: "el sistema",
};

/**
 * Una propuesta de una fuente externa.
 *
 * ⭐ Se lee como una sugerencia, no como un hecho: dice quién la propone y por
 * qué, y no hace nada hasta que alguien la acepta.
 */
function ProposalCard({
  proposal,
  zona,
  checkpointName,
  pending,
  onAccept,
  onReject,
}: {
  proposal: CheckpointProposal;
  /** La zona de la organización. */
  zona: string | null;
  checkpointName: string;
  pending: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <GlassPanel className="space-y-2 border-primary/20 p-3">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="text-muted-foreground">
              {PROPOSAL_SOURCE_LABEL[proposal.source]} sugiere que alcanzó
            </span>{" "}
            <strong>{checkpointName}</strong>
          </p>
          {proposal.rationale ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{proposal.rationale}</p>
          ) : null}
          {proposal.suggestedReachedAt ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatearFechaDelHito(proposal.suggestedReachedAt, zona)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={pending} onClick={onReject}>
          Descartar
        </Button>
        <Button size="sm" disabled={pending} onClick={onAccept}>
          Aceptar
        </Button>
      </div>
    </GlassPanel>
  );
}

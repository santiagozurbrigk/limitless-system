"use client";

/**
 * C1 · La pantalla del recorrido del cliente.
 *
 * Dibuja las fases en orden y, dentro de cada una, sus checkpoints. Es
 * configuración: acá se define el mapa, no se registra lo que pasó (eso es C2).
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge, Button, GlassPanel, cn } from "@ai-coo/ui";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  Clock,
  Pencil,
  Plus,
  Route,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { useToast } from "@/providers/toast-provider";
import type { MutationResult } from "@/lib/server/action-result";
import { correrMutacion, leerConMotivo, type Aviso } from "@/lib/client/correr-accion";
import {
  CHECKPOINT_CLIENT_STATUS_LABEL,
  type Checkpoint,
  type JourneyStage,
  type JourneyStageWithCheckpoints,
} from "@/types/checkpoints";
import type { FieldDefinition } from "@/types/custom-fields";
import { fieldOptionColorVar } from "@/lib/custom-fields";
import { resolveMetricSchema } from "@/lib/checkpoints";
import {
  createCheckpointAction,
  createJourneyStageAction,
  deleteCheckpointAction,
  deleteJourneyStageAction,
  getJourneyPageDataAction,
  reorderCheckpointsAction,
  reorderJourneyStagesAction,
  seedExampleJourneyAction,
  setCheckpointArchivedAction,
  setJourneyStageArchivedAction,
  updateCheckpointAction,
  updateJourneyStageAction,
  type JourneyPageData,
} from "@/app/clients/checkpoint-actions";
import { paths } from "@/routes";
import {
  CheckpointDialog,
  type CheckpointDraft,
} from "@/components/clients/checkpoints/checkpoint-dialog";
import {
  StageDialog,
  type StageDraft,
} from "@/components/clients/checkpoints/stage-dialog";

/**
 * Vuelve a leer el recorrido después de un cambio (SCRUM-517). Si no se pudo,
 * avisa el motivo (o el texto fijo si la acción lanzó) y devuelve `null`: la
 * pantalla se queda con lo que ya mostraba.
 */
export async function recargarRecorrido(
  avisar: (aviso: Aviso) => void
): Promise<JourneyPageData | null> {
  const lectura = await leerConMotivo(getJourneyPageDataAction, "[JourneyPage] recargar");
  if (!lectura.ok) {
    avisar({ title: "No se pudo actualizar el recorrido", description: lectura.motivo });
    return null;
  }
  return lectura.data;
}

/**
 * Un cambio del recorrido desde un botón (SCRUM-517): el motivo de un rechazo
 * se avisa; si la acción lanzó, el texto fijo. Con éxito, `alExito`.
 */
export function cambiarRecorrido(
  accion: () => Promise<MutationResult<unknown>>,
  avisar: (aviso: Aviso) => void,
  alExito: () => void | Promise<void>
): Promise<void> {
  return correrMutacion({
    accion,
    alExito,
    avisar,
    tituloError: "No se pudo guardar",
    etiqueta: "[JourneyPage] cambio",
  });
}

export function JourneyPage({ initialData }: { initialData: JourneyPageData }) {
  const { push } = useToast();
  const [data, setData] = useState(initialData);
  const [pending, startTransition] = useTransition();

  const [stageDialog, setStageDialog] = useState<{ open: boolean; stage: JourneyStage | null }>(
    { open: false, stage: null }
  );
  const [checkpointDialog, setCheckpointDialog] = useState<{
    open: boolean;
    stage: JourneyStageWithCheckpoints | null;
    checkpoint: Checkpoint | null;
  }>({ open: false, stage: null, checkpoint: null });
  const [dialogError, setDialogError] = useState<string | null>(null);

  const { canManage, checkpointFields, orphanCheckpoints, stages } = data;

  async function refresh() {
    const next = await recargarRecorrido(push);
    if (next) setData(next);
  }

  function run(operation: () => Promise<MutationResult<unknown>>) {
    startTransition(() => cambiarRecorrido(operation, push, refresh));
  }

  function submitStage(draft: StageDraft) {
    setDialogError(null);
    startTransition(async () => {
      // Si la acción lanzó, el diálogo muestra el texto fijo (SCRUM-517).
      const result = await leerConMotivo(
        () =>
          stageDialog.stage
            ? updateJourneyStageAction(stageDialog.stage.id, draft)
            : createJourneyStageAction(draft),
        "[JourneyPage] guardar fase"
      );

      if (!result.ok) {
        setDialogError(result.motivo);
        return;
      }
      setStageDialog({ open: false, stage: null });
      await refresh();
    });
  }

  function submitCheckpoint(draft: CheckpointDraft) {
    setDialogError(null);
    const stage = checkpointDialog.stage;
    if (!stage) return;

    // Un plazo vacío es "sin plazo". Un plazo que no es un número se rechaza
    // acá, con un mensaje, en vez de mandarlo a la base.
    const trimmedDays = draft.expectedDays.trim();
    let expectedDays: number | null = null;
    if (trimmedDays !== "") {
      const parsed = Number(trimmedDays);
      if (!Number.isInteger(parsed) || parsed < 1) {
        setDialogError("El plazo tiene que ser un número entero de días, o quedar vacío.");
        return;
      }
      expectedDays = parsed;
    }

    startTransition(async () => {
      const payload = {
        stageId: stage.id,
        name: draft.name,
        description: draft.description.trim() || null,
        setsClientStatus: draft.setsClientStatus,
        expectedDays,
        metricSchema: draft.metricSchema,
      };

      const result = await leerConMotivo(
        () =>
          checkpointDialog.checkpoint
            ? updateCheckpointAction(checkpointDialog.checkpoint.id, payload)
            : createCheckpointAction(payload),
        "[JourneyPage] guardar checkpoint"
      );

      if (!result.ok) {
        setDialogError(result.motivo);
        return;
      }
      setCheckpointDialog({ open: false, stage: null, checkpoint: null });
      await refresh();
      push({ title: checkpointDialog.checkpoint ? "Checkpoint actualizado" : "Checkpoint creado", variant: "success" });
    });
  }

  function moveStage(stage: JourneyStage, direction: -1 | 1) {
    const ordered = stages.map((entry) => entry.id);
    const from = ordered.indexOf(stage.id);
    const to = from + direction;
    if (to < 0 || to >= ordered.length) return;
    [ordered[from], ordered[to]] = [ordered[to] as string, ordered[from] as string];
    run(() => reorderJourneyStagesAction(ordered));
  }

  function moveCheckpoint(
    stage: JourneyStageWithCheckpoints,
    checkpoint: Checkpoint,
    direction: -1 | 1
  ) {
    const ordered = stage.checkpoints.map((entry) => entry.id);
    const from = ordered.indexOf(checkpoint.id);
    const to = from + direction;
    if (to < 0 || to >= ordered.length) return;
    [ordered[from], ordered[to]] = [ordered[to] as string, ordered[from] as string];
    run(() => reorderCheckpointsAction(stage.id, ordered));
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* El título ya lo pone el topbar: acá va sólo la bajada (ver PageHeader). */}
      <PageHeader
        description="Las fases por las que pasa un cliente y los hitos concretos de cada una."
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setDialogError(null);
                setStageDialog({ open: true, stage: null });
              }}
              disabled={pending}
            >
              <Plus className="mr-1 h-4 w-4" />
              Nueva fase
            </Button>
          ) : undefined
        }
      />

      <p className="-mt-3 text-sm text-muted-foreground">
        Las métricas que pide cada hito salen de{" "}
        <Link
          href={paths.platform.clients.customFields}
          className="text-primary underline-offset-4 hover:underline"
        >
          Campos personalizados
        </Link>
        .
      </p>

      {!canManage ? (
        <GlassPanel className="p-4 text-sm text-muted-foreground">
          Solo el founder puede cambiar el recorrido. Podés ver cómo está armado.
        </GlassPanel>
      ) : null}

      {stages.length === 0 ? (
        <EmptyState
          icon={<Route className="h-6 w-6" />}
          title="Todavía no hay un recorrido"
          description="Definí las fases por las que pasa un cliente desde que compra. Después, dentro de cada una, los hitos concretos."
          action={
            canManage ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  onClick={() => {
                    setDialogError(null);
                    setStageDialog({ open: true, stage: null });
                  }}
                  disabled={pending}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Nueva fase
                </Button>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(seedExampleJourneyAction)}
                >
                  Cargar un recorrido de ejemplo
                </Button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {stages.map((stage, index) => (
            <StageCard
              key={stage.id}
              stage={stage}
              checkpointFields={checkpointFields}
              canManage={canManage}
              pending={pending}
              isFirst={index === 0}
              isLast={index === stages.length - 1}
              position={index + 1}
              onEdit={() => {
                setDialogError(null);
                setStageDialog({ open: true, stage });
              }}
              onMove={(direction) => moveStage(stage, direction)}
              onToggleArchive={() =>
                run(() => setJourneyStageArchivedAction(stage.id, stage.archivedAt === null))
              }
              onDelete={() => run(() => deleteJourneyStageAction(stage.id))}
              onAddCheckpoint={() => {
                setDialogError(null);
                setCheckpointDialog({ open: true, stage, checkpoint: null });
              }}
              onEditCheckpoint={(checkpoint) => {
                setDialogError(null);
                setCheckpointDialog({ open: true, stage, checkpoint });
              }}
              onMoveCheckpoint={(checkpoint, direction) =>
                moveCheckpoint(stage, checkpoint, direction)
              }
              onToggleCheckpointArchive={(checkpoint) =>
                run(() =>
                  setCheckpointArchivedAction(checkpoint.id, checkpoint.archivedAt === null)
                )
              }
              onDeleteCheckpoint={(checkpoint) =>
                run(() => deleteCheckpointAction(checkpoint.id))
              }
            />
          ))}
        </div>
      )}

      {orphanCheckpoints.length > 0 ? (
        <GlassPanel className="space-y-2 p-4">
          <p className="flex items-center gap-1.5 text-sm text-warning">
            <AlertTriangle className="h-4 w-4" />
            Checkpoints sin fase
          </p>
          <p className="text-xs text-muted-foreground">
            Su fase ya no existe. Se muestran acá para que no desaparezcan sin aviso.
          </p>
          {orphanCheckpoints.map((checkpoint) => (
            <div key={checkpoint.id} className="flex items-center justify-between gap-2">
              <span className="text-sm">{checkpoint.name}</span>
              {canManage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => deleteCheckpointAction(checkpoint.id))}
                >
                  Borrar
                </Button>
              ) : null}
            </div>
          ))}
        </GlassPanel>
      ) : null}

      <StageDialog
        open={stageDialog.open}
        stage={stageDialog.stage}
        saving={pending}
        error={dialogError}
        onClose={() => setStageDialog({ open: false, stage: null })}
        onSubmit={submitStage}
      />

      <CheckpointDialog
        open={checkpointDialog.open}
        checkpoint={checkpointDialog.checkpoint}
        stageName={checkpointDialog.stage?.name ?? ""}
        checkpointFields={checkpointFields}
        saving={pending}
        error={dialogError}
        onClose={() => setCheckpointDialog({ open: false, stage: null, checkpoint: null })}
        onSubmit={submitCheckpoint}
      />
    </div>
  );
}

function StageCard({
  stage,
  checkpointFields,
  canManage,
  pending,
  isFirst,
  isLast,
  position,
  onEdit,
  onMove,
  onToggleArchive,
  onDelete,
  onAddCheckpoint,
  onEditCheckpoint,
  onMoveCheckpoint,
  onToggleCheckpointArchive,
  onDeleteCheckpoint,
}: {
  stage: JourneyStageWithCheckpoints;
  checkpointFields: FieldDefinition[];
  canManage: boolean;
  pending: boolean;
  isFirst: boolean;
  isLast: boolean;
  position: number;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
  onToggleArchive: () => void;
  onDelete: () => void;
  onAddCheckpoint: () => void;
  onEditCheckpoint: (checkpoint: Checkpoint) => void;
  onMoveCheckpoint: (checkpoint: Checkpoint, direction: -1 | 1) => void;
  onToggleCheckpointArchive: (checkpoint: Checkpoint) => void;
  onDeleteCheckpoint: (checkpoint: Checkpoint) => void;
}) {
  const isArchived = stage.archivedAt !== null;

  return (
    <GlassPanel className={cn("p-4", isArchived && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="h-8 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: fieldOptionColorVar(stage.color) }}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Fase {position}</span>
              <span className="font-medium">{stage.name}</span>
              {isArchived ? <Badge variant="warning">Archivada</Badge> : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {stage.checkpoints.length === 0
                ? "Sin checkpoints"
                : `${stage.checkpoints.length} checkpoint${stage.checkpoints.length > 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {canManage ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" title="Subir" disabled={pending || isFirst} onClick={() => onMove(-1)}>
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" title="Bajar" disabled={pending || isLast} onClick={() => onMove(1)}>
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" title="Editar" disabled={pending} onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title={isArchived ? "Volver a usarla" : "Archivar"}
              disabled={pending}
              onClick={onToggleArchive}
            >
              {isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Borrar (sólo si está vacía)"
              disabled={pending}
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-3 space-y-2 border-l border-border/50 pl-4">
        {stage.checkpoints.map((checkpoint, index) => (
          <CheckpointRow
            key={checkpoint.id}
            checkpoint={checkpoint}
            checkpointFields={checkpointFields}
            canManage={canManage}
            pending={pending}
            isFirst={index === 0}
            isLast={index === stage.checkpoints.length - 1}
            onEdit={() => onEditCheckpoint(checkpoint)}
            onMove={(direction) => onMoveCheckpoint(checkpoint, direction)}
            onToggleArchive={() => onToggleCheckpointArchive(checkpoint)}
            onDelete={() => onDeleteCheckpoint(checkpoint)}
          />
        ))}

        {canManage ? (
          <Button variant="ghost" size="sm" disabled={pending} onClick={onAddCheckpoint}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Agregar checkpoint
          </Button>
        ) : null}
      </div>
    </GlassPanel>
  );
}

function CheckpointRow({
  checkpoint,
  checkpointFields,
  canManage,
  pending,
  isFirst,
  isLast,
  onEdit,
  onMove,
  onToggleArchive,
  onDelete,
}: {
  checkpoint: Checkpoint;
  checkpointFields: FieldDefinition[];
  canManage: boolean;
  pending: boolean;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  const isArchived = checkpoint.archivedAt !== null;
  const metrics = resolveMetricSchema(checkpoint.metricSchema, checkpointFields);
  const broken = metrics.filter((entry) => entry.field === null).length;

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border border-border/50 px-3 py-2",
        isArchived && "opacity-60"
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{checkpoint.name}</span>
          {isArchived ? <Badge variant="warning">Archivado</Badge> : null}
          {checkpoint.expectedDays !== null ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {checkpoint.expectedDays} d
            </span>
          ) : null}
          {checkpoint.setsClientStatus ? (
            <Badge variant="outline">
              → {CHECKPOINT_CLIENT_STATUS_LABEL[checkpoint.setsClientStatus]}
            </Badge>
          ) : null}
        </div>

        {checkpoint.description ? (
          <p className="text-xs text-muted-foreground">{checkpoint.description}</p>
        ) : null}

        {metrics.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <SlidersHorizontal className="h-3 w-3 text-muted-foreground" />
            {metrics.map((entry) => (
              <span
                key={entry.metric.fieldKey}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px]",
                  entry.field === null
                    ? "border-warning/50 text-warning"
                    : "border-border/60 text-muted-foreground"
                )}
                title={
                  entry.field === null
                    ? "Esta métrica apunta a una columna que ya no existe"
                    : undefined
                }
              >
                {entry.field?.label ?? entry.metric.fieldKey}
                {entry.required ? " *" : ""}
              </span>
            ))}
            {broken > 0 ? (
              <AlertTriangle className="h-3 w-3 text-warning" />
            ) : null}
          </div>
        ) : null}
      </div>

      {canManage ? (
        <div className="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="icon" title="Subir" disabled={pending || isFirst} onClick={() => onMove(-1)}>
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" title="Bajar" disabled={pending || isLast} onClick={() => onMove(1)}>
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" title="Editar" disabled={pending} onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={isArchived ? "Volver a usarlo" : "Archivar"}
            disabled={pending}
            onClick={onToggleArchive}
          >
            {isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Borrar (sólo si nadie lo alcanzó)"
            disabled={pending}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  publishVariationsAction,
  setReelVariationDelayAction,
  refreshVariationPreviewUrlsAction,
  listReelVariationJobsForPieceAction,
} from "@/app/marketing/content/reel-variation-actions";
import { VariationCard } from "./variation-card";
import { Badge, Button, cn } from "@ai-coo/ui";
import { useToast } from "@/providers/toast-provider";
import { createClient } from "@/lib/supabase/client";
import {
  correrMutacion,
  leerConMotivo,
  type Aviso,
} from "@/lib/client/correr-accion";
import {
  Clock,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";
import type { ReelVariation, ReelVariationJob, ReelJobStatus } from "@/types/reel-variations";

// ─── Tipos locales ────────────────────────────────────────────────────────────

const DELAY_OPTIONS = [
  { label: "Sin delay", value: 0 },
  { label: "1 hora", value: 1 },
  { label: "2 horas", value: 2 },
  { label: "4 horas", value: 4 },
  { label: "8 horas", value: 8 },
  { label: "24 horas", value: 24 },
];

const JOB_STATUS_LABEL: Record<ReelJobStatus, string> = {
  pending:       "En cola",
  processing:    "Procesando",
  preview_ready: "Lista para revisar",
  publishing:    "Publicando",
  done:          "Completado",
  failed:        "Error",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ReelJobStatus }) {
  const variants: Record<ReelJobStatus, string> = {
    pending:       "bg-muted text-muted-foreground",
    processing:    "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
    preview_ready: "bg-primary/20 text-primary border-primary/30",
    publishing:    "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30",
    done:          "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30",
    failed:        "bg-destructive/20 text-destructive border-destructive/30",
  };

  return (
    <Badge className={cn("border", variants[status])}>
      {status === "processing" || status === "publishing" ? (
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
      ) : null}
      {JOB_STATUS_LABEL[status]}
    </Badge>
  );
}

// ─── Acciones con su motivo (SCRUM-502) ───────────────────────────────────────
// Las acciones devuelven su error como valor: se avisa el motivo, o el texto
// fijo si la acción lanzó. Antes renovar las vistas previas y recargar los jobs
// ignoraban cualquier falla en silencio.

export function cambiarDemora(opciones: {
  jobId: string;
  horas: number;
  alCambiar: () => void;
  avisar: (aviso: Aviso) => void;
}): Promise<void> {
  return correrMutacion({
    accion: () => setReelVariationDelayAction(opciones.jobId, opciones.horas),
    alExito: opciones.alCambiar,
    avisar: opciones.avisar,
    tituloError: "No se pudo cambiar el delay",
    etiqueta: "[TrialReelsPanel] delay",
  });
}

/** El job con las URLs renovadas; `null` si no existe o si falló (y se avisó). */
export async function renovarVistasPrevias(
  jobId: string,
  avisar: (aviso: Aviso) => void
): Promise<ReelVariationJob | null> {
  const lectura = await leerConMotivo(
    () => refreshVariationPreviewUrlsAction(jobId),
    "[TrialReelsPanel] renovar vistas previas"
  );
  if (lectura.ok) return lectura.data;
  avisar({ title: "No se pudieron renovar las vistas previas", description: lectura.motivo });
  return null;
}

/** Los jobs de la pieza; `null` si falló (y se avisó): el panel queda como estaba. */
export async function recargarTrabajos(
  contentPieceId: string,
  avisar: (aviso: Aviso) => void
): Promise<ReelVariationJob[] | null> {
  const lectura = await leerConMotivo(
    () => listReelVariationJobsForPieceAction(contentPieceId),
    "[TrialReelsPanel] recargar"
  );
  if (lectura.ok) return lectura.data;
  avisar({ title: "No se pudieron recargar los Trial Reels", description: lectura.motivo });
  return null;
}

// ─── Panel principal ──────────────────────────────────────────────────────────

type Props = {
  contentPieceId: string;
  initialJobs?: ReelVariationJob[];
};

export function TrialReelsPanel({ contentPieceId, initialJobs = [] }: Props) {
  const { push } = useToast();
  const router = useRouter();
  const [jobs, setJobs] = useState<ReelVariationJob[]>(initialJobs);
  const [activeJobId, setActiveJobId] = useState<string | null>(
    initialJobs[0]?.id ?? null
  );
  const [publishing, setPublishing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const realtimeRef = useRef<ReturnType<typeof createClient> | null>(null);

  const activeJob = jobs.find((j) => j.id === activeJobId) ?? null;

  // ─── Supabase Realtime ────────────────────────────────────────────────────

  useEffect(() => {
    if (!activeJobId) return;

    const supabase = createClient();
    realtimeRef.current = supabase;

    const channel = supabase
      .channel(`reel-job-${activeJobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "reel_variation_jobs",
          filter: `id=eq.${activeJobId}`,
        },
        (payload) => {
          const updated = payload.new as ReelVariationJob;
          setJobs((prev) =>
            prev.map((j) => (j.id === activeJobId ? { ...j, ...updated } : j))
          );

          if (updated.status === "preview_ready") {
            push({
              title: "Variaciones listas",
              description: "Podés revisar y editar los captions antes de publicar.",
              variant: "success",
            });
          }

          if (updated.status === "done") {
            push({
              title: "Trial Reels publicados",
              description: "Todas las variantes se publicaron en Zernio.",
              variant: "success",
            });
            router.refresh();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeJobId, push, router]);

  // ─── Actualizar variante localmente (optimistic) ──────────────────────────

  const handleVariationUpdate = useCallback(
    (index: number, patch: Partial<ReelVariation>) => {
      setJobs((prev) =>
        prev.map((j) => {
          if (j.id !== activeJobId) return j;
          const variations = [...j.variations];
          variations[index] = { ...variations[index], ...patch };
          return { ...j, variations };
        })
      );
    },
    [activeJobId]
  );

  // ─── Delay ───────────────────────────────────────────────────────────────

  const handleDelayChange = async (hours: number) => {
    if (!activeJobId) return;
    await cambiarDemora({
      jobId: activeJobId,
      horas: hours,
      alCambiar: () =>
        setJobs((prev) =>
          prev.map((j) => (j.id === activeJobId ? { ...j, delay_hours: hours } : j))
        ),
      avisar: push,
    });
  };

  // ─── Refresh preview URLs ─────────────────────────────────────────────────

  const handleRefreshUrls = async () => {
    if (!activeJobId) return;
    setRefreshing(true);
    try {
      const updated = await renovarVistasPrevias(activeJobId, push);
      if (updated) {
        setJobs((prev) => prev.map((j) => (j.id === activeJobId ? updated : j)));
      }
    } finally {
      setRefreshing(false);
    }
  };

  // ─── Publicar ─────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!activeJobId) return;
    setPublishing(true);
    try {
      const result = await publishVariationsAction(activeJobId);
      if (!result.ok) {
        push({ title: "Error al publicar", description: result.message });
        return;
      }
      push({
        title: `${result.scheduled} variante${result.scheduled === 1 ? "" : "s"} programada${result.scheduled === 1 ? "" : "s"}`,
        description:
          result.scheduled > 1 && activeJob?.delay_hours
            ? `Se publicarán con ${activeJob.delay_hours}h de diferencia entre cada una.`
            : "La publicación está en proceso.",
        variant: "success",
      });
    } catch (err) {
      push({
        title: "Error al publicar",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setPublishing(false);
    }
  };

  // ─── Recargar jobs ────────────────────────────────────────────────────────

  const handleReloadJobs = async () => {
    const fresh = await recargarTrabajos(contentPieceId, push);
    if (!fresh) return;
    setJobs(fresh);
    if (fresh.length > 0 && !fresh.find((j) => j.id === activeJobId)) {
      setActiveJobId(fresh[0].id);
    }
  };

  // ─── Estado vacío ─────────────────────────────────────────────────────────

  if (jobs.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No hay jobs de Trial Reels para esta pieza.
        <br />
        Usá el botón &ldquo;Crear Trial Reels&rdquo; para empezar.
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const includedCount = activeJob?.variations.filter((v) => v.included && (v.status === "ready" || v.status === "scheduled")).length ?? 0;
  const readyCount = activeJob?.variations.filter((v) => v.status === "ready" || v.status === "scheduled").length ?? 0;

  return (
    <div className="space-y-4">
      {/* Selector de job (si hay más de uno) */}
      {jobs.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {jobs.map((job, i) => (
            <button
              key={job.id}
              onClick={() => setActiveJobId(job.id)}
              className={cn(
                "shrink-0 rounded-md border px-3 py-1.5 text-xs transition-colors",
                job.id === activeJobId
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              Job #{jobs.length - i}
              {" · "}
              <span suppressHydrationWarning>
                {new Date(job.created_at).toLocaleDateString("es-AR", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </button>
          ))}
          <button
            onClick={handleReloadJobs}
            className="shrink-0 rounded-md border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            title="Recargar jobs"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      )}

      {activeJob && (
        <>
          {/* Status del job */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusBadge status={activeJob.status} />
              {activeJob.status === "processing" && (
                <span className="text-xs text-muted-foreground">
                  {readyCount} / {activeJob.variations.length || 5} variantes
                </span>
              )}
            </div>

            {activeJob.status === "preview_ready" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshUrls}
                disabled={refreshing}
                className="h-7 gap-1 text-xs text-muted-foreground"
              >
                <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
                Renovar URLs
              </Button>
            )}
          </div>

          {/* Error del job */}
          {activeJob.status === "failed" && activeJob.error_message && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {activeJob.error_message}
            </div>
          )}

          {/* Variantes */}
          {activeJob.variations.length > 0 ? (
            <div className="space-y-3">
              {activeJob.variations.map((variation, i) => (
                <VariationCard
                  key={variation.type}
                  jobId={activeJob.id}
                  index={i}
                  variation={variation}
                  onUpdate={handleVariationUpdate}
                />
              ))}
            </div>
          ) : (
            activeJob.status === "pending" && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                Esperando que el worker procese el video…
              </div>
            )
          )}

          {/* Controles de publicación */}
          {activeJob.status === "preview_ready" && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h4 className="text-sm font-medium">Publicar variantes</h4>

              {/* Selector de delay */}
              <div className="flex items-center gap-2 flex-wrap">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">Delay entre posts:</span>
                <div className="flex gap-1 flex-wrap">
                  {DELAY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleDelayChange(opt.value)}
                      className={cn(
                        "rounded px-2.5 py-1 text-xs transition-colors",
                        activeJob.delay_hours === opt.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {includedCount} de {readyCount} variantes seleccionadas
                </p>
                <Button
                  size="sm"
                  onClick={handlePublish}
                  disabled={publishing || includedCount === 0}
                  className="gap-1.5"
                >
                  {publishing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {publishing ? "Publicando…" : `Publicar ${includedCount} variante${includedCount === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

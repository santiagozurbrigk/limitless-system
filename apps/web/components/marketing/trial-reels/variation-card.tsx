"use client";

import { useState } from "react";
import {
  updateReelVariationAction,
  retryVariationAction,
  regenerateCaptionAction,
} from "@/app/marketing/content/reel-variation-actions";
import { Badge, Button, Textarea, cn } from "@ai-coo/ui";
import { useToast } from "@/providers/toast-provider";
import { correrMutacion, type Aviso } from "@/lib/client/correr-accion";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Instagram,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import type { ReelVariation, ReelVariationType } from "@/types/reel-variations";

// ─── Labels ───────────────────────────────────────────────────────────────────

const VARIATION_LABELS: Record<ReelVariationType, string> = {
  speed_up:   "Velocidad +25%",
  speed_down: "Velocidad -15%",
  music:      "Música de fondo",
  subtitles:  "Subtítulos",
  color:      "Corrección de color",
};

const VARIATION_DESCRIPTIONS: Record<ReelVariationType, string> = {
  speed_up:   "Video acelerado un 25% para mayor dinamismo y engagement",
  speed_down: "Video a -15% de velocidad, más contemplativo",
  music:      "Música de fondo mezclada sobre el audio original",
  subtitles:  "Texto del caption quemado en el video para ver sin sonido",
  color:      "LUT de color cálido aplicado para diferente estética",
};

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  jobId: string;
  index: number;
  variation: ReelVariation;
  onUpdate: (index: number, patch: Partial<ReelVariation>) => void;
};

// ─── Guardar con su motivo (SCRUM-502) ────────────────────────────────────────
// `updateReelVariationAction` devuelve su error como valor: se avisa el motivo,
// o el texto fijo si la acción lanzó. Antes, incluir o excluir una variante que
// fallaba no avisaba nada.

type CambioDeVariante = Parameters<typeof updateReelVariationAction>[2];

export function guardarCambioDeVariante(opciones: {
  jobId: string;
  index: number;
  cambio: CambioDeVariante;
  alGuardar: () => void;
  avisar: (aviso: Aviso) => void;
  tituloError: string;
}): Promise<void> {
  return correrMutacion({
    accion: () => updateReelVariationAction(opciones.jobId, opciones.index, opciones.cambio),
    alExito: opciones.alGuardar,
    avisar: opciones.avisar,
    tituloError: opciones.tituloError,
    etiqueta: "[VariationCard] guardar",
  });
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function VariationCard({ jobId, index, variation, onUpdate }: Props) {
  const { push } = useToast();
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [localDescription, setLocalDescription] = useState(variation.description);
  const [localHashtags, setLocalHashtags] = useState(
    (variation.hashtags ?? []).join(" ")
  );
  const [videoExpanded, setVideoExpanded] = useState(false);

  const isDirty =
    localDescription !== variation.description ||
    localHashtags !== (variation.hashtags ?? []).join(" ");

  const handleSave = async () => {
    setSaving(true);
    try {
      const hashtags = localHashtags
        .split(/\s+/)
        .map((h) => (h.startsWith("#") ? h : `#${h}`))
        .filter(Boolean);

      await guardarCambioDeVariante({
        jobId,
        index,
        cambio: { description: localDescription, hashtags },
        alGuardar: () => {
          onUpdate(index, { description: localDescription, hashtags });
          push({ title: "Variante actualizada", variant: "success" });
        },
        avisar: push,
        tituloError: "No se pudo guardar",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const result = await retryVariationAction(jobId, index);
      if (result.ok) {
        onUpdate(index, { status: "scheduled", error: null });
        push({ title: "Variante reencolada", description: "Se publicará en breve.", variant: "success" });
      } else {
        push({ title: "No se pudo reintentar", description: result.message });
      }
    } catch (err) {
      push({ title: "Error al reintentar", description: err instanceof Error ? err.message : "Error desconocido" });
    } finally {
      setRetrying(false);
    }
  };

  const handleRegenerateCaption = async () => {
    setGenerating(true);
    try {
      const result = await regenerateCaptionAction(jobId, index);
      if (result.ok) {
        setLocalDescription(result.description);
        setLocalHashtags(result.hashtags.join(" "));
        onUpdate(index, { description: result.description, hashtags: result.hashtags });
        push({ title: "Caption generado", description: "Revisá y guardá si te gusta.", variant: "success" });
      } else {
        push({ title: "No se pudo generar", description: result.message });
      }
    } catch (err) {
      push({ title: "Error al generar", description: err instanceof Error ? err.message : "Error desconocido" });
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleIncluded = async () => {
    const next = !variation.included;
    await guardarCambioDeVariante({
      jobId,
      index,
      cambio: { included: next },
      alGuardar: () => onUpdate(index, { included: next }),
      avisar: push,
      tituloError: "No se pudo cambiar la variante",
    });
  };

  const isReady = variation.status === "ready";
  const isScheduled = variation.status === "scheduled";
  const isPublished = variation.status === "published";
  const isFailed = variation.status === "failed";
  const isProcessing = variation.status === "processing";

  return (
    <div
      className={cn(
        "rounded-lg border bg-card transition-all",
        !variation.included && "opacity-60",
        isPublished && "border-green-500/40 bg-green-500/5"
      )}
    >
      {/* Cabecera */}
      <div className="flex items-center gap-3 p-4">
        {/* Número */}
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
          V{index + 1}
        </span>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">
            {VARIATION_LABELS[variation.type]}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {VARIATION_DESCRIPTIONS[variation.type]}
          </p>
        </div>

        {/* Estado */}
        {isProcessing && (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Procesando
          </Badge>
        )}
        {isReady && (
          <Badge variant="secondary" className="text-muted-foreground">Lista</Badge>
        )}
        {isScheduled && (
          <Badge className="gap-1 bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30">
            <Clock className="h-3 w-3" />
            Programada
          </Badge>
        )}
        {isPublished && (
          <Badge className="gap-1 bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">
            <Instagram className="h-3 w-3" />
            Publicada
          </Badge>
        )}
        {isFailed && (
          <Badge variant="destructive">Error</Badge>
        )}

        {/* Toggle incluir/excluir */}
        {(isReady || isPublished) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleIncluded}
            className={cn(
              "h-7 w-7 p-0",
              variation.included
                ? "text-primary"
                : "text-muted-foreground"
            )}
            title={variation.included ? "Excluir de la publicación" : "Incluir en la publicación"}
          >
            {variation.included ? (
              <Check className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </Button>
        )}

        {/* Expandir/colapsar video */}
        {(isReady || isScheduled) && variation.preview_url && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVideoExpanded((prev) => !prev)}
            className="h-7 w-7 p-0 text-muted-foreground"
          >
            {videoExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Error message + botón reintentar */}
      {isFailed && (
        <div className="px-4 pb-3 flex items-start gap-3">
          {variation.error && (
            <p className="flex-1 text-xs text-destructive mt-0.5">{variation.error}</p>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleRetry}
            disabled={retrying}
            className="shrink-0 gap-1 h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            {retrying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {retrying ? "Reintentando…" : "Reintentar"}
          </Button>
        </div>
      )}

      {/* Preview de video */}
      {(isReady || isScheduled) && videoExpanded && variation.preview_url && (
        <div className="px-4 pb-4">
          <video
            src={variation.preview_url}
            controls
            playsInline
            className="w-full max-h-[400px] rounded-md bg-black object-contain"
          >
            Tu navegador no soporta el tag de video.
          </video>
        </div>
      )}

      {/* Editor de descripción y hashtags */}
      {isReady && variation.included && (
        <div className="border-t px-4 pb-4 pt-3 space-y-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Descripción / Caption
            </label>
            <Textarea
              value={localDescription}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setLocalDescription(e.target.value)}
              rows={3}
              placeholder="Caption para esta variante…"
              className="mt-1 resize-none text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Hashtags (separados por espacio)
            </label>
            <Textarea
              value={localHashtags}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setLocalHashtags(e.target.value)}
              rows={2}
              placeholder="#emprendimiento #negocio #marketing"
              className="mt-1 resize-none text-sm font-mono"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRegenerateCaption}
              disabled={generating || saving}
              className="gap-1"
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {generating ? "Generando…" : "Generar con IA"}
            </Button>
            {isDirty && (
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || generating}
                className="gap-1"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {saving ? "Guardando…" : "Guardar cambios"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Publicado en */}
      {isPublished && variation.published_at && (
        <div className="border-t px-4 py-2">
          <p className="text-xs text-muted-foreground" suppressHydrationWarning>
            Publicado el{" "}
            <span suppressHydrationWarning>
              {new Date(variation.published_at).toLocaleDateString("es-AR", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {variation.zernio_post_id && (
              <span className="ml-2 text-muted-foreground/70">
                · ID: {variation.zernio_post_id}
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

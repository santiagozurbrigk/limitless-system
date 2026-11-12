"use client";

/**
 * D · Crear un SOP desde un video.
 *
 * Es un **modo más** del creador, no un reemplazo: el modo texto sigue igual.
 *
 * El video se sube desde el navegador contra una signed URL —cientos de MB no
 * pasan por un Server Action— y después el trabajo corre en segundo plano. La
 * pantalla escucha los cambios del job por realtime en vez de que haya que
 * apretar F5.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  GlassPanel,
  Input,
  Label,
  Textarea,
  cn,
} from "@ai-coo/ui";
import {
  AlertTriangle,
  CheckCircle2,
  FileVideo,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/providers/toast-provider";
import { createClient } from "@/lib/supabase/client";
import {
  SOP_VIDEO_MAX_BYTES,
  formatearLimiteDeVideo,
} from "@/lib/sops/constants";
import {
  createSopVideoJobAction,
  getSopVideoJobAction,
  prepareSopVideoUploadAction,
  retrySopVideoJobAction,
  type SopVideoJob,
} from "@/app/sops/video-actions";
import { esRechazoPorModulo, type RechazoPorModulo } from "@/lib/auth/regla-de-modulo";
import { SinAcceso } from "@/components/platform/sin-acceso";
import { getPermissionModuleLabel } from "@/constants/permission-modules";

const STATUS_LABEL: Record<SopVideoJob["status"], string> = {
  pending: "En cola…",
  transcribing: "Transcribiendo el video…",
  generating: "Escribiendo el SOP…",
  ready: "Listo",
  failed: "Falló",
};

export function SopVideoCreator({
  onGenerated,
}: {
  /** Se llama con el markdown cuando el SOP está listo, para cargarlo al editor. */
  onGenerated?: (markdown: string, title: string | null) => void;
}) {
  const { push } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [context, setContext] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [job, setJob] = useState<SopVideoJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rechazo, setRechazo] = useState<RechazoPorModulo | null>(null);
  const deliveredRef = useRef(false);

  const jobId = job?.id ?? null;

  /** Trae el estado del job. Es el respaldo si el realtime no llega. */
  const refreshJob = useCallback(async () => {
    if (!jobId) return;
    const next = await getSopVideoJobAction(jobId);
    // Sin job, el efecto de abajo cierra el canal y el intervalo: no se sigue sondeando.
    if (esRechazoPorModulo(next)) {
      setRechazo(next);
      setJob(null);
      return;
    }
    if (next) setJob(next);
  }, [jobId]);

  // Realtime: el worker actualiza la fila y la pantalla se entera sola.
  useEffect(() => {
    if (!jobId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`sop-job-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sop_generation_jobs",
          filter: `id=eq.${jobId}`,
        },
        () => void refreshJob()
      )
      .subscribe();

    // Respaldo: si el realtime no está habilitado, se pregunta cada 10 segundos.
    // Sin esto el usuario se queda mirando "En cola…" para siempre.
    const interval = setInterval(() => void refreshJob(), 10_000);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [jobId, refreshJob]);

  // Cuando queda listo, se entrega el markdown una sola vez.
  useEffect(() => {
    if (job?.status === "ready" && job.generatedMarkdown && !deliveredRef.current) {
      deliveredRef.current = true;
      onGenerated?.(job.generatedMarkdown, job.title);
    }
  }, [job, onGenerated]);

  /**
   * ⭐ El tamaño se revisa **antes** de subir, no después.
   *
   * Antes la pantalla decía "hasta 1 GB" y el límite real era 50 MB, así que un
   * video grande se transfería entero —35 segundos— y recién ahí Storage lo
   * rechazaba con un número de error. Frenar acá cuesta cero y evita esa espera.
   */
  function elegirArchivo(elegido: File | null) {
    setError(null);
    if (elegido && elegido.size > SOP_VIDEO_MAX_BYTES) {
      setFile(null);
      setError(
        `"${elegido.name}" pesa ${Math.round(elegido.size / (1024 * 1024))} MB y el máximo es ${formatearLimiteDeVideo()}. Bajá la resolución al exportarlo, o cortalo en partes.`
      );
      return;
    }
    setFile(elegido);
  }

  async function start() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setProgress(0);
    deliveredRef.current = false;

    try {
      const prepared = await prepareSopVideoUploadAction({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
      if (!prepared.success) throw new Error(prepared.error);

      await uploadWithProgress(prepared.data.signedUrl, file, setProgress);

      const created = await createSopVideoJobAction({
        videoPath: prepared.data.videoPath,
        fileName: file.name,
        fileSize: file.size,
        title: title.trim() || null,
        department: department.trim() || null,
        context: context.trim() || null,
      });
      if (!created.success) throw new Error(created.error);

      setJob(created.data);
      push({ title: "Video subido. El SOP se está generando.", variant: "success" });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo subir el video");
    } finally {
      setUploading(false);
    }
  }

  const working =
    job?.status === "pending" ||
    job?.status === "transcribing" ||
    job?.status === "generating";

  // Sin Operaciones la recarga vuelve rechazada: pasa si los permisos cambian
  // con la pantalla abierta (SCRUM-541).
  if (rechazo) {
    return <SinAcceso moduleLabel={getPermissionModuleLabel(rechazo.moduleId)} />;
  }

  return (
    <div className="space-y-4">
      {!job ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="sop-video">Video</Label>
            <label
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border px-4 py-6 text-sm transition-colors hover:border-primary/40",
                uploading && "pointer-events-none opacity-60"
              )}
            >
              <FileVideo className="h-5 w-5 text-muted-foreground" />
              <span className={file ? "" : "text-muted-foreground"}>
                {file ? file.name : "Elegí el archivo del Loom (mp4, mov, webm)"}
              </span>
              <input
                id="sop-video"
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                className="hidden"
                onChange={(event) => elegirArchivo(event.target.files?.[0] ?? null)}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Loom no deja bajar el video por link, así que hay que descargarlo y
              subirlo. Hasta {formatearLimiteDeVideo()}.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sop-video-title">Título (opcional)</Label>
              <Input
                id="sop-video-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Cómo cargar un pago manual"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sop-video-department">Departamento (opcional)</Label>
              <Input
                id="sop-video-department"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                placeholder="Finanzas"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sop-video-context">Contexto (opcional)</Label>
            <Textarea
              id="sop-video-context"
              rows={2}
              value={context}
              onChange={(event) => setContext(event.target.value)}
              placeholder="Para quién es y cuándo se usa."
            />
          </div>

          {uploading ? (
            <div className="space-y-1.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Subiendo… {progress}%</p>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button onClick={start} disabled={!file || uploading}>
            {uploading ? "Subiendo…" : "Generar el SOP desde el video"}
          </Button>
        </>
      ) : (
        <GlassPanel className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            {working ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : job.status === "ready" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            )}
            <span className="text-sm font-medium">{STATUS_LABEL[job.status]}</span>
          </div>

          {working ? (
            <p className="text-xs text-muted-foreground">
              Podés cerrar esta pantalla: el trabajo sigue solo y lo vas a encontrar
              acá cuando vuelvas.
            </p>
          ) : null}

          {job.status === "failed" ? (
            <>
              <p className="text-xs text-destructive">{job.error}</p>
              {job.transcript ? (
                <p className="text-xs text-muted-foreground">
                  La transcripción quedó guardada: reintentar no vuelve a cobrarla.
                </p>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const result = await retrySopVideoJobAction(job.id);
                  if (!result.success) {
                    push({ title: "No se pudo reintentar", description: result.error });
                    return;
                  }
                  await refreshJob();
                }}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Reintentar
              </Button>
            </>
          ) : null}

          {job.status === "ready" && job.openQuestions.length > 0 ? (
            <div className="space-y-1.5 rounded-lg border border-warning/40 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
                <AlertTriangle className="h-3.5 w-3.5" />
                Lo que el video no aclara
              </p>
              <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                {job.openQuestions.map((question, index) => (
                  <li key={index}>{question}</li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">
                Estos huecos no se rellenaron solos a propósito: decilos en un video
                nuevo o completalos a mano.
              </p>
            </div>
          ) : null}

          {job.transcriptSeconds ? (
            <p className="text-[11px] text-muted-foreground">
              {Math.round(job.transcriptSeconds / 60)} min de video transcriptos.
            </p>
          ) : null}
        </GlassPanel>
      )}
    </div>
  );
}

/** XHR y no fetch: es la única forma de saber cuánto va subido. */
function uploadWithProgress(
  signedUrl: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", signedUrl);
    request.setRequestHeader("Content-Type", file.type || "video/mp4");

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) return resolve();

      // ⭐ El cuerpo de la respuesta dice el motivo; el número no dice nada.
      // Storage devuelve 400 con "Payload too large" adentro, y mostrar sólo
      // "400" dejaba al usuario sin ninguna pista de qué hacer.
      reject(new Error(motivoDeLaSubida(request)));
    });
    request.addEventListener("error", () =>
      reject(new Error("La subida se cortó. Revisá tu conexión y probá de nuevo."))
    );
    request.send(file);
  });
}

/** Traduce la respuesta de Storage a algo accionable. */
function motivoDeLaSubida(request: XMLHttpRequest): string {
  let detalle = "";
  try {
    const cuerpo = JSON.parse(request.responseText) as {
      error?: string;
      message?: string;
    };
    detalle = cuerpo.message ?? cuerpo.error ?? "";
  } catch {
    detalle = request.responseText?.slice(0, 200) ?? "";
  }

  if (/too large|EntityTooLarge/i.test(detalle)) {
    return `El video supera el máximo que acepta el almacenamiento (${formatearLimiteDeVideo()}).`;
  }
  if (detalle) return `La subida falló: ${detalle}`;
  return `La subida falló con código ${request.status}.`;
}

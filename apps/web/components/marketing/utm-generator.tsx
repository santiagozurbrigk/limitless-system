"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { Button, Input, Label, cn } from "@ai-coo/ui";
import { paths } from "@/routes";
import { createUTMLinkAction } from "@/app/marketing/utm-actions";
import { leerConMotivo, type Lectura } from "@/lib/client/correr-accion";
import { slugifyCampaign } from "@/lib/utm/slugify-campaign";
import {
  buildLandingUtmUrl,
  buildManychatUrl,
  getDefaultUtmBaseUrl,
  normalizeInstagramUsername,
} from "@/lib/utm/build-links";
import type { ContentAssetView } from "@/app/marketing/actions";
import { UTM_CONTENT_OPTIONS } from "@/types/utm";
import type { UTMLinkRow } from "@/types/utm";
import { brand } from "@/lib/brand";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-[#1A1A1A]";

type VideoOption =
  | { kind: "youtube"; externalId: string; title: string }
  | { kind: "manual"; title: string };

/**
 * Crea el UTM y devuelve el link o el motivo para el usuario: el que la acción
 * devolvió como valor o, si lanzó, el texto fijo (SCRUM-520). Antes un error
 * lanzado se mostraba como "No se pudo guardar el UTM." sin registrarse.
 */
export function guardarUtmNuevo(
  datos: Parameters<typeof createUTMLinkAction>[0]
): Promise<Lectura<UTMLinkRow>> {
  return leerConMotivo(() => createUTMLinkAction(datos), "[UTMGenerator] crear UTM");
}

export function UTMGenerator({
  youtubeVideos,
  orgWebsiteUrl,
  motivoDeUrlDelSitio = null,
  onCreated,
}: {
  youtubeVideos: ContentAssetView[];
  orgWebsiteUrl: string | null;
  /** Si no se pudo leer la URL del sitio, su motivo en vez del aviso de configurarla. */
  motivoDeUrlDelSitio?: string | null;
  onCreated: (link: UTMLinkRow) => void;
}) {
  const [videoMode, setVideoMode] = useState<"select" | "manual">(
    youtubeVideos.length > 0 ? "select" : "manual"
  );
  const [selectedVideoId, setSelectedVideoId] = useState(
    youtubeVideos[0]?.id ?? ""
  );
  const [manualTitle, setManualTitle] = useState("");
  const [campaign, setCampaign] = useState("");
  const [campaignTouched, setCampaignTouched] = useState(false);
  const [content, setContent] = useState<string>("");
  const [instagramUsername, setInstagramUsername] = useState("");
  const [copiedKey, setCopiedKey] = useState<"landing" | "manychat" | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedVideo = useMemo((): VideoOption | null => {
    if (videoMode === "manual") {
      const title = manualTitle.trim();
      return title ? { kind: "manual", title } : null;
    }
    const asset = youtubeVideos.find((v) => v.id === selectedVideoId);
    if (!asset) return null;
    return { kind: "youtube", externalId: asset.externalId, title: asset.title };
  }, [videoMode, manualTitle, selectedVideoId, youtubeVideos]);

  const videoTitle = selectedVideo?.title ?? "";

  const effectiveCampaign =
    campaign.trim() || (videoTitle ? slugifyCampaign(videoTitle) : "");

  const utmBaseUrl = orgWebsiteUrl?.trim() || getDefaultUtmBaseUrl();

  const generatedLandingUrl = effectiveCampaign
    ? buildLandingUtmUrl(effectiveCampaign, content || undefined, utmBaseUrl)
    : "";

  const normalizedIg = instagramUsername
    ? normalizeInstagramUsername(instagramUsername)
    : "";

  const generatedManychatUrl = effectiveCampaign
    ? buildManychatUrl({
        utmCampaign: effectiveCampaign,
        instagramUsername: normalizedIg || null,
      }).url
    : null;

  function handleVideoTitleChange(title: string) {
    if (videoMode === "manual") setManualTitle(title);
    if (!campaignTouched && title.trim()) {
      setCampaign(slugifyCampaign(title));
    }
  }

  function handleSelectVideo(id: string) {
    setSelectedVideoId(id);
    const asset = youtubeVideos.find((v) => v.id === id);
    if (asset && !campaignTouched) {
      setCampaign(slugifyCampaign(asset.title));
    }
  }

  async function copyToClipboard(
    url: string,
    key: "landing" | "manychat"
  ) {
    await navigator.clipboard.writeText(url);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  function handleSave() {
    setError(null);
    if (!effectiveCampaign) {
      setError("Ingresá un nombre de campaña.");
      return;
    }

    startTransition(async () => {
      const result = await guardarUtmNuevo({
        youtube_video_id:
          selectedVideo?.kind === "youtube" && selectedVideo.externalId
            ? selectedVideo.externalId
            : undefined,
        youtube_video_title: videoTitle || undefined,
        utm_campaign: effectiveCampaign,
        utm_content: content || undefined,
        instagram_username: normalizedIg || undefined,
      });
      if (result.ok && result.data) {
        onCreated(result.data);
        setCampaign("");
        setCampaignTouched(false);
        setManualTitle("");
        setContent("");
        setInstagramUsername("");
      } else if (!result.ok) {
        setError(result.motivo);
      }
    });
  }

  return (
    <div className="space-y-5 rounded-xl border border-border/60 bg-card/40 p-5 dark:border-glass dark:bg-glass dark:backdrop-blur-md">
      <div>
        <h2 className="text-base font-medium text-foreground">Nuevo UTM</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Generá links para landing y DM de Instagram (ManyChat).
        </p>
      </div>

      {motivoDeUrlDelSitio ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-900/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="flex flex-col gap-1">
            <p className="text-[12px] font-medium text-amber-600 dark:text-amber-400">
              No se pudo leer la URL de tu sitio web
            </p>
            <p className="text-[11px] text-muted-foreground">{motivoDeUrlDelSitio}</p>
          </div>
        </div>
      ) : !orgWebsiteUrl?.trim() ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-900/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="flex flex-col gap-1">
            <p className="text-[12px] font-medium text-amber-600 dark:text-amber-400">
              Configurá la URL de tu sitio web
            </p>
            <p className="text-[11px] text-muted-foreground">
              Los links de UTM van a apuntar a optimizatucontrol.com hasta que
              configures tu propia URL.
            </p>
            <Link
              href={paths.platform.settings}
              className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400 underline underline-offset-2"
            >
              Ir a Configuración → General →
            </Link>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>Video de YouTube</Label>
        {youtubeVideos.length > 0 ? (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={videoMode === "select" ? "default" : "outline"}
              onClick={() => setVideoMode("select")}
            >
              De integración
            </Button>
            <Button
              type="button"
              size="sm"
              variant={videoMode === "manual" ? "default" : "outline"}
              onClick={() => setVideoMode("manual")}
            >
              Manual
            </Button>
          </div>
        ) : null}

        {videoMode === "select" && youtubeVideos.length > 0 ? (
          <select
            className={SELECT_CLASS}
            value={selectedVideoId}
            onChange={(e) => handleSelectVideo(e.target.value)}
          >
            {youtubeVideos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
        ) : (
          <Input
            placeholder="Título del video (ej. Cómo escalé a $100k)"
            value={manualTitle}
            onChange={(e) => handleVideoTitleChange(e.target.value)}
          />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="utm-campaign">Campaña (utm_campaign)</Label>
        <Input
          id="utm-campaign"
          placeholder="como-escale-a-100k"
          value={campaign}
          onChange={(e) => {
            setCampaignTouched(true);
            setCampaign(e.target.value);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Identificador único por video. Se auto-genera del título.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="utm-content">Ubicación del link (utm_content)</Label>
        <select
          id="utm-content"
          className={cn(SELECT_CLASS)}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        >
          <option value="">Sin especificar</option>
          {UTM_CONTENT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="instagram-username"
          className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          Usuario de Instagram
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            @
          </span>
          <Input
            id="instagram-username"
            placeholder="tuusuario"
            className="pl-7"
            value={instagramUsername}
            onChange={(e) => setInstagramUsername(e.target.value)}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Para generar el link directo a tu DM de Instagram
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border/40 bg-muted/30 p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Links generados
        </p>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-foreground">
              Link de landing
            </span>
            <span className="rounded-full border border-brand-500/20 bg-brand-900/20 px-2 py-0.5 text-[10px] text-brand-400">
              Para leads que van a tu sitio
            </span>
          </div>
          <div className="flex gap-2">
            <Input
              readOnly
              value={generatedLandingUrl}
              className="bg-background text-[11px] text-muted-foreground"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!generatedLandingUrl}
              onClick={() =>
                void copyToClipboard(generatedLandingUrl, "landing")
              }
            >
              {copiedKey === "landing" ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        {normalizedIg ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-foreground">
                Link de DM directo
              </span>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-900/20 px-2 py-0.5 text-[10px] text-emerald-400">
                Recomendado para YouTube
              </span>
            </div>
            <div className="flex gap-2">
              <Input
                readOnly
                value={generatedManychatUrl ?? ""}
                className="bg-background text-[11px] text-muted-foreground"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!generatedManychatUrl}
                onClick={() => {
                  if (generatedManychatUrl) {
                    void copyToClipboard(generatedManychatUrl, "manychat");
                  }
                }}
              >
                {copiedKey === "manychat" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cuando el lead clickea este link, se abre tu DM de Instagram
              directamente. {brand.name} detecta automáticamente que vino de este video.
            </p>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        disabled={pending || !effectiveCampaign}
        onClick={handleSave}
        className="w-full"
      >
        {pending ? "Guardando…" : "Guardar UTM"}
      </Button>
    </div>
  );
}

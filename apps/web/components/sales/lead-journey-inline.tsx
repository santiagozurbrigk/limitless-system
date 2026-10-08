"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  DollarSign,
  MessageCircle,
  Youtube,
  MessageSquare,
  Image as ImageIcon,
  Zap,
} from "lucide-react";
import { Skeleton, SteppedAlert, cn } from "@ai-coo/ui";
import { getLeadJourneyAction, getZernioLeadJourneyAction } from "@/app/sales/actions";
import { paths } from "@/routes";
import type { LeadJourneyStep, RecorridoDelLead } from "@/lib/sales/lead-journey";
import { AvisoDeLecturaFallida } from "@/components/shared/aviso-de-lectura-fallida";
import { leerConMotivo, type Lectura } from "@/lib/client/correr-accion";

// ─── Configuración visual por tipo de paso ────────────────────────────────────

const STEP_CONFIG: Record<
  LeadJourneyStep["type"],
  { icon: typeof Youtube; className: string; dotClass: string }
> = {
  content: {
    icon: Youtube,
    className: "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/25",
    dotClass: "bg-red-500/70",
  },
  comment: {
    icon: MessageSquare,
    className: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/25",
    dotClass: "bg-amber-500/70",
  },
  story_reply: {
    icon: ImageIcon,
    className: "text-pink-600 dark:text-pink-400 bg-pink-500/10 border-pink-500/25",
    dotClass: "bg-pink-500/70",
  },
  cta: {
    icon: Zap,
    className: "text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/25",
    dotClass: "bg-yellow-500/70",
  },
  dm: {
    icon: MessageCircle,
    className: "text-brand-600 dark:text-brand-400 bg-brand-500/10 border-brand-500/25",
    dotClass: "bg-brand-500/70",
  },
  booking: {
    icon: Calendar,
    className: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/25",
    dotClass: "bg-blue-500/70",
  },
  sale: {
    icon: DollarSign,
    className: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
    dotClass: "bg-emerald-500/70",
  },
};

// ─── Formateo de fecha ────────────────────────────────────────────────────────

function formatStepDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function JourneySkeleton() {
  return (
    <div className="space-y-4 px-4 pb-4">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-full max-w-xs" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Thumbnail de contenido ───────────────────────────────────────────────────

function ContentThumbnailChip({
  thumbnailUrl,
  platformPostUrl,
  contentTitle,
}: {
  thumbnailUrl?: string;
  platformPostUrl?: string;
  contentTitle?: string;
}) {
  if (!thumbnailUrl) return null;

  const inner = (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-2 py-1.5 text-[10px] text-muted-foreground hover:border-border hover:bg-muted/60 transition-colors">
      <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-md bg-muted">
        <Image
          src={thumbnailUrl}
          alt={contentTitle ?? "Contenido"}
          fill
          className="object-cover"
          unoptimized
        />
      </div>
      <span className="line-clamp-2 leading-snug">
        {contentTitle ?? "Ver contenido"}
      </span>
    </div>
  );

  if (platformPostUrl) {
    return (
      <a href={platformPostUrl} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }

  return inner;
}

// ─── Paso individual ──────────────────────────────────────────────────────────

function StepContent({ step }: { step: LeadJourneyStep }) {
  const config = STEP_CONFIG[step.type];
  const Icon = config.icon;

  const thumbnailUrl =
    typeof step.metadata?.thumbnailUrl === "string"
      ? step.metadata.thumbnailUrl
      : undefined;
  const platformPostUrl =
    typeof step.metadata?.platformPostUrl === "string"
      ? step.metadata.platformPostUrl
      : typeof step.metadata?.url === "string"
        ? step.metadata.url
        : undefined;
  const contentTitle =
    typeof step.metadata?.contentTitle === "string"
      ? step.metadata.contentTitle
      : undefined;
  const clientId =
    typeof step.metadata?.clientId === "string" ? step.metadata.clientId : undefined;
  const closingCallId =
    typeof step.metadata?.closingCallId === "string"
      ? step.metadata.closingCallId
      : undefined;

  const iconNode = (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
        config.className
      )}
    >
      <Icon className="h-4 w-4" />
    </div>
  );

  const body = (
    <div className="min-w-0 flex-1 space-y-1">
      <p className="text-xs font-medium text-foreground">{step.title}</p>
      <p className="text-xs italic text-muted-foreground line-clamp-2">
        {step.description}
      </p>
      {/* Thumbnail del contenido (reels, posts, historias) */}
      {(step.type === "comment" || step.type === "story_reply" || step.type === "content") && (
        <ContentThumbnailChip
          thumbnailUrl={thumbnailUrl}
          platformPostUrl={platformPostUrl}
          contentTitle={contentTitle}
        />
      )}
      {step.date ? (
        <p className="text-[10px] text-muted-foreground/70">
          {formatStepDate(step.date)}
        </p>
      ) : null}
    </div>
  );

  const wrapperClass =
    "flex gap-3 rounded-lg border border-transparent px-1 py-1.5 transition-colors";

  // Para ventas y bookings: link interno
  if (clientId) {
    return (
      <Link
        href={paths.platform.clients.detail(clientId)}
        className={cn(wrapperClass, "hover:border-border/60 hover:bg-muted/20")}
      >
        {iconNode}
        {body}
      </Link>
    );
  }

  if (closingCallId) {
    return (
      <Link
        href={`${paths.platform.sales.closing}?call=${encodeURIComponent(closingCallId)}`}
        className={cn(wrapperClass, "hover:border-border/60 hover:bg-muted/20")}
      >
        {iconNode}
        {body}
      </Link>
    );
  }

  // Para contenido con URL externa directa (sin thumbnail chip ya incluido)
  if (platformPostUrl && step.type === "content" && !thumbnailUrl) {
    return (
      <a
        href={platformPostUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(wrapperClass, "hover:border-border/60 hover:bg-muted/20")}
      >
        {iconNode}
        {body}
      </a>
    );
  }

  return (
    <div className={wrapperClass}>
      {iconNode}
      {body}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

/** El recorrido del lead por conversación o por Zernio, o el motivo si no se pudo leer. */
export function cargarRecorridoDelLead(params: {
  conversationId?: string;
  zernioAccountId?: string;
  zernioParticipantId?: string;
  zernioParticipantName?: string;
}): Promise<Lectura<RecorridoDelLead>> {
  const { conversationId, zernioAccountId, zernioParticipantId, zernioParticipantName } = params;
  if (conversationId) {
    return leerConMotivo(
      () =>
        getLeadJourneyAction(conversationId, {
          zernioAccountId,
          zernioParticipantId,
          zernioParticipantName,
        }),
      "[LeadJourneyInline] recorrido"
    );
  }
  if (zernioAccountId && zernioParticipantName) {
    return leerConMotivo(
      () => getZernioLeadJourneyAction(zernioAccountId, zernioParticipantId ?? "", zernioParticipantName),
      "[LeadJourneyInline] recorrido de Zernio"
    );
  }
  return Promise.resolve({ ok: true, data: { pasos: [], faltan: [] } });
}

/** "la llamada", "la venta" → "la llamada y la venta". */
function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/**
 * Aviso de las fuentes del recorrido que no se pudieron leer (SCRUM-504): los
 * pasos que sí se leyeron se muestran igual.
 */
export function AvisoDeRecorridoIncompleto({ faltan }: { faltan: string[] }) {
  if (faltan.length === 0) return null;
  return (
    <AvisoDeLecturaFallida
      titulo="Faltan datos del recorrido:"
      motivo={`no se pudieron leer ${enumerar(faltan)}.`}
    />
  );
}

export function LeadJourneyInline({
  conversationId,
  leadName,
  zernioAccountId,
  zernioParticipantId,
  zernioParticipantName,
}: {
  /** UUID de conversación en la DB (inbox legacy). Si no se provee, usa el modo Zernio. */
  conversationId?: string;
  leadName?: string;
  /** Props de Zernio para buscar comentarios en contenido y enriquecer el journey */
  zernioAccountId?: string;
  zernioParticipantId?: string;
  zernioParticipantName?: string;
}) {
  const [steps, setSteps] = useState<LeadJourneyStep[]>([]);
  const [loading, setLoading] = useState(true);
  // Por qué no se pudo leer el recorrido (SCRUM-504): antes se veía como
  // "Sin recorrido registrado".
  const [motivo, setMotivo] = useState<string | null>(null);
  const [faltan, setFaltan] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMotivo(null);
    setFaltan([]);

    void cargarRecorridoDelLead({
      conversationId,
      zernioAccountId,
      zernioParticipantId,
      zernioParticipantName,
    }).then((lectura) => {
      if (cancelled) return;
      if (lectura.ok) {
        setSteps(lectura.data.pasos);
        setFaltan(lectura.data.faltan);
      } else {
        setMotivo(lectura.motivo);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, zernioAccountId, zernioParticipantId]);

  const hasRichData = steps.some((s) =>
    ["comment", "story_reply", "cta"].includes(s.type)
  );

  return (
    <div className="shrink-0 px-[var(--space-card-sm)] pb-[var(--space-card-sm)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {leadName ? `Recorrido: ${leadName}` : "Recorrido del lead"}
        </span>
        {!loading && hasRichData && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {steps.length} eventos
          </span>
        )}
      </div>

      {!loading && !motivo && faltan.length > 0 ? (
        <div className="mb-3">
          <AvisoDeRecorridoIncompleto faltan={faltan} />
        </div>
      ) : null}

      {loading ? (
        <JourneySkeleton />
      ) : motivo ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-4 text-[11px] text-destructive" role="alert">
          No se pudo cargar el recorrido. {motivo}
        </p>
      ) : steps.length === 0 ? (
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-4 text-center">
          <p className="text-[11px] font-medium text-muted-foreground">Sin recorrido registrado</p>
          <p className="mt-1 text-[10px] text-muted-foreground/70 leading-relaxed">
            Conectá UTMs en tus videos o Zernio para trackear de dónde vienen tus leads.
          </p>
        </div>
      ) : (
        <ol className="relative space-y-0">
          {steps.map((step, index) => (
            <li key={`${step.type}-${step.date}-${index}`} className="relative pl-0">
              {index < steps.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute left-[15px] top-9 bottom-0 w-px bg-gradient-to-b from-border/80 to-border/20"
                />
              ) : null}
              <StepContent step={step} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

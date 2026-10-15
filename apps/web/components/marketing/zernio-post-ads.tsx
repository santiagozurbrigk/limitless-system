"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getContentPieceAdsAction } from "@/app/marketing/content/ad-actions";
import { leerConMotivo, type Lectura } from "@/lib/client/correr-accion";
import { EmptyState } from "@/components/shared/empty-state";
import type { ZernioAdStatus, ZernioLinkedAd } from "@/lib/zernio/client";
import { formatCurrency, formatNumber, normalizeAdMetrics } from "@/lib/utils/format-ad-metrics";
import { Badge, Button, cn, Skeleton } from "@ai-coo/ui";

type Props = {
  contentPieceId: string;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_LABELS: Record<ZernioAdStatus, string> = {
  active: "Activo",
  paused: "Pausado",
  pending_review: "En revisión",
  rejected: "Rechazado",
  completed: "Finalizado",
  cancelled: "Cancelado",
  error: "Error",
};

function statusBadgeClass(status: ZernioAdStatus): string {
  switch (status) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300";
    case "paused":
      return "border-muted bg-muted/50 text-muted-foreground";
    case "error":
    case "rejected":
      return "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300";
    default:
      return "border-border bg-background text-muted-foreground";
  }
}

function AdSkeleton() {
  return (
    <div className="rounded-lg border p-4">
      <div className="space-y-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <div className="grid grid-cols-3 gap-3 pt-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function AdCard({ ad }: { ad: ZernioLinkedAd }) {
  const metrics = normalizeAdMetrics(ad.metrics);

  const budgetLabel =
    ad.budget?.type === "daily"
      ? `${formatCurrency(ad.budget.amount)}/día`
      : `${formatCurrency(ad.budget?.amount ?? 0)}/total`;

  const endLabel = ad.schedule?.endDate
    ? formatDate(ad.schedule.endDate)
    : "activo";

  return (
    <article className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-snug">{ad.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{ad.campaignName}</p>
          {ad.adSetName ? (
            <p className="text-xs text-muted-foreground">{ad.adSetName}</p>
          ) : null}
        </div>
        <Badge
          variant="outline"
          className={cn("shrink-0 capitalize", statusBadgeClass(ad.status))}
        >
          {STATUS_LABELS[ad.status] ?? ad.status}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <MetricCell label="Gasto" value={formatCurrency(metrics.spend)} />
        <MetricCell label="ROAS" value={`${metrics.roas}x`} />
        <MetricCell label="Impresiones" value={formatNumber(metrics.impressions)} />
        <MetricCell label="Alcance" value={formatNumber(metrics.reach)} />
        <MetricCell label="CTR" value={`${metrics.ctr}%`} />
        <MetricCell label="CPC" value={formatCurrency(metrics.cpc)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Budget: {budgetLabel}</span>
        {ad.schedule?.startDate ? (
          <span>
            {formatDate(ad.schedule.startDate)} → {endLabel}
          </span>
        ) : null}
      </div>
    </article>
  );
}

/**
 * Los anuncios de la pieza, o el motivo por el que no se pudieron leer
 * (SCRUM-502): el que devuelve la acción, o el texto fijo si lanzó.
 */
export async function cargarAnunciosDeLaPieza(
  contentPieceId: string
): Promise<Lectura<{ ads: ZernioLinkedAd[] }>> {
  return leerConMotivo(() => getContentPieceAdsAction(contentPieceId), "[ZernioPostAds] cargar");
}

export function ZernioPostAds({ contentPieceId }: Props) {
  const [ads, setAds] = useState<ZernioLinkedAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadAds = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    const lectura = await cargarAnunciosDeLaPieza(contentPieceId);
    if (requestId !== requestIdRef.current) return;
    if (lectura.ok) setAds(lectura.data.ads);
    else setError(lectura.motivo);
    setLoading(false);
  }, [contentPieceId]);

  useEffect(() => {
    void loadAds();
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadAds]);

  if (loading) {
    return (
      <div className="space-y-4" aria-label="Cargando anuncios" aria-busy="true">
        <AdSkeleton />
        <AdSkeleton />
      </div>
    );
  }

  if (error && ads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm font-medium">No se pudieron cargar los anuncios</p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">{error}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void loadAds()}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  if (ads.length === 0) {
    return (
      <EmptyState
        title="Sin anuncios vinculados"
        description="Este post no tiene anuncios vinculados. Si boosteás este contenido desde Meta Ads, aparecerá aquí automáticamente."
      />
    );
  }

  return (
    <div className="space-y-4">
      {ads.map((ad) => (
        <AdCard key={ad._id} ad={ad} />
      ))}
      {error ? (
        <p className="text-center text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

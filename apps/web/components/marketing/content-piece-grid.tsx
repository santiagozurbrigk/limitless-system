"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { ContentPiece } from "@/types/content";
import { paths } from "@/routes";
import { cn } from "@ai-coo/ui";
import { Check, Folder, TrendingUp, Eye, Heart } from "lucide-react";
import { ContentTypeIcon } from "@/components/marketing/marketing-icons";
import { FilterPills } from "@/components/marketing/filter-pills";
import {
  segmentedNavContainerClass,
  segmentedNavItemClass,
} from "@/components/shared/segmented-nav-styles";
import { safeThumbnailUrl } from "@/lib/marketing/cdn-utils";
import { ordenarPiezas, type OrdenDePiezas } from "@/lib/marketing/orden-de-piezas";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = OrdenDePiezas;

const TYPE_LABEL: Record<string, string> = {
  reel: "Reel",
  story: "Historia",
  post: "Post",
  carousel: "Carrusel",
  youtube: "YouTube",
  brief: "Brief IA",
};

const TYPE_BADGE_COLOR: Record<string, string> = {
  reel: "bg-primary/80 text-white",
  youtube: "bg-red-600/80 text-white",
  carousel: "bg-blue-600/80 text-white",
  story: "bg-pink-500/80 text-white",
  post: "bg-black/70 text-white",
  brief: "bg-brand-700/80 text-white",
};

const FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "reel", label: "Reels" },
  { value: "carousel", label: "Carruseles" },
  { value: "post", label: "Posts" },
  { value: "story", label: "Historias" },
  { value: "youtube", label: "YouTube" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "reciente", label: "Más reciente" },
  { value: "views", label: "Más views" },
  { value: "engagement", label: "Más engagement" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getEngagement(piece: ContentPiece): number {
  const m = piece.metrics;
  if (!m) return 0;
  return (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
}

function fmtNum(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("es-AR");
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  pieces: ContentPiece[];
};

export function ContentPieceGrid({ pieces }: Props) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("reciente");

  const filtered = useMemo(() => {
    let result = pieces;

    // Filter by type
    if (typeFilter !== "all") {
      result = result.filter((p) => p.type === typeFilter);
    }

    // Orden: las piezas sin métricas van al final por views o engagement.
    return ordenarPiezas(result, sortKey);
  }, [pieces, typeFilter, sortKey]);

  if (pieces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-muted-foreground">No hay piezas de contenido todavía.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          El contenido de Instagram se sincroniza automáticamente desde Zernio.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: filters + sort */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          options={FILTER_OPTIONS}
          value={typeFilter}
          onChange={setTypeFilter}
        />

        <div className={segmentedNavContainerClass}>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSortKey(opt.value)}
              className={segmentedNavItemClass(sortKey === opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      {filtered.length !== pieces.length ? (
        <p className="text-xs text-muted-foreground">
          {filtered.length} de {pieces.length} piezas
        </p>
      ) : null}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground text-sm">
            No hay contenido de tipo &quot;{FILTER_OPTIONS.find((o) => o.value === typeFilter)?.label}&quot;.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((piece) => (
            <ContentPieceCard key={piece.id} piece={piece} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Card component ───────────────────────────────────────────────────────────

function ContentPieceCard({ piece }: { piece: ContentPiece }) {
  const views = piece.metrics?.views ?? 0;
  const engagement = getEngagement(piece);
  const engagementRate =
    piece.metrics?.reach && piece.metrics.reach > 0
      ? ((engagement / piece.metrics.reach) * 100).toFixed(1)
      : null;

  const typeBadgeClass =
    TYPE_BADGE_COLOR[piece.type] ?? "bg-black/70 text-white";

  // Filtrar URLs efímeras del CDN de Instagram (expiran ~1-2hs → generan 403 en consola)
  const thumbnail = safeThumbnailUrl(piece.thumbnail_url);

  return (
    <Link
      href={paths.platform.marketing.contentDetail(piece.id)}
      className="group block overflow-hidden rounded-xl border border-border/60 bg-card transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
    >
      {/* Thumbnail */}
      <div className="relative aspect-[9/16] overflow-hidden bg-muted">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail}
            alt={piece.title ?? "Contenido"}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ContentTypeIcon type={piece.type} size={32} />
          </div>
        )}

        {/* Type badge */}
        <span
          className={cn(
            "absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-sm",
            typeBadgeClass
          )}
        >
          {TYPE_LABEL[piece.type] ?? piece.type}
        </span>

        {/* Status badges — top right stack */}
        <div className="absolute right-2 top-2 flex flex-col gap-1 items-end">
          {piece.analysis ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              <Check className="h-2.5 w-2.5" aria-hidden />
              IA
            </span>
          ) : null}
          {piece.drive_file_id ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700 backdrop-blur-sm dark:bg-black/60 dark:text-gray-200">
              <Folder className="h-2.5 w-2.5 text-yellow-500" aria-hidden />
              Drive
            </span>
          ) : null}
        </div>

        {/* Bottom metric overlay */}
        {views > 0 ? (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-2.5 pb-2 pt-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white">
                <Eye className="h-3 w-3 opacity-80" aria-hidden />
                {fmtNum(views)}
              </span>
              {engagementRate ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/80">
                  <TrendingUp className="h-3 w-3 opacity-80" aria-hidden />
                  {engagementRate}%
                </span>
              ) : piece.metrics?.likes ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-white/80">
                  <Heart className="h-3 w-3 opacity-80" aria-hidden />
                  {fmtNum(piece.metrics.likes)}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Card footer */}
      <div className="px-3 py-2.5">
        <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground/90">
          {piece.title ?? piece.caption?.slice(0, 70) ?? "Sin título"}
        </p>

        {piece.analysis?.angulo ? (
          <p className="mt-1 line-clamp-1 text-[10px] italic text-muted-foreground">
            {piece.analysis.angulo.name}
          </p>
        ) : piece.published_at ? (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {new Date(piece.published_at).toLocaleDateString("es-AR", {
              day: "numeric",
              month: "short",
            })}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

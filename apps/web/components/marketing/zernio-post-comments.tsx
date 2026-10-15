"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Heart, MessageCircle } from "lucide-react";
import { getContentPieceCommentsAction } from "@/app/marketing/content/comment-actions";
import { leerConMotivo, type Lectura } from "@/lib/client/correr-accion";
import { EmptyState } from "@/components/shared/empty-state";
import { formatRelativeTime } from "@/lib/format";
import type {
  ZernioPostComment,
  ZernioPostCommentsResponse,
} from "@/lib/zernio/client";
import { Button, Skeleton } from "@ai-coo/ui";

type Props = {
  contentPieceId: string;
};

function CommentSkeleton() {
  return (
    <div className="flex gap-3 border-b py-4 last:border-b-0">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

function AuthorAvatar({ comment }: { comment: ZernioPostComment }) {
  const [imageFailed, setImageFailed] = useState(false);
  const name = comment.from?.name ?? comment.from?.username ?? "Usuario";
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  if (comment.from?.picture && !imageFailed) {
    return (
      <Image
        src={comment.from.picture}
        alt=""
        width={40}
        height={40}
        unoptimized
        className="h-10 w-10 shrink-0 rounded-full bg-muted object-cover"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

function CommentRow({ comment }: { comment: ZernioPostComment }) {
  const name = comment.from?.name ?? comment.from?.username ?? "Usuario";
  const username = comment.from?.username;

  return (
    <article className="flex gap-3 border-b py-4 last:border-b-0">
      <AuthorAvatar comment={comment} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold">{name}</span>
          {username ? (
            <span className="text-xs text-muted-foreground">@{username}</span>
          ) : null}
          <time
            className="text-xs text-muted-foreground"
            dateTime={comment.createdTime}
            title={new Date(comment.createdTime).toLocaleString("es-AR")}
          >
            {formatRelativeTime(comment.createdTime)}
          </time>
        </div>

        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
          {comment.message}
        </p>

        <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" aria-hidden="true" />
            {comment.likeCount ?? 0}
            <span className="sr-only"> Me gusta</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {comment.replyCount ?? comment.replies?.length ?? 0}
            <span className="sr-only"> Respuestas</span>
          </span>
          {comment.isHidden ? <span>Oculto</span> : null}
        </div>
      </div>
    </article>
  );
}

/**
 * Una página de comentarios de la pieza, o el motivo por el que no se pudo
 * leer (SCRUM-502): el que devuelve la acción, o el texto fijo si lanzó.
 */
export async function cargarComentariosDeLaPieza(
  contentPieceId: string,
  cursor?: string
): Promise<Lectura<ZernioPostCommentsResponse>> {
  return leerConMotivo(
    () => getContentPieceCommentsAction(contentPieceId, cursor),
    "[ZernioPostComments] cargar"
  );
}

export function ZernioPostComments({ contentPieceId }: Props) {
  const [comments, setComments] = useState<ZernioPostComment[]>([]);
  const [pagination, setPagination] =
    useState<ZernioPostCommentsResponse["pagination"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadComments = useCallback(
    async (cursor?: string) => {
      const requestId = ++requestIdRef.current;
      if (cursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const lectura = await cargarComentariosDeLaPieza(contentPieceId, cursor);
      if (requestId !== requestIdRef.current) return;

      if (lectura.ok) {
        const response = lectura.data;
        setComments((current) => {
          if (!cursor) return response.comments;
          const knownIds = new Set(current.map((comment) => comment.id));
          return [
            ...current,
            ...response.comments.filter((comment) => !knownIds.has(comment.id)),
          ];
        });
        setPagination(response.pagination);
      } else {
        setError(lectura.motivo);
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [contentPieceId]
  );

  useEffect(() => {
    void loadComments();
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadComments]);

  if (loading) {
    return (
      <div aria-label="Cargando comentarios" aria-busy="true">
        <CommentSkeleton />
        <CommentSkeleton />
        <CommentSkeleton />
      </div>
    );
  }

  if (error && comments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm font-medium">No se pudieron cargar los comentarios</p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">{error}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void loadComments()}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <EmptyState
        title="Sin comentarios"
        description="Este post no tiene comentarios todavía."
      />
    );
  }

  return (
    <div>
      <div>
        {comments.map((comment) => (
          <CommentRow key={comment.id} comment={comment} />
        ))}
      </div>

      {error ? (
        <p className="mt-3 text-center text-xs text-destructive">{error}</p>
      ) : null}

      {pagination?.hasMore && pagination.cursor ? (
        <div className="flex justify-center pt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => void loadComments(pagination.cursor ?? undefined)}
          >
            {loadingMore ? "Cargando…" : "Cargar más"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { startTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle } from "lucide-react";
import { Button } from "@ai-coo/ui";

/** Lo que Next le pasa a un `error.tsx` y a `global-error.tsx`. */
export type PropsDeBoundary = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Manda a Sentry el error que atrapó un boundary y arma el "Reintentar"
 * (SCRUM-108). Lo usan `PantallaDeError` y `app/global-error.tsx`.
 *
 * - La captura va por el SDK del navegador, así que pasa por el mismo
 *   `beforeSend` que limpia los datos sensibles (`sentry.client.config.ts`).
 *   Lleva el tag `boundary` y, si lo hay, `error_digest`: el mismo código que
 *   ve el usuario y que trae el evento del servidor (`onRequestError`), para
 *   encontrarlo cuando alguien lo pase a soporte.
 * - Los errores internos de Next (redirect, notFound) nunca llegan acá: el
 *   boundary de Next los relanza antes de dibujar el `error.tsx`.
 * - `reset` sólo vuelve a dibujar el segmento con lo que ya tiene el
 *   navegador; si el error vino del servidor, sin `router.refresh()` el
 *   reintento mostraría la misma falla. Por eso van juntos.
 */
export function useBoundaryDeError(
  error: PropsDeBoundary["error"],
  reset: PropsDeBoundary["reset"],
  boundary: string
): () => void {
  const router = useRouter();

  useEffect(() => {
    Sentry.captureException(error, {
      tags: {
        boundary,
        ...(error.digest ? { error_digest: error.digest } : {}),
      },
    });
  }, [error, boundary]);

  return () => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  };
}

/**
 * La pantalla de error de la plataforma y de cada módulo (SCRUM-108).
 *
 * Se dibuja dentro de la cáscara: la navegación sigue a mano para ir a otro
 * módulo. Nunca muestra el mensaje ni el stack del error (pueden traer nombres
 * de tablas, datos de la fila o rutas internas); sólo el código de referencia
 * (`digest`) que Next le pone a un error del servidor.
 */
export function PantallaDeError({
  error,
  reset,
  boundary,
  titulo = "No pudimos cargar esta sección",
  inicio,
}: PropsDeBoundary & {
  /** Nombre corto para el tag de Sentry: `plataforma`, `marketing`... */
  boundary: string;
  titulo?: string;
  /** A dónde lleva el link de salida. */
  inicio: { href: string; texto: string };
}) {
  const reintentar = useBoundaryDeError(error, reset, boundary);

  return (
    <div
      role="alert"
      className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-muted/40">
        <AlertTriangle className="h-5 w-5 text-muted-foreground" />
      </div>
      <h1 className="text-lg font-medium text-foreground">{titulo}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Algo falló de nuestro lado. Lo que ya guardaste no se perdió. Probá de
        nuevo en unos segundos; si sigue pasando, avisale a soporte
        {error.digest ? " con el código de referencia" : ""}.
      </p>
      {error.digest ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Código de referencia:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
            {error.digest}
          </code>
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={reintentar}>Reintentar</Button>
        <Button variant="outline" asChild>
          <Link href={inicio.href}>{inicio.texto}</Link>
        </Button>
      </div>
    </div>
  );
}

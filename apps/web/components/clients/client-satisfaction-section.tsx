"use client";

/**
 * ⭐ Qué tan conforme está el cliente.
 *
 * Es una impresión de una persona, no una medición, y la pantalla lo trata como
 * tal: muestra **cuándo se marcó y quién la marcó**, y avisa cuando el dato
 * envejeció. Un "muy conforme" de hace cuatro meses presentado como actual
 * decide cosas sobre una relación que ya cambió.
 *
 * Por ahora se carga a mano. Más adelante puede salir de lo que el bot de
 * Discord lee en las conversaciones; ese día lo automático va a convivir con lo
 * manual, y por eso el dato ya guarda su autor.
 */

import { useEffect, useState, useTransition } from "react";
import { GlassPanel, cn } from "@ai-coo/ui";
import { Gauge, TriangleAlert } from "lucide-react";
import { useToast } from "@/providers/toast-provider";
import { updateClientSatisfactionAction } from "@/app/clients/tracking-actions";
import { correrMutacion, type Aviso } from "@/lib/client/correr-accion";
import {
  ETIQUETAS_DE_SATISFACCION,
  NIVELES_DE_SATISFACCION,
  resolverSatisfaccion,
  type NivelDeSatisfaccion,
} from "@/lib/clients/satisfaction";

/**
 * Guarda (o borra, con `null`) la marca de satisfacción (SCRUM-517): el motivo
 * de un rechazo se avisa; si la acción lanzó, el texto fijo. Con éxito,
 * `alGuardar` con la fecha de la marca.
 */
export function guardarSatisfaccion(
  clientId: string,
  nivel: NivelDeSatisfaccion | null,
  avisar: (aviso: Aviso) => void,
  alGuardar: (updatedAt: string | null) => void
): Promise<void> {
  return correrMutacion({
    accion: () => updateClientSatisfactionAction(clientId, nivel),
    avisar,
    tituloError: "No se pudo guardar",
    etiqueta: "[ClientSatisfaction] guardar",
    alExito: (data) => {
      alGuardar(data.updatedAt);
      avisar({
        title: nivel ? "Satisfacción actualizada" : "Marca borrada",
        variant: "success",
      });
    },
  });
}

export function ClientSatisfactionSection({
  clientId,
  initialLevel,
  initialUpdatedAt,
  updatedByName,
}: {
  clientId: string;
  initialLevel: string | null;
  initialUpdatedAt: string | null;
  updatedByName?: string | null;
}) {
  const { push } = useToast();
  const [pending, startTransition] = useTransition();
  const [nivel, setNivel] = useState<string | null>(initialLevel);
  const [marcadaEl, setMarcadaEl] = useState<string | null>(initialUpdatedAt);

  useEffect(() => {
    setNivel(initialLevel);
    setMarcadaEl(initialUpdatedAt);
  }, [initialLevel, initialUpdatedAt]);

  const estado = resolverSatisfaccion(nivel, marcadaEl);

  function marcar(elegido: NivelDeSatisfaccion) {
    // Tocar el nivel que ya estaba lo saca: es la forma natural de "me
    // equivoqué" sin agregar un botón de borrar.
    const siguiente = nivel === elegido ? null : elegido;

    startTransition(() =>
      guardarSatisfaccion(clientId, siguiente, push, (updatedAt) => {
        setNivel(siguiente);
        setMarcadaEl(updatedAt);
      })
    );
  }

  return (
    <GlassPanel className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          Satisfacción
        </h3>
        {estado.cargada && marcadaEl ? (
          <span className="text-xs text-muted-foreground">
            marcada el{" "}
            {new Date(marcadaEl).toLocaleDateString("es-AR", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            {updatedByName ? ` por ${updatedByName}` : ""}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {NIVELES_DE_SATISFACCION.map((valor) => {
          const etiqueta = ETIQUETAS_DE_SATISFACCION[valor];
          const elegido = nivel === valor;
          return (
            <button
              key={valor}
              type="button"
              disabled={pending}
              onClick={() => marcar(valor)}
              title={etiqueta.descripcion}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-60",
                elegido
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {etiqueta.label}
            </button>
          );
        })}
      </div>

      {/*
        ⭐ El aviso de dato viejo.
        Sin esto, una marca de hace meses se lee como si fuera de hoy. No se
        borra el dato —el histórico sirve—, se dice que hay que volver a
        preguntar.
      */}
      {estado.cargada && estado.vencida ? (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {marcadaEl
            ? `Esta marca tiene ${estado.diasDesdeLaMarca} días. Conviene volver a preguntar.`
            : "Esta marca no tiene fecha, así que no se sabe de cuándo es."}
        </p>
      ) : null}

      {!estado.cargada ? (
        <p className="text-xs text-muted-foreground">
          Sin marcar. Es una impresión tuya, no un dato del sistema: sirve para
          ver de un vistazo con quién hay que ocuparse.
        </p>
      ) : null}
    </GlassPanel>
  );
}

import { Plug } from "lucide-react";
import { cn } from "@ai-coo/ui";
import {
  formatearCantidad,
  formatearTasa,
  fuentesConProblemas,
  fuentesOrdenadas,
} from "@/lib/webinar/inicio/presentacion";
import type {
  EstadoDeFuente,
  PasoDelEmbudo,
  PasoDelEmbudoId,
  SesionDelLanzamiento,
} from "@/lib/webinar/vistas/contratos";
import { ETIQUETA_DE_FUENTE, ETIQUETA_DEL_ESTADO, tieneValor, type Dato } from "@/lib/webinar/vistas/dato";
import { FechaDeLaOrg } from "./fecha-de-la-org";
import { AccionDelDato } from "./numero-del-dato";

/**
 * Secciones que comparten Inicio (SCRUM-543) y el Detalle del lanzamiento
 * (SCRUM-544): sesiones, estado de las fuentes y el embudo. Dibujan sólo el
 * contrato; sin estado ni efectos.
 */

/** Un número en una línea de texto: el valor o el estado en minúscula. */
function textoCorto(dato: Dato<number>): string {
  return tieneValor(dato) ? formatearCantidad(dato.value) : ETIQUETA_DEL_ESTADO[dato.state].toLowerCase();
}

export function SeccionDeSesiones({ sesiones }: { sesiones: readonly SesionDelLanzamiento[] }) {
  return (
    <section aria-label="Sesiones" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Sesiones</h3>
      {sesiones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este lanzamiento todavía no tiene sesiones cargadas.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {sesiones.map((sesion) => (
            <li key={sesion.id} data-sesion={sesion.id} className="rounded-lg border border-border px-3 py-2">
              <p className="font-medium">
                <FechaDeLaOrg iso={sesion.empiezaAt} />
              </p>
              {sesion.asistieron === null ? (
                <p className="text-xs text-muted-foreground">Todavía no ocurrió.</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Asistieron: {textoCorto(sesion.asistieron)} · Se quedaron a la oferta:{" "}
                  {sesion.seQuedaronALaOferta ? textoCorto(sesion.seQuedaronALaOferta) : "—"}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SeccionDeFuentes({ fuentes }: { fuentes: readonly EstadoDeFuente[] }) {
  const problemas = fuentesConProblemas(fuentes);
  return (
    <section aria-label="Estado de las fuentes" className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-medium">
        <Plug className="h-4 w-4" aria-hidden="true" />
        Estado de las fuentes
        <span className="font-normal text-muted-foreground">
          {problemas === 0
            ? "· todas al día"
            : problemas === 1
              ? "· 1 no está al día"
              : `· ${problemas} no están al día`}
        </span>
      </h3>
      <ul className="flex flex-col gap-2 text-sm">
        {fuentesOrdenadas(fuentes).map((fuente) => (
          <li
            key={fuente.fuente}
            data-fuente={fuente.fuente}
            data-estado={fuente.state}
            className={cn(
              "flex flex-col gap-0.5 rounded-lg border px-3 py-2",
              fuente.state === "error" ? "border-destructive/40" : "border-border"
            )}
          >
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{ETIQUETA_DE_FUENTE[fuente.fuente]}</span>
              <span
                className={cn(
                  "text-xs",
                  fuente.state === "medido" ? "text-muted-foreground" : "text-warning",
                  fuente.state === "error" && "text-destructive"
                )}
              >
                {fuente.state === "medido" ? "Al día" : ETIQUETA_DEL_ESTADO[fuente.state]}
              </span>
            </p>
            {fuente.reason ? <p className="text-xs text-muted-foreground">{fuente.reason}</p> : null}
            {fuente.ultimaLecturaAt ? (
              <p className="text-xs text-muted-foreground">
                Última lectura: <FechaDeLaOrg iso={fuente.ultimaLecturaAt} />
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * El embudo. En Inicio, compacto (etapa y personas). En el Detalle
 * (`completo`), con el paso desde la etapa base, la fuente de cada número y la
 * acción de su estado.
 */
export function SeccionDelEmbudo({
  embudo,
  completo = false,
  launchId,
}: {
  embudo: readonly PasoDelEmbudo[];
  completo?: boolean;
  launchId?: string;
}) {
  const etiquetaDe = new Map<PasoDelEmbudoId, string>(embudo.map((p) => [p.paso, p.etiqueta]));
  return (
    <section aria-label="Embudo" className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Embudo</h3>
      <ol className="flex flex-col gap-1.5 text-sm">
        {embudo.map((paso) => (
          <li
            key={paso.paso}
            data-paso={paso.paso}
            data-estado={paso.personas.state}
            className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-border/60 py-1.5 last:border-b-0"
          >
            <div className="flex flex-col">
              <span>{paso.etiqueta}</span>
              {completo ? (
                <span className="text-xs text-muted-foreground">
                  Fuente: {ETIQUETA_DE_FUENTE[paso.personas.source]}
                </span>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-0.5 text-right">
              {tieneValor(paso.personas) ? (
                <span className="font-medium tabular-nums">
                  {formatearCantidad(paso.personas.value)}
                  {paso.personas.state === "desactualizado" ? (
                    <span className="ml-1 text-xs text-warning">({ETIQUETA_DEL_ESTADO.desactualizado})</span>
                  ) : null}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground" title={paso.personas.reason}>
                  {ETIQUETA_DEL_ESTADO[paso.personas.state]}
                  {completo ? `. ${paso.personas.reason}` : ""}
                </span>
              )}
              {completo && paso.pasoDesde ? (
                <span data-paso-desde={paso.pasoDesde.desde} className="text-xs text-muted-foreground">
                  {tieneValor(paso.pasoDesde.tasa)
                    ? `${formatearTasa(paso.pasoDesde.tasa.value)} de «${etiquetaDe.get(paso.pasoDesde.desde) ?? paso.pasoDesde.desde}»`
                    : `Paso: ${ETIQUETA_DEL_ESTADO[paso.pasoDesde.tasa.state].toLowerCase()}`}
                </span>
              ) : null}
              {completo && launchId ? <AccionDelDato dato={paso.personas} launchId={launchId} /> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

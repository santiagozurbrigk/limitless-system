import { AlertTriangle, Info } from "lucide-react";
import { ETIQUETA_DEL_ESTADO, type EstadoDelDato } from "@/lib/webinar/vistas/dato";

/**
 * Lo que se muestra en lugar de un número o una lista que no llegó `medido`
 * (SCRUM-545, AC-4): el estado (`ETIQUETA_DEL_ESTADO`) y su motivo. Nunca un
 * cero ni una lista inventada (CD-4). Sin estado ni efectos.
 *
 * `que` dice de qué parte de la pantalla es el aviso ("Total", "Leads"...).
 */
export function AvisoDeEstado({
  estado,
  reason,
  que,
}: {
  estado: EstadoDelDato;
  reason: string | null;
  que?: string;
}) {
  return (
    <div
      role="status"
      data-estado={estado}
      className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p>
        {que ? <span className="text-muted-foreground">{que}: </span> : null}
        <span className="font-medium">{ETIQUETA_DEL_ESTADO[estado]}.</span>
        {reason ? <span className="text-muted-foreground"> {reason}</span> : null}
      </p>
    </div>
  );
}

/**
 * La ficha no se pudo leer (`{ ok: false, motivo }` de la función de lectura,
 * AC-8): el título fijo y el motivo. Lo usa la página dentro de la cáscara de
 * la plataforma.
 */
export function ErrorDeCarga({
  motivo,
  titulo = "No pudimos cargar esta ficha.",
}: {
  motivo: string;
  /** El título fijo; el Detalle del lanzamiento usa el suyo (SCRUM-544). */
  titulo?: string;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/40 px-4 py-3 text-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <div>
        <p className="font-medium">{titulo}</p>
        <p className="text-muted-foreground">{motivo}</p>
      </div>
    </div>
  );
}

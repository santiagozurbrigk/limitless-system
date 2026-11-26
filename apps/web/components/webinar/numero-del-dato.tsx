import Link from "next/link";
import { accionDelDato } from "@/lib/webinar/acciones-del-estado";
import { ETIQUETA_DEL_ESTADO, tieneValor, type Dato } from "@/lib/webinar/vistas/dato";

/**
 * El botón (o el texto, si su destino todavía no existe) de lo que se puede
 * hacer con un número que no llegó medido (SCRUM-544, `accionDelDato`).
 */
export function AccionDelDato({ dato, launchId }: { dato: Dato<unknown>; launchId: string }) {
  const accion = accionDelDato(dato, launchId);
  if (!accion) return null;
  return accion.href ? (
    <Link
      href={accion.href}
      data-accion={accion.destino}
      className="self-start text-xs font-medium text-primary hover:underline"
    >
      {accion.texto}
    </Link>
  ) : (
    <span data-accion={accion.destino} className="text-xs font-medium text-muted-foreground">
      {accion.texto}
    </span>
  );
}

/**
 * Un número del contrato en una tarjeta (SCRUM-543, SCRUM-544): el valor
 * formateado si llegó (con la marca y el motivo si está desactualizado) o el
 * estado y su motivo si no. Con `launchId`, también la acción de su estado.
 */
export function NumeroDelDato<T>({
  etiqueta,
  dato,
  formatear,
  ayuda,
  launchId,
}: {
  etiqueta: string;
  dato: Dato<T>;
  formatear: (valor: T) => string;
  ayuda?: string | null;
  launchId?: string;
}) {
  return (
    <div
      data-numero={etiqueta}
      data-estado={dato.state}
      className="flex flex-col gap-1 rounded-lg border border-border p-3"
    >
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      {tieneValor(dato) ? (
        <>
          <p className="text-xl font-semibold tabular-nums">{formatear(dato.value)}</p>
          {dato.state === "desactualizado" ? (
            <p className="text-xs text-warning">
              {ETIQUETA_DEL_ESTADO.desactualizado}.{" "}
              <span className="text-muted-foreground">{dato.reason}</span>
            </p>
          ) : ayuda ? (
            <p className="text-xs text-muted-foreground">{ayuda}</p>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-sm font-medium">{ETIQUETA_DEL_ESTADO[dato.state]}</p>
          <p className="text-xs text-muted-foreground">{dato.reason}</p>
        </>
      )}
      {launchId ? <AccionDelDato dato={dato} launchId={launchId} /> : null}
    </div>
  );
}

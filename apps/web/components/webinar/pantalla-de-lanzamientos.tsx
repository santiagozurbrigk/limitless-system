import Link from "next/link";
import { Badge, Button } from "@ai-coo/ui";
import { EmptyState } from "@/components/shared/empty-state";
import { CartelDatosDeEjemplo } from "@/components/webinar/cartel-datos-de-ejemplo";
import { ETIQUETA_DE_VARIANTE, formatearCantidad, formatearMonto } from "@/lib/webinar/inicio/presentacion";
import { RUTA_PARA_CREAR_LANZAMIENTO } from "@/lib/webinar/leads/config";
import {
  ETIQUETA_DEL_ESTADO_DEL_LANZAMIENTO,
  textoDeLasFechas,
} from "@/lib/webinar/lanzamientos/presentacion";
import type { VistaListaDeLanzamientos } from "@/lib/webinar/vistas/contratos";
import { ETIQUETA_DEL_ESTADO, tieneValor, type Dato } from "@/lib/webinar/vistas/dato";
import { paths } from "@/routes/paths";
import { AvisoDeEstado } from "./aviso-de-estado";

/**
 * ⭐ Lista de lanzamientos de Limitless Webinars (SCRUM-544): cada uno con su
 * variante, estado, fechas, registrados, asistentes, ventas e ingresos, y el
 * enlace a su detalle. Dibuja lo que devuelve `leerListaDeLanzamientos` y
 * nada más; el orden (activos primero) viene del contrato. Crear y editar es
 * de SCRUM-529.
 */
export function PantallaDeLanzamientos({
  vista,
  hrefCrearLanzamiento = RUTA_PARA_CREAR_LANZAMIENTO,
}: {
  vista: VistaListaDeLanzamientos;
  hrefCrearLanzamiento?: string | null;
}) {
  const { lanzamientos } = vista;
  return (
    <div className="flex flex-col gap-4">
      <CartelDatosDeEjemplo visible={vista.esEjemplo} />
      {!tieneValor(lanzamientos) ? (
        <AvisoDeEstado estado={lanzamientos.state} reason={lanzamientos.reason} que="Lanzamientos" />
      ) : lanzamientos.value.length === 0 ? (
        <EmptyState
          title="Todavía no hay lanzamientos."
          description="Cuando crees uno, vas a ver acá sus registros, asistentes y ventas."
          action={
            hrefCrearLanzamiento ? (
              <Button asChild size="sm">
                <Link href={hrefCrearLanzamiento}>Crear un lanzamiento</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {lanzamientos.value.map((fila) => {
            const l = fila.lanzamiento;
            return (
              <li key={l.id} data-lanzamiento={l.id}>
                <Link
                  href={paths.platform.lanzamientosDetail(l.id)}
                  className="flex flex-col gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary/40"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{l.nombre}</span>
                    <Badge variant="outline">{ETIQUETA_DE_VARIANTE[l.variante]}</Badge>
                    <Badge variant={l.estado === "active" ? "default" : "secondary"}>
                      {ETIQUETA_DEL_ESTADO_DEL_LANZAMIENTO[l.estado]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{textoDeLasFechas(l.captaDesde, l.cierraEl)}</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <Celda etiqueta="Registrados" dato={fila.registrados} formatear={formatearCantidad} />
                    <Celda etiqueta="Asistieron" dato={fila.asistieron} formatear={formatearCantidad} />
                    <Celda etiqueta="Ventas" dato={fila.ventas} formatear={formatearCantidad} />
                    <Celda
                      etiqueta="Ingresos"
                      dato={fila.ingresos}
                      formatear={(v) => formatearMonto(v, l.moneda)}
                    />
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Celda({
  etiqueta,
  dato,
  formatear,
}: {
  etiqueta: string;
  dato: Dato<number>;
  formatear: (v: number) => string;
}) {
  return (
    <div data-celda={etiqueta} data-estado={dato.state} className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="font-medium tabular-nums" title={dato.reason ?? undefined}>
        {tieneValor(dato) ? formatear(dato.value) : ETIQUETA_DEL_ESTADO[dato.state]}
      </dd>
    </div>
  );
}

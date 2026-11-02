import Link from "next/link";
import { Search } from "lucide-react";
import { Button, Input, cn } from "@ai-coo/ui";
import { EmptyState } from "@/components/shared/empty-state";
import { CartelDatosDeEjemplo } from "@/components/webinar/cartel-datos-de-ejemplo";
import { RUTA_PARA_CREAR_LANZAMIENTO } from "@/lib/webinar/leads/config";
import { urlDeLeads } from "@/lib/webinar/leads/url";
import type { ParametrosDeLeads, VistaLeads } from "@/lib/webinar/vistas/contratos";
import { tieneValor } from "@/lib/webinar/vistas/dato";
import { paths } from "@/routes/paths";
import { AvisoDeEstado } from "./aviso-de-estado";
import { FiltrosDeLeads } from "./filtros-de-leads";
import { TablaDeLeads } from "./tabla-de-leads";

/**
 * ⭐ La pantalla de Leads de Limitless Webinars (SCRUM-545). Dibuja lo que
 * devuelve `leerLeads` y nada más: el orden, las 50 filas y los totales vienen
 * del contrato (CD-16). Filtro, búsqueda, lanzamiento y cursor viven en la URL
 * (AC-2): los filtros, el selector y la paginación son enlaces y el buscador es
 * un formulario GET (DT-16). Sin estado ni efectos.
 *
 * Un dato que no llegó `medido` muestra su estado y su motivo, nunca un cero ni
 * la lista de todos (AC-4); sin valor, tampoco los controles de esa parte.
 */
export function PantallaDeLeads({
  vista,
  cursor,
  hrefCrearLanzamiento = RUTA_PARA_CREAR_LANZAMIENTO,
}: {
  vista: VistaLeads;
  /** El cursor de la URL (la página pedida), para "Volver al principio". */
  cursor: string | null;
  /** Adónde lleva el estado vacío; sin ruta no hay enlace (DT-22). */
  hrefCrearLanzamiento?: string | null;
}) {
  const launchId = vista.lanzamientoElegido?.id ?? null;
  const actual: ParametrosDeLeads = {
    filtro: vista.filtroElegido,
    busqueda: vista.busqueda || null,
    launchId,
    cursor,
  };

  if (tieneValor(vista.lanzamientos) && vista.lanzamientos.value.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <CartelDatosDeEjemplo visible={vista.esEjemplo} />
        <EmptyState
          title="Todavía no hay lanzamientos."
          description="Cuando exista uno, sus leads van a aparecer acá."
          action={
            hrefCrearLanzamiento ? (
              <Button asChild size="sm">
                <Link href={hrefCrearLanzamiento}>Crear un lanzamiento</Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <CartelDatosDeEjemplo visible={vista.esEjemplo} />

      {vista.lanzamientos.state !== "medido" ? (
        <AvisoDeEstado
          estado={vista.lanzamientos.state}
          reason={vista.lanzamientos.reason}
          que="Lanzamientos"
        />
      ) : null}
      {tieneValor(vista.lanzamientos) ? (
        <nav aria-label="Lanzamiento" className="flex flex-wrap gap-1.5">
          {vista.lanzamientos.value.map((opcion) => {
            const elegido = opcion.id === launchId;
            return (
              <Link
                key={opcion.id}
                href={urlDeLeads(actual, { launchId: opcion.id })}
                aria-current={elegido ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  elegido
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                )}
              >
                {opcion.nombre}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <form
        method="get"
        action={paths.platform.webinars.leads}
        role="search"
        className="flex max-w-md items-center gap-2"
      >
        <input type="hidden" name="filtro" value={vista.filtroElegido} />
        {launchId ? <input type="hidden" name="lanzamiento" value={launchId} /> : null}
        <Input
          type="search"
          name="busqueda"
          defaultValue={vista.busqueda}
          placeholder="Buscar por nombre o email"
          aria-label="Buscar por nombre o email"
        />
        <Button type="submit" variant="outline" size="sm">
          <Search aria-hidden="true" />
          Buscar
        </Button>
      </form>

      <FiltrosDeLeads filtros={vista.filtros} filtroElegido={vista.filtroElegido} actual={actual} />

      {vista.total.state !== "medido" ? (
        <AvisoDeEstado estado={vista.total.state} reason={vista.total.reason} que="Total" />
      ) : null}
      {tieneValor(vista.total) ? (
        <p className="text-sm text-muted-foreground" data-total>
          {vista.total.value === 1 ? "1 lead" : `${vista.total.value} leads`}
        </p>
      ) : null}

      {vista.filas.state !== "medido" ? (
        <AvisoDeEstado estado={vista.filas.state} reason={vista.filas.reason} que="Leads" />
      ) : null}
      {tieneValor(vista.filas) ? (
        vista.filas.value.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún lead coincide con este filtro.</p>
        ) : (
          <>
            <TablaDeLeads filas={vista.filas.value} launchId={launchId} />
            {vista.siguienteCursor || cursor ? (
              <nav aria-label="Páginas" className="flex items-center gap-3 text-sm">
                {cursor ? (
                  <Link
                    href={urlDeLeads(actual, { cursor: null })}
                    className="text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Volver al principio
                  </Link>
                ) : null}
                {vista.siguienteCursor ? (
                  <Link
                    href={urlDeLeads(actual, { cursor: vista.siguienteCursor })}
                    className="text-primary hover:underline"
                  >
                    Siguiente
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}

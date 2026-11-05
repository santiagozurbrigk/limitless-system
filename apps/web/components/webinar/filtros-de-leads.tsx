import Link from "next/link";
import { cn } from "@ai-coo/ui";
import { urlDeLeads } from "@/lib/webinar/leads/url";
import type {
  ConteoDeFiltro,
  FiltroDeLeads,
  ParametrosDeLeads,
} from "@/lib/webinar/vistas/contratos";
import { ETIQUETA_DEL_ESTADO, tieneValor } from "@/lib/webinar/vistas/dato";
import { AvisoDeEstado } from "./aviso-de-estado";

/**
 * Los filtros de trabajo de Leads con su conteo (SCRUM-545, AC-2, AC-3). Son
 * enlaces: el filtro vive en la URL, elegir uno navega sin recargar la
 * pantalla a mano y la URL se puede compartir (DT-16). Cambiar de filtro vuelve
 * a la primera página. Sin estado ni efectos.
 *
 * Un conteo que no llegó `medido` no muestra un número: muestra su estado, y
 * abajo el motivo (AC-4, CD-4).
 */
export function FiltrosDeLeads({
  filtros,
  filtroElegido,
  actual,
}: {
  filtros: ConteoDeFiltro[];
  filtroElegido: FiltroDeLeads;
  /** Los parámetros de la URL de hoy (para conservar búsqueda y lanzamiento). */
  actual: ParametrosDeLeads;
}) {
  const sinMedir = filtros.filter((f) => f.personas.state !== "medido");
  const motivos = new Map<string, (typeof sinMedir)[number]["personas"]>();
  for (const f of sinMedir) motivos.set(`${f.personas.state}|${f.personas.reason}`, f.personas);

  return (
    <div className="flex flex-col gap-2">
      <nav aria-label="Filtros de leads" className="flex flex-wrap gap-1.5">
        {filtros.map((conteo) => {
          const activo = conteo.filtro === filtroElegido;
          return (
            <Link
              key={conteo.filtro}
              href={urlDeLeads(actual, { filtro: conteo.filtro })}
              aria-current={activo ? "page" : undefined}
              data-filtro={conteo.filtro}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                activo
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40"
              )}
            >
              <span>{conteo.etiqueta}</span>
              <span className="font-medium" data-conteo={conteo.personas.state}>
                {tieneValor(conteo.personas)
                  ? conteo.personas.value
                  : ETIQUETA_DEL_ESTADO[conteo.personas.state]}
              </span>
            </Link>
          );
        })}
      </nav>
      {[...motivos.values()].map((dato) => (
        <AvisoDeEstado
          key={`${dato.state}|${dato.reason}`}
          estado={dato.state}
          reason={dato.reason}
          que="Conteos de los filtros"
        />
      ))}
    </div>
  );
}

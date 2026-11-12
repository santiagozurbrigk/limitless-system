import { Skeleton } from "@ai-coo/ui";

/**
 * Esqueletos de las pantallas de Limitless Webinars (SCRUM-546, A8): lo que se
 * ve mientras la función de lectura responde, con la misma forma que la
 * pantalla para que nada salte al cargar. Sin estado ni efectos: los usan los
 * `loading.tsx` de cada ruta. `aria-busy` y el texto oculto avisan a un lector
 * de pantalla que la sección está cargando.
 */

function Cargando({ que, children }: { que: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" data-esqueleto={que} className="flex flex-col gap-6">
      <span className="sr-only">Cargando {que}…</span>
      {children}
    </div>
  );
}

function Tarjetas({ cantidad }: { cantidad: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: cantidad }, (_, i) => (
        <Skeleton key={i} className="h-20" />
      ))}
    </div>
  );
}

function Lista({ filas, alto = "h-10" }: { filas: number; alto?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: filas }, (_, i) => (
        <Skeleton key={i} className={alto} />
      ))}
    </div>
  );
}

/** Inicio: encabezado con la cuenta regresiva, números, pendientes, embudo y fuentes. */
export function EsqueletoDeInicio() {
  return (
    <Cargando que="Inicio">
      <Skeleton className="h-28 rounded-xl" />
      <Tarjetas cantidad={4} />
      <Lista filas={2} />
      <Lista filas={5} alto="h-7" />
      <Lista filas={3} alto="h-14" />
    </Cargando>
  );
}

/** Leads: selector de lanzamiento, buscador, filtros y la tabla. */
export function EsqueletoDeLeads() {
  return (
    <Cargando que="Leads">
      <div className="flex gap-1.5">
        <Skeleton className="h-7 w-40 rounded-full" />
        <Skeleton className="h-7 w-40 rounded-full" />
      </div>
      <Skeleton className="h-9 max-w-md" />
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-44 rounded-full" />
        ))}
      </div>
      <Lista filas={8} />
    </Cargando>
  );
}

/** Ficha del lead: contacto, registros, línea de tiempo y el panel de venta. */
export function EsqueletoDeFichaDelLead() {
  return (
    <Cargando que="la ficha del lead">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Lista filas={2} alto="h-14" />
      <Lista filas={6} alto="h-8" />
    </Cargando>
  );
}

/** Lista de lanzamientos: una tarjeta por lanzamiento con sus cuatro números. */
export function EsqueletoDeLanzamientos() {
  return (
    <Cargando que="Lanzamientos">
      <Lista filas={3} alto="h-28" />
    </Cargando>
  );
}

/** Detalle del lanzamiento: encabezado, números, embudo, cortes y la serie diaria. */
export function EsqueletoDeDetalleDelLanzamiento() {
  return (
    <Cargando que="el lanzamiento">
      <Skeleton className="h-20 rounded-xl" />
      <Tarjetas cantidad={8} />
      <Lista filas={11} alto="h-9" />
      <div className="grid gap-6 md:grid-cols-2">
        <Lista filas={4} alto="h-6" />
        <Lista filas={4} alto="h-6" />
      </div>
      <Skeleton className="h-32" />
    </Cargando>
  );
}

/** Configuración del lanzamiento: faltantes, formulario y campañas y productos. */
export function EsqueletoDeConfiguracion() {
  return (
    <Cargando que="la configuración">
      <Skeleton className="h-20 rounded-lg" />
      <Lista filas={6} alto="h-9" />
      <div className="grid gap-6 md:grid-cols-2">
        <Lista filas={2} alto="h-10" />
        <Lista filas={2} alto="h-10" />
      </div>
    </Cargando>
  );
}

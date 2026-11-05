import { Badge } from "@ai-coo/ui";
import { CartelDatosDeEjemplo } from "@/components/webinar/cartel-datos-de-ejemplo";
import {
  ETIQUETA_DE_VARIANTE,
  formatearCantidad,
  formatearMonto,
  formatearTasa,
  formatearVeces,
} from "@/lib/webinar/inicio/presentacion";
import {
  ETIQUETA_DEL_ESTADO_DEL_LANZAMIENTO,
  anchoDeBarra,
  formatearFechaCalendario,
  textoDeLasFechas,
} from "@/lib/webinar/lanzamientos/presentacion";
import { TEXTO_ORIGEN_VACIO } from "@/lib/webinar/leads/config";
import type { PuntoDiario, VistaDetalleDelLanzamiento } from "@/lib/webinar/vistas/contratos";
import { ETIQUETA_DEL_ESTADO, tieneValor, type Dato } from "@/lib/webinar/vistas/dato";
import { AvisoDeEstado } from "./aviso-de-estado";
import { AccionDelDato, NumeroDelDato } from "./numero-del-dato";
import { SeccionDeFuentes, SeccionDeSesiones, SeccionDelEmbudo } from "./secciones-del-lanzamiento";

/** Texto del corte por anuncio cuando el registro no trae `utm_content`. */
export const TEXTO_ANUNCIO_VACIO = "Sin dato de anuncio";

/**
 * ⭐ Detalle del lanzamiento de Limitless Webinars (SCRUM-544, A6): las etapas
 * de su variante con su número, el paso desde la etapa base y la fuente de
 * cada cifra; números principales; corte por origen (UTM) y por anuncio;
 * evolución diaria de registros e inversión; sesiones y estado de las fuentes.
 * Cada número que no llegó medido muestra su estado, su motivo y su acción
 * (`accionDelEstado`). Dibuja lo que devuelve `leerDetalleDelLanzamiento` y
 * nada más (regla de SCRUM-542). Sin estado ni efectos.
 */
export function PantallaDeDetalleDelLanzamiento({ vista }: { vista: VistaDetalleDelLanzamiento }) {
  const l = vista.lanzamiento;
  const monto = (v: number) => formatearMonto(v, l.moneda);
  return (
    <div className="flex flex-col gap-6">
      <CartelDatosDeEjemplo visible={vista.esEjemplo} />

      <section aria-label="Lanzamiento" className="flex flex-col gap-2 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{l.nombre}</h2>
          <Badge variant="outline">{ETIQUETA_DE_VARIANTE[l.variante]}</Badge>
          <Badge variant={l.estado === "active" ? "default" : "secondary"}>
            {ETIQUETA_DEL_ESTADO_DEL_LANZAMIENTO[l.estado]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {textoDeLasFechas(l.captaDesde, l.cierraEl)}
          {l.precioDeLaOferta !== null ? ` · Oferta: ${monto(l.precioDeLaOferta)}` : ""}
        </p>
      </section>

      <section aria-label="Números principales" className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Números principales</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <NumeroDelDato etiqueta="Ventas" dato={vista.ventas.ventas} formatear={formatearCantidad} launchId={l.id} />
          <NumeroDelDato etiqueta="Ingresos" dato={vista.ventas.ingresos} formatear={monto} launchId={l.id} />
          <NumeroDelDato etiqueta="Reembolsos" dato={vista.ventas.reembolsos} formatear={formatearCantidad} launchId={l.id} />
          <NumeroDelDato etiqueta="Asistencia" dato={vista.tasas.asistencia} formatear={formatearTasa} launchId={l.id} />
          <NumeroDelDato
            etiqueta="Conversión de asistentes"
            dato={vista.tasas.conversionDeAsistentes}
            formatear={formatearTasa}
            launchId={l.id}
          />
          <NumeroDelDato
            etiqueta="Registrado a venta"
            dato={vista.tasas.conversionDeRegistrados}
            formatear={formatearTasa}
            launchId={l.id}
          />
          {vista.anuncios ? (
            <>
              <NumeroDelDato etiqueta="Inversión en anuncios" dato={vista.anuncios.inversion} formatear={monto} launchId={l.id} />
              <NumeroDelDato
                etiqueta="Costo por registro"
                dato={vista.anuncios.costoPorRegistro}
                formatear={(v) => (v === null ? "—" : monto(v))}
                launchId={l.id}
              />
              <NumeroDelDato
                etiqueta="Costo por venta"
                dato={vista.anuncios.costoPorVenta}
                formatear={(v) => (v === null ? "—" : monto(v))}
                launchId={l.id}
              />
              <NumeroDelDato etiqueta="ROAS" dato={vista.anuncios.roas} formatear={formatearVeces} launchId={l.id} />
            </>
          ) : null}
        </div>
      </section>

      <SeccionDelEmbudo embudo={vista.embudo} completo launchId={l.id} />

      <div className="grid gap-6 md:grid-cols-2">
        <Corte
          titulo="Registros por origen (UTM)"
          dato={vista.origenes}
          filas={(lista) => lista.map((o) => ({ clave: o.origen ?? TEXTO_ORIGEN_VACIO, valor: o.registros }))}
          launchId={l.id}
          id="origen"
        />
        <Corte
          titulo="Registros por anuncio"
          dato={vista.registrosPorAnuncio}
          filas={(lista) => lista.map((a) => ({ clave: a.anuncio ?? TEXTO_ANUNCIO_VACIO, valor: a.registros }))}
          launchId={l.id}
          id="anuncio"
        />
      </div>

      <section aria-label="Evolución diaria" className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Evolución diaria</h3>
        <SerieDiaria titulo="Registros por día" dato={vista.evolucionDiaria.registros} launchId={l.id} formatear={formatearCantidad} />
        {vista.evolucionDiaria.inversion ? (
          <SerieDiaria titulo="Inversión por día" dato={vista.evolucionDiaria.inversion} launchId={l.id} formatear={monto} />
        ) : null}
      </section>

      <SeccionDeSesiones sesiones={vista.sesiones} />
      <SeccionDeFuentes fuentes={vista.fuentes} />
    </div>
  );
}

/** El aviso de un dato sin valor, con su acción. */
function SinValor({ dato, que, launchId }: { dato: Dato<unknown>; que: string; launchId: string }) {
  if (tieneValor(dato)) return null;
  return (
    <div className="flex flex-col gap-1">
      <AvisoDeEstado estado={dato.state} reason={dato.reason} que={que} />
      <AccionDelDato dato={dato} launchId={launchId} />
    </div>
  );
}

function Corte<T>({
  titulo,
  dato,
  filas,
  launchId,
  id,
}: {
  titulo: string;
  dato: Dato<T[]>;
  filas: (lista: T[]) => { clave: string; valor: number }[];
  launchId: string;
  id: string;
}) {
  const lista = tieneValor(dato) ? filas(dato.value) : [];
  const maximo = Math.max(0, ...lista.map((f) => f.valor));
  return (
    <section aria-label={titulo} data-corte={id} className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{titulo}</h3>
      <SinValor dato={dato} que={titulo} launchId={launchId} />
      {tieneValor(dato) ? (
        lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay registros.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {lista.map((f) => (
              <li key={f.clave} className="flex flex-col gap-0.5">
                <div className="flex justify-between gap-3">
                  <span className="truncate">{f.clave}</span>
                  <span className="font-medium tabular-nums">{formatearCantidad(f.valor)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: `${anchoDeBarra(f.valor, maximo)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}
      {dato.state === "desactualizado" ? (
        <p className="text-xs text-warning">
          {ETIQUETA_DEL_ESTADO.desactualizado}. <span className="text-muted-foreground">{dato.reason}</span>
        </p>
      ) : null}
    </section>
  );
}

function SerieDiaria({
  titulo,
  dato,
  launchId,
  formatear,
}: {
  titulo: string;
  dato: Dato<PuntoDiario[]>;
  launchId: string;
  formatear: (v: number) => string;
}) {
  const puntos = tieneValor(dato) ? dato.value : [];
  const maximo = Math.max(0, ...puntos.map((p) => p.valor));
  return (
    <div data-serie={titulo} data-estado={dato.state} className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <SinValor dato={dato} que={titulo} launchId={launchId} />
      {tieneValor(dato) ? (
        puntos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay días con datos.</p>
        ) : (
          <ol
            className="flex h-32 items-end gap-0.5 overflow-x-auto rounded-lg border border-border p-2"
            aria-label={titulo}
          >
            {puntos.map((p) => (
              <li
                key={p.dia}
                data-dia={p.dia}
                title={`${formatearFechaCalendario(p.dia)}: ${formatear(p.valor)}`}
                className="flex h-full min-w-2 flex-1 flex-col justify-end"
              >
                <span className="sr-only">
                  {formatearFechaCalendario(p.dia)}: {formatear(p.valor)}
                </span>
                <span
                  aria-hidden="true"
                  className="rounded-sm bg-primary"
                  style={{ height: `${anchoDeBarra(p.valor, maximo)}%` }}
                />
              </li>
            ))}
          </ol>
        )
      ) : null}
    </div>
  );
}

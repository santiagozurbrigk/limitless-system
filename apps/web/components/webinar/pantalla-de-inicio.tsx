import Link from "next/link";
import { AlertTriangle, CalendarClock, Plug, Users } from "lucide-react";
import { Badge, Button, cn } from "@ai-coo/ui";
import { EmptyState } from "@/components/shared/empty-state";
import { CartelDatosDeEjemplo } from "@/components/webinar/cartel-datos-de-ejemplo";
import {
  ETIQUETA_DE_VARIANTE,
  avisoDeRegistros,
  formatearCantidad,
  formatearMonto,
  formatearTasa,
  formatearVeces,
  fuentesConProblemas,
  fuentesOrdenadas,
  textoDelCierre,
} from "@/lib/webinar/inicio/presentacion";
import { RUTA_PARA_CREAR_LANZAMIENTO } from "@/lib/webinar/leads/config";
import { urlDeLeads } from "@/lib/webinar/leads/url";
import type {
  FiltroDeLeads,
  InicioDelLanzamientoActivo,
  VistaInicio,
} from "@/lib/webinar/vistas/contratos";
import {
  ETIQUETA_DE_FUENTE,
  ETIQUETA_DEL_ESTADO,
  tieneValor,
  type Dato,
} from "@/lib/webinar/vistas/dato";
import { AvisoDeEstado } from "./aviso-de-estado";
import { FechaDeLaOrg } from "./fecha-de-la-org";

/**
 * ⭐ Inicio de Limitless Webinars (SCRUM-543, A3): el lanzamiento activo con su
 * cuenta regresiva, los números principales, lo que el equipo tiene que mover
 * hoy, el estado de las fuentes y el aviso de registros que dejan de llegar.
 * Dibuja lo que devuelve `leerInicio` y nada más (regla de SCRUM-542). Sin
 * estado ni efectos: es un Server Component (las fechas, `FechaDeLaOrg`).
 *
 * Un número que no llegó `medido` muestra su estado y su motivo; nunca un cero
 * inventado. Desactualizado muestra el valor con la marca y el motivo.
 */
export function PantallaDeInicio({
  vista,
  hrefCrearLanzamiento = RUTA_PARA_CREAR_LANZAMIENTO,
}: {
  vista: VistaInicio;
  /** Adónde lleva el estado vacío; sin ruta no hay enlace (hoy, hasta SCRUM-529). */
  hrefCrearLanzamiento?: string | null;
}) {
  const { activo } = vista;

  if (!tieneValor(activo)) {
    return (
      <div className="flex flex-col gap-4">
        <CartelDatosDeEjemplo visible={vista.esEjemplo} />
        <AvisoDeEstado estado={activo.state} reason={activo.reason} que="Lanzamiento activo" />
      </div>
    );
  }

  if (activo.value === null) {
    return (
      <div className="flex flex-col gap-4">
        <CartelDatosDeEjemplo visible={vista.esEjemplo} />
        <EmptyState
          title="No hay un lanzamiento activo."
          description="Cuando actives uno, acá vas a ver sus registros, ventas y lo que el equipo tiene que mover hoy."
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

  const inicio = activo.value;
  return (
    <div className="flex flex-col gap-6">
      <CartelDatosDeEjemplo visible={vista.esEjemplo} />
      {activo.state === "desactualizado" ? (
        <AvisoDeEstado estado={activo.state} reason={activo.reason} que="Lanzamiento activo" />
      ) : null}
      <Encabezado inicio={inicio} />
      <AvisoDeRegistrosQueNoLlegan inicio={inicio} />
      <NumerosPrincipales inicio={inicio} />
      <ActividadDeHoy inicio={inicio} />
      <Embudo inicio={inicio} />
      <Sesiones inicio={inicio} />
      <Fuentes inicio={inicio} />
    </div>
  );
}

function Encabezado({ inicio }: { inicio: InicioDelLanzamientoActivo }) {
  const { lanzamiento } = inicio;
  const cierreVencido = inicio.diasParaElCierre !== null && inicio.diasParaElCierre < 0;
  return (
    <section aria-label="Lanzamiento activo" className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{lanzamiento.nombre}</h2>
        <Badge variant="outline">{ETIQUETA_DE_VARIANTE[lanzamiento.variante]}</Badge>
        {lanzamiento.precioDeLaOferta !== null ? (
          <span className="text-sm text-muted-foreground">
            Oferta: {formatearMonto(lanzamiento.precioDeLaOferta, lanzamiento.moneda)}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <p
          data-cuenta-regresiva
          className={cn("text-2xl font-semibold", cierreVencido ? "text-warning" : "text-primary")}
        >
          {textoDelCierre(inicio.diasParaElCierre)}
        </p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          {inicio.proximaSesion ? (
            <>
              Próxima sesión: <FechaDeLaOrg iso={inicio.proximaSesion.empiezaAt} />
            </>
          ) : (
            "No hay sesiones por delante"
          )}
        </p>
      </div>
    </section>
  );
}

function AvisoDeRegistrosQueNoLlegan({ inicio }: { inicio: InicioDelLanzamientoActivo }) {
  const aviso = avisoDeRegistros(inicio);
  if (!aviso) return null;
  return (
    <div
      role="alert"
      data-aviso="registros"
      className="flex items-start gap-2 rounded-lg border border-warning/40 px-4 py-3 text-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <div>
        <p className="font-medium">{aviso.titulo}</p>
        <p className="text-muted-foreground">{aviso.detalle}</p>
      </div>
    </div>
  );
}

/**
 * Un número del contrato en una tarjeta: el valor formateado si llegó (con la
 * marca y el motivo si está desactualizado) o el estado y su motivo si no.
 */
function Numero<T>({
  etiqueta,
  dato,
  formatear,
  ayuda,
}: {
  etiqueta: string;
  dato: Dato<T>;
  formatear: (valor: T) => string;
  ayuda?: string | null;
}) {
  return (
    <div data-numero={etiqueta} data-estado={dato.state} className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      {tieneValor(dato) ? (
        <>
          <p className="text-xl font-semibold tabular-nums">{formatear(dato.value)}</p>
          {dato.state === "desactualizado" ? (
            <p className="text-xs text-warning">
              {ETIQUETA_DEL_ESTADO.desactualizado}. <span className="text-muted-foreground">{dato.reason}</span>
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
    </div>
  );
}

function NumerosPrincipales({ inicio }: { inicio: InicioDelLanzamientoActivo }) {
  const moneda = inicio.lanzamiento.moneda;
  const monto = (valor: number) => formatearMonto(valor, moneda);
  const recientes = inicio.registradosUltimas24h;
  return (
    <section aria-label="Números principales" className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Números principales</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero
          etiqueta="Registrados"
          dato={inicio.registrados}
          formatear={formatearCantidad}
          ayuda={tieneValor(recientes) ? `+${formatearCantidad(recientes.value)} en las últimas 24 h` : null}
        />
        <Numero etiqueta="Asistencia" dato={inicio.tasas.asistencia} formatear={formatearTasa} />
        <Numero etiqueta="Ventas" dato={inicio.ventas.ventas} formatear={formatearCantidad} />
        <Numero etiqueta="Ingresos" dato={inicio.ventas.ingresos} formatear={monto} />
        <Numero
          etiqueta="Conversión de asistentes"
          dato={inicio.tasas.conversionDeAsistentes}
          formatear={formatearTasa}
        />
        {inicio.ventas.ventasVip ? (
          <Numero etiqueta="Ventas VIP" dato={inicio.ventas.ventasVip} formatear={formatearCantidad} />
        ) : null}
        {inicio.anuncios ? (
          <>
            <Numero etiqueta="Inversión en anuncios" dato={inicio.anuncios.inversion} formatear={monto} />
            <Numero
              etiqueta="Costo por registro"
              dato={inicio.anuncios.costoPorRegistro}
              formatear={(v) => (v === null ? "—" : monto(v))}
            />
            <Numero etiqueta="ROAS" dato={inicio.anuncios.roas} formatear={formatearVeces} />
          </>
        ) : null}
      </div>
    </section>
  );
}

function ActividadDeHoy({ inicio }: { inicio: InicioDelLanzamientoActivo }) {
  const launchId = inicio.lanzamiento.id;
  const pendientes: { etiqueta: string; dato: Dato<number>; filtro: FiltroDeLeads }[] = [
    {
      etiqueta: "Levantaron la mano y nadie los contactó",
      dato: inicio.pendientesDelEquipo.levantaronLaManoSinContactar,
      filtro: "levanto_la_mano_sin_contactar",
    },
    {
      etiqueta: "Agendaron una llamada y no cerraron",
      dato: inicio.pendientesDelEquipo.agendadosSinCerrar,
      filtro: "agendado_sin_cerrar",
    },
  ];
  return (
    <section aria-label="Actividad de hoy" className="flex flex-col gap-3">
      <h3 className="flex items-center gap-1.5 text-sm font-medium">
        <Users className="h-4 w-4" aria-hidden="true" />
        Lo que el equipo tiene que mover hoy
      </h3>
      <ul className="flex flex-col gap-2">
        {pendientes.map((p) => (
          <li
            key={p.filtro}
            data-pendiente={p.filtro}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
          >
            <span>{p.etiqueta}</span>
            {tieneValor(p.dato) ? (
              <Link
                href={urlDeLeads({ filtro: p.filtro, launchId })}
                className="font-semibold tabular-nums text-primary hover:underline"
              >
                {formatearCantidad(p.dato.value)} · Ver leads
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">
                {ETIQUETA_DEL_ESTADO[p.dato.state]}. {p.dato.reason}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Embudo({ inicio }: { inicio: InicioDelLanzamientoActivo }) {
  return (
    <section aria-label="Embudo" className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Embudo</h3>
      <ol className="flex flex-col gap-1.5 text-sm">
        {inicio.embudo.map((paso) => (
          <li
            key={paso.paso}
            data-paso={paso.paso}
            data-estado={paso.personas.state}
            className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 last:border-b-0"
          >
            <span>{paso.etiqueta}</span>
            {tieneValor(paso.personas) ? (
              <span className="font-medium tabular-nums">
                {formatearCantidad(paso.personas.value)}
                {paso.personas.state === "desactualizado" ? (
                  <span className="ml-1 text-xs text-warning">({ETIQUETA_DEL_ESTADO.desactualizado})</span>
                ) : null}
              </span>
            ) : (
              <span className="text-right text-xs text-muted-foreground" title={paso.personas.reason}>
                {ETIQUETA_DEL_ESTADO[paso.personas.state]}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Sesiones({ inicio }: { inicio: InicioDelLanzamientoActivo }) {
  if (inicio.sesiones.length === 0) {
    return (
      <section aria-label="Sesiones" className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Sesiones</h3>
        <p className="text-sm text-muted-foreground">Este lanzamiento todavía no tiene sesiones cargadas.</p>
      </section>
    );
  }
  return (
    <section aria-label="Sesiones" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Sesiones</h3>
      <ul className="flex flex-col gap-2 text-sm">
        {inicio.sesiones.map((sesion) => (
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
    </section>
  );
}

/** Un número en una línea de texto: el valor o el estado (el motivo va en el título). */
function textoCorto(dato: Dato<number>): string {
  return tieneValor(dato) ? formatearCantidad(dato.value) : ETIQUETA_DEL_ESTADO[dato.state].toLowerCase();
}

function Fuentes({ inicio }: { inicio: InicioDelLanzamientoActivo }) {
  const problemas = fuentesConProblemas(inicio.fuentes);
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
        {fuentesOrdenadas(inicio.fuentes).map((fuente) => (
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

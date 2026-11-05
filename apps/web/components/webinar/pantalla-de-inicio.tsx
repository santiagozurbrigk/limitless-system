import Link from "next/link";
import { AlertTriangle, CalendarClock, Users } from "lucide-react";
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
  textoDelCierre,
} from "@/lib/webinar/inicio/presentacion";
import { RUTA_PARA_CREAR_LANZAMIENTO } from "@/lib/webinar/leads/config";
import { urlDeLeads } from "@/lib/webinar/leads/url";
import type {
  FiltroDeLeads,
  InicioDelLanzamientoActivo,
  VistaInicio,
} from "@/lib/webinar/vistas/contratos";
import { ETIQUETA_DEL_ESTADO, tieneValor, type Dato } from "@/lib/webinar/vistas/dato";
import { AvisoDeEstado } from "./aviso-de-estado";
import { FechaDeLaOrg } from "./fecha-de-la-org";
import { NumeroDelDato } from "./numero-del-dato";
import { SeccionDeFuentes, SeccionDeSesiones, SeccionDelEmbudo } from "./secciones-del-lanzamiento";

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
      <SeccionDelEmbudo embudo={inicio.embudo} />
      <SeccionDeSesiones sesiones={inicio.sesiones} />
      <SeccionDeFuentes fuentes={inicio.fuentes} />
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

function NumerosPrincipales({ inicio }: { inicio: InicioDelLanzamientoActivo }) {
  const moneda = inicio.lanzamiento.moneda;
  const monto = (valor: number) => formatearMonto(valor, moneda);
  const recientes = inicio.registradosUltimas24h;
  return (
    <section aria-label="Números principales" className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Números principales</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <NumeroDelDato
          etiqueta="Registrados"
          dato={inicio.registrados}
          formatear={formatearCantidad}
          ayuda={tieneValor(recientes) ? `+${formatearCantidad(recientes.value)} en las últimas 24 h` : null}
        />
        <NumeroDelDato etiqueta="Asistencia" dato={inicio.tasas.asistencia} formatear={formatearTasa} />
        <NumeroDelDato etiqueta="Ventas" dato={inicio.ventas.ventas} formatear={formatearCantidad} />
        <NumeroDelDato etiqueta="Ingresos" dato={inicio.ventas.ingresos} formatear={monto} />
        <NumeroDelDato
          etiqueta="Conversión de asistentes"
          dato={inicio.tasas.conversionDeAsistentes}
          formatear={formatearTasa}
        />
        {inicio.ventas.ventasVip ? (
          <NumeroDelDato etiqueta="Ventas VIP" dato={inicio.ventas.ventasVip} formatear={formatearCantidad} />
        ) : null}
        {inicio.anuncios ? (
          <>
            <NumeroDelDato etiqueta="Inversión en anuncios" dato={inicio.anuncios.inversion} formatear={monto} />
            <NumeroDelDato
              etiqueta="Costo por registro"
              dato={inicio.anuncios.costoPorRegistro}
              formatear={(v) => (v === null ? "—" : monto(v))}
            />
            <NumeroDelDato etiqueta="ROAS" dato={inicio.anuncios.roas} formatear={formatearVeces} />
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


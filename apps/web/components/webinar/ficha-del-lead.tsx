import { MessageCircle } from "lucide-react";
import { Badge } from "@ai-coo/ui";
import { CartelDatosDeEjemplo } from "@/components/webinar/cartel-datos-de-ejemplo";
import { TEXTO_SIN_TELEFONO, nombreVisible, textoDelOrigen } from "@/lib/webinar/leads/config";
import {
  ETIQUETA_DEL_EVENTO,
  type CompraDelLead,
  type VistaFichaDelLead,
} from "@/lib/webinar/vistas/contratos";
import { ETIQUETA_DE_FUENTE, tieneValor } from "@/lib/webinar/vistas/dato";
import { AvisoDeEstado } from "./aviso-de-estado";
import { FechaDeLaOrg } from "./fecha-de-la-org";
import { PanelDeVentaCliente } from "./panel-de-venta-cliente";

/**
 * ⭐ La ficha del lead de Limitless Webinars (SCRUM-545, AC-7): contacto,
 * WhatsApp, registros por lanzamiento, línea de tiempo con la fuente de cada
 * evento y quién lo cargó, avisos de fuentes que no están al día, compras y el
 * panel de venta. Dibuja lo que devuelve `leerFichaDelLead` y nada más. Sin
 * estado ni efectos: el estado local vive en el envoltorio del panel.
 */
export function FichaDelLead({ vista }: { vista: VistaFichaDelLead }) {
  const { lead, lanzamientoElegido } = vista;

  return (
    <div className="flex flex-col gap-6">
      <CartelDatosDeEjemplo visible={vista.esEjemplo} />

      <section aria-label="Contacto" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{nombreVisible(lead)}</h2>
        <p className="text-sm text-muted-foreground">{lead.email}</p>
        {lead.telefono ? <p className="text-sm text-muted-foreground">{lead.telefono}</p> : null}
        <p className="text-xs text-muted-foreground">
          Primera vez: <FechaDeLaOrg iso={lead.primeraVezAt} />
        </p>
        {vista.whatsappUrl ? (
          <a
            href={vista.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 self-start text-sm text-primary underline-offset-4 hover:underline"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Escribir por WhatsApp
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">{TEXTO_SIN_TELEFONO}</p>
        )}
      </section>

      {vista.avisosDeFuentes.length > 0 ? (
        <section aria-label="Fuentes que no están al día" className="flex flex-col gap-2">
          {vista.avisosDeFuentes.map((aviso) => (
            <AvisoDeEstado
              key={aviso.fuente}
              estado={aviso.state}
              reason={aviso.reason}
              que={ETIQUETA_DE_FUENTE[aviso.fuente]}
            />
          ))}
        </section>
      ) : null}

      <section aria-label="Registros" className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Registros</h3>
        <ul className="flex flex-col gap-2 text-sm">
          {vista.registros.map((registro) => (
            <li key={registro.lanzamiento.id} className="rounded-lg border border-border px-3 py-2">
              <p className="font-medium">{registro.lanzamiento.nombre}</p>
              <p className="text-xs text-muted-foreground">
                <FechaDeLaOrg iso={registro.registradoAt} /> · Origen: {textoDelOrigen(registro.origen)}
              </p>
              {registro.calificacion ? (
                <p className="text-xs text-muted-foreground">Calificación: {registro.calificacion}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={`Estado de venta en ${lanzamientoElegido.nombre}`} className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Estado de venta · {lanzamientoElegido.nombre}</h3>
        <PanelDeVentaCliente
          key={lead.id + lanzamientoElegido.id}
          leadId={lead.id}
          launchId={lanzamientoElegido.id}
          estadoDeVenta={vista.estadoDeVenta}
          notas={vista.notas}
          equipo={vista.equipo}
        />
      </section>

      <section aria-label="Línea de tiempo" className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Línea de tiempo</h3>
        {vista.lineaDeTiempo.state !== "medido" ? (
          <AvisoDeEstado
            estado={vista.lineaDeTiempo.state}
            reason={vista.lineaDeTiempo.reason}
            que="Línea de tiempo"
          />
        ) : null}
        {tieneValor(vista.lineaDeTiempo) ? (
          <ol className="flex flex-col gap-2 text-sm">
            {vista.lineaDeTiempo.value.map((evento) => (
              <li key={evento.id} data-evento={evento.id} className="flex flex-col">
                <span className="font-medium">{ETIQUETA_DEL_EVENTO[evento.tipo]}</span>
                <span className="text-xs text-muted-foreground">
                  <FechaDeLaOrg iso={evento.occurredAt} /> · Fuente: {ETIQUETA_DE_FUENTE[evento.fuente]}
                  {evento.cargadoPor ? ` · Cargado por ${evento.cargadoPor.nombre}` : null}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <section aria-label="Compras" className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Compras</h3>
        {vista.compras.state !== "medido" ? (
          <AvisoDeEstado estado={vista.compras.state} reason={vista.compras.reason} que="Compras" />
        ) : null}
        {tieneValor(vista.compras) ? (
          vista.compras.value.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin compras.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {vista.compras.value.map((compra) => (
                <li key={compra.eventoId} data-compra={compra.eventoId} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{compra.producto}</span>
                  <span>{montoDeLaCompra(compra)}</span>
                  <Badge variant="outline">{compra.estado === "cobrada" ? "Cobrada" : "Reembolsada"}</Badge>
                  <span className="text-xs text-muted-foreground">
                    <FechaDeLaOrg iso={compra.occurredAt} /> · Fuente: {ETIQUETA_DE_FUENTE[compra.fuente]}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>
    </div>
  );
}

/** El monto con su moneda; sin monto, "—" (nunca un cero inventado). */
function montoDeLaCompra(compra: CompraDelLead): string {
  if (compra.monto === null) return "—";
  return `${compra.moneda} ${compra.monto.toLocaleString("es-AR")}`;
}

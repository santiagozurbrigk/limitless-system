import { Badge, Button, Textarea } from "@ai-coo/ui";
import {
  TEXTO_SIN_CONTACTAR,
  TEXTO_SIN_RESPONSABLE,
  siguienteEtapa,
} from "@/lib/webinar/leads/config";
import type { EstadoLocalDelLead } from "@/lib/webinar/leads/estado-local";
import {
  ETIQUETA_DEL_EVENTO,
  type EstadoDeVenta,
  type EtapaDelLead,
  type NotaDelLead,
  type PersonaDelEquipo,
} from "@/lib/webinar/vistas/contratos";
import { tieneValor, type Dato } from "@/lib/webinar/vistas/dato";
import { AvisoDeEstado } from "./aviso-de-estado";
import { FechaDeLaOrg } from "./fecha-de-la-org";

/**
 * ⭐ El panel de venta de la ficha (SCRUM-545, DT-11): estado de venta,
 * responsable, botón de avance y notas. Sólo presentación: no tiene estado ni
 * efectos y recibe todo por props; el estado local y las acciones viven en
 * `panel-de-venta-cliente.tsx`.
 *
 * "Marcar avance" es un solo botón, sin menú, con el paso del mapa explícito
 * de `config.ts` (AC-9b); si la etapa no tiene paso, no hay botón. Los cambios
 * son de ejemplo y el panel lo dice siempre, y otra vez después de un cambio
 * (AC-9, CD-8). Un `Dato` sin valor muestra su estado y no sus controles.
 */
export function PanelDeVentaDelLead({
  estadoDeVenta,
  notas,
  equipo,
  local,
  borradorDeNota,
  ocupado,
  alMarcarAvance,
  alAsignarResponsable,
  alCambiarBorrador,
  alAgregarNota,
}: {
  estadoDeVenta: Dato<EstadoDeVenta>;
  notas: Dato<NotaDelLead[]>;
  equipo: PersonaDelEquipo[];
  /** El estado de venta con los cambios de ejemplo; `null` si no hay estado de venta. */
  local: EstadoLocalDelLead | null;
  borradorDeNota: string;
  ocupado: boolean;
  alMarcarAvance: (etapaActual: EtapaDelLead) => void;
  alAsignarResponsable: (userId: string | null) => void;
  alCambiarBorrador: (texto: string) => void;
  alAgregarNota: () => void;
}) {
  const siguiente = local ? siguienteEtapa(local.etapa) : null;

  return (
    <section aria-label="Estado de venta" className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground" data-aviso="acciones-de-ejemplo">
        Estas acciones son de ejemplo: no se guardan.
      </p>
      {local?.huboCambios ? (
        <p role="status" className="rounded-lg border border-warning/40 px-3 py-2 text-sm text-warning">
          Cambio de ejemplo: no se guardó y se pierde al recargar.
        </p>
      ) : null}

      {estadoDeVenta.state !== "medido" ? (
        <AvisoDeEstado estado={estadoDeVenta.state} reason={estadoDeVenta.reason} que="Estado de venta" />
      ) : null}
      {tieneValor(estadoDeVenta) && local ? (
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Etapa</dt>
            <dd>
              <Badge variant="outline">{ETIQUETA_DEL_EVENTO[local.etapa]}</Badge>
            </dd>
            <dt className="text-muted-foreground">Último contacto</dt>
            <dd>
              {estadoDeVenta.value.ultimoContactoAt ? (
                <FechaDeLaOrg iso={estadoDeVenta.value.ultimoContactoAt} />
              ) : (
                TEXTO_SIN_CONTACTAR
              )}
            </dd>
          </dl>

          {siguiente ? (
            <Button
              type="button"
              size="sm"
              disabled={ocupado}
              data-accion="marcar-avance"
              onClick={() => alMarcarAvance(local.etapa)}
            >
              {`Marcar como ${ETIQUETA_DEL_EVENTO[siguiente]}`}
            </Button>
          ) : null}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Responsable</span>
            <select
              name="responsable"
              value={local.responsable?.userId ?? ""}
              disabled={ocupado}
              onChange={(evento) => alAsignarResponsable(evento.target.value || null)}
              className="h-9 rounded-[10px] border border-input bg-background px-3 text-sm"
            >
              <option value="">{TEXTO_SIN_RESPONSABLE}</option>
              {equipo.map((persona) => (
                <option key={persona.userId} value={persona.userId}>
                  {persona.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Notas</h3>
        {notas.state !== "medido" ? (
          <AvisoDeEstado estado={notas.state} reason={notas.reason} que="Notas" />
        ) : null}
        {tieneValor(notas) && local ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(evento) => {
              evento.preventDefault();
              alAgregarNota();
            }}
          >
            <Textarea
              name="texto"
              value={borradorDeNota}
              disabled={ocupado}
              onChange={(evento) => alCambiarBorrador(evento.target.value)}
              placeholder="Escribí una nota"
              aria-label="Nota"
            />
            <Button type="submit" size="sm" variant="outline" disabled={ocupado} className="self-start">
              Agregar nota
            </Button>
          </form>
        ) : null}
        {tieneValor(notas) ? (
          <ul className="flex flex-col gap-2 text-sm">
            {(local?.notasLocales ?? []).map((nota) => (
              <li key={nota.id} data-nota={nota.id} className="rounded-lg border border-border px-3 py-2">
                <p>{nota.texto}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">Nota de ejemplo</Badge>
                  <FechaDeLaOrg iso={nota.creadaAt} />
                </p>
              </li>
            ))}
            {notas.value.map((nota) => (
              <li key={nota.id} data-nota={nota.id} className="rounded-lg border border-border px-3 py-2">
                <p>{nota.texto}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {nota.autor ? `${nota.autor.nombre} · ` : null}
                  <FechaDeLaOrg iso={nota.creadaAt} />
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

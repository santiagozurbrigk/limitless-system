"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Label } from "@ai-coo/ui";
import { crearLanzamientoAction, guardarLanzamientoAction } from "@/app/lanzamientos/webinar-actions";
import { correrMutacion } from "@/lib/client/correr-accion";
import { ETIQUETA_DE_VARIANTE } from "@/lib/webinar/inicio/presentacion";
import { MAXIMO_DE_SESIONES, VARIANTES } from "@/lib/webinar/lanzamientos/esquemas";
import {
  SESION_VACIA,
  datosDesdeElFormulario,
  type CamposDeSesion,
  type CamposDelLanzamiento,
} from "@/lib/webinar/lanzamientos/formulario";
import { useToast } from "@/providers/toast-provider";

/**
 * ⭐ Crear o editar un lanzamiento de Limitless Webinars (SCRUM-529): nombre,
 * variante, oferta, fechas de captación y cierre, y sesiones (con el ID del
 * webinar de Zoom y el minuto de la oferta). Llama a las acciones **simuladas**:
 * con éxito avisa que el cambio es de ejemplo y no se guardó, como la ficha del
 * lead (SCRUM-545); con error, `correrMutacion` avisa con el motivo.
 */
export function FormularioDelLanzamiento({
  modo,
  launchId,
  inicial,
}: {
  modo: "crear" | "editar";
  /** Sólo para editar. */
  launchId?: string;
  inicial: CamposDelLanzamiento;
}) {
  const [campos, setCampos] = useState<CamposDelLanzamiento>(inicial);
  const [guardadoDeEjemplo, setGuardadoDeEjemplo] = useState(false);
  const [ocupado, startTransition] = useTransition();
  const { push } = useToast();

  function cambiar<K extends keyof CamposDelLanzamiento>(campo: K, valor: CamposDelLanzamiento[K]) {
    setGuardadoDeEjemplo(false);
    setCampos((previo) => ({ ...previo, [campo]: valor }));
  }

  function cambiarSesion(indice: number, campo: keyof CamposDeSesion, valor: string) {
    cambiar(
      "sesiones",
      campos.sesiones.map((s, i) => (i === indice ? { ...s, [campo]: valor } : s))
    );
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const datos = datosDesdeElFormulario(campos);
    startTransition(() =>
      correrMutacion({
        accion: () =>
          modo === "crear" || !launchId
            ? crearLanzamientoAction(datos)
            : guardarLanzamientoAction({ launchId, datos }),
        avisar: push,
        tituloError: modo === "crear" ? "No se pudo crear el lanzamiento" : "No se pudo guardar el lanzamiento",
        etiqueta: `[FormularioDelLanzamiento] ${modo}`,
        alExito: () => setGuardadoDeEjemplo(true),
      })
    );
  }

  return (
    <form onSubmit={enviar} data-formulario={modo} className="flex max-w-2xl flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="nombre">Nombre</Label>
          <Input id="nombre" value={campos.nombre} onChange={(e) => cambiar("nombre", e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="variante">Variante</Label>
          <select
            id="variante"
            value={campos.variante}
            onChange={(e) => cambiar("variante", e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {VARIANTES.map((v) => (
              <option key={v} value={v}>
                {ETIQUETA_DE_VARIANTE[v]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-[5rem_1fr] gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="moneda">Moneda</Label>
            <Input id="moneda" value={campos.moneda} maxLength={3} onChange={(e) => cambiar("moneda", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="precio">Precio de la oferta</Label>
            <Input
              id="precio"
              inputMode="decimal"
              value={campos.precioDeLaOferta}
              onChange={(e) => cambiar("precioDeLaOferta", e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="capta-desde">Captación desde</Label>
          <Input id="capta-desde" type="date" value={campos.captaDesde} onChange={(e) => cambiar("captaDesde", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cierra-el">Cierre</Label>
          <Input id="cierra-el" type="date" value={campos.cierraEl} onChange={(e) => cambiar("cierraEl", e.target.value)} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Sesiones</legend>
        {campos.sesiones.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay sesiones.</p>
        ) : null}
        {campos.sesiones.map((sesion, i) => (
          <div key={i} data-sesion-formulario={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_8rem_auto]">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`sesion-${i}-inicio`}>Fecha y hora</Label>
              <Input
                id={`sesion-${i}-inicio`}
                type="datetime-local"
                value={sesion.empiezaAt}
                onChange={(e) => cambiarSesion(i, "empiezaAt", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`sesion-${i}-zoom`}>ID del webinar de Zoom</Label>
              <Input id={`sesion-${i}-zoom`} value={sesion.zoomWebinarId} onChange={(e) => cambiarSesion(i, "zoomWebinarId", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`sesion-${i}-oferta`}>Minuto de la oferta</Label>
              <Input
                id={`sesion-${i}-oferta`}
                inputMode="decimal"
                value={sesion.minutoDeLaOferta}
                onChange={(e) => cambiarSesion(i, "minutoDeLaOferta", e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-end"
              aria-label={`Quitar la sesión ${i + 1}`}
              onClick={() => cambiar("sesiones", campos.sesiones.filter((_, j) => j !== i))}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
        {campos.sesiones.length < MAXIMO_DE_SESIONES ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => cambiar("sesiones", [...campos.sesiones, { ...SESION_VACIA }])}
          >
            <Plus aria-hidden="true" />
            Agregar sesión
          </Button>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={ocupado} data-accion="guardar-lanzamiento">
          {modo === "crear" ? "Crear lanzamiento" : "Guardar cambios"}
        </Button>
        {guardadoDeEjemplo ? (
          <p role="status" className="text-sm text-warning">
            Cambio de ejemplo: no se guardó y se pierde al recargar.
          </p>
        ) : null}
      </div>
    </form>
  );
}

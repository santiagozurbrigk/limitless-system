"use client";

/**
 * Los clientes del cliente, cada uno con su Marketing, Ventas y Sistemas.
 *
 * ⭐ Sólo con el add-on `growth_partners`. El cliente de Limitless es un growth
 * partner que trabaja con varios infoproductores a la vez, y el avatar, la
 * oferta o el GHL son del negocio de cada infoproductor, no del partner.
 *
 * ⭐ A propósito, es poco: un nombre y un link. El pedido fue "algo simple, que
 * pongan el nombre del cliente de su cliente y listo". Lo que se carga de cada
 * uno son las mismas columnas de Campos personalizados que antes se cargaban en
 * el cliente.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Input, cn } from "@ai-coo/ui";
import { ArrowRight, ExternalLink, Loader2, Pencil, Plus, Trash2, Users } from "lucide-react";
import {
  createSubClientAction,
  deleteSubClientAction,
  listSubClientsAction,
  moveLegacySectionValuesAction,
  updateSubClientAction,
  updateSubClientFieldsAction,
} from "@/app/clients/sub-client-actions";
import { ACCION_DE_FILA, FichaCard } from "@/components/clients/ficha-section";
import { SectionFieldsPanel } from "@/components/clients/section-fields-panel";
import { SubClientOnboarding } from "@/components/clients/sub-client-onboarding";
import { instagramLabel, legacySectionValues, type SubClient } from "@/lib/clients/sub-clients";
import { usePlatformData } from "@/providers";
import { useToast } from "@/providers/toast-provider";
import {
  correrMutacion,
  falloInesperado,
  leerConMotivo,
  type Lectura,
} from "@/lib/client/correr-accion";
import { AvisoDeLecturaFallida } from "@/components/shared/aviso-de-lectura-fallida";
import type { Client } from "@/types/clients";
import type { CustomFieldValues, FieldDefinition } from "@/types/custom-fields";

type Borrador = { name: string; instagramUrl: string };

/** El formulario de nombre + link, para agregar y para corregir. */
function FormularioDeCliente({
  inicial,
  textoBoton,
  onSubmit,
  onCancel,
}: {
  inicial: Borrador;
  textoBoton: string;
  onSubmit: (borrador: Borrador) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [borrador, setBorrador] = useState(inicial);
  const [saving, setSaving] = useState(false);

  const enviar = async () => {
    if (!borrador.name.trim() || saving) return;
    setSaving(true);
    const ok = await onSubmit(borrador);
    setSaving(false);
    if (ok) onCancel();
  };

  return (
    <form
      className="space-y-2 rounded-lg border border-border/60 p-2.5 dark:border-white/[0.08]"
      onSubmit={(event) => {
        event.preventDefault();
        void enviar();
      }}
    >
      <Input
        autoFocus
        placeholder="Nombre del cliente"
        value={borrador.name}
        maxLength={200}
        onChange={(event) => setBorrador((b) => ({ ...b, name: event.target.value }))}
      />
      <Input
        placeholder="Instagram: @usuario o link (opcional)"
        value={borrador.instagramUrl}
        maxLength={500}
        onChange={(event) => setBorrador((b) => ({ ...b, instagramUrl: event.target.value }))}
      />
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="sm" variant="ghost" className={ACCION_DE_FILA} onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={saving || !borrador.name.trim()}>
          {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          {textoBoton}
        </Button>
      </div>
    </form>
  );
}

/**
 * Los clientes del cliente, o el motivo si no se pudieron leer (SCRUM-516).
 * Antes una falla se mostraba como "Todavía no cargaste clientes".
 */
export function cargarSubClientes(clientId: string): Promise<Lectura<SubClient[]>> {
  return leerConMotivo(() => listSubClientsAction(clientId), "[ClientSubClientsCard] listar");
}

/**
 * Guarda Marketing, Ventas y Sistemas de un sub-cliente. Devuelve los valores
 * guardados o el motivo para el panel: el que devolvió la acción o, si lanzó,
 * el texto fijo (nunca el párrafo técnico de Next).
 */
export async function guardarCamposDelSubCliente(
  id: string,
  values: CustomFieldValues
): Promise<{ ok: true; data: CustomFieldValues } | { ok: false; motivo: string }> {
  try {
    const result = await updateSubClientFieldsAction({ id, values });
    return result.success ? { ok: true, data: result.data } : { ok: false, motivo: result.error };
  } catch (error) {
    return { ok: false, motivo: falloInesperado("[ClientSubClientsCard] guardar campos", error) };
  }
}

export function ClientSubClientsCard({
  client,
  fields,
}: {
  client: Client;
  /** Las columnas activas del cliente. Se usan las que tienen sección. */
  fields: FieldDefinition[];
}) {
  const { refreshClients } = usePlatformData();
  const { push } = useToast();
  const [subClients, setSubClients] = useState<SubClient[] | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modo, setModo] = useState<"nada" | "agregar" | "editar">("nada");
  const [moviendo, setMoviendo] = useState(false);

  const cargar = useCallback(async () => {
    const lectura = await cargarSubClientes(client.id);
    if (!lectura.ok) {
      setMotivo(lectura.motivo);
      return;
    }
    const lista = lectura.data;
    setMotivo(null);
    setSubClients(lista);
    setSelectedId((actual) =>
      actual && lista.some((s) => s.id === actual) ? actual : (lista[0]?.id ?? null)
    );
  }, [client.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const sectionFields = fields.filter((field) => field.section !== null);
  /*
    ⭐ Lo que quedó cargado en el growth partner, de antes de que existieran sus
    clientes. No se muestra como si fuera de él: se ofrece pasarlo a uno.
  */
  const pendientes = Object.keys(legacySectionValues(sectionFields, client.custom)).length;

  if (subClients === null) {
    return motivo ? (
      <FichaCard icon={Users} title="Clientes">
        <AvisoDeLecturaFallida titulo="No se pudieron cargar los clientes." motivo={motivo} />
      </FichaCard>
    ) : null;
  }

  const selected = subClients.find((s) => s.id === selectedId) ?? null;

  const agregar = async ({ name, instagramUrl }: Borrador) => {
    let ok = false;
    await correrMutacion({
      accion: () => createSubClientAction({ clientId: client.id, name, instagramUrl }),
      alExito: (nuevo) => {
        ok = true;
        setSubClients((lista) => [...(lista ?? []), nuevo]);
        setSelectedId(nuevo.id);
      },
      avisar: push,
      tituloError: "No se pudo agregar",
      etiqueta: "[ClientSubClientsCard] agregar",
    });
    return ok;
  };

  const corregir = async ({ name, instagramUrl }: Borrador) => {
    if (!selected) return false;
    let ok = false;
    await correrMutacion({
      accion: () => updateSubClientAction({ id: selected.id, name, instagramUrl }),
      alExito: (guardado) => {
        ok = true;
        setSubClients((lista) =>
          (lista ?? []).map((s) => (s.id === guardado.id ? guardado : s))
        );
      },
      avisar: push,
      tituloError: "No se pudo guardar",
      etiqueta: "[ClientSubClientsCard] corregir",
    });
    return ok;
  };

  const borrar = async () => {
    if (!selected) return;
    if (
      !window.confirm(
        `¿Borrar a ${selected.name}? Se pierde todo lo cargado de su Marketing, Ventas y Sistemas.`
      )
    ) {
      return;
    }
    await correrMutacion({
      accion: () => deleteSubClientAction(selected.id),
      alExito: () => {
        const resto = subClients.filter((s) => s.id !== selected.id);
        setSubClients(resto);
        setSelectedId(resto[0]?.id ?? null);
      },
      avisar: push,
      tituloError: "No se pudo borrar",
      etiqueta: "[ClientSubClientsCard] borrar",
    });
  };

  const pasarDatos = async () => {
    if (!selected) return;
    setMoviendo(true);
    await correrMutacion({
      accion: () =>
        moveLegacySectionValuesAction({
          clientId: client.id,
          subClientId: selected.id,
        }),
      alExito: async ({ moved, kept }) => {
        await Promise.all([cargar(), refreshClients()]);
        push({
          title:
            moved === 0 ? "No se pasó ningún dato" : moved === 1 ? "1 dato pasado" : `${moved} datos pasados`,
          description:
            kept > 0
              ? `${kept} no se pasaron porque ${selected.name} ya los tenía cargados. Siguen disponibles para otro cliente.`
              : undefined,
          variant: "success",
        });
      },
      avisar: push,
      tituloError: "No se pudieron pasar",
      etiqueta: "[ClientSubClientsCard] pasar datos",
    });
    setMoviendo(false);
  };

  return (
    <FichaCard
      icon={Users}
      title="Clientes"
      meta={subClients.length > 0 ? subClients.length : undefined}
      action={
        modo === "agregar" ? null : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setModo("agregar")}
          >
            <Plus className="h-3 w-3" />
            Agregar
          </Button>
        )
      }
    >
      <div className="space-y-3">
        {motivo ? (
          <AvisoDeLecturaFallida titulo="No se pudieron recargar los clientes." motivo={motivo} />
        ) : null}
        {modo === "agregar" ? (
          <FormularioDeCliente
            inicial={{ name: "", instagramUrl: "" }}
            textoBoton="Agregar"
            onSubmit={agregar}
            onCancel={() => setModo("nada")}
          />
        ) : null}

        {subClients.length === 0 && modo !== "agregar" ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Todavía no cargaste clientes de {client.name}. Agregá el primero para
            completar su Marketing, Ventas y Sistemas.
          </p>
        ) : null}

        {/* Uno por botón: con varios se elige de quién se está viendo la info. */}
        {subClients.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {subClients.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => {
                  setSelectedId(sub.id);
                  if (modo === "editar") setModo("nada");
                }}
                className={cn(
                  "max-w-full truncate rounded-full border px-2.5 py-1 text-xs transition-colors",
                  sub.id === selectedId
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground dark:border-white/[0.08]"
                )}
              >
                {sub.name}
              </button>
            ))}
          </div>
        ) : null}

        {pendientes > 0 ? (
          <div className="space-y-2 rounded-lg border border-dashed border-border p-2.5 text-xs leading-relaxed text-muted-foreground dark:border-white/[0.12]">
            <p>
              {pendientes === 1
                ? "Hay 1 dato de Marketing, Ventas y Sistemas"
                : `Hay ${pendientes} datos de Marketing, Ventas y Sistemas`}{" "}
              cargados en {client.name} de antes de que existieran sus clientes.
              {selected ? null : " Agregá un cliente para pasárselos."}
            </p>
            {selected ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={pasarDatos}
                disabled={moviendo}
              >
                {moviendo ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ArrowRight className="h-3 w-3" />
                )}
                <span className="truncate">Pasarlos a {selected.name}</span>
              </Button>
            ) : null}
          </div>
        ) : null}

        {selected ? (
          <div className="space-y-3 border-t border-border/50 pt-3 dark:border-white/[0.06]">
            {modo === "editar" ? (
              <FormularioDeCliente
                key={selected.id}
                inicial={{ name: selected.name, instagramUrl: selected.instagramUrl ?? "" }}
                textoBoton="Guardar"
                onSubmit={corregir}
                onCancel={() => setModo("nada")}
              />
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selected.name}</p>
                  {selected.instagramUrl ? (
                    <a
                      href={selected.instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
                      title={selected.instagramUrl}
                    >
                      <span className="truncate">{instagramLabel(selected.instagramUrl)}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={cn(ACCION_DE_FILA, "h-7 w-7 p-0")}
                    title="Cambiar nombre o link"
                    onClick={() => setModo("editar")}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={cn(ACCION_DE_FILA, "h-7 w-7 p-0")}
                    title={`Borrar a ${selected.name}`}
                    onClick={borrar}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            <SubClientOnboarding
              key={`onboarding-${selected.id}`}
              subClient={selected}
              fields={sectionFields}
              onSubmissionSeen={() => void cargar()}
            />

            <SectionFieldsPanel
              key={selected.id}
              fields={sectionFields}
              values={selected.custom}
              onSave={async (values) => {
                const guardado = await guardarCamposDelSubCliente(selected.id, values);
                if (!guardado.ok) return guardado.motivo;
                setSubClients((lista) =>
                  (lista ?? []).map((s) =>
                    s.id === selected.id ? { ...s, custom: guardado.data } : s
                  )
                );
                return null;
              }}
            />
          </div>
        ) : null}
      </div>
    </FichaCard>
  );
}

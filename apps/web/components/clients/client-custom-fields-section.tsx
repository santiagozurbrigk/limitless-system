"use client";

/**
 * Las columnas configurables del cliente, en su ficha.
 *
 * ⭐ Acá vive el "Objetivo general" de las correcciones: una lista compartida
 * por toda la organización en vez de texto libre, para que el sistema pueda
 * responder "¿quiénes van a 50k?". La lista se configura en Campos
 * personalizados; esta pantalla sólo la carga.
 *
 * Si la organización no configuró ninguna columna de cliente, la sección **no se
 * muestra**: mandar a configurar algo desde la ficha de un cliente sería ruido,
 * y el lugar para configurarlo es su propia pantalla.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@ai-coo/ui";
import { ListChecks } from "lucide-react";
import { FichaCard } from "@/components/clients/ficha-section";
import { useToast } from "@/providers/toast-provider";
import { correrMutacion, leerConMotivo, type Aviso } from "@/lib/client/correr-accion";
import { usePlatformData } from "@/providers";
import {
  listClientFieldDefinitionsAction,
  updateClientCustomFieldsAction,
} from "@/app/clients/client-custom-fields-actions";
import { FieldValueInput } from "@/components/clients/custom-fields/field-value-input";
import { FieldValueCell } from "@/components/clients/custom-fields/field-value-cell";
import { activeFields, fieldsForValues, hasValue } from "@/lib/custom-fields";
import type { CustomFieldValues, FieldDefinition } from "@/types/custom-fields";
import type { Client } from "@/types/clients";

/**
 * Las columnas configurables de cliente (SCRUM-517): el dato o el motivo. Antes
 * una falla se veía como "la organización no tiene columnas" y la tarjeta
 * desaparecía sin decir nada.
 */
export function cargarColumnasDelCliente() {
  return leerConMotivo(listClientFieldDefinitionsAction, "[ClientCustomFields] columnas");
}

/**
 * Guarda los campos de un cliente (SCRUM-517): el motivo de un rechazo se
 * avisa; si la acción lanzó, el texto fijo. Con éxito, `alGuardar` con lo
 * guardado.
 */
export function guardarCamposDelCliente(
  clientId: string,
  values: CustomFieldValues,
  avisar: (aviso: Aviso) => void,
  alGuardar: (guardado: CustomFieldValues) => Promise<void>
): Promise<void> {
  return correrMutacion({
    accion: () => updateClientCustomFieldsAction({ clientId, values }),
    avisar,
    tituloError: "No se pudo guardar",
    etiqueta: "[ClientCustomFields] guardar",
    alExito: async (guardado) => {
      await alGuardar(guardado);
      avisar({ title: "Datos del cliente guardados", variant: "success" });
    },
  });
}

/**
 * `columnas` las lee una sola vez la ficha (`cargarColumnasDelCliente`) y las
 * comparte con la tarjeta de secciones: `null` mientras cargan o si no se
 * pudieron leer. En ese caso la ficha muestra un solo aviso con el motivo y
 * esta tarjeta no se dibuja (SCRUM-517).
 */
export function ClientCustomFieldsSection({
  client,
  columnas,
}: {
  client: Client;
  columnas: FieldDefinition[] | null;
}) {
  const { push } = useToast();
  const { refreshClients } = usePlatformData();

  const [draft, setDraft] = useState<CustomFieldValues>(client.custom ?? {});
  const [pending, startTransition] = useTransition();
  const fields = useMemo(() => columnas ?? [], [columnas]);

  // El borrador se resincroniza si el cliente cambia por fuera (otra pestaña,
  // un refresco del provider). Sin esto, quedaría mostrando lo viejo.
  useEffect(() => {
    setDraft(client.custom ?? {});
  }, [client.custom]);

  /** Las columnas que se ofrecen para cargar. */
  /**
   * ⭐ Sólo las columnas **sin sección**. Las de Marketing, Ventas y Sistemas
   * viven en su propia tarjeta con solapas: mostrarlas también acá las pondría
   * dos veces en la misma pantalla, editables desde dos lugares.
   */
  const offered = useMemo(
    () => activeFields(fields).filter((field) => field.section === null),
    [fields]
  );

  /**
   * Las archivadas que este cliente igual tiene cargadas. Se muestran de sólo
   * lectura: la columna dejó de ofrecerse, pero el dato sigue siendo cierto y
   * esconderlo sería borrarlo de la vista sin que nadie lo decida.
   */
  const archivedWithValue = useMemo(
    () =>
      fieldsForValues(fields, client.custom).filter(
        (field) => field.archivedAt !== null
      ),
    [fields, client.custom]
  );

  const dirty = useMemo(() => {
    const saved = client.custom ?? {};
    const keys = new Set([...Object.keys(saved), ...Object.keys(draft)]);
    for (const key of keys) {
      if (JSON.stringify(saved[key] ?? null) !== JSON.stringify(draft[key] ?? null)) {
        return true;
      }
    }
    return false;
  }, [client.custom, draft]);

  if (columnas === null || (offered.length === 0 && archivedWithValue.length === 0)) {
    return null;
  }

  function save() {
    startTransition(() =>
      guardarCamposDelCliente(client.id, draft, push, async (guardado) => {
        setDraft(guardado);
        await refreshClients();
      })
    );
  }

  return (
    <FichaCard
      icon={ListChecks}
      title="Datos del cliente"
      action={
        dirty ? (
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        ) : null
      }
    >
      <div className="space-y-4">
        {offered.map((field) => (
          <FieldValueInput
            key={field.id}
            field={field}
            value={draft[field.key]}
            onChange={(value) =>
              setDraft((current) => ({ ...current, [field.key]: value }))
            }
          />
        ))}

        {archivedWithValue.length > 0 ? (
          <div className="space-y-2 border-t border-border/60 pt-4">
            <p className="text-xs text-muted-foreground">
              Columnas archivadas que este cliente tiene cargadas. No se editan,
              y se conservan al guardar.
            </p>
            {archivedWithValue.map((field) =>
              hasValue(client.custom?.[field.key]) ? (
                <div key={field.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{field.label}:</span>
                  <FieldValueCell field={field} value={client.custom?.[field.key]} />
                </div>
              ) : null
            )}
          </div>
        ) : null}
      </div>
    </FichaCard>
  );
}

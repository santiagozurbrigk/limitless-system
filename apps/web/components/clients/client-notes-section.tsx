"use client";

/**
 * ⭐ El cuaderno del cliente.
 *
 * Un campo de texto libre para lo que no entra en ningún otro lado: que tiene
 * dos hijos, que su socio decide, que odia las llamadas de los lunes. Nada de
 * eso cabe en un campo estructurado y todo eso cambia cómo se le habla.
 *
 * Se guarda a mano, no solo. Un guardado automático mientras alguien escribe
 * pisa la nota de otro que la abrió al mismo tiempo, y acá lo que se pierde es
 * contexto que costó meses juntar.
 */

import { useEffect, useState, useTransition } from "react";
import { Button, GlassPanel, Textarea } from "@ai-coo/ui";
import { NotebookPen } from "lucide-react";
import { useToast } from "@/providers/toast-provider";
import { updateClientNotesAction } from "@/app/clients/tracking-actions";
import { correrMutacion, type Aviso } from "@/lib/client/correr-accion";

/**
 * Guarda las notas (SCRUM-517): el motivo de un rechazo se avisa; si la acción
 * lanzó, el texto fijo. Con éxito, `alGuardar` con la fecha de la edición.
 */
export function guardarNotas(
  clientId: string,
  notas: string,
  avisar: (aviso: Aviso) => void,
  alGuardar: (updatedAt: string | null) => void
): Promise<void> {
  return correrMutacion({
    accion: () => updateClientNotesAction(clientId, notas),
    avisar,
    tituloError: "No se pudieron guardar las notas",
    etiqueta: "[ClientNotes] guardar",
    alExito: (data) => {
      alGuardar(data.updatedAt);
      avisar({ title: "Notas guardadas", variant: "success" });
    },
  });
}

export function ClientNotesSection({
  clientId,
  initialNotes,
  initialUpdatedAt,
}: {
  clientId: string;
  initialNotes: string | null;
  initialUpdatedAt: string | null;
}) {
  const { push } = useToast();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(initialNotes ?? "");
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);

  useEffect(() => {
    setValue(initialNotes ?? "");
    setUpdatedAt(initialUpdatedAt);
  }, [initialNotes, initialUpdatedAt]);

  const guardado = (initialNotes ?? "").trim();
  const sucio = value.trim() !== guardado;

  function guardar() {
    startTransition(() => guardarNotas(clientId, value, push, setUpdatedAt));
  }

  return (
    <GlassPanel className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <NotebookPen className="h-4 w-4 text-muted-foreground" />
          Notas
        </h3>
        {updatedAt ? (
          <span className="text-xs text-muted-foreground">
            última edición el{" "}
            {new Date(updatedAt).toLocaleDateString("es-AR", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        ) : null}
      </div>

      <Textarea
        rows={5}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Lo que no entra en ningún campo: su contexto, sus manías, quién decide de verdad, qué le prometiste."
      />

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!sucio || pending} onClick={guardar}>
          {pending ? "Guardando…" : "Guardar notas"}
        </Button>
        {sucio ? (
          <span className="text-xs text-muted-foreground">Hay cambios sin guardar</span>
        ) : null}
      </div>
    </GlassPanel>
  );
}

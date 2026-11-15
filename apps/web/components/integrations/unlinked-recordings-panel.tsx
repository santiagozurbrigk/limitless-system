"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Link2, Unlink } from "lucide-react";
import { Badge, Button } from "@ai-coo/ui";
import {
  linkRecordingToAppointmentAction,
  listLinkableAppointmentsAction,
  type LinkableAppointment,
  type UnlinkedRecording,
} from "@/app/fathom/sales-call-actions";
import { useToast } from "@/providers/toast-provider";
import { esRechazoPorModulo, type RechazoPorModulo } from "@/lib/auth/regla-de-modulo";
import { SinAcceso } from "@/components/platform/sin-acceso";
import { getPermissionModuleLabel } from "@/constants/permission-modules";

/**
 * Grabaciones que no quedaron asociadas a ningún turno de venta.
 *
 * ⭐ **Que una grabación esté acá no significa que algo esté mal.** Limitless registra
 * únicamente llamadas de venta; una reunión de equipo o una sesión con un
 * cliente aparece en esta lista porque no es una venta, y eso es correcto.
 *
 * Lo que la lista resuelve es el caso contrario: una llamada de venta real que
 * no llegó a cruzar —porque el turno todavía no tenía el mail del lead, o porque
 * la grabación arrancó lejos del horario—. Ahí se vincula a mano.
 */

const REASON_TEXT: Record<string, string> = {
  no_candidates: "No había turnos agendados cerca de este horario.",
  outside_window: "Hay turnos ese día, pero ninguno cerca de este horario.",
  ambiguous: "Varios turnos posibles a la misma hora: no se puede elegir solo.",
  no_recording_time: "La grabación no trae hora de inicio.",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "Sin fecha";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RecordingRow({
  recording,
  onRechazo,
}: {
  recording: UnlinkedRecording;
  onRechazo: (rechazo: RechazoPorModulo) => void;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [isPending, startTransition] = useTransition();
  const [options, setOptions] = useState<LinkableAppointment[] | null>(null);
  const [linked, setLinked] = useState(false);

  function handleOpen() {
    startTransition(async () => {
      const r = await listLinkableAppointmentsAction(recording.id);
      if (esRechazoPorModulo(r)) {
        onRechazo(r);
        return;
      }
      setOptions(r);
    });
  }

  function handleLink(appointmentId: string) {
    startTransition(async () => {
      const result = await linkRecordingToAppointmentAction({
        recordingId: recording.id,
        appointmentId,
      });
      if (!result.ok) {
        push({ title: "No se pudo vincular", description: result.error });
        return;
      }
      setLinked(true);
      router.refresh();
    });
  }

  if (linked) return null;

  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{recording.title}</p>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(recording.callDate)}
          </p>
        </div>
        {recording.fathomUrl && (
          <a
            href={recording.fathomUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Ver en Fathom
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {recording.noMatchReason && REASON_TEXT[recording.noMatchReason] && (
        <p className="text-xs text-muted-foreground">
          {REASON_TEXT[recording.noMatchReason]}
        </p>
      )}

      {recording.participantEmails.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {recording.participantEmails.slice(0, 4).map((email) => (
            <Badge key={email} variant="outline" className="text-[10px]">
              {email}
            </Badge>
          ))}
        </div>
      )}

      {options === null ? (
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={handleOpen}
          >
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            Vincular a un turno
          </Button>
        </div>
      ) : options.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No hay turnos agendados dentro de las 24 horas de esta grabación.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={isPending}
              onClick={() => handleLink(option.id)}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50 disabled:opacity-50"
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {option.leadName}
                {option.leadEmail ? (
                  <span className="ml-2 font-normal text-muted-foreground">
                    {option.leadEmail}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {formatDateTime(option.scheduledAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function UnlinkedRecordingsPanel({
  recordings,
}: {
  recordings: UnlinkedRecording[];
}) {
  const [rechazo, setRechazo] = useState<RechazoPorModulo | null>(null);

  // Sin Integraciones la lectura de turnos de una fila vuelve rechazada: pasa si
  // los permisos cambian con la pantalla abierta (SCRUM-541). Corta el panel
  // entero: las otras filas también muestran datos.
  if (rechazo) {
    return <SinAcceso moduleLabel={getPermissionModuleLabel(rechazo.moduleId)} />;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Unlink className="h-3.5 w-3.5 text-primary" aria-hidden />
        <h4 className="text-xs font-semibold">Grabaciones sin turno</h4>
        {recordings.length > 0 ? (
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {recordings.length}
          </Badge>
        ) : null}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Estar en esta lista no es un problema: una reunión de equipo o una
        sesión con un cliente no es una venta. Vinculá sólo las llamadas de
        venta que no llegaron a cruzarse solas.
      </p>

      {recordings.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Todas las grabaciones procesadas están asociadas a su turno.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
          {recordings.map((recording) => (
            <RecordingRow
              key={recording.id}
              recording={recording}
              onRechazo={setRechazo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

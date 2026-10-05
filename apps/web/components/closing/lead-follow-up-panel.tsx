"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronDown, ChevronRight, Flame, Snowflake } from "lucide-react";
import { Badge, Button, cn, Textarea } from "@ai-coo/ui";
import {
  setLeadQualificationAction,
  setNextActionAction,
  type LeadSummary,
} from "@/app/sales/lead-actions";
import {
  LEAD_THREAD_STATE_LABEL,
  type LeadQualification,
  type LeadThreadState,
  type NextAction,
} from "@/lib/sales/lead-thread";
import { CLOSING_CALL_STATUS_LABEL } from "@/lib/closing/call-status";
import { CampoFecha } from "@/components/shared/campo-fecha";
import { fechaAInstanteLocal, formatearFechaGuardada } from "@/lib/fechas/calendario";
import { fechaPropuestaDelProximoPaso } from "@/lib/sales/follow-up-options";
import { useToast } from "@/providers/toast-provider";

/**
 * Seguimiento de leads: qué pasó con cada uno y qué sigue.
 *
 * ⭐ **Es la pantalla que faltaba.** De 1.027 turnos, cero tenían resultado
 * cargado — no porque nadie trabajara, sino porque después de una llamada que no
 * cerraba **no había dónde anotar qué seguía**. El lead se perdía ahí.
 *
 * Muestra sólo los tres casos que son trabajo real, ordenados por urgencia:
 * un seguimiento vencido pesa más que un resultado sin cargar, y ambos pesan
 * más que un lead que nadie retomó.
 */

const STATE_VARIANT: Record<
  LeadThreadState,
  "default" | "success" | "warning" | "destructive" | "secondary"
> = {
  follow_up_due: "destructive",
  pending_outcome: "warning",
  stalled: "warning",
  scheduled: "default",
  follow_up_planned: "secondary",
  won: "success",
  lost: "secondary",
};

const NEXT_ACTION_LABEL: Record<NextAction, string> = {
  reschedule: "Reagendar",
  follow_up: "Hacer seguimiento",
  waiting_lead: "Esperando al lead",
  lost: "Dar por perdido",
};

const QUALIFICATION_LABEL: Record<LeadQualification, string> = {
  hot: "Caliente",
  warm: "Tibio",
  cold: "Frío",
  unqualified: "No calificado",
};

const QUALIFICATIONS: LeadQualification[] = ["hot", "warm", "cold", "unqualified"];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * La fecha del próximo paso, sin hora: es una fecha elegida (ver
 * `lead-detail-drawer.tsx`). Se lee igual que la celda de la tabla.
 */
function formatearFechaDelPaso(valor: string | null): string {
  return formatearFechaGuardada(valor, { day: "2-digit", month: "short" }) ?? "—";
}

function LeadRow({ lead }: { lead: LeadSummary }) {
  const router = useRouter();
  const { push } = useToast();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<NextAction | "">("");
  const [date, setDate] = useState(fechaPropuestaDelProximoPaso);
  const [notes, setNotes] = useState("");
  const [resolved, setResolved] = useState(false);

  const target = lead.thread.actionableAttemptId;
  const latest = lead.thread.attempts[0];

  function handleSave() {
    if (!target || !action) return;
    startTransition(async () => {
      const result = await setNextActionAction({
        callId: target,
        nextAction: action,
        // `lost` cierra el hilo, así que no necesita fecha. La fecha se guarda
        // al mediodía local: a medianoche UTC caía el día anterior en Argentina.
        // Sin fecha va null y el servidor responde que el paso la necesita.
        nextActionAt: action === "lost" ? null : date ? fechaAInstanteLocal(date) : null,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        push({ title: "No se pudo guardar", description: result.error });
        return;
      }
      setResolved(true);
      router.refresh();
    });
  }

  function handleQualify(qualification: LeadQualification) {
    if (!target) return;
    startTransition(async () => {
      const result = await setLeadQualificationAction({
        callId: target,
        moment: "post",
        qualification,
      });
      if (!result.ok) {
        push({ title: "No se pudo calificar", description: result.error });
        return;
      }
      router.refresh();
    });
  }

  if (resolved) return null;

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{lead.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {latest ? formatDate(latest.scheduledAt) : "Sin turnos"}
            {lead.thread.attemptCount > 1
              ? ` · ${lead.thread.attemptCount} turnos`
              : ""}
            {lead.email ? ` · ${lead.email}` : ""}
          </p>
        </div>

        {lead.thread.latestQualification && (
          <Badge variant="outline" className="hidden shrink-0 text-[10px] sm:inline-flex">
            {QUALIFICATION_LABEL[lead.thread.latestQualification]}
          </Badge>
        )}
        <Badge variant={STATE_VARIANT[lead.thread.state]} className="shrink-0 text-[10px]">
          {LEAD_THREAD_STATE_LABEL[lead.thread.state]}
        </Badge>
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-border bg-muted/20 px-4 py-4">
          {/* Hilo de intentos: los reagendamientos, en orden. */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Historial
            </p>
            {lead.thread.attempts.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs"
              >
                <span className="font-medium">{formatDate(a.scheduledAt)}</span>
                <Badge variant="outline" className="text-[10px]">
                  {CLOSING_CALL_STATUS_LABEL[a.status]}
                </Badge>
                {a.nextAction && (
                  <span className="text-muted-foreground">
                    → {NEXT_ACTION_LABEL[a.nextAction]}
                    {a.nextActionAt ? ` · ${formatearFechaDelPaso(a.nextActionAt)}` : ""}
                  </span>
                )}
              </div>
            ))}
          </div>

          {target && (
            <>
              {/* Calificación posterior a la llamada. */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Calificación
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUALIFICATIONS.map((q) => (
                    <Button
                      key={q}
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => handleQualify(q)}
                      className={cn(
                        "h-7 text-xs",
                        lead.thread.latestQualification === q && "border-primary text-primary"
                      )}
                    >
                      {q === "hot" && <Flame className="mr-1 h-3 w-3" />}
                      {q === "cold" && <Snowflake className="mr-1 h-3 w-3" />}
                      {QUALIFICATION_LABEL[q]}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Próximo paso: lo que convierte "no cerró" en trabajo agendado. */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Próximo paso
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(NEXT_ACTION_LABEL) as NextAction[]).map((a) => (
                    <Button
                      key={a}
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => setAction(a)}
                      className={cn(
                        "h-7 text-xs",
                        action === a && "border-primary text-primary"
                      )}
                    >
                      {NEXT_ACTION_LABEL[a]}
                    </Button>
                  ))}
                </div>

                {action && action !== "lost" && (
                  <label className="flex items-center gap-2 text-xs">
                    <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Para el</span>
                    <CampoFecha
                      value={date}
                      onChange={(fecha) => setDate(fecha ?? "")}
                      className="h-8 w-auto rounded-md border-border bg-background px-2 py-0 text-xs"
                    />
                  </label>
                )}

                {action && (
                  <>
                    <Textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Contexto para vos y para el equipo (opcional)"
                      className="text-xs"
                    />
                    <div>
                      <Button size="sm" disabled={isPending} onClick={handleSave}>
                        Guardar
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function LeadFollowUpPanel({ leads }: { leads: LeadSummary[] }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-1 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Seguimiento de leads</h3>
          {leads.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {leads.length}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Leads con trabajo pendiente: falta cargar el resultado, el seguimiento
          venció, o nadie definió qué sigue.
        </p>
      </div>

      {leads.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Ningún lead quedó sin próximo paso.
        </p>
      ) : (
        <div className="flex flex-col">
          {leads.map((lead) => (
            <LeadRow key={lead.leadId} lead={lead} />
          ))}
        </div>
      )}
    </div>
  );
}

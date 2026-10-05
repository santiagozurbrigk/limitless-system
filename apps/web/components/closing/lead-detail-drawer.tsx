"use client";

import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { Badge, Button, cn } from "@ai-coo/ui";
import { CLOSING_CALL_STATUS_LABEL } from "@/lib/closing/call-status";
import {
  LEAD_THREAD_STATE_LABEL,
  type LeadThreadState,
} from "@/lib/sales/lead-thread";
import {
  findOption,
  optionLabel,
  type FollowUpCatalog,
} from "@/lib/sales/follow-up-options";
import type { LeadTableRow } from "@/app/sales/lead-actions";
import type { TeamMember } from "@/types/team";
import { paths } from "@/routes";
import { formatearFechaGuardada } from "@/lib/fechas/calendario";
import { FollowUpChip } from "./follow-up-option-picker";

/**
 * El hilo del lead, al costado de la tabla.
 *
 * El historial de intentos dejó de ocupar espacio en la vista principal, pero no
 * se perdió: es lo único que explica por qué un lead con siete turnos en dos días
 * es una sola persona y no siete filas sueltas.
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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * La fecha del próximo paso, sin hora: es una fecha elegida, y la hora con que
 * quedó guardada (12:00, o 21:00 en filas viejas) nadie la eligió. Se lee igual
 * que la celda de la tabla (`CampoFecha`), para que las dos digan el mismo día.
 */
function formatearFechaDelPaso(valor: string | null): string {
  return (
    formatearFechaGuardada(valor, { day: "2-digit", month: "short", year: "numeric" }) ?? "—"
  );
}

export function LeadDetailDrawer({
  row,
  catalog,
  teamMembers,
  onClose,
}: {
  row: LeadTableRow | null;
  catalog: FollowUpCatalog;
  teamMembers: TeamMember[];
  onClose: () => void;
}) {
  if (!row) return null;

  const memberName = (id: string | null) =>
    id ? (teamMembers.find((m) => m.id === id)?.name ?? "Alguien del equipo") : null;

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar detalle"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
      />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl">
        <header className="flex items-start gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">{row.name}</h3>
            <p className="truncate text-xs text-muted-foreground">
              {row.email ?? "Sin mail"}
              {row.phone ? ` · ${row.phone}` : ""}
            </p>
          </div>
          <Badge variant={STATE_VARIANT[row.state]} className="shrink-0 text-[10px]">
            {LEAD_THREAD_STATE_LABEL[row.state]}
          </Badge>
          <Button size="icon" variant="outline" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {row.clientId && (
            <Link
              href={paths.platform.clients.detail(row.clientId)}
              className="mb-4 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Ver el cliente en que se convirtió
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}

          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Historial · {row.attemptCount} {row.attemptCount === 1 ? "turno" : "turnos"}
          </p>

          <div className="flex flex-col gap-2">
            {row.attempts.map((attempt) => {
              const option = findOption(catalog.nextActions, attempt.nextAction);
              const owner = memberName(attempt.nextActionOwnerId ?? null);
              return (
                <div
                  key={attempt.id}
                  className={cn(
                    "rounded-md border border-border bg-background px-3 py-2 text-xs",
                    attempt.id === row.targetAttemptId && "border-primary/40"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{formatDate(attempt.scheduledAt)}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {CLOSING_CALL_STATUS_LABEL[attempt.status]}
                    </Badge>
                  </div>

                  {attempt.nextAction && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">→</span>
                      <FollowUpChip
                        option={option}
                        label={optionLabel(catalog.nextActions, attempt.nextAction)}
                      />
                      {attempt.nextActionAt && (
                        <span className="text-muted-foreground">
                          {formatearFechaDelPaso(attempt.nextActionAt)}
                        </span>
                      )}
                      {owner && <span className="text-muted-foreground">· {owner}</span>}
                    </div>
                  )}

                  {attempt.nextActionNotes && (
                    <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">
                      {attempt.nextActionNotes}
                    </p>
                  )}

                  {(attempt.preCallQualification || attempt.postCallQualification) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {attempt.preCallQualification && (
                        <span className="text-[10px] text-muted-foreground">
                          Antes:{" "}
                          {optionLabel(
                            catalog.qualifications,
                            attempt.preCallQualification
                          )}
                        </span>
                      )}
                      {attempt.postCallQualification && (
                        <span className="text-[10px] text-muted-foreground">
                          Después:{" "}
                          {optionLabel(
                            catalog.qualifications,
                            attempt.postCallQualification
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}

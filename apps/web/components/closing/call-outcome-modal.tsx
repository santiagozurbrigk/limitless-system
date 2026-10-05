"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FormField,
  Textarea,
} from "@ai-coo/ui";
import { CampoFecha } from "@/components/shared/campo-fecha";
import { fechaAInstanteLocal } from "@/lib/fechas/calendario";
import {
  fechaPropuestaDelProximoPaso,
  needsDate,
  type FollowUpCatalog,
  type FollowUpOption,
} from "@/lib/sales/follow-up-options";
import type { NoCloseReasonId } from "@/types/closing";
import type { TeamMember } from "@/types/team";
import { FollowUpOptionPicker } from "./follow-up-option-picker";

/**
 * Resultado de la llamada **y** qué sigue, en un solo paso.
 *
 * ⭐ **El seguimiento se pide cuando la información existe.** Antes se cargaba
 * sólo desde la tabla de seguimiento, o sea después: el closer marcaba "no
 * cerró", cerraba la pantalla, y el próximo paso quedaba para más tarde — que en
 * los datos reales significaba nunca. Acá se pide en el mismo momento, con la
 * llamada todavía fresca.
 *
 * ⭐ **No obliga a inventar.** Dejar el próximo paso vacío es legítimo: a veces
 * no se sabe qué sigue. El modal dice en voz alta la consecuencia —el lead queda
 * en la cola como "Sin próximo paso"— en vez de forzar un valor falso.
 */

export type CallOutcomeKind = "not_closed" | "no_show";

export type CallOutcomePayload = {
  /** Sólo para "no cerrada". */
  reason?: NoCloseReasonId;
  /** Notas del resultado de la llamada. */
  notes?: string;
  qualification: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  ownerId: string | null;
  nextActionNotes: string | null;
};

const selectClass =
  "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

const REASONS: { id: NoCloseReasonId; label: string }[] = [
  { id: "price", label: "Objeción de precio" },
  { id: "timing", label: "No es el momento adecuado" },
  { id: "think", label: "Necesita pensarlo" },
  { id: "partner", label: "Debe decidir con su pareja/socio" },
  { id: "not_qualified", label: "No calificado" },
  { id: "other", label: "Otro" },
];

const TITLE: Record<CallOutcomeKind, string> = {
  not_closed: "La llamada no cerró",
  no_show: "El lead no se presentó",
};

export function CallOutcomeModal({
  open,
  onOpenChange,
  kind,
  leadName,
  catalog,
  teamMembers,
  onCatalogChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: CallOutcomeKind;
  leadName: string;
  catalog: FollowUpCatalog;
  teamMembers: TeamMember[];
  /** Un valor creado desde acá tiene que quedar disponible en el resto de la UI. */
  onCatalogChange?: (option: FollowUpOption) => void;
  onSubmit: (payload: CallOutcomePayload) => Promise<void>;
}) {
  const [reason, setReason] = useState<NoCloseReasonId>("price");
  const [notes, setNotes] = useState("");
  const [qualification, setQualification] = useState<string | null>(null);
  const [nextAction, setNextAction] = useState<string | null>(null);
  const [date, setDate] = useState(fechaPropuestaDelProximoPaso);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [nextActionNotes, setNextActionNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Cada llamada arranca en blanco: arrastrar lo cargado en la anterior sería
  // poner en la ficha de un lead algo que se dijo de otro.
  useEffect(() => {
    if (!open) return;
    setReason("price");
    setNotes("");
    setQualification(null);
    setNextAction(null);
    setDate(fechaPropuestaDelProximoPaso());
    setOwnerId(null);
    setNextActionNotes("");
    setError(null);
    setSaving(false);
  }, [open]);

  const wantsDate = nextAction ? needsDate(catalog.nextActions, nextAction) : false;
  const owner = ownerId ? teamMembers.find((m) => m.id === ownerId) : null;

  async function handleSubmit() {
    if (wantsDate && !date) {
      setError(
        "El próximo paso necesita una fecha: sin fecha nunca vence, y el lead no vuelve a la cola."
      );
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        reason: kind === "not_closed" ? reason : undefined,
        notes: notes.trim() || undefined,
        qualification,
        nextAction,
        nextActionAt: wantsDate ? fechaAInstanteLocal(date) : null,
        ownerId,
        nextActionNotes: nextActionNotes.trim() || null,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TITLE[kind]}</DialogTitle>
          <DialogDescription>
            {leadName} · cargá qué pasó y qué sigue, mientras lo tenés fresco.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {kind === "not_closed" && (
            <FormField label="Motivo">
              <select
                className={selectClass}
                value={reason}
                onChange={(e) => setReason(e.target.value as NoCloseReasonId)}
              >
                {REASONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          <FormField
            label={
              kind === "not_closed"
                ? "Notas de la llamada (opcional)"
                : "Qué pasó (opcional)"
            }
          >
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contexto para el equipo y la IA…"
            />
          </FormField>

          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Seguimiento
            </p>

            <FormField label="Calificación">
              <div className="rounded-md border border-border bg-background px-1 py-1">
                <FollowUpOptionPicker
                  kind="qualification"
                  options={catalog.qualifications}
                  value={qualification}
                  placeholder="Sin calificar"
                  onSelect={setQualification}
                  onCreated={onCatalogChange}
                />
              </div>
            </FormField>

            <FormField label="Próximo paso">
              <div className="rounded-md border border-border bg-background px-1 py-1">
                <FollowUpOptionPicker
                  kind="next_action"
                  options={catalog.nextActions}
                  value={nextAction}
                  placeholder="Sin definir"
                  onSelect={setNextAction}
                  onCreated={onCatalogChange}
                />
              </div>
            </FormField>

            {wantsDate && (
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

            {nextAction && (
              <>
                <FormField label="Responsable">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-9 w-full items-center rounded-md border border-border bg-background px-3 text-left text-xs"
                      >
                        {owner ? (
                          owner.name
                        ) : (
                          <span className="text-muted-foreground">Sin asignar</span>
                        )}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuItem
                        className="text-xs text-muted-foreground"
                        onSelect={() => setOwnerId(null)}
                      >
                        Sin asignar
                      </DropdownMenuItem>
                      {teamMembers.map((member) => (
                        <DropdownMenuItem
                          key={member.id}
                          className="text-xs"
                          onSelect={() => setOwnerId(member.id)}
                        >
                          {member.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </FormField>

                <FormField label="Nota del próximo paso (opcional)">
                  <Textarea
                    rows={2}
                    value={nextActionNotes}
                    onChange={(e) => setNextActionNotes(e.target.value)}
                    placeholder="Qué hay que hacer exactamente"
                    className="text-xs"
                  />
                </FormField>
              </>
            )}

            {!nextAction && (
              <p className="text-[11px] text-muted-foreground">
                Si lo dejás vacío, el lead queda en la cola de seguimiento como
                <span className="font-medium"> &ldquo;Sin próximo paso&rdquo;</span>.
              </p>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={saving}
            onClick={handleSubmit}
            className={cn(saving && "opacity-70")}
          >
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

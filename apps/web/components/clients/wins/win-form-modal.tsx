"use client";

/**
 * A · Alta y edición de un win.
 *
 * ⭐ Dos cosas que salen de otras piezas y no se reinventan acá:
 *   · las columnas configurables se renderizan con el `FieldValueInput` de C0;
 *   · la captura se sube por signed URL, igual que los adjuntos de SOPs.
 */

import { useEffect, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
  cn,
} from "@ai-coo/ui";
import { ImagePlus, Loader2, X } from "lucide-react";
import type { Client } from "@/types/clients";
import type {
  ClientWin,
  ConsentDisplay,
  ConsentStatus,
  WinAttachment,
} from "@/types/wins";
import {
  CONSENT_DISPLAYS,
  CONSENT_DISPLAY_LABEL,
  CONSENT_STATUSES,
  CONSENT_STATUS_LABEL,
} from "@/types/wins";
import type { FieldDefinition } from "@/types/custom-fields";
import { activeFields } from "@/lib/custom-fields";
import { FieldValueInput } from "@/components/clients/custom-fields/field-value-input";
import { CampoFecha } from "@/components/shared/campo-fecha";
import { fechaDeHoyEnZona } from "@/lib/fechas/calendario";
import { useZonaDeLaOrganizacion } from "@/providers/zona-de-la-organizacion-provider";
import {
  deleteWinAttachmentAction,
  finalizeWinAttachmentAction,
  prepareWinAttachmentUploadAction,
} from "@/app/clients/win-actions";

const CONTROL_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";

export type WinDraft = {
  clientId: string;
  winDate: string;
  achievement: string;
  metricKey: string;
  metricValue: string;
  metricUnit: string;
  custom: Record<string, unknown>;
  notes: string;
  consentStatus: ConsentStatus;
  /** `""` = todavía no eligió cómo aparecer. */
  consentDisplay: ConsentDisplay | "";
  consentNote: string;
  /** Sólo se declara "reservada"; "usada" sale de los usos cargados. */
  reserved: boolean;
  needsScreenshot: boolean;
};

/** `hoy`: el de la zona de la organización, fecha por defecto de un win nuevo. */
function draftFrom(win: ClientWin | null, hoy: string, defaultClientId?: string): WinDraft {
  return {
    clientId: win?.clientId ?? defaultClientId ?? "",
    winDate: win?.winDate ?? hoy,
    achievement: win?.achievement ?? "",
    metricKey: win?.metric?.key ?? "",
    metricValue: win?.metric ? String(win.metric.value) : "",
    metricUnit: win?.metric?.unit ?? "",
    custom: win?.custom ?? {},
    notes: win?.notes ?? "",
    consentStatus: win?.consent.status ?? "not_asked",
    consentDisplay: win?.consent.display ?? "",
    consentNote: win?.consentNote ?? "",
    reserved: win?.usageState === "reserved",
    needsScreenshot: win?.needsScreenshot ?? false,
  };
}

export function WinFormModal({
  open,
  win,
  clients,
  winFields,
  defaultClientId,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** `null` = alta. */
  win: ClientWin | null;
  clients: Client[];
  winFields: FieldDefinition[];
  defaultClientId?: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (draft: WinDraft, draftId: string | null) => void;
}) {
  const zonaDeLaOrganizacion = useZonaDeLaOrganizacion();
  const [draft, setDraft] = useState<WinDraft>(() =>
    draftFrom(win, fechaDeHoyEnZona(zonaDeLaOrganizacion), defaultClientId)
  );
  /** Agrupa las capturas subidas antes de que el win exista. */
  const draftIdRef = useRef<string | null>(null);
  const [attachments, setAttachments] = useState<WinAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(draftFrom(win, fechaDeHoyEnZona(zonaDeLaOrganizacion), defaultClientId));
    setAttachments(win?.attachments ?? []);
    setUploadError(null);
    // Un win nuevo necesita un identificador temporal para agrupar sus
    // capturas; uno que ya existe no, porque se cuelgan de él directamente.
    draftIdRef.current = win ? null : crypto.randomUUID();
  }, [open, win, defaultClientId, zonaDeLaOrganizacion]);

  const fields = activeFields(winFields);

  function patch(changes: Partial<WinDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  async function upload(file: File) {
    // ⭐ Si el win ya existe, la captura va directo a él. Antes esto exigía un
    // borrador incluso al editar, así que decía "guardá el win primero" sobre
    // un win que ya estaba guardado: no había forma de agregar la captura.
    const destino = win
      ? { winId: win.id }
      : draftIdRef.current
        ? { draftId: draftIdRef.current }
        : null;

    if (!destino) {
      setUploadError("Volvé a abrir el formulario para agregar la captura.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const prepared = await prepareWinAttachmentUploadAction({
        ...destino,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
      if (!prepared.success) throw new Error(prepared.error);

      const uploadResponse = await fetch(prepared.data.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": prepared.data.contentType },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("No se pudo subir la captura.");

      const finalized = await finalizeWinAttachmentAction({
        ...destino,
        storagePath: prepared.data.storagePath,
        fileName: file.name,
        mimeType: prepared.data.contentType,
        fileSize: file.size,
      });
      if (!finalized.success) throw new Error(finalized.error);

      setAttachments((current) => [...current, finalized.data]);
    } catch (uploadFailure) {
      setUploadError(
        uploadFailure instanceof Error ? uploadFailure.message : "No se pudo subir"
      );
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(attachment: WinAttachment) {
    setAttachments((current) => current.filter((item) => item.id !== attachment.id));
    await deleteWinAttachmentAction(attachment.id);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{win ? "Editar win" : "Nuevo win"}</DialogTitle>
          <DialogDescription>
            Un logro concreto de un cliente. El número es opcional, pero es lo que
            después permite mostrar su recorrido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="win-client">Cliente</Label>
              <select
                id="win-client"
                className={CONTROL_CLASS}
                value={draft.clientId}
                onChange={(event) => patch({ clientId: event.target.value })}
              >
                <option value="">Elegí un cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="win-date">Fecha</Label>
              <CampoFecha
                id="win-date"
                max={fechaDeHoyEnZona(zonaDeLaOrganizacion)}
                value={draft.winDate}
                onChange={(fecha) => patch({ winDate: fecha ?? "" })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="win-achievement">Qué logró</Label>
            <Textarea
              id="win-achievement"
              rows={2}
              value={draft.achievement}
              onChange={(event) => patch({ achievement: event.target.value })}
              placeholder="Facturó 8.500 USD en su primer lanzamiento"
            />
          </div>

          {/* La medida: opcional, y es lo que hace posible el dashboard. */}
          <div className="space-y-1.5 rounded-lg border border-border/60 p-3">
            <Label>Medida (opcional)</Label>
            <p className="text-xs text-muted-foreground">
              Cargá la misma clave y unidad en varios wins del cliente y el dashboard
              muestra su recorrido.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                aria-label="Clave de la medida"
                value={draft.metricKey}
                onChange={(event) => patch({ metricKey: event.target.value })}
                placeholder="facturacion"
              />
              <Input
                aria-label="Valor"
                inputMode="decimal"
                value={draft.metricValue}
                onChange={(event) => patch({ metricValue: event.target.value })}
                placeholder="8500"
              />
              <Input
                aria-label="Unidad"
                value={draft.metricUnit}
                onChange={(event) => patch({ metricUnit: event.target.value })}
                placeholder="USD"
              />
            </div>
          </div>

          {/* ⭐ Las columnas configurables de C0. */}
          {fields.length > 0 ? (
            <div className="space-y-3">
              {fields.map((field) => (
                <FieldValueInput
                  key={field.key}
                  field={field}
                  value={draft.custom[field.key] ?? null}
                  onChange={(value) =>
                    patch({ custom: { ...draft.custom, [field.key]: value } })
                  }
                />
              ))}
            </div>
          ) : null}

          {/* La captura */}
          <div className="space-y-2">
            <Label>Captura (opcional)</Label>
            <div className="flex flex-wrap items-center gap-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="group relative h-16 w-16 overflow-hidden rounded-lg border border-border"
                >
                  {attachment.signedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attachment.signedUrl}
                      alt={attachment.fileName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                      {attachment.fileName}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Quitar captura"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}

              <label
                className={cn(
                  "flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  uploading && "pointer-events-none opacity-60"
                )}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            {uploadError ? (
              <p className="text-xs text-destructive">{uploadError}</p>
            ) : null}
          </div>

          {/* ⭐ Los permisos. Sin esto, el win existe pero no se puede publicar. */}
          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <Label htmlFor="win-consent">¿El cliente autoriza usarlo?</Label>
            <select
              id="win-consent"
              className={CONTROL_CLASS}
              value={draft.consentStatus}
              onChange={(event) =>
                patch({
                  consentStatus: event.target.value as ConsentStatus,
                  // Si deja de autorizar, la forma de aparecer no aplica más.
                  consentDisplay:
                    event.target.value === "granted" ? draft.consentDisplay : "",
                })
              }
            >
              {CONSENT_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {CONSENT_STATUS_LABEL[option]}
                </option>
              ))}
            </select>

            {draft.consentStatus === "granted" ? (
              <div className="space-y-1.5">
                <Label htmlFor="win-consent-display" className="text-xs">
                  ¿Cómo quiere aparecer?
                </Label>
                <select
                  id="win-consent-display"
                  className={CONTROL_CLASS}
                  value={draft.consentDisplay}
                  onChange={(event) =>
                    patch({ consentDisplay: event.target.value as ConsentDisplay | "" })
                  }
                >
                  <option value="">Elegí una opción</option>
                  {CONSENT_DISPLAYS.map((option) => (
                    <option key={option} value={option}>
                      {CONSENT_DISPLAY_LABEL[option]}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  De esto depende si se puede mostrar su nombre o sólo el número.
                </p>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="win-consent-note" className="text-xs">
                Cómo lo dijo (opcional)
              </Label>
              <Input
                id="win-consent-note"
                value={draft.consentNote}
                onChange={(event) => patch({ consentNote: event.target.value })}
                placeholder="Lo autorizó por DM el 3/9"
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <Label>Estado</Label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={draft.reserved}
                onChange={(event) => patch({ reserved: event.target.checked })}
              />
              Reservada para algo puntual
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={draft.needsScreenshot}
                onChange={(event) => patch({ needsScreenshot: event.target.checked })}
              />
              Falta sacar la captura
            </label>
            <p className="text-xs text-muted-foreground">
              La captura se saca el día que pasó, no el día que la vas a usar.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="win-notes">Notas (opcional)</Label>
            <Textarea
              id="win-notes"
              rows={2}
              value={draft.notes}
              onChange={(event) => patch({ notes: event.target.value })}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={
              saving || draft.clientId === "" || draft.achievement.trim() === ""
            }
            onClick={() => onSubmit(draft, draftIdRef.current)}
          >
            {saving ? "Guardando…" : win ? "Guardar" : "Crear win"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

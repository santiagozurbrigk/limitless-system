"use client";

/**
 * A · W1 — El tracker de wins.
 *
 * La tabla donde se cargan los logros: fecha, cliente, logro, la medida, las
 * columnas configurables de C0 y dónde se usó cada caso.
 */

import { useMemo, useState, useTransition } from "react";
import { Button, cn } from "@ai-coo/ui";
import { Camera, Plus, ShieldAlert, ShieldCheck, Trash2, Trophy } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterPills } from "@/components/marketing/filter-pills";
import { useToast } from "@/providers/toast-provider";
import type { MutationResult } from "@/lib/server/action-result";
import { correrMutacion, leerConMotivo } from "@/lib/client/correr-accion";
import type { Client } from "@/types/clients";
import type { ClientWin } from "@/types/wins";
import {
  CONSENT_DISPLAY_LABEL,
  CONSENT_STATUS_LABEL,
  USAGE_STATE_LABEL,
  WIN_USAGE_CHANNELS,
  WIN_USAGE_CHANNEL_LABEL,
  type UsageState,
} from "@/types/wins";
import { blockedReason, canPublish, resolveUsageState } from "@/lib/wins";
import type { FieldDefinition } from "@/types/custom-fields";
import { activeFields } from "@/lib/custom-fields";
import { FieldValueCell } from "@/components/clients/custom-fields/field-value-cell";
import {
  addWinUsageAction,
  createWinAction,
  deleteWinAction,
  deleteWinUsageAction,
  updateWinAction,
} from "@/app/clients/win-actions";
import { WinFormModal, type WinDraft } from "@/components/clients/wins/win-form-modal";

export function WinsTracker({
  wins,
  clients,
  winFields,
  onChanged,
}: {
  wins: ClientWin[];
  clients: Client[];
  winFields: FieldDefinition[];
  onChanged: () => Promise<void>;
}) {
  const { push } = useToast();
  const [pending, startTransition] = useTransition();
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [modal, setModal] = useState<{ open: boolean; win: ClientWin | null }>({
    open: false,
    win: null,
  });
  const [modalError, setModalError] = useState<string | null>(null);

  const fields = activeFields(winFields);
  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients]
  );

  const filtered = useMemo(
    () =>
      wins.filter((win) => {
        if (clientFilter !== "all" && win.clientId !== clientFilter) return false;
        return matchesStateFilter(win, stateFilter);
      }),
    [wins, clientFilter, stateFilter]
  );

  /**
   * ⭐ El contador de "Sin usar" es la razón de ser del tracker: la pregunta que
   * el Excel contesta y que hasta ahora Limitless no podía contestar.
   */
  const stateOptions = useMemo(
    () =>
      STATE_FILTERS.map((option) => {
        const count = wins.filter((win) => matchesStateFilter(win, option.value)).length;
        return {
          value: option.value,
          label: option.value === "all" ? option.label : `${option.label} (${count})`,
        };
      }),
    [wins]
  );

  /** Sólo los clientes que ya tienen wins: filtrar por uno vacío no sirve. */
  const clientOptions = useMemo(() => {
    const ids = new Set(wins.map((win) => win.clientId));
    return [
      { value: "all", label: "Todos" },
      ...clients
        .filter((client) => ids.has(client.id))
        .map((client) => ({ value: client.id, label: client.name })),
    ];
  }, [wins, clients]);

  function run(operation: () => Promise<MutationResult<unknown>>) {
    startTransition(async () => {
      await correrMutacion({
        accion: operation,
        alExito: onChanged,
        avisar: push,
        tituloError: "No se pudo guardar",
        etiqueta: "[WinsTracker] guardar",
      });
    });
  }

  function submit(draft: WinDraft, draftId: string | null) {
    setModalError(null);

    // Una medida a medias no es una medida: o están la clave y el número, o no
    // hay medida. Un número ilegible se rechaza acá con el motivo.
    const key = draft.metricKey.trim();
    const rawValue = draft.metricValue.trim();
    let metric: { key: string; value: number; unit: string | null } | null = null;

    if (key !== "" || rawValue !== "") {
      if (key === "" || rawValue === "") {
        setModalError("La medida necesita la clave y el número, o dejá las dos vacías.");
        return;
      }
      const value = Number(rawValue.replace(",", "."));
      if (!Number.isFinite(value)) {
        setModalError("El número de la medida no se entiende.");
        return;
      }
      metric = { key, value, unit: draft.metricUnit.trim() || null };
    }

    // Misma regla que la base: autorizar sin decir cómo aparecer deja el
    // permiso a medias, y después nadie sabe si se puede poner el nombre.
    if (draft.consentStatus === "granted" && draft.consentDisplay === "") {
      setModalError("Si el cliente autorizó, elegí cómo quiere aparecer.");
      return;
    }

    startTransition(async () => {
      const payload = {
        clientId: draft.clientId,
        winDate: draft.winDate,
        achievement: draft.achievement,
        metric,
        custom: draft.custom,
        notes: draft.notes.trim() || null,
        draftId,
        consentStatus: draft.consentStatus,
        consentDisplay: draft.consentDisplay || null,
        consentNote: draft.consentNote.trim() || null,
        // "usada" no se declara: sale de los usos cargados.
        usageState: (draft.reserved ? "reserved" : "unused") as UsageState,
        needsScreenshot: draft.needsScreenshot,
      };

      const editando = modal.win;
      // El motivo va al formulario, que queda abierto; si la acción lanzó, el
      // texto fijo (SCRUM-516).
      const result = await leerConMotivo<ClientWin>(
        () => (editando ? updateWinAction(editando.id, payload) : createWinAction(payload)),
        "[WinsTracker] guardar win"
      );

      if (!result.ok) {
        setModalError(result.motivo);
        return;
      }
      setModal({ open: false, win: null });
      await onChanged();
      push({ title: modal.win ? "Win actualizado" : "Win cargado", variant: "success" });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterPills
            options={stateOptions}
            value={stateFilter}
            onChange={(value) => setStateFilter(value as StateFilter)}
          />
          {clientOptions.length > 1 ? (
            <FilterPills
              options={clientOptions}
              value={clientFilter}
              onChange={setClientFilter}
            />
          ) : null}
        </div>
        <Button
          onClick={() => {
            setModalError(null);
            setModal({ open: true, win: null });
          }}
          disabled={pending}
        >
          <Plus className="mr-1 h-4 w-4" />
          Nuevo win
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-6 w-6" />}
          title={wins.length === 0 ? "Todavía no hay wins" : "Ninguno cae en este filtro"}
          description={
            wins.length === 0
              ? "Cada logro con su fecha, su captura y —si aplica— su número. El número es lo que después arma el recorrido del cliente en el dashboard."
              : "Probá con otro filtro: los wins siguen cargados."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Logro</th>
                <th className="px-4 py-3 font-medium">Medida</th>
                {fields.map((field) => (
                  <th key={field.key} className="px-4 py-3 font-medium">
                    {field.label}
                  </th>
                ))}
                <th className="px-4 py-3 font-medium">Permiso</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Captura</th>
                <th className="px-4 py-3 font-medium">Se usó en</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((win) => (
                <tr
                  key={win.id}
                  className="border-b border-border/50 transition-colors hover:bg-muted/40"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {new Date(`${win.winDate}T12:00:00Z`).toLocaleDateString("es-AR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {clientById.get(win.clientId)?.name ?? "—"}
                  </td>
                  <td className="max-w-xs px-4 py-3">{win.achievement}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    {win.metric ? (
                      <span>
                        {new Intl.NumberFormat("es-AR").format(win.metric.value)}
                        {win.metric.unit ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            {win.metric.unit}
                          </span>
                        ) : null}
                        <span className="ml-1.5 text-[11px] text-muted-foreground">
                          {win.metric.key}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {fields.map((field) => (
                    <td key={field.key} className="px-4 py-3">
                      <FieldValueCell field={field} value={win.custom[field.key]} />
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <ConsentCell win={win} />
                  </td>
                  <td className="px-4 py-3">
                    <StateCell win={win} />
                  </td>
                  <td className="px-4 py-3">
                    {win.attachments.length > 0 ? (
                      <div className="flex -space-x-2">
                        {win.attachments.slice(0, 3).map((attachment) =>
                          attachment.signedUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={attachment.id}
                              src={attachment.signedUrl}
                              alt={attachment.fileName}
                              className="h-8 w-8 rounded border border-border object-cover"
                            />
                          ) : null
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <UsageCell
                      win={win}
                      pending={pending}
                      onAdd={(channel, label) =>
                        run(() =>
                          addWinUsageAction({
                            winId: win.id,
                            channel,
                            locationLabel: label || null,
                          })
                        )
                      }
                      onRemove={(usageId) => run(() => deleteWinUsageAction(usageId))}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={() => {
                          setModalError(null);
                          setModal({ open: true, win });
                        }}
                      >
                        Editar
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground/50 hover:text-destructive"
                        title="Borrar win"
                        disabled={pending}
                        onClick={() => {
                          if (!window.confirm(`¿Borrar el win "${win.achievement}"?`)) return;
                          run(() => deleteWinAction(win.id));
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <WinFormModal
        open={modal.open}
        win={modal.win}
        clients={clients}
        winFields={winFields}
        saving={pending}
        error={modalError}
        onClose={() => setModal({ open: false, win: null })}
        onSubmit={submit}
      />
    </div>
  );
}

/**
 * ⭐ Los filtros que hacen del tracker un recordatorio y no un archivo.
 *
 * "Sin usar" es el que importa: es la pregunta que el Excel contestaba de una
 * mirada —*"¿cuáles todavía no aproveché?"*— y que Limitless no podía contestar.
 */
const STATE_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "unused", label: "Sin usar" },
  { value: "reserved", label: "Reservadas" },
  { value: "used", label: "Usadas" },
  { value: "no_consent", label: "Sin permiso" },
  { value: "needs_screenshot", label: "Falta captura" },
] as const;

type StateFilter = (typeof STATE_FILTERS)[number]["value"];

function matchesStateFilter(win: ClientWin, filter: StateFilter): boolean {
  if (filter === "all") return true;
  if (filter === "no_consent") return !canPublish(win.consent);
  if (filter === "needs_screenshot") return win.needsScreenshot;
  return resolveUsageState(win.usageState, win.usages.length) === filter;
}

/** El permiso, con el motivo cuando falta: "no publicable" a secas no destraba nada. */
function ConsentCell({ win }: { win: ClientWin }) {
  const allowed = canPublish(win.consent);
  const reason = blockedReason(win.consent);

  return (
    <div className="min-w-[9rem] space-y-0.5">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
          allowed
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-muted text-muted-foreground"
        )}
      >
        {allowed ? (
          <ShieldCheck className="h-3 w-3" />
        ) : (
          <ShieldAlert className="h-3 w-3" />
        )}
        {CONSENT_STATUS_LABEL[win.consent.status]}
      </span>
      {allowed && win.consent.display ? (
        <p className="text-[11px] text-muted-foreground">
          {CONSENT_DISPLAY_LABEL[win.consent.display]}
        </p>
      ) : reason ? (
        <p className="text-[11px] text-muted-foreground">{reason}</p>
      ) : null}
    </div>
  );
}

/** El estado de uso: derivado de los usos, salvo "reservada", que se declara. */
function StateCell({ win }: { win: ClientWin }) {
  const state = resolveUsageState(win.usageState, win.usages.length);

  return (
    <div className="min-w-[7rem] space-y-0.5">
      <span
        className={cn(
          "inline-block rounded-full px-2 py-0.5 text-[11px]",
          state === "unused" && "bg-primary/10 text-primary",
          state === "reserved" && "bg-muted text-muted-foreground",
          state === "used" && "bg-muted text-muted-foreground"
        )}
      >
        {USAGE_STATE_LABEL[state]}
      </span>
      {win.needsScreenshot ? (
        <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <Camera className="h-3 w-3" />
          Falta la captura
        </p>
      ) : null}
    </div>
  );
}

/** Los usos de un win: cada uno es una fila, no un campo de texto. */
function UsageCell({
  win,
  pending,
  onAdd,
  onRemove,
}: {
  win: ClientWin;
  pending: boolean;
  onAdd: (channel: (typeof WIN_USAGE_CHANNELS)[number], label: string) => void;
  onRemove: (usageId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [channel, setChannel] = useState<(typeof WIN_USAGE_CHANNELS)[number]>("landing");
  const [label, setLabel] = useState("");

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {win.usages.map((usage) => (
          <button
            key={usage.id}
            type="button"
            title="Quitar este uso"
            disabled={pending}
            onClick={() => onRemove(usage.id)}
            className={cn(
              "rounded-full border border-border/60 px-2 py-0.5 text-[11px]",
              "hover:border-destructive/50 hover:text-destructive"
            )}
          >
            {WIN_USAGE_CHANNEL_LABEL[usage.channel]}
            {usage.locationLabel ? ` · ${usage.locationLabel}` : ""}
          </button>
        ))}
      </div>

      {adding ? (
        <div className="flex items-center gap-1">
          <select
            aria-label="Canal"
            className="h-7 rounded border border-border bg-background px-1 text-xs"
            value={channel}
            onChange={(event) =>
              setChannel(event.target.value as (typeof WIN_USAGE_CHANNELS)[number])
            }
          >
            {WIN_USAGE_CHANNELS.map((option) => (
              <option key={option} value={option}>
                {WIN_USAGE_CHANNEL_LABEL[option]}
              </option>
            ))}
          </select>
          <input
            aria-label="Dónde"
            className="h-7 w-24 rounded border border-border bg-background px-1 text-xs"
            placeholder="dónde"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={pending}
            onClick={() => {
              onAdd(channel, label.trim());
              setLabel("");
              setAdding(false);
            }}
          >
            OK
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setAdding(true)}
        >
          + agregar
        </button>
      )}
    </div>
  );
}

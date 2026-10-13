"use client";

/**
 * A · W2 — El dashboard de casos.
 *
 * Responde una pregunta distinta a la del tracker: *"¿qué recorrido hizo este
 * cliente?"* — nicho, punto inicial → final, y en cuánto tiempo.
 *
 * ⭐ Si un cliente no tiene dos puntos numéricos comparables, dice **"sin medir"**
 * y explica por qué. No estima, no interpola, y no muestra una flecha verde sin
 * datos que la sostengan.
 */

import { useState, useTransition } from "react";
import { Badge, Button, GlassPanel, cn } from "@ai-coo/ui";
import {
  ArrowRight,
  Minus,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { Client, ClientTracking } from "@/types/clients";
import type { ClientBaseline, ClientWin } from "@/types/wins";
import { WIN_USAGE_CHANNEL_LABEL } from "@/types/wins";
import {
  UNMEASURED_REASON_LABEL,
  canPublish,
  deriveClientCase,
  groupWinsByClient,
} from "@/lib/wins";
import { FilterPills } from "@/components/marketing/filter-pills";
import { EmptyState } from "@/components/shared/empty-state";
import { Trophy } from "lucide-react";
import { useToast } from "@/providers/toast-provider";
import { updateClientBaselineAction } from "@/app/clients/win-actions";
import { leerConMotivo } from "@/lib/client/correr-accion";
import { updateClientTrackingAction } from "@/app/clients/tracking-actions";
import { leerConMotivo } from "@/lib/client/correr-accion";
import {
  ClientBaselineDialog,
  type BaselineDraft,
} from "@/components/clients/wins/client-baseline-dialog";

export function WinsDashboard({
  wins,
  clients,
  baselines,
  niches,
  tracking,
  onChanged,
}: {
  wins: ClientWin[];
  clients: Client[];
  baselines: Record<string, ClientBaseline>;
  niches: Record<string, string>;
  tracking: Record<string, ClientTracking>;
  onChanged: () => Promise<void>;
}) {
  const { push } = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Client | null>(null);
  const [consentFilter, setConsentFilter] = useState<"all" | "publishable">("all");
  const [dialogError, setDialogError] = useState<string | null>(null);

  const byClient = groupWinsByClient(wins);
  const allClientsWithWins = clients.filter((client) => byClient.has(client.id));

  /**
   * ⭐ Lo que no está autorizado no se ofrece como material. No se esconde —el
   * win sigue contando para el recorrido— pero se puede sacar de la vista de
   * una, que es lo que hace falta cuando estás armando una landing.
   */
  const clientsWithWins =
    consentFilter === "publishable"
      ? allClientsWithWins.filter((client) =>
          (byClient.get(client.id) ?? []).some((win) => canPublish(win.consent))
        )
      : allClientsWithWins;

  // Vacío de verdad (no hay wins) vs. vacío por el filtro: el segundo se
  // resuelve más abajo, con las pills a la vista para poder volver.
  if (allClientsWithWins.length === 0) {
    return (
      <EmptyState
        icon={<Trophy className="h-6 w-6" />}
        title="Todavía no hay wins cargados"
        description="Cargá el primero en el tracker. Cuando un cliente tenga dos números comparables, acá vas a ver su recorrido."
      />
    );
  }

  function submitBaseline(draft: BaselineDraft) {
    if (!editing) return;
    setDialogError(null);

    // Igual que la medida de un win: o están la clave y el número, o no hay
    // punto de partida. Guardar medio baseline sería guardar algo que no se
    // puede usar.
    const key = draft.metricKey.trim();
    const rawValue = draft.metricValue.trim();
    if ((key === "") !== (rawValue === "")) {
      setDialogError("El punto de partida necesita la clave y el número, o ninguno.");
      return;
    }
    const value = rawValue === "" ? null : Number(rawValue.replace(",", "."));
    if (value !== null && !Number.isFinite(value)) {
      setDialogError("El número del punto de partida no se entiende.");
      return;
    }

    // Misma regla para el objetivo: una clave sin número no es una meta.
    const goalKey = draft.goalMetricKey.trim();
    const rawGoal = draft.goalMetricValue.trim();
    if ((goalKey === "") !== (rawGoal === "")) {
      setDialogError("La métrica objetivo necesita la clave y el número, o ninguno.");
      return;
    }
    const goalValue = rawGoal === "" ? null : Number(rawGoal.replace(",", "."));
    if (goalValue !== null && !Number.isFinite(goalValue)) {
      setDialogError("El número del objetivo no se entiende.");
      return;
    }

    startTransition(async () => {
      // El motivo va al diálogo, que queda abierto; si la acción lanzó, el
      // texto fijo (SCRUM-516).
      const result = await leerConMotivo(
        () =>
          updateClientBaselineAction(editing.id, {
            niche: draft.niche.trim() || null,
            baselineMetricKey: key || null,
            baselineMetricValue: value,
            baselineMetricUnit: draft.metricUnit.trim() || null,
            baselineCapturedAt: draft.capturedAt || null,
          }),
        "[WinsDashboard] guardar baseline"
      );
      if (!result.ok) {
        setDialogError(result.motivo);
        return;
      }

      // Si la acción lanzó, el diálogo muestra el texto fijo (SCRUM-517).
      const tracked = await leerConMotivo(
        () =>
          updateClientTrackingAction(editing.id, {
            goalText: draft.goalText.trim() || null,
            goalMetricKey: goalKey || null,
            goalMetricValue: goalValue,
            goalMetricUnit: draft.goalMetricUnit.trim() || null,
            exitDate: draft.exitDate || null,
          }),
        "[WinsDashboard] objetivo y egreso"
      );
      if (!tracked.ok) {
        setDialogError(tracked.motivo);
        return;
      }

      setEditing(null);
      await onChanged();
      push({ title: "Guardado", variant: "success" });
    });
  }

  return (
    <div className="space-y-3">
      <FilterPills
        options={[
          { value: "all", label: "Todos" },
          {
            value: "publishable",
            label: `Con permiso (${
              allClientsWithWins.filter((client) =>
                (byClient.get(client.id) ?? []).some((win) => canPublish(win.consent))
              ).length
            })`,
          },
        ]}
        value={consentFilter}
        onChange={(value) => setConsentFilter(value as "all" | "publishable")}
      />

      {clientsWithWins.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title="Ningún cliente tiene wins autorizados"
          description="Un win se puede publicar sólo si el cliente dijo que sí y dijo cómo quiere aparecer. Eso se carga al editar el win, en el tracker."
        />
      ) : null}

      {clientsWithWins.map((client) => (
        <ClientCaseCard
          key={client.id}
          client={client}
          wins={byClient.get(client.id) ?? []}
          baseline={baselines[client.id] ?? null}
          niche={niches[client.id] ?? null}
          tracking={tracking[client.id] ?? null}
          pending={pending}
          onEdit={() => {
            setDialogError(null);
            setEditing(client);
          }}
        />
      ))}

      <ClientBaselineDialog
        open={editing !== null}
        clientName={editing?.name ?? ""}
        niche={editing ? (niches[editing.id] ?? null) : null}
        baseline={editing ? (baselines[editing.id] ?? null) : null}
        tracking={editing ? (tracking[editing.id] ?? null) : null}
        saving={pending}
        error={dialogError}
        onClose={() => setEditing(null)}
        onSubmit={submitBaseline}
      />
    </div>
  );
}

function ClientCaseCard({
  client,
  wins,
  baseline,
  niche,
  tracking,
  pending,
  onEdit,
}: {
  client: Client;
  wins: ClientWin[];
  baseline: ClientBaseline | null;
  niche: string | null;
  tracking: ClientTracking | null;
  pending: boolean;
  onEdit: () => void;
}) {
  const result = deriveClientCase(wins, baseline);
  const usages = wins.flatMap((win) => win.usages);
  const publishable = wins.filter((win) => canPublish(win.consent)).length;

  return (
    <GlassPanel className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{client.name}</span>
          {niche ? <Badge variant="outline">{niche}</Badge> : null}
        </div>
        <div className="flex items-center gap-2">
          {/* ⭐ Cuántos de sus wins se pueden mostrar, y con qué permiso. */}
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
              publishable > 0
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            )}
            title={
              publishable > 0
                ? "Wins que el cliente autorizó a mostrar"
                : "Ninguno de sus wins está autorizado todavía"
            }
          >
            {publishable > 0 ? (
              <ShieldCheck className="h-3 w-3" />
            ) : (
              <ShieldAlert className="h-3 w-3" />
            )}
            {publishable} de {wins.length} con permiso
          </span>
          <span className="text-xs text-muted-foreground">
            {wins.length} win{wins.length > 1 ? "s" : ""}
          </span>
          <Button
            variant="ghost"
            size="icon"
            title="Ficha del cliente"
            disabled={pending}
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {result.measured ? (
        <div className="flex flex-wrap items-center gap-3">
          <Point label="Punto inicial" value={result.start.value} unit={result.unit} />
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Point label="Punto final" value={result.end.value} unit={result.unit} />

          {/* ⭐ La meta, cuando se puede comparar: sólo si es la misma medida. */}
          {tracking?.goalMetricValue !== null &&
          tracking?.goalMetricValue !== undefined &&
          tracking.goalMetricKey === result.metricKey ? (
            <Point label="Objetivo" value={tracking.goalMetricValue} unit={result.unit} />
          ) : null}

          <div className="flex items-center gap-1.5">
            <Trend delta={result.delta} />
            <span
              className={cn(
                "text-sm tabular-nums",
                result.delta > 0 && "text-emerald-500",
                result.delta < 0 && "text-destructive"
              )}
            >
              {result.delta > 0 ? "+" : ""}
              {formatNumber(result.delta)}
              {result.deltaPercent !== null
                ? ` (${result.deltaPercent > 0 ? "+" : ""}${Math.round(result.deltaPercent)}%)`
                : ""}
            </span>
          </div>

          <span className="text-sm text-muted-foreground">
            en {result.days} día{result.days > 1 ? "s" : ""}
          </span>

          <Badge variant="secondary" className="ml-auto">
            {result.metricKey}
          </Badge>
        </div>
      ) : (
        // ⭐ "Sin medir" con el motivo: decirlo a secas no ayuda a arreglarlo.
        <div className="space-y-0.5">
          <p className="text-sm text-muted-foreground">Sin medir</p>
          <p className="text-xs text-muted-foreground">
            {UNMEASURED_REASON_LABEL[result.reason]}
          </p>
        </div>
      )}

      {usages.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2">
          <span className="text-xs text-muted-foreground">Usado en:</span>
          {usages.map((usage) => (
            <span
              key={usage.id}
              className="rounded-full border border-border/60 px-2 py-0.5 text-[11px]"
            >
              {WIN_USAGE_CHANNEL_LABEL[usage.channel]}
              {usage.locationLabel ? ` · ${usage.locationLabel}` : ""}
            </span>
          ))}
        </div>
      ) : null}
    </GlassPanel>
  );
}

function Point({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string | null;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm tabular-nums">
        {formatNumber(value)}
        {unit ? <span className="ml-1 text-xs text-muted-foreground">{unit}</span> : null}
      </p>
    </div>
  );
}

function Trend({ delta }: { delta: number }) {
  if (delta > 0) return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  if (delta < 0) return <TrendingDown className="h-4 w-4 text-destructive" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value);
}

"use client";

/**
 * Cobros — el seguimiento del dinero de cada cliente.
 *
 * ⭐ Esta pantalla no es nueva: es la mitad financiera que vivía en la tabla de
 * Clientes y en la ficha de cada uno. Se mudó entera a Ventas porque es la
 * continuación del cierre —`/sales/closing` pacta las condiciones de pago, acá
 * se sigue si se cumplen— y porque Clientes pasó a ser el tablero de entrega:
 * dónde está parado cada cliente en su recorrido. Son dos preguntas distintas
 * que muchas veces hacen dos personas distintas.
 *
 * Lo que se muestra es exactamente lo que se mostraba antes: plan, días
 * restantes del programa, tipo de pago, adeudado y monto. Nada se recalcula de
 * otra forma — se reusan `computeOutstandingBalance` y
 * `computeRemainingProgramDays`, las mismas funciones de siempre.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  GlassPanel,
  StaggerFade,
  StaggerFadeItem,
} from "@ai-coo/ui";
import { BookOpen, Settings2, X } from "lucide-react";
import { assignClientPlanAction } from "@/app/clients/actions";
import { listPlansAction } from "@/app/clients/plan-actions";
import { getClientsTableEnrichmentAction } from "@/app/clients/plan-duration-actions";
import { FilterPills } from "@/components/marketing/filter-pills";
import { fechaDeHoyEnZona } from "@/lib/fechas/calendario";
import {
  useHoyDeLaOrganizacion,
  useZonaDeLaOrganizacion,
} from "@/providers/zona-de-la-organizacion-provider";
import { PlanManagerDialog } from "@/components/clients/plan-manager-dialog";
import { ClientPaymentsSection } from "@/components/sales/client-payments-section";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import {
  computeOutstandingBalance,
  computeRemainingProgramDays,
  formatRemainingDays,
  getClientPlanName,
} from "@/lib/clients/plan-utils";
import { paths } from "@/routes";
import { usePlatformData } from "@/providers";
import { useModuleAccess } from "@/providers/permissions-provider";
import { useToast } from "@/providers/toast-provider";
import type { Client } from "@/types/clients";
import type { Plan } from "@/types/plans";
import type { PlanDuration } from "@/types/plan-durations";

const PAYMENT_LABEL = {
  upfront: "Upfront",
  installments: "Cuotas",
  upfront_fee: "Upfront + fee",
} as const;

/** Los filtros de esta pantalla son de plata, no de recorrido. */
type CobroFilter = "all" | "owing" | "settled";

const COBRO_FILTERS: { value: CobroFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "owing", label: "Con saldo" },
  { value: "settled", label: "Saldados" },
];

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function RemainingDaysCell({
  days,
  loading,
  hasDuration,
}: {
  days: number | null;
  loading: boolean;
  hasDuration: boolean;
}) {
  if (loading && !hasDuration) {
    return <span className="text-muted-foreground">…</span>;
  }

  let dotClass: string | null = null;
  if (days !== null) {
    if (days < 0) dotClass = "bg-muted-foreground/40";
    else if (days < 15) dotClass = "bg-red-500";
    else if (days < 30) dotClass = "bg-amber-400";
    else dotClass = "bg-green-500";
  }

  return (
    <div className="flex items-center gap-2">
      {dotClass !== null ? (
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} aria-hidden />
      ) : null}
      <span className="text-muted-foreground">{formatRemainingDays(days)}</span>
    </div>
  );
}

function AssignPlanDialog({
  client,
  plans,
  onConfirm,
  onCancel,
  pending,
}: {
  client: Client;
  plans: Plan[];
  onConfirm: (planId: string | null) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [selectedPlanId, setSelectedPlanId] = useState<string>(client.planId ?? "");

  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Asignar plan a {client.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Seleccioná el plan contratado por este cliente.
          </p>
          <select
            className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={selectedPlanId}
            onChange={(e) => setSelectedPlanId(e.target.value)}
            disabled={pending}
          >
            <option value="">Sin plan asignado</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.durationDays ? ` (${p.durationDays} días)` : ""}
              </option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(selectedPlanId || null)} disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CobrosPage({
  initialClientId = null,
}: {
  /** Cliente que llega abierto desde `?cliente=`, si vino alguno. */
  initialClientId?: string | null;
}) {
  const { clients, clientsLoading, refreshClients } = usePlatformData();
  const { push } = useToast();

  /**
   * ⭐ El permiso que manda acá es el de **Ventas**, no el de Clientes.
   *
   * `useModuleAccess` ya devuelve "full" para el fundador, así que no hace
   * falta preguntar aparte si lo es.
   */
  const permisoVentas = useModuleAccess("sales");
  const puedeGestionar = permisoVentas === "full";

  const [filter, setFilter] = useState<CobroFilter>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [paidByClientId, setPaidByClientId] = useState<Record<string, number>>({});
  const [planDurations, setPlanDurations] = useState<PlanDuration[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansOpen, setPlansOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialClientId);
  const [assignPlanTarget, setAssignPlanTarget] = useState<Client | null>(null);
  const [loadingEnrichment, startLoad] = useTransition();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startLoad(async () => {
      const [enrichment, fetchedPlans] = await Promise.all([
        getClientsTableEnrichmentAction(),
        listPlansAction(),
      ]);
      setPaidByClientId(enrichment.paidByClientId);
      setPlanDurations(enrichment.planDurations);
      setPlans(fetchedPlans);
    });
  }, [clients]);

  /** Plan, días restantes, cobrado y adeudado de cada cliente, en una pasada. */
  // Hoy en la zona de la org (en el render del servidor, con la misma zona).
  const zonaDeLaOrganizacion = useZonaDeLaOrganizacion();
  const hoy = useHoyDeLaOrganizacion() ?? fechaDeHoyEnZona(zonaDeLaOrganizacion);

  const rows = useMemo(() => {
    return clients.map((client) => {
      const planName = getClientPlanName(client);
      const assignedPlan = client.planId
        ? plans.find((p) => p.id === client.planId)
        : undefined;
      const durationDays =
        assignedPlan?.durationDays ??
        planDurations.find(
          (d) => d.planName.toLowerCase() === (planName ?? "").toLowerCase()
        )?.durationDays;
      const paid = paidByClientId[client.id] ?? 0;

      return {
        client,
        planLabel: assignedPlan?.name ?? planName ?? "—",
        durationDays,
        remainingDays: computeRemainingProgramDays(client.joinDate, durationDays, hoy),
        owed: computeOutstandingBalance(client, paid),
      };
    });
  }, [clients, plans, planDurations, paidByClientId, hoy]);

  const planOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) if (row.planLabel !== "—") names.add(row.planLabel);
    return [
      { value: "all", label: "Todos los planes" },
      ...[...names]
        .sort((a, b) => a.localeCompare(b, "es"))
        .map((name) => ({ value: name, label: name })),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (filter === "owing" && row.owed <= 0) return false;
      if (filter === "settled" && row.owed > 0) return false;
      if (planFilter !== "all" && row.planLabel !== planFilter) return false;
      return true;
    });
  }, [rows, filter, planFilter]);

  /**
   * Los totales de arriba salen de lo **filtrado**, no de toda la cartera: si
   * alguien filtra "con saldo", el número que quiere ver es cuánto suma ese
   * recorte, no el total de siempre.
   */
  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, row) => ({
          owed: acc.owed + row.owed,
          total: acc.total + row.client.totalAmount,
        }),
        { owed: 0, total: 0 }
      ),
    [filtered]
  );

  const selected = selectedId
    ? clients.find((c) => c.id === selectedId) ?? null
    : null;

  const handleAssignPlanConfirm = (planId: string | null) => {
    if (!assignPlanTarget) return;
    const target = assignPlanTarget;
    setAssignPlanTarget(null);
    startTransition(async () => {
      try {
        await assignClientPlanAction(target.id, planId);
        await refreshClients();
        push({ title: "Plan asignado", variant: "success" });
      } catch (e) {
        push({
          title: "No se pudo asignar el plan",
          description: e instanceof Error ? e.message : undefined,
        });
      }
    });
  };

  if (clientsLoading) {
    return (
      <div className="space-y-6">
        <PageHeader description="Plan, monto, adeudado y comprobantes de cada cliente" />
        <p className="text-sm text-muted-foreground">Cargando cobros…</p>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader description="Plan, monto, adeudado y comprobantes de cada cliente" />
        <EmptyState
          title="Todavía no hay clientes"
          description="Cuando se cierre una venta, el cliente aparece acá con sus condiciones de pago."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={paths.platform.sales.closing}>Ir a Closing</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader description="Plan, monto, adeudado y comprobantes de cada cliente" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <FilterPills
            options={COBRO_FILTERS}
            value={filter}
            onChange={(value) => setFilter(value as CobroFilter)}
          />
          {planOptions.length > 1 ? (
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm dark:border-white/[0.08] dark:bg-[#1A1A1A]"
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
            >
              {planOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        {puedeGestionar ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setPlansOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
            Crear planes
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <GlassPanel className="p-4">
          <p className="text-xs text-muted-foreground">Clientes</p>
          <p className="text-xl font-semibold tabular-nums">{filtered.length}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <p className="text-xs text-muted-foreground">Contratado</p>
          <p className="text-xl font-semibold tabular-nums">
            {formatCurrency(totals.total)}
          </p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <p className="text-xs text-muted-foreground">Adeudado</p>
          <p
            className={`text-xl font-semibold tabular-nums ${
              totals.owed > 0 ? "text-warning" : ""
            }`}
          >
            {loadingEnrichment ? "…" : formatCurrency(totals.owed)}
          </p>
        </GlassPanel>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Días restantes</th>
              <th className="px-4 py-3 font-medium">Pago</th>
              <th className="px-4 py-3 font-medium">Adeudado</th>
              <th className="px-4 py-3 font-medium">Monto</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <StaggerFade as="tbody">
            {filtered.map(({ client, planLabel, durationDays, remainingDays, owed }) => (
              <StaggerFadeItem
                as="tr"
                key={client.id}
                className={`border-b border-border/50 transition-colors hover:bg-muted/40 ${
                  selectedId === client.id ? "bg-muted/40" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <Link
                    href={paths.platform.clients.detail(client.id)}
                    className="font-medium hover:underline"
                  >
                    {client.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span>{planLabel}</span>
                    {puedeGestionar && plans.length > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground/60 hover:text-primary"
                        title="Modificar plan"
                        onClick={() => setAssignPlanTarget(client)}
                        disabled={pending}
                      >
                        <BookOpen className="h-3 w-3" />
                      </Button>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <RemainingDaysCell
                    days={remainingDays}
                    loading={loadingEnrichment}
                    hasDuration={!!durationDays}
                  />
                </td>
                <td className="px-4 py-3">{PAYMENT_LABEL[client.paymentType]}</td>
                <td className="px-4 py-3 tabular-nums">
                  {loadingEnrichment ? (
                    "…"
                  ) : (
                    <span className={owed > 0 ? "text-warning" : "text-muted-foreground"}>
                      {formatCurrency(owed)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {formatCurrency(client.totalAmount)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() =>
                      setSelectedId((current) =>
                        current === client.id ? null : client.id
                      )
                    }
                  >
                    {selectedId === client.id ? "Ocultar pagos" : "Ver pagos"}
                  </button>
                </td>
              </StaggerFadeItem>
            ))}
          </StaggerFade>
        </table>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No hay clientes con este filtro.
          </p>
        ) : null}
      </div>

      {/*
        El detalle del cobro del cliente elegido. Abajo de la tabla y no en un
        diálogo: registrar una cuota se hace mirando la fila de al lado.
      */}
      {selected ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Cobros de {selected.name}</h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => setSelectedId(null)}
            >
              <X className="h-3.5 w-3.5" />
              Cerrar
            </Button>
          </div>
          <ClientPaymentsSection client={selected} />
        </section>
      ) : null}

      {puedeGestionar ? (
        <PlanManagerDialog
          open={plansOpen}
          onOpenChange={setPlansOpen}
          plans={plans}
          onUpdated={setPlans}
        />
      ) : null}

      {assignPlanTarget ? (
        <AssignPlanDialog
          client={assignPlanTarget}
          plans={plans}
          onConfirm={handleAssignPlanConfirm}
          onCancel={() => setAssignPlanTarget(null)}
          pending={pending}
        />
      ) : null}
    </div>
  );
}

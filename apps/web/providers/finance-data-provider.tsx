"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createFixedExpenseAction,
  createPaymentPlatformAction,
  createSubscriptionAction,
  createTeamCompensationAction,
  deleteFixedExpenseAction,
  deletePaymentPlatformAction,
  deleteSubscriptionAction,
  deleteTeamCompensationAction,
  loadFinanceConfigAction,
  updateFixedExpenseAction,
  updatePaymentPlatformAction,
  updateSubscriptionAction,
  updateTeamCompensationAction,
} from "@/app/finance/actions";
import { listOrganizationPaymentsAction } from "@/app/sales/payment-actions";
import { fechaDeHoyEnZona } from "@/lib/fechas/calendario";
import { useZonaDeLaOrganizacion } from "@/providers/zona-de-la-organizacion-provider";
import { getSalesMetricsSnapshotsAction } from "@/app/sales/metrics-actions";
import {
  mockFinanceSummary,
  mockMonthlySeries,
} from "@/mocks/finance";
import { computeExpensesSummary } from "@/lib/metrics/compute-expenses-summary";
import { enrichTeamCompensationWithCommissions } from "@/lib/metrics/enrich-team-compensation";
import { deriveFinanceSummary } from "@/lib/metrics/derive-finance-summary";
import { deriveMonthlySeries } from "@/lib/metrics/derive-monthly-series";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { usePlatformData } from "@/providers/platform-data-provider";
import type {
  ExpensesSummary,
  FixedExpense,
  Subscription,
  TeamCompensation,
} from "@/types/expenses";
import type { FinanceSummary, PaymentPlatformConfig } from "@/types/finance";
import type { ClientPayment } from "@/types/clients";

const useSupabase = isSupabaseConfigured();

type FinanceDataContextValue = {
  paymentPlatforms: PaymentPlatformConfig[];
  financeConfigLoading: boolean;
  addPaymentPlatform: (
    platform: Omit<PaymentPlatformConfig, "id" | "totalReceived" | "lastTransactionAt">
  ) => Promise<string | undefined>;
  updatePaymentPlatform: (
    id: string,
    patch: Partial<PaymentPlatformConfig>
  ) => Promise<string | undefined>;
  removePaymentPlatform: (id: string) => Promise<string | undefined>;
  clientPayments: ClientPayment[];
  financeSummary: FinanceSummary;
  /** Métricas históricas importadas (snapshot más reciente). Null si no hay datos importados.
   *  Usar como fallback cuando los datos live (conversaciones, closing calls) están en cero. */
  salesBaselineMetrics: Record<string, number> | null;
  monthlySeries: typeof mockMonthlySeries;
  fixedExpenses: FixedExpense[];
  subscriptions: Subscription[];
  teamCompensation: TeamCompensation[];
  expensesSummary: ExpensesSummary;
  addFixedExpense: (expense: Omit<FixedExpense, "id">) => Promise<string | undefined>;
  updateFixedExpense: (
    id: string,
    patch: Partial<FixedExpense>
  ) => Promise<string | undefined>;
  removeFixedExpense: (id: string) => Promise<string | undefined>;
  addSubscription: (sub: Omit<Subscription, "id">) => Promise<string | undefined>;
  updateSubscription: (
    id: string,
    patch: Partial<Subscription>
  ) => Promise<string | undefined>;
  removeSubscription: (id: string) => Promise<string | undefined>;
  updateTeamCompensation: (
    id: string,
    patch: Partial<TeamCompensation>
  ) => Promise<string | undefined>;
  addTeamCompensation: (
    member: Omit<TeamCompensation, "id" | "estimatedThisMonth">
  ) => Promise<string | undefined>;
  removeTeamCompensation: (id: string) => Promise<string | undefined>;
  refreshFinanceConfig: () => Promise<void>;
  /**
   * ⭐ Vuelve a leer los pagos de clientes.
   *
   * Existía y **no se exponía**, así que ningún componente podía pedirlo. Ese
   * era el motivo real de que un pago recién cargado no apareciera en Finanzas
   * hasta apretar F5: el provider cuelga del layout de toda la plataforma, así
   * que navegar de la ficha del cliente a Finanzas no lo vuelve a montar.
   */
  refreshClientPayments: () => Promise<void>;
};

const FinanceDataContext = createContext<FinanceDataContextValue | null>(null);

export function FinanceDataProvider({ children }: { children: ReactNode }) {
  const zonaDeLaOrganizacion = useZonaDeLaOrganizacion();
  const { clients, closingCalls, clientsLoading, closingCallsLoading } =
    usePlatformData();

  const [financeConfigLoading, setFinanceConfigLoading] = useState(useSupabase);
  const [paymentPlatforms, setPaymentPlatforms] = useState<PaymentPlatformConfig[]>(
    []
  );
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [teamCompensation, setTeamCompensation] = useState<TeamCompensation[]>([]);
  const [clientPayments, setClientPayments] = useState<ClientPayment[]>([]);

  // Baseline: métricas históricas importadas por el usuario (fallback cuando no hay datos en vivo)
  const [salesBaselineMetrics, setSalesBaselineMetrics] = useState<Record<string, number> | null>(null);

  const refreshClientPayments = useCallback(async () => {
    if (!useSupabase) return;
    const payments = await listOrganizationPaymentsAction();
    setClientPayments(payments);
  }, []);

  const refreshFinanceConfig = useCallback(async () => {
    if (!useSupabase) return;
    setFinanceConfigLoading(true);
    try {
      const config = await loadFinanceConfigAction();
      setPaymentPlatforms(config.paymentPlatforms);
      setFixedExpenses(config.fixedExpenses);
      setSubscriptions(config.subscriptions);
      setTeamCompensation(config.teamCompensation);
    } catch (e) {
      console.error("[FinanceDataProvider] loadFinanceConfig", e);
    } finally {
      setFinanceConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    if (useSupabase) {
      void refreshFinanceConfig();
      void refreshClientPayments();
    } else {
      void loadFinanceConfigAction().then((config) => {
        setPaymentPlatforms(config.paymentPlatforms);
        setFixedExpenses(config.fixedExpenses);
        setSubscriptions(config.subscriptions);
        setTeamCompensation(config.teamCompensation);
      });
    }
  }, [refreshFinanceConfig]);

  useEffect(() => {
    if (useSupabase && !clientsLoading) {
      void refreshClientPayments();
    }
  }, [clients.length, clientsLoading, refreshClientPayments]);

  // Cargar baseline de ventas una vez al montar (datos históricos importados)
  useEffect(() => {
    if (!useSupabase) return;
    // El baseline es opcional y no tiene pantalla propia: si no se puede leer,
    // queda registrado en la consola como antes (SCRUM-504: ahora el motivo
    // vuelve como valor).
    getSalesMetricsSnapshotsAction()
      .then((resultado) => {
        if (!resultado.success) {
          console.error("[FinanceDataProvider] baseline load", resultado.error);
          return;
        }
        if (resultado.data.length > 0) {
          setSalesBaselineMetrics(resultado.data[0].metrics);
        }
      })
      .catch((e) => console.error("[FinanceDataProvider] baseline load", e));
  }, []);

  const runFinanceMutation = useCallback(
    async (result: { success: boolean; error?: string }) => {
      if (!result.success) return result.error ?? "Error al guardar";
      await refreshFinanceConfig();
      return undefined;
    },
    [refreshFinanceConfig]
  );

  const addPaymentPlatform = useCallback(
    async (
      platform: Omit<
        PaymentPlatformConfig,
        "id" | "totalReceived" | "lastTransactionAt"
      >
    ) => {
      if (useSupabase) {
        return runFinanceMutation(await createPaymentPlatformAction(platform));
      }
      setPaymentPlatforms((prev) => [
        ...prev,
        {
          ...platform,
          id: `pp-${Date.now()}`,
          totalReceived: 0,
          lastTransactionAt: fechaDeHoyEnZona(zonaDeLaOrganizacion),
        },
      ]);
      return undefined;
    },
    [refreshFinanceConfig, runFinanceMutation, zonaDeLaOrganizacion]
  );

  const updatePaymentPlatform = useCallback(
    async (id: string, patch: Partial<PaymentPlatformConfig>) => {
      if (useSupabase) {
        return runFinanceMutation(await updatePaymentPlatformAction(id, patch));
      }
      setPaymentPlatforms((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
      );
      return undefined;
    },
    [refreshFinanceConfig, runFinanceMutation]
  );

  const removePaymentPlatform = useCallback(
    async (id: string) => {
      if (useSupabase) {
        return runFinanceMutation(await deletePaymentPlatformAction(id));
      }
      setPaymentPlatforms((prev) => prev.filter((p) => p.id !== id));
      return undefined;
    },
    [refreshFinanceConfig, runFinanceMutation]
  );

  const addFixedExpense = useCallback(
    async (expense: Omit<FixedExpense, "id">) => {
      if (useSupabase) {
        return runFinanceMutation(await createFixedExpenseAction(expense));
      }
      setFixedExpenses((prev) => [
        ...prev,
        { ...expense, id: `fe-${Date.now()}` },
      ]);
      return undefined;
    },
    [refreshFinanceConfig, runFinanceMutation]
  );

  const updateFixedExpense = useCallback(
    async (id: string, patch: Partial<FixedExpense>) => {
      if (useSupabase) {
        return runFinanceMutation(await updateFixedExpenseAction(id, patch));
      }
      setFixedExpenses((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
      );
      return undefined;
    },
    [refreshFinanceConfig, runFinanceMutation]
  );

  const removeFixedExpense = useCallback(
    async (id: string) => {
      if (useSupabase) {
        return runFinanceMutation(await deleteFixedExpenseAction(id));
      }
      setFixedExpenses((prev) => prev.filter((e) => e.id !== id));
      return undefined;
    },
    [refreshFinanceConfig, runFinanceMutation]
  );

  const addSubscription = useCallback(
    async (sub: Omit<Subscription, "id">) => {
      if (useSupabase) {
        return runFinanceMutation(await createSubscriptionAction(sub));
      }
      setSubscriptions((prev) => [...prev, { ...sub, id: `sub-${Date.now()}` }]);
      return undefined;
    },
    [refreshFinanceConfig, runFinanceMutation]
  );

  const updateSubscription = useCallback(
    async (id: string, patch: Partial<Subscription>) => {
      if (useSupabase) {
        return runFinanceMutation(await updateSubscriptionAction(id, patch));
      }
      setSubscriptions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
      );
      return undefined;
    },
    [refreshFinanceConfig, runFinanceMutation]
  );

  const removeSubscription = useCallback(
    async (id: string) => {
      if (useSupabase) {
        return runFinanceMutation(await deleteSubscriptionAction(id));
      }
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
      return undefined;
    },
    [refreshFinanceConfig, runFinanceMutation]
  );

  const updateTeamCompensation = useCallback(
    async (id: string, patch: Partial<TeamCompensation>) => {
      if (useSupabase) {
        return runFinanceMutation(await updateTeamCompensationAction(id, patch));
      }
      setTeamCompensation((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
      );
      return undefined;
    },
    [refreshFinanceConfig, runFinanceMutation]
  );

  const addTeamCompensation = useCallback(
    async (member: Omit<TeamCompensation, "id" | "estimatedThisMonth">) => {
      if (useSupabase) {
        return runFinanceMutation(await createTeamCompensationAction(member));
      }
      setTeamCompensation((prev) => [
        ...prev,
        {
          ...member,
          id: `team-${Date.now()}`,
          memberId: member.memberId || `member-${Date.now()}`,
          estimatedThisMonth: 0,
        },
      ]);
      return undefined;
    },
    [refreshFinanceConfig, runFinanceMutation]
  );

  const removeTeamCompensation = useCallback(
    async (id: string) => {
      if (useSupabase) {
        return runFinanceMutation(await deleteTeamCompensationAction(id));
      }
      setTeamCompensation((prev) => prev.filter((t) => t.id !== id));
      return undefined;
    },
    [refreshFinanceConfig, runFinanceMutation]
  );

  const enrichedTeamCompensation = useMemo(
    () =>
      enrichTeamCompensationWithCommissions(teamCompensation, closingCalls),
    [teamCompensation, closingCalls]
  );

  const expensesSummary = useMemo(
    () =>
      computeExpensesSummary(
        fixedExpenses,
        subscriptions,
        enrichedTeamCompensation
      ),
    [fixedExpenses, subscriptions, enrichedTeamCompensation]
  );

  const dataReady =
    !useSupabase || (!clientsLoading && !closingCallsLoading && !financeConfigLoading);

  const financeSummary: FinanceSummary = useMemo(() => {
    if (!useSupabase) return mockFinanceSummary;
    const sourceClients = dataReady ? clients : [];
    const sourceCalls = dataReady ? closingCalls : [];
    const live = deriveFinanceSummary(
      sourceClients,
      sourceCalls,
      expensesSummary,
      paymentPlatforms,
      undefined,
      dataReady ? clientPayments : []
    );

    // Si hay datos en vivo (clientes con facturación real), usarlos tal cual
    if (live.facturacion > 0 || !salesBaselineMetrics) return live;

    // Fallback a baseline: el usuario aún no tiene datos integrados,
    // pero sí tiene métricas históricas importadas manualmente
    const bFact = salesBaselineMetrics["facturacion"] ?? 0;
    // Preferir gastos configurados en el módulo (live.gastosTotales) sobre el snapshot,
    // ya que el snapshot de ventas raramente incluye un campo "gastos".
    // El snapshot es la fuente de ingresos históricos; los gastos vienen de la config del módulo.
    const bGastosSnapshot = salesBaselineMetrics["gastos"] ?? 0;
    const effectiveGastos = live.gastosTotales > 0 ? live.gastosTotales : bGastosSnapshot;
    const bCash =
      salesBaselineMetrics["cash_collected"] != null
        ? salesBaselineMetrics["cash_collected"]
        : Math.max(0, bFact - effectiveGastos);
    const bMargen = bFact > 0 ? ((bFact - effectiveGastos) / bFact) * 100 : 0;

    return {
      ...live,
      facturacion: bFact,
      cashCollected: bCash,
      gastosTotales: effectiveGastos,
      margenPercent: bMargen,
    };
  }, [
    clients,
    closingCalls,
    expensesSummary,
    paymentPlatforms,
    clientPayments,
    dataReady,
    salesBaselineMetrics,
  ]);

  const monthlySeries = useMemo(() => {
    if (!useSupabase) return mockMonthlySeries;
    const sourceClients = dataReady ? clients : [];
    const series = deriveMonthlySeries(
      sourceClients,
      expensesSummary,
      dataReady ? clientPayments : []
    );

    // Fallback baseline: si la serie completa está en cero y hay métricas importadas,
    // pintar el mes más reciente con los valores del snapshot para que los gráficos
    // no muestren una línea plana en cero.
    if (salesBaselineMetrics) {
      const hasLiveData = series.some((m) => m.facturacion > 0);
      if (!hasLiveData) {
        const bFact = salesBaselineMetrics["facturacion"] ?? 0;
        if (bFact > 0) {
          const bGastos = expensesSummary.totalMonthly; // usar gastos configurados actuales
          const bCash = Math.max(0, bFact - bGastos);
          const bMargin = bFact > 0 ? (bCash / bFact) * 100 : 0;
          const patched = [...series];
          const last = patched[patched.length - 1];
          if (last) {
            patched[patched.length - 1] = {
              ...last,
              facturacion: bFact,
              cashCollected: bCash,
              marginPercent: bMargin,
            };
          }
          return patched;
        }
      }
    }

    return series;
  }, [clients, clientPayments, expensesSummary, dataReady, salesBaselineMetrics]);

  const value = useMemo(
    () => ({
      paymentPlatforms,
      financeConfigLoading,
      clientPayments,
      addPaymentPlatform,
      updatePaymentPlatform,
      removePaymentPlatform,
      financeSummary,
      salesBaselineMetrics,
      monthlySeries,
      fixedExpenses,
      subscriptions,
      teamCompensation: enrichedTeamCompensation,
      expensesSummary,
      addFixedExpense,
      updateFixedExpense,
      removeFixedExpense,
      addSubscription,
      updateSubscription,
      removeSubscription,
      updateTeamCompensation,
      addTeamCompensation,
      removeTeamCompensation,
      refreshFinanceConfig,
      refreshClientPayments,
    }),
    [
      paymentPlatforms,
      financeConfigLoading,
      clientPayments,
      addPaymentPlatform,
      updatePaymentPlatform,
      removePaymentPlatform,
      financeSummary,
      salesBaselineMetrics,
      monthlySeries,
      fixedExpenses,
      subscriptions,
      enrichedTeamCompensation,
      expensesSummary,
      addFixedExpense,
      updateFixedExpense,
      removeFixedExpense,
      addSubscription,
      updateSubscription,
      removeSubscription,
      updateTeamCompensation,
      addTeamCompensation,
      removeTeamCompensation,
      refreshFinanceConfig,
      refreshClientPayments,
    ]
  );

  return (
    <FinanceDataContext.Provider value={value}>{children}</FinanceDataContext.Provider>
  );
}

export function useFinanceData(): FinanceDataContextValue {
  const ctx = useContext(FinanceDataContext);
  if (!ctx) {
    throw new Error("useFinanceData debe usarse dentro de FinanceDataProvider");
  }
  return ctx;
}

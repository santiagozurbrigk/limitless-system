"use client";

import { useEffect, useMemo, useState } from "react";
import { usePlatformData, useFinanceData } from "@/providers";
import { deriveSalesMetrics } from "@/lib/metrics/derive-sales-metrics";
import { padTimeSeriesZeros } from "@/lib/chart/pad-time-series";
import {
  getSalesPerformanceMetricsAction,
} from "@/app/sales/metrics-actions";
import type { SalesPerformanceMetrics } from "@/types/sales";
import { leerConMotivo } from "@/lib/client/correr-accion";
import type { DateRange } from "./date-range-picker";
import { brandColors } from "@/lib/brand";

/** Hook central de métricas de ventas. Encapsula fetching, filtrado y memoization. */
export function useSalesMetrics(dateRange: DateRange) {
  const { conversations, closingCalls, salesMetrics, salesMetricsLoading } =
    usePlatformData();
  const { financeSummary, monthlySeries, financeConfigLoading } = useFinanceData();

  // ── Métricas de performance (server action) ────────────────────────────────
  const [perfMetrics, setPerfMetrics] = useState<SalesPerformanceMetrics | null>(null);
  const [perfLoading, setPerfLoading] = useState(true);
  // Por qué no se pudieron leer las métricas del rango (SCRUM-504): la
  // pantalla lo muestra en vez de quedarse en cero sin explicación.
  const [perfError, setPerfError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPerfLoading(true);
    setPerfError(null);
    void leerConMotivo(
      () =>
        getSalesPerformanceMetricsAction("custom", {
          from: dateRange.from.toISOString(),
          to: dateRange.to.toISOString(),
        }),
      "[useSalesMetrics] rendimiento"
    ).then((lectura) => {
      if (cancelled) return;
      if (lectura.ok) {
        setPerfMetrics(lectura.data);
      } else {
        setPerfMetrics(null);
        setPerfError(lectura.motivo);
      }
      setPerfLoading(false);
    });
    return () => { cancelled = true; };
  }, [dateRange]);

  // ── Conversaciones filtradas por rango ────────────────────────────────────
  const filteredConversations = useMemo(
    () =>
      conversations.filter((c) => {
        const d = new Date(c.lastMessageAt);
        return d >= dateRange.from && d <= dateRange.to;
      }),
    [conversations, dateRange]
  );

  const filteredCalls = useMemo(
    () =>
      closingCalls.filter((c) => {
        if (!c.scheduledAt) return false;
        const d = new Date(c.scheduledAt);
        return d >= dateRange.from && d <= dateRange.to;
      }),
    [closingCalls, dateRange]
  );

  // Métricas derivadas del rango filtrado
  const filteredMetrics = useMemo(
    () => deriveSalesMetrics(filteredConversations, filteredCalls),
    [filteredConversations, filteredCalls]
  );

  // ── Series de tiempo ───────────────────────────────────────────────────────

  /** Sparkline del booking trend aplanado a 7 puntos */
  const bookingSparkData = useMemo(
    () => padTimeSeriesZeros(salesMetrics.bookingTrend, 7).map((d) => d.value),
    [salesMetrics.bookingTrend]
  );

  /** Agendas por semana (6 semanas) para hero de agendas */
  const agendasSparkData = useMemo(() => {
    const weeks = 6;
    const now = new Date();
    return Array.from({ length: weeks }, (_, i) => {
      const start = new Date(now);
      start.setDate(start.getDate() - (weeks - 1 - i) * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return closingCalls.filter((c) => {
        const d = c.scheduledAt ? new Date(c.scheduledAt) : null;
        return d && d >= start && d < end;
      }).length;
    });
  }, [closingCalls]);

  /** Serie semanal para DualAreaChart: conversaciones nuevas vs agendadas */
  const weeklyTrend = useMemo(() => {
    const weeks = 6;
    const now = new Date();
    return Array.from({ length: weeks }, (_, i) => {
      const start = new Date(now);
      start.setDate(start.getDate() - (weeks - 1 - i) * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const label = start.toLocaleDateString("es-AR", {
        day: "numeric",
        month: "short",
      });
      const total = conversations.filter((c) => {
        const d = new Date(c.lastMessageAt);
        return d >= start && d < end;
      }).length;
      const booked = conversations.filter((c) => {
        const d = new Date(c.lastMessageAt);
        return (
          d >= start &&
          d < end &&
          (c.status === "booked" || c.tag === "agendado")
        );
      }).length;
      return { label, primary: total, secondary: booked };
    });
  }, [conversations]);

  // ── Distribución de fuentes de leads ─────────────────────────────────────
  const leadSourceSlices = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of filteredConversations) {
      const src = (c.source as string | undefined) ?? "manual";
      counts[src] = (counts[src] ?? 0) + 1;
    }
    const COLOR: Record<string, string> = {
      instagram: "#E1306C",
      whatsapp: "#25D366",
      manychat: "#0084FF",
      manual: "#64748b",
      web: brandColors.primary,
    };
    const LABEL: Record<string, string> = {
      instagram: "Instagram",
      whatsapp: "WhatsApp",
      manychat: "ManyChat",
      manual: "Manual",
      web: "Web / Landing",
    };
    const total = filteredConversations.length || 1;
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([key, value]) => ({
        label: LABEL[key] ?? key,
        value,
        color: COLOR[key] ?? "#94a3b8",
        pct: Math.round((value / total) * 100),
      }));
  }, [filteredConversations]);

  // ── Estado de conversaciones ──────────────────────────────────────────────
  const convStatusSlices = useMemo(() => {
    const active = filteredConversations.filter((c) => c.status === "active").length;
    const booked = filteredConversations.filter(
      (c) =>
        c.status === "booked" || c.tag === "agendado" || c.tag === "closeado"
    ).length;
    const ghosted = filteredConversations.filter((c) => c.status === "ghosted").length;
    const closed = filteredConversations.filter((c) => c.status === "closed").length;
    return [
      { label: "Activas", value: active, color: brandColors.primary },
      { label: "Agendadas", value: booked, color: "#10b981" },
      { label: "Ghosted", value: ghosted, color: "#f59e0b" },
      { label: "Cerradas", value: closed, color: "#64748b" },
    ].filter((s) => s.value > 0);
  }, [filteredConversations]);

  // ── Etapas del embudo ─────────────────────────────────────────────────────
  const funnelStages = useMemo(() => {
    const leads = perfMetrics?.leads.leadsCount ?? filteredConversations.length;
    const agendas = perfMetrics?.leads.agendasCount ?? 0;
    const asistencias = perfMetrics?.calls.asistencias ?? 0;
    const cierres = perfMetrics?.calls.cierres ?? 0;
    return [
      { label: "Leads", value: leads },
      { label: "Agendas", value: agendas },
      { label: "Asistencias", value: asistencias },
      { label: "Cierres", value: cierres },
    ].filter((s) => s.value > 0);
  }, [perfMetrics, filteredConversations]);

  // ── Series de facturación para sparklines ─────────────────────────────────
  const facturacionSparkData = useMemo(
    () => monthlySeries.map((m) => m.facturacion),
    [monthlySeries]
  );

  const cashCollectedSparkData = useMemo(
    () => monthlySeries.map((m) => m.cashCollected),
    [monthlySeries]
  );

  return {
    isLoading: salesMetricsLoading || perfLoading || financeConfigLoading,
    perfMetrics,
    perfError,
    filteredMetrics,
    filteredConversations,
    // finanzas
    financeSummary,
    facturacionSparkData,
    cashCollectedSparkData,
    // series
    bookingSparkData,
    agendasSparkData,
    weeklyTrend,
    // distribuciones
    leadSourceSlices,
    convStatusSlices,
    funnelStages,
  };
}

"use client";

import { motion } from "framer-motion";
import type { DashboardData } from "@/types/dashboard";
import { RevenueMetricsSection } from "./revenue-metrics-section";
import { SalesMetricsSection } from "./sales-metrics-section";
import { DashboardEmptyState } from "./dashboard-empty-state";
import { ZernioAnalyticsSection } from "./zernio-analytics-section";
import { TopKpiRow } from "./top-kpi-row";
import { SalesFunnelStrip } from "./sales-funnel-strip";
import type { SalesFunnel } from "@/lib/metrics/build-sales-funnel-stages";
import type { ZernioAnalyticsSummary } from "@/app/integrations/zernio/actions";
import { SalesTeamPerformanceSection } from "@/components/sales/sales-team-performance-section";

const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
};

export function DashboardOverview({
  data,
  embudo,
  zernioAnalytics,
}: {
  data: DashboardData;
  embudo: SalesFunnel;
  zernioAnalytics?: ZernioAnalyticsSummary;
}) {
  if (data.isEmpty) {
    return <DashboardEmptyState />;
  }

  return (
    <motion.div
      className="space-y-6"
      initial="initial"
      animate="animate"
      variants={{
        animate: { transition: { staggerChildren: 0.06 } },
      }}
    >
      {/* 1 — KPIs clave: ingresos + ventas de un vistazo */}
      <motion.div variants={fade}>
        <TopKpiRow
          revenueMetrics={data.revenueMetrics}
          salesMetrics={data.salesMetrics}
        />
      </motion.div>

      {/* 2 — Embudo de conversión DMs → clientes */}
      <motion.div variants={fade}>
        <SalesFunnelStrip embudo={embudo} />
      </motion.div>

      {/* 3 — Métricas de ingresos con sparklines */}
      <motion.div variants={fade}>
        <RevenueMetricsSection metrics={data.revenueMetrics} />
      </motion.div>

      {/* 4 — Métricas de ventas: booking rate, conversaciones, ghosting */}
      <motion.div variants={fade}>
        <SalesMetricsSection metrics={data.salesMetrics} />
      </motion.div>

      {/* 5 — Rendimiento de closers */}
      <motion.div variants={fade}>
        <SalesTeamPerformanceSection />
      </motion.div>

      {/* 6 — Redes sociales: alcance e engagement vía Zernio */}
      <motion.div variants={fade}>
        <ZernioAnalyticsSection
          analytics={
            zernioAnalytics ?? {
              totalImpressions: 0,
              totalLikes: 0,
              totalComments: 0,
              hasData: false,
            }
          }
        />
      </motion.div>
    </motion.div>
  );
}

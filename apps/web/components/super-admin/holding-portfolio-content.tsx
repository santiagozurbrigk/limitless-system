"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, MetricBand, MetricStat, cn } from "@ai-coo/ui";
import { Panel } from "@/components/shared/panel";
import { formatUsd } from "@/lib/super-admin/org-metrics";
import {
  ETIQUETA_DE_ESTADO_DE_ORG,
  VARIANTE_DE_ESTADO_DE_ORG,
} from "@/lib/super-admin/estado-de-org";
import type {
  HoldingHealthStatus,
  HoldingKPIs,
  HoldingPortfolioOrg,
} from "@/lib/super-admin/holding-queries";
import { paths } from "@/routes";
import { HoldingCreateOrgDialog } from "./holding-create-org-dialog";

type HealthFilter = "all" | HoldingHealthStatus;

const HEALTH_LABEL: Record<HoldingHealthStatus, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
};

const HEALTH_VARIANT: Record<
  HoldingHealthStatus,
  "success" | "warning" | "destructive"
> = {
  healthy: "success",
  warning: "warning",
  critical: "destructive",
};

function marginColor(margin: number): string {
  if (margin >= 80) return "text-emerald-600";
  if (margin >= 60) return "text-amber-600";
  return "text-red-600";
}

export function HoldingPortfolioContent({
  holdingName,
  kpis,
  organizations,
}: {
  holdingName: string;
  kpis: HoldingKPIs;
  organizations: HoldingPortfolioOrg[];
}) {
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");

  const filtered = useMemo(() => {
    if (healthFilter === "all") return organizations;
    return organizations.filter((org) => org.healthStatus === healthFilter);
  }, [organizations, healthFilter]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{holdingName}</h2>
          <p className="text-sm text-muted-foreground">
            Vista portfolio — {kpis.totalOrgs} organizaciones
          </p>
        </div>
        <HoldingCreateOrgDialog />
      </div>

      <MetricBand>
        <MetricStat title="Total orgs" value={String(kpis.totalOrgs)} />
        <MetricStat title="MRR total" value={formatUsd(kpis.totalMRR)} />
        <MetricStat
          title="Conversaciones activas (30d)"
          value={String(kpis.activeConversations)}
        />
        <MetricStat
          title="Costo IA este mes"
          value={formatUsd(kpis.totalAICostThisMonth)}
        />
      </MetricBand>

      <p className="text-sm">
        Margen estimado:{" "}
        <span className={cn("font-semibold", marginColor(kpis.estimatedMargin))}>
          {kpis.estimatedMargin}%
        </span>{" "}
        <span className="text-muted-foreground">
          (MRR total − costo IA) / MRR total
        </span>
      </p>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "Todas"],
            ["healthy", "Healthy"],
            ["warning", "Warning"],
            ["critical", "Critical"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={healthFilter === key ? "default" : "outline"}
            onClick={() => setHealthFilter(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay organizaciones para este filtro.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((org) => (
            <Panel
              key={org.id}
              title={org.name}
              subtitle={org.industry ?? "Sin industria"}
              contentClassName="space-y-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={VARIANTE_DE_ESTADO_DE_ORG[org.status]}>
                  {ETIQUETA_DE_ESTADO_DE_ORG[org.status]}
                </Badge>
                <Badge variant={HEALTH_VARIANT[org.healthStatus]}>
                  {HEALTH_LABEL[org.healthStatus]} · {org.healthScore}
                </Badge>
                {org.metrics.hasInstagram && (
                  <Badge variant="secondary">Instagram</Badge>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">MRR</dt>
                  <dd className="font-medium tabular-nums">
                    {formatUsd(org.metrics.mrr)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Clientes</dt>
                  <dd className="font-medium tabular-nums">
                    {org.metrics.clients}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Team</dt>
                  <dd className="font-medium tabular-nums">
                    {org.metrics.teamMembers} miembros
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Conversaciones (30d)
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {org.metrics.activeConversations}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">
                    Costo IA este mes
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {formatUsd(org.metrics.aiCostThisMonth)}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <Link href={paths.superAdmin.organizationDetail(org.id)}>
                    Ver detalle
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" className="flex-1" disabled>
                  Acceder como org (próximamente)
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

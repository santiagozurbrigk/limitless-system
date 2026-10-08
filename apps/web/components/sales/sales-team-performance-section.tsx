"use client";

import { useEffect, useState } from "react";
import { getTeamRankingAction } from "@/app/sales/actions";
import {
  TeamCallRanking,
  TeamPerformanceSummary,
} from "@/components/sales/team-call-ranking";
import { EmptyState } from "@/components/shared/empty-state";
import type { TeamRankingEntry } from "@/types/call-analysis";
import { leerConMotivo } from "@/lib/client/correr-accion";

export function SalesTeamPerformanceSection() {
  const [ranking, setRanking] = useState<TeamRankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [motivo, setMotivo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void leerConMotivo(getTeamRankingAction, "[SalesTeamPerformanceSection]").then(
      (lectura) => {
        if (cancelled) return;
        if (lectura.ok) setRanking(lectura.data);
        else setMotivo(lectura.motivo);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RendimientoDelEquipo loading={loading} motivo={motivo} ranking={ranking} />
  );
}

/**
 * Lo que se ve según el estado de la carga. `motivo`: por qué no se pudo leer
 * el ranking (lo devuelve la acción; si fue inesperado, el texto fijo).
 */
export function RendimientoDelEquipo({
  loading,
  motivo,
  ranking,
}: {
  loading: boolean;
  motivo: string | null;
  ranking: TeamRankingEntry[];
}) {
  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">
        Cargando rendimiento del equipo…
      </p>
    );
  }

  if (motivo) {
    return (
      <EmptyState
        variant="inline"
        title="No pudimos cargar el rendimiento del equipo"
        description={motivo}
      />
    );
  }

  if (ranking.length === 0) {
    return (
      <EmptyState
        variant="inline"
        title="Todavía no hay análisis de calls"
        description="Conectá Fathom y procesá llamadas para ver el ranking y la evolución del equipo."
      />
    );
  }

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">
        Rendimiento del equipo de ventas
      </h3>
      <TeamCallRanking entries={ranking} />
      <TeamPerformanceSummary entries={ranking} />
    </section>
  );
}

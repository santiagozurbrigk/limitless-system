"use client";

import { useEffect, useState } from "react";
import { Button } from "@ai-coo/ui";
import { ChevronDown, ExternalLink, Phone, TrendingUp, X } from "lucide-react";
import {
  getCloserEvolutionAction,
  getTeamAverageEvolutionAction,
  getTeamRankingAction,
} from "@/app/sales/actions";
import { ClientCallAnalysisSection } from "@/components/clients/client-call-analysis";
import { CloserEvolutionChart } from "@/components/clients/closer-evolution-chart";
import {
  TeamCallRanking,
  TeamPerformanceSummary,
} from "@/components/sales/team-call-ranking";
import type { ClientLinkedCall } from "@/types/clients";
import { FichaSection } from "@/components/clients/ficha-section";
import type { TeamRankingEntry } from "@/types/call-analysis";
import { cn } from "@/lib/utils";
import { leerConMotivo, type Lectura } from "@/lib/client/correr-accion";

function CallAnalysisEmptyState() {
  return (
    <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/5 px-4 py-8 text-center dark:border-white/[0.08]">
      <p className="text-sm font-medium text-foreground">Análisis no disponible</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Esta llamada aún no tiene análisis. Se generará automáticamente cuando Fathom
        esté conectado y la transcripción esté procesada.
      </p>
    </div>
  );
}

/**
 * El contenido del panel según el estado de la carga. `motivo`: por qué no se
 * pudo leer (lo devuelve la acción; si fue inesperado, el texto fijo).
 */
export function EvolucionDelCloser({
  loading,
  motivo,
  closerName,
  scores,
  teamAverage,
  ranking,
}: {
  loading: boolean;
  motivo: string | null;
  closerName: string;
  scores: number[];
  teamAverage: number[];
  ranking: TeamRankingEntry[];
}) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando evolución…</p>;
  }
  if (motivo) {
    return (
      <p className="text-sm text-destructive">
        No pudimos cargar la evolución. {motivo}
      </p>
    );
  }
  if (scores.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay análisis de calls para este closer.
      </p>
    );
  }
  return (
    <>
      <CloserEvolutionChart
        closerName={closerName}
        scores={scores}
        teamAverage={teamAverage}
      />
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          Ranking del equipo
        </h3>
        <TeamCallRanking entries={ranking} />
      </div>
    </>
  );
}

/**
 * Las tres lecturas del panel de evolución. Si una falla, el motivo de la
 * primera que falló (lo devuelve la acción; si fue inesperado, el texto fijo).
 */
export async function cargarEvolucionDelCloser(closerName: string): Promise<
  Lectura<{ scores: number[]; teamAverage: number[]; ranking: TeamRankingEntry[] }>
> {
  const [evolution, avg, team] = await Promise.all([
    leerConMotivo(() => getCloserEvolutionAction(closerName), "[CloserEvolutionSheet] evolución"),
    leerConMotivo(getTeamAverageEvolutionAction, "[CloserEvolutionSheet] promedio"),
    leerConMotivo(getTeamRankingAction, "[CloserEvolutionSheet] ranking"),
  ]);
  if (!evolution.ok) return evolution;
  if (!avg.ok) return avg;
  if (!team.ok) return team;
  return {
    ok: true,
    data: { scores: evolution.data, teamAverage: avg.data, ranking: team.data },
  };
}

function CloserEvolutionSheet({
  open,
  onOpenChange,
  closerName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closerName: string;
}) {
  const [scores, setScores] = useState<number[]>([]);
  const [teamAverage, setTeamAverage] = useState<number[]>([]);
  const [ranking, setRanking] = useState<TeamRankingEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void cargarEvolucionDelCloser(closerName).then((lectura) => {
      if (cancelled) return;
      if (lectura.ok) {
        setScores(lectura.data.scores);
        setTeamAverage(lectura.data.teamAverage);
        setRanking(lectura.data.ranking);
      } else {
        setLoadError(lectura.motivo);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, closerName]);

  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default bg-black/50"
          aria-label="Cerrar panel de evolución"
          onClick={() => onOpenChange(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-border/40 bg-background p-6 shadow-xl transition-transform duration-200 dark:border-white/[0.08] dark:bg-[#0A0A0A]",
          open ? "translate-x-0" : "translate-x-full"
        )}
        aria-hidden={!open}
      >
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium">Evolución del closer</h2>
            <p className="text-xs text-muted-foreground">{closerName}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-8 overflow-y-auto">
          <EvolucionDelCloser
            loading={loading}
            motivo={loadError}
            closerName={closerName}
            scores={scores}
            teamAverage={teamAverage}
            ranking={ranking}
          />
        </div>
      </aside>
    </>
  );
}

/**
 * Las llamadas de **venta** del cliente, con el análisis del closer.
 *
 * ⭐ Se llamaba «Llamadas del cliente» y no lo era: `clients.linked_calls`, su
 * única fuente, lo escribe sólo el análisis profundo de las llamadas de venta.
 * Una ficha con diez sesiones de acompañamiento mostraba igual «Sin llamadas
 * vinculadas», y el cartel invitaba a conectar Fathom cuando Fathom ya estaba
 * conectado. Las 1-1 viven en `ClientOneOnOnesSection`, que es la sección de al
 * lado.
 *
 * ⭐ Y no se muestra vacía. Un cliente que entró sin llamada de venta grabada
 * —importado, o vendido por DM— no tiene nada que ver acá, y un cartel de
 * "no hay nada" permanente en cada ficha es ruido, no información.
 */
export function ClientLinkedCallsSection({
  calls,
}: {
  calls: ClientLinkedCall[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [evolutionOpen, setEvolutionOpen] = useState(false);
  const [evolutionCloser, setEvolutionCloser] = useState("");

  const openEvolution = (closerName: string) => {
    setEvolutionCloser(closerName);
    setEvolutionOpen(true);
  };

  if (calls.length === 0) return null;

  return (
    <>
      <FichaSection
        icon={Phone}
        title="Llamadas de venta"
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => openEvolution(calls[0]?.closerName ?? "")}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Ver evolución del closer
          </Button>
        }
      >
        <ul className="space-y-2">
          {calls.map((call) => {
            const expanded = expandedId === call.id;
            return (
              <li
                key={call.id}
                className="rounded-lg border border-border px-4 py-3 dark:border-white/[0.08]"
              >
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    onClick={() =>
                      setExpandedId(expanded ? null : call.id)
                    }
                  >
                    <ChevronDown
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        expanded && "rotate-180"
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{call.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {call.date} · {call.duration}
                        {call.closerName ? ` · ${call.closerName}` : ""}
                      </p>
                    </div>
                  </button>
                  <Button size="sm" variant="ghost" asChild>
                    <a
                      href={call.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="gap-1"
                    >
                      Fathom
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                </div>

                {expanded && call.analysis ? (
                  <ClientCallAnalysisSection
                    analysis={call.analysis}
                    durationLabel={call.duration}
                  />
                ) : null}
                {expanded && !call.analysis ? <CallAnalysisEmptyState /> : null}
              </li>
            );
          })}
        </ul>
      </FichaSection>

      <CloserEvolutionSheet
        open={evolutionOpen}
        onOpenChange={setEvolutionOpen}
        closerName={evolutionCloser}
      />
    </>
  );
}

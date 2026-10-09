"use server";

import {
  isMissingTableError,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { fechaDeInstanteEnZona } from "@/lib/fechas/calendario";
import { leerZonaHorariaDeLaOrganizacion } from "@/lib/fechas/organizacion";
import {
  getTeamAverageEvolution,
  mockCallAnalyses,
  mockCloserEvolution,
  mockTeamRanking,
} from "@/mocks/call-analyses";
import type { TeamRankingEntry } from "@/types/call-analysis";
import type { FrequentObjectionsResult } from "@/types/sales";
import {
  getFrequentObjections,
  mockFrequentObjectionSummaries,
} from "@/lib/metrics/frequent-objections";
import { getLeadJourney, getZernioLeadJourney } from "@/lib/sales/lead-journey";
import type { LeadJourneyContext, RecorridoDelLead } from "@/lib/sales/lead-journey";
import {
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";

type CallAnalysisRow = {
  closer_id: string | null;
  closer_name: string | null;
  overall_score: number | null;
  booked: boolean;
  sold: boolean;
  call_date?: string | null;
};

function mockCloserEvolutionForName(closerName: string): number[] {
  const key = closerName
    .split(" ")[0]
    ?.toLowerCase() as keyof typeof mockCloserEvolution;
  return mockCloserEvolution[key] ?? mockCloserEvolution.carlos;
}

/**
 * El promedio del equipo por día. El día de cada llamada es el de la zona de la
 * organización (`zona`): con el de UTC, una llamada de las 22:00 en Argentina
 * se sumaba al día siguiente (SCRUM-493).
 */
function aggregateTeamAverageByDate(
  rows: Array<{ overall_score: number | null; call_date?: string | null }>,
  zona: string | null
): number[] {
  const byDate = new Map<string, number[]>();

  for (const row of rows) {
    if (row.overall_score == null) continue;
    const date = fechaDeInstanteEnZona(row.call_date, zona) || "unknown";
    const bucket = byDate.get(date) ?? [];
    bucket.push(row.overall_score);
    byDate.set(date, bucket);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, scores]) =>
      Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    );
}

/*
 * SCRUM-504: las lecturas de análisis de llamadas (ranking y evolución)
 * devuelven sus errores como valor (`MutationResult`): en producción Next no le
 * manda al cliente el mensaje de un error lanzado por una server action. La
 * sesión que falta vuelve con su motivo; un error de la base (salvo la tabla
 * que falta, que se lee como "sin datos") o cualquier otra excepción se
 * registra, va a Sentry (tag `server_action`) y vuelve con el texto fijo de la
 * interfaz.
 */

export async function getTeamRankingAction(): Promise<MutationResult<TeamRankingEntry[]>> {
  if (!isSupabaseConfigured()) return { success: true, data: mockTeamRanking };

  return mutacionConErroresEsperables("[getTeamRanking]", leerRankingDelEquipo);
}

async function leerRankingDelEquipo(): Promise<TeamRankingEntry[]> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("call_analyses")
    .select("closer_id, closer_name, overall_score, booked, sold")
    .eq("organization_id", organizationId)
    .gte("call_date", since);

  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new FallaDeLaBase(error);
  }

  if (!data?.length) return [];

  const byCloser = data.reduce<
    Record<
      string,
      {
        name: string;
        scores: number[];
        calls: number;
        bookings: number;
      }
    >
  >((acc, call: CallAnalysisRow) => {
    const key = call.closer_id ?? call.closer_name ?? "unknown";
    if (!acc[key]) {
      acc[key] = {
        name: call.closer_name ?? "Sin nombre",
        scores: [],
        calls: 0,
        bookings: 0,
      };
    }
    if (call.overall_score != null) {
      acc[key].scores.push(call.overall_score);
    }
    acc[key].calls += 1;
    if (call.booked) acc[key].bookings += 1;
    return acc;
  }, {});

  return Object.values(byCloser)
    .map((c) => ({
      name: c.name,
      score: Math.round(
        c.scores.reduce((a: number, b: number) => a + b, 0) /
          Math.max(c.scores.length, 1)
      ),
      calls: c.calls,
      bookings: c.bookings,
      conversion: `${Math.round((c.bookings / Math.max(c.calls, 1)) * 100)}%`,
      trend: "stable" as const,
    }))
    .sort((a, b) => b.score - a.score);
}

export async function getCloserEvolutionAction(
  closerName: string
): Promise<MutationResult<number[]>> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: mockCloserEvolutionForName(closerName) };
  }

  return mutacionConErroresEsperables("[getCloserEvolution]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("call_analyses")
      .select("overall_score, call_date")
      .eq("organization_id", organizationId)
      .eq("closer_name", closerName)
      .order("call_date", { ascending: true })
      .limit(50);

    if (error) {
      if (isMissingTableError(error.message)) return [];
      throw new FallaDeLaBase(error);
    }

    if (!data?.length) return [];

    return data.map((d) => d.overall_score ?? 0);
  });
}

export async function getTeamAverageEvolutionAction(): Promise<MutationResult<number[]>> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: getTeamAverageEvolution() };
  }

  return mutacionConErroresEsperables("[getTeamAverageEvolution]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const [{ data, error }, zona] = await Promise.all([
      supabase
        .from("call_analyses")
        .select("overall_score, call_date")
        .eq("organization_id", organizationId)
        .order("call_date", { ascending: true })
        .limit(200),
      leerZonaHorariaDeLaOrganizacion(supabase, organizationId),
    ]);

    if (error) {
      if (isMissingTableError(error.message)) return [];
      throw new FallaDeLaBase(error);
    }

    if (!data?.length) return [];

    return aggregateTeamAverageByDate(data, zona);
  });
}

/** Expuesto para validar mocks en desarrollo */
export async function getMockCallAnalysisKeysAction() {
  return Object.keys(mockCallAnalyses);
}

export async function getLeadJourneyAction(
  conversationId: string,
  context?: LeadJourneyContext
): Promise<MutationResult<RecorridoDelLead>> {
  if (!isSupabaseConfigured()) return { success: true, data: { pasos: [], faltan: [] } };

  // Antes atrapaba todo y devolvía `[]`: sin sesión o con una falla, el panel
  // decía "Sin recorrido registrado" (AR de SCRUM-504).
  return mutacionConErroresEsperables("[getLeadJourney]", async () => {
    const organizationId = await requireOrganizationId();
    return getLeadJourney(organizationId, conversationId, context);
  });
}

/**
 * Journey para el inbox de Zernio: busca por nombre del lead en la DB
 * y enriquece con comentarios de Zernio + CTAs de ManyChat.
 */
export async function getZernioLeadJourneyAction(
  accountId: string,
  participantId: string,
  participantName: string
): Promise<MutationResult<RecorridoDelLead>> {
  if (!isSupabaseConfigured()) return { success: true, data: { pasos: [], faltan: [] } };

  return mutacionConErroresEsperables("[getZernioLeadJourney]", async () => {
    const organizationId = await requireOrganizationId();
    return getZernioLeadJourney(organizationId, {
      zernioAccountId: accountId,
      zernioParticipantId: participantId,
      zernioParticipantName: participantName,
    });
  });
}

export async function getFrequentObjectionsAction(): Promise<
  MutationResult<FrequentObjectionsResult>
> {
  if (!isSupabaseConfigured()) {
    return {
      success: true,
      data: { objections: mockFrequentObjectionSummaries(), dataSource: "mock" },
    };
  }

  return mutacionConErroresEsperables("[getFrequentObjections]", async () => {
    const organizationId = await requireOrganizationId();
    return getFrequentObjections(organizationId);
  });
}

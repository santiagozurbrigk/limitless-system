"use server";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import {
  rechazoPorModulo,
  type RechazoPorModulo,
} from "@/lib/auth/acceso-a-modulo";
import type { MutationResult } from "@/lib/server/action-result";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type {
  IntelligenceBottleneck,
  IntelligenceInsight,
  IntelligenceOpportunity,
  IntelligenceRecommendation,
  MemoryChunk,
} from "@/types/intelligence";

export type IntelligenceSnapshotView = {
  insights: IntelligenceInsight[];
  recommendations: IntelligenceRecommendation[];
  bottlenecks: IntelligenceBottleneck[];
  opportunities: IntelligenceOpportunity[];
  memoryChunks: MemoryChunk[];
  generatedAt: string | null;
};

/**
 * El resumen, o el rechazo si quien llama no tiene Operaciones. El rechazo
 * vuelve como valor para que la pantalla dibuje `SinAcceso` en vez de la
 * pantalla de error de Next.
 */
export type ResultadoSnapshotDeInteligencia =
  | Extract<MutationResult<IntelligenceSnapshotView>, { success: true }>
  | RechazoPorModulo;

const EMPTY_SNAPSHOT: IntelligenceSnapshotView = {
  insights: [],
  recommendations: [],
  bottlenecks: [],
  opportunities: [],
  memoryChunks: [],
  generatedAt: null,
};

function parseJsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * El último resumen de Inteligencia de la org. Lo muestran `/intelligence` y
 * `/founder`, las dos bajo Operaciones.
 *
 * ⭐ Exige Operaciones aunque las dos pantallas ya lo exijan en el layout: es
 * una Server Action exportada y se puede invocar a mano sin abrir ninguna de
 * las dos, y en una navegación del cliente el layout no se vuelve a ejecutar
 * pero la página sí (SCRUM-18).
 */
export async function getIntelligenceSnapshotAction(): Promise<ResultadoSnapshotDeInteligencia> {
  if (!isSupabaseConfigured()) return { success: true, data: EMPTY_SNAPSHOT };

  const rechazo = await rechazoPorModulo("operations");
  if (rechazo) return rechazo;

  return { success: true, data: await leerUltimoSnapshot() };
}

async function leerUltimoSnapshot(): Promise<IntelligenceSnapshotView> {
  const organizationId = await requireOrganizationId();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("intelligence_snapshots")
    .select(
      "insights, recommendations, bottlenecks, opportunities, memory_chunks, generated_at"
    )
    .eq("organization_id", organizationId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[getIntelligenceSnapshot]", error.message);
    return EMPTY_SNAPSHOT;
  }

  if (!data) return EMPTY_SNAPSHOT;

  return {
    insights: parseJsonArray<IntelligenceInsight>(data.insights),
    recommendations: parseJsonArray<IntelligenceRecommendation>(
      data.recommendations
    ),
    bottlenecks: parseJsonArray<IntelligenceBottleneck>(data.bottlenecks),
    opportunities: parseJsonArray<IntelligenceOpportunity>(data.opportunities),
    memoryChunks: parseJsonArray<MemoryChunk>(data.memory_chunks),
    generatedAt: data.generated_at ?? null,
  };
}

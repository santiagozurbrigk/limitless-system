import crypto from "crypto";
import { z } from "zod";
import {
  callClaudeJson,
  getModelForTask,
  getClientForOrg,
} from "@/lib/ai/anthropic";
import { buildOrgContextText, getOrgContext } from "@/lib/ai/org-context";
import { wrapUntrustedContent } from "@/lib/ai/wrap-untrusted-content";
import { createAdminClient } from "@/lib/supabase/admin";
import { listActiveOrganizationIds } from "./organizaciones-activas";
import { formatDate } from "@/lib/format";
import {
  collectIntelligenceData,
  formatCollectedDataForPrompt,
} from "@/lib/intelligence/collect-context";
import { buildMemoryChunks } from "@/lib/intelligence/memory-chunks";
import type {
  IntelligenceBottleneck,
  IntelligenceInsight,
  IntelligenceOpportunity,
  IntelligenceRecommendation,
  MemoryChunk,
} from "@/types/intelligence";

const intelligenceAiResponseSchema = z.object({
  insights: z
    .array(
      z.object({
        title: z.string().min(1),
        body: z.string().min(1),
        confidence: z.number().min(0).max(1),
        department: z.string().min(1),
      })
    )
    .max(6),
  recommendations: z
    .array(
      z.object({
        priority: z.enum(["high", "medium", "low"]),
        title: z.string().min(1),
        action: z.string().min(1),
      })
    )
    .max(6),
  bottlenecks: z
    .array(
      z.object({
        area: z.string().min(1),
        impact: z.string().min(1),
        frequency: z.string().min(1),
      })
    )
    .max(5),
  opportunities: z
    .array(
      z.object({
        title: z.string().min(1),
        potential: z.string().min(1),
      })
    )
    .max(5),
});

type IntelligenceAiResponse = z.infer<typeof intelligenceAiResponseSchema>;

export type IntelligenceSnapshotPayload = {
  insights: IntelligenceInsight[];
  recommendations: IntelligenceRecommendation[];
  bottlenecks: IntelligenceBottleneck[];
  opportunities: IntelligenceOpportunity[];
  memoryChunks: MemoryChunk[];
  generatedAt: string;
};

function addIds<T extends Record<string, unknown>>(
  items: T[],
  prefix: string
): Array<T & { id: string }> {
  return items.map((item) => ({
    ...item,
    id: `${prefix}-${crypto.randomUUID().slice(0, 8)}`,
  }));
}

function mapAiResponse(
  parsed: IntelligenceAiResponse,
  generatedAt: string
): Omit<IntelligenceSnapshotPayload, "memoryChunks" | "generatedAt"> {
  const createdLabel = formatDate(generatedAt);

  return {
    insights: addIds(parsed.insights, "ins").map((item) => ({
      ...item,
      createdAt: createdLabel,
    })),
    recommendations: addIds(parsed.recommendations, "rec"),
    bottlenecks: addIds(parsed.bottlenecks, "bn"),
    opportunities: addIds(parsed.opportunities, "op"),
  };
}

export async function generateIntelligenceSnapshot(
  organizationId: string
): Promise<IntelligenceSnapshotPayload | null> {
  const admin = createAdminClient();
  const collected = await collectIntelligenceData(admin, organizationId);

  if (!collected.hasMeaningfulData) {
    console.info(
      `[intelligence] Org ${organizationId}: sin datos suficientes, omitiendo IA`
    );
    return null;
  }

  const client = await getClientForOrg(organizationId);
  if (!client) {
    console.warn(
      `[intelligence] Org ${organizationId}: sin API key de Anthropic`
    );
    return null;
  }

  const model = getModelForTask("intelligence_analysis");
  console.info(
    `[intelligence] Org ${organizationId}: generando snapshot con ${model}`
  );

  const memoryChunks = await buildMemoryChunks(admin, organizationId);
  const orgContext = await getOrgContext(organizationId);
  const orgContextText = buildOrgContextText(orgContext);
  const dataText = formatCollectedDataForPrompt(collected);

  const system = `Sos el COO de IA de "${orgContext.orgName}". Analizás datos operativos reales de ventas, marketing, operaciones y finanzas.

REGLAS ESTRICTAS:
- Basá cada insight, recomendación, cuello de botella y oportunidad ÚNICAMENTE en los datos provistos.
- NO inventes números, porcentajes ni situaciones que no estén respaldados por el contexto.
- Si los datos son escasos en un área, decilo con honestidad y bajá la confianza (confidence).
- Respondé ÚNICAMENTE con JSON válido en español rioplatense profesional.
- Máximo 4 insights, 4 recomendaciones, 3 cuellos de botella, 3 oportunidades.`;

  const user = `Analizá el estado del negocio y devolvé inteligencia accionable para el founder.

${wrapUntrustedContent("datos_operativos", dataText)}

JSON exacto:
{
  "insights": [
    { "title": "...", "body": "...", "confidence": 0.0-1.0, "department": "Ventas|Marketing|Operaciones|Finanzas|Delivery" }
  ],
  "recommendations": [
    { "priority": "high|medium|low", "title": "...", "action": "..." }
  ],
  "bottlenecks": [
    { "area": "...", "impact": "...", "frequency": "Diario|Semanal|Mensual" }
  ],
  "opportunities": [
    { "title": "...", "potential": "..." }
  ]
}`;

  const raw = await callClaudeJson<unknown>({
    organizationId,
    task: "intelligence_analysis",
    feature: "intelligence_snapshot",
    cachedSystemPrompt: orgContextText,
    system,
    user,
    maxTokens: 2500,
  });

  if (!raw) {
    throw new Error("La IA no devolvió respuesta para intelligence snapshot");
  }

  const parsed = intelligenceAiResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(
      "[intelligence] Respuesta IA inválida:",
      parsed.error.flatten()
    );
    throw new Error("Respuesta de IA con formato inválido");
  }

  const generatedAt = new Date().toISOString();
  const mapped = mapAiResponse(parsed.data, generatedAt);

  return {
    ...mapped,
    memoryChunks,
    generatedAt,
  };
}

export async function saveIntelligenceSnapshot(
  organizationId: string,
  snapshot: IntelligenceSnapshotPayload
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("intelligence_snapshots").insert({
    organization_id: organizationId,
    insights: snapshot.insights,
    recommendations: snapshot.recommendations,
    bottlenecks: snapshot.bottlenecks,
    opportunities: snapshot.opportunities,
    memory_chunks: snapshot.memoryChunks,
    generated_at: snapshot.generatedAt,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export { listActiveOrganizationIds };

export async function generateAndSaveIntelligenceSnapshot(
  organizationId: string
): Promise<"generated" | "skipped" | "failed"> {
  try {
    const snapshot = await generateIntelligenceSnapshot(organizationId);
    if (!snapshot) return "skipped";

    const hasContent =
      snapshot.insights.length > 0 ||
      snapshot.recommendations.length > 0 ||
      snapshot.bottlenecks.length > 0 ||
      snapshot.opportunities.length > 0;

    if (!hasContent) return "skipped";

    await saveIntelligenceSnapshot(organizationId, snapshot);
    return "generated";
  } catch (err) {
    console.error(
      `[intelligence] Error generando snapshot para org ${organizationId}:`,
      err
    );
    return "failed";
  }
}

export async function generateAllIntelligenceSnapshots(): Promise<{
  orgs: number;
  generated: number;
  skipped: number;
  failed: number;
}> {
  const orgIds = await listActiveOrganizationIds();
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const orgId of orgIds) {
    const result = await generateAndSaveIntelligenceSnapshot(orgId);
    if (result === "generated") generated += 1;
    else if (result === "skipped") skipped += 1;
    else failed += 1;
  }

  return { orgs: orgIds.length, generated, skipped, failed };
}

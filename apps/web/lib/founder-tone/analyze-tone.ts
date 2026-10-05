import { callClaudeText, getClientForOrg, getModelForTask } from "@/lib/ai/anthropic";
import { wrapUntrustedContent } from "@/lib/ai/wrap-untrusted-content";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listActiveOrganizationIds,
  organizacionSigueActiva,
} from "@/lib/intelligence/organizaciones-activas";
import {
  collectFounderToneSources,
  formatToneSourcesForPrompt,
  type FounderToneSources,
} from "@/lib/founder-tone/collect-sources";

/** Texto neutro cuando no hay material suficiente para detectar un estilo. */
export const NEUTRAL_TONE_DESCRIPTION =
  "Sin suficiente información para detectar un estilo de comunicación particular aún. Usar un tono profesional estándar, claro y cercano.";

const MAX_TONE_CHARS = 1500;

export type FounderToneResult = {
  toneDescription: string;
  sourceSummary: FounderToneSources["summary"] & { neutral: boolean };
  analyzedAt: string;
};

export async function generateFounderTone(
  organizationId: string
): Promise<FounderToneResult | null> {
  const admin = createAdminClient();
  const sources = await collectFounderToneSources(admin, organizationId);
  const analyzedAt = new Date().toISOString();

  if (!sources.hasEnoughContent) {
    console.info(
      `[founder-tone] Org ${organizationId}: sin material suficiente, tono neutro`
    );
    return {
      toneDescription: NEUTRAL_TONE_DESCRIPTION,
      sourceSummary: { ...sources.summary, neutral: true },
      analyzedAt,
    };
  }

  const client = await getClientForOrg(organizationId);
  if (!client) {
    console.warn(`[founder-tone] Org ${organizationId}: sin API key de Anthropic`);
    return null;
  }

  const model = getModelForTask("tone_analysis");
  console.info(`[founder-tone] Org ${organizationId}: analizando tono con ${model}`);

  const sourcesText = formatToneSourcesForPrompt(sources);

  const system = `Sos un analista experto en estilo de comunicación y voz de marca. Tu tarea es leer textos reales escritos por una persona (founder de un negocio) y describir su estilo de comunicación.

REGLAS ESTRICTAS:
- Basate ÚNICAMENTE en los textos provistos. No inventes rasgos que no estén respaldados por el material.
- Si el material es escaso o ambiguo, decilo y describí solo lo que se puede inferir con seguridad.
- Devolvé una descripción en TEXTO LIBRE (sin JSON, sin viñetas obligatorias, sin encabezados), en español, de 4 a 8 oraciones.
- Esta descripción es de USO INTERNO: será una instrucción para que otra IA imite ese estilo. Escribila como una guía de estilo accionable, no como un análisis académico.`;

  const user = `Analizá los siguientes textos reales escritos por el founder (o su equipo) y describí su estilo de comunicación.

Identificá rasgos concretos como: nivel de formalidad, muletillas o expresiones particulares que repite, longitud típica de oraciones, calidez vs. distancia, uso de jerga o términos técnicos, uso de humor, signos de puntuación característicos, y cualquier patrón distintivo real.

${wrapUntrustedContent("textos_del_founder", sourcesText)}

Devolvé SOLO la descripción del estilo de comunicación en texto libre, lista para usarse como guía de tono.`;

  const raw = await callClaudeText({
    organizationId,
    task: "tone_analysis",
    feature: "founder_tone_analysis",
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 700,
  });

  if (!raw || !raw.trim()) {
    throw new Error("La IA no devolvió una descripción de tono");
  }

  return {
    toneDescription: raw.trim().slice(0, MAX_TONE_CHARS),
    sourceSummary: { ...sources.summary, neutral: false },
    analyzedAt,
  };
}

export async function saveFounderTone(
  organizationId: string,
  result: FounderToneResult
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("founder_communication_tone").upsert(
    {
      organization_id: organizationId,
      tone_description: result.toneDescription,
      analyzed_at: result.analyzedAt,
      source_summary: result.sourceSummary,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  );

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Genera y guarda para una org. Antes de tocar la IA comprueba que la org siga
 * activa (SCRUM-210): una pausada o dada de baja devuelve `"skipped"`. Ese
 * chequeo va fuera del `try` a propósito: si la base falla, el error sube, no
 * se procesa la org y el worker responde 500 para que QStash reintente.
 */
export async function generateAndSaveFounderTone(
  organizationId: string
): Promise<"generated" | "skipped" | "failed"> {
  if (!(await organizacionSigueActiva(organizationId))) {
    console.info(`[founder-tone] Org ${organizationId}: no está activa, se omite el tono`);
    return "skipped";
  }

  try {
    const result = await generateFounderTone(organizationId);
    if (!result) return "skipped";

    await saveFounderTone(organizationId, result);
    return "generated";
  } catch (err) {
    console.error(
      `[founder-tone] Error analizando tono para org ${organizationId}:`,
      err
    );
    return "failed";
  }
}

export async function generateAllFounderTones(): Promise<{
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
    // El chequeo de org activa puede lanzar si la base falla: en serie se
    // cuenta como fallida y se sigue con la próxima, como antes.
    const result = await generateAndSaveFounderTone(orgId).catch((err: unknown) => {
      console.error(`[founder-tone] Error comprobando la org ${orgId}:`, err);
      return "failed" as const;
    });
    if (result === "generated") generated += 1;
    else if (result === "skipped") skipped += 1;
    else failed += 1;
  }

  return { orgs: orgIds.length, generated, skipped, failed };
}

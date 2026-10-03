/**
 * ⭐ Las señales del día: lo que las fuentes automáticas dejan para que alguien
 * decida.
 *
 * Hace tres cosas, en este orden y por este motivo:
 *
 *   1. **Clasifica** los mensajes nuevos de Discord (E). Existía y no lo llamaba
 *      nadie: había que apretar un botón todos los días, así que no corría nunca.
 *   2. **Propone hitos desde esos mensajes** (E→C). Va después de clasificar
 *      para que los mensajes de hoy entren en la misma corrida.
 *   3. **Propone hitos desde las llamadas de entrega** (B→C).
 *
 * Ninguna de las tres registra nada: las propuestas esperan en el buzón del
 * cliente a que una persona las acepte o las descarte.
 *
 * Una organización que falla no corta a las demás, y un paso que falla no corta
 * a los otros dos: el resultado dice qué anduvo y qué no.
 */
import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import { classifyDiscordMessagesForOrg } from "@/lib/discord/classify-run";
import { proposeCheckpointsFromDiscordForOrg } from "@/lib/discord/propose-checkpoints";
import { proposeCheckpointsFromCallsForOrg } from "@/lib/fathom/propose-checkpoints";
import { createAdminClient } from "@/lib/supabase/admin";
import { conMonitorDeCron } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
/** Varias llamadas a Haiku por organización, en serie. */
export const maxDuration = 600;

type OrgResult = {
  organizationId: string;
  clasificacion?: { clasificados: number; testimonios: number; vacios: number } | { error: string };
  hitosDesdeDiscord?: { evaluados: number; propuestos: number; creados: number } | { error: string };
  hitosDesdeLlamadas?: { evaluados: number; propuestos: number; creados: number } | { error: string };
};

export const GET = conMonitorDeCron("/api/cron/daily-signals", async (request: Request) => {
  return POST(request);
});

export async function POST(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  const organizationId = new URL(request.url).searchParams.get("organizationId");

  try {
    const orgIds = organizationId ? [organizationId] : await organizationsToProcess();
    const results: OrgResult[] = [];

    for (const id of orgIds) {
      results.push({
        organizationId: id,
        clasificacion: await step(() => classifyDiscordMessagesForOrg(id)),
        hitosDesdeDiscord: await step(() => proposeCheckpointsFromDiscordForOrg(id)),
        hitosDesdeLlamadas: await step(() => proposeCheckpointsFromCallsForOrg(id)),
      });
    }

    return NextResponse.json({ ok: true, organizaciones: orgIds.length, results });
  } catch (error) {
    console.error("[cron/daily-signals]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "error desconocido" },
      { status: 500 }
    );
  }
}

/** Un paso que falla queda registrado y deja seguir a los otros. */
async function step<T>(run: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (failure) {
    return { error: failure instanceof Error ? failure.message : "error desconocido" };
  }
}

/**
 * Las organizaciones con Discord conectado **o** con llamadas de Fathom.
 *
 * Se juntan las dos fuentes en vez de recorrer todas las organizaciones: una que
 * no tiene ninguna de las dos no tiene nada que evaluar.
 */
async function organizationsToProcess(): Promise<string[]> {
  const admin = createAdminClient();

  const [discord, fathom] = await Promise.all([
    admin.from("discord_integrations").select("organization_id").eq("status", "connected"),
    admin
      .from("fathom_calls")
      .select("organization_id")
      .is("checkpoint_checked_at", null)
      .eq("purpose", "delivery")
      .limit(500),
  ]);

  const ids = [
    ...((discord.data as { organization_id: string }[]) ?? []),
    ...((fathom.data as { organization_id: string }[]) ?? []),
  ].map((row) => row.organization_id);

  return [...new Set(ids)];
}

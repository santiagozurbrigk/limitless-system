import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import { pollInstagramConversations } from "@/lib/instagram/poll-conversations";
import { createAdminClient } from "@/lib/supabase/admin";
import { conMonitorDeCron } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

async function runPoll(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();

  const { data: integrations } = await supabase
    .from("instagram_integrations")
    .select("organization_id")
    .eq("status", "active")
    .not("access_token", "is", null);

  if (!integrations?.length) {
    return NextResponse.json({ ok: true, polled: 0 });
  }

  console.log(`[IG Poll Cron] Procesando ${integrations.length} orgs`);

  let polled = 0;
  for (const integration of integrations) {
    await pollInstagramConversations(integration.organization_id).catch(
      (err) => {
        console.error(
          "[IG Poll Cron] Error en org:",
          integration.organization_id,
          err
        );
      }
    );
    polled++;
    await new Promise((r) => setTimeout(r, 1000));
  }

  return NextResponse.json({ ok: true, polled });
}

/** Polling de DMs vía Graph API — cada 5 min (Vercel Cron) o manual con CRON_SECRET. */
export const GET = conMonitorDeCron("/api/integrations/instagram/poll", async (request: Request) => {
  return runPoll(request);
});

export async function POST(request: Request) {
  return runPoll(request);
}

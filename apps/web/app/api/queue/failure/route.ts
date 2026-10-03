/**
 * QStash avisa acá cuando un job agotó sus reintentos (SCRUM-84).
 *
 * ⭐ Antes un job que fallaba todas las veces quedaba sólo en la cola de
 * mensajes muertos de Upstash, que nadie mira. Ahora va a Sentry con el worker
 * y la organización, y la regla de alerta lo manda por mail.
 *
 * Lo firma QStash (`Upstash-Signature`): no lleva el header del worker, así que
 * se verifica sólo la firma.
 */
import { NextResponse } from "next/server";
import { verifyQStashRequest } from "@/lib/queue/qstash-verify";
import { leerFallaDeQStash } from "@/lib/queue/failure-callback";
import { reportarFalla } from "@/lib/observability/reportar-falla";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();

  const auth = await verifyQStashRequest(request, rawBody);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(rawBody);
  } catch {
    cuerpo = null;
  }

  const falla = leerFallaDeQStash(cuerpo);
  if (!falla) {
    reportarFalla(new Error("QStash: aviso de job fallido con un cuerpo que no se entiende"), {
      cron: "/api/queue/failure",
    });
    return NextResponse.json({ ok: true, mapped: false });
  }

  console.error("[Queue] job agotó sus reintentos", falla);
  reportarFalla(
    new Error(`QStash: ${falla.worker} agotó sus reintentos (último status ${falla.status ?? "?"})`),
    {
      cron: falla.worker,
      organizationId: falla.organizationId,
      provider: "qstash",
      extra: {
        retried: falla.retried,
        maxRetries: falla.maxRetries,
        sourceMessageId: falla.sourceMessageId,
        dlqId: falla.dlqId,
        jobId: falla.jobId,
      },
    }
  );

  // 200 siempre que se registró: si no, QStash reintenta el aviso.
  return NextResponse.json({ ok: true });
}

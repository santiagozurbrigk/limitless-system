import { NextResponse } from "next/server";
import { leerSalud } from "@/lib/observability/salud";

/**
 * `GET /api/health` (SCRUM-85): pública, sin sesión. La consultan el monitor
 * externo de disponibilidad y el workflow `produccion-al-dia.yml`, que compara
 * `version.commit` con `main`. Qué mide y por qué es barata:
 * `lib/observability/salud.ts`.
 *
 * 200 si la base responde (`ok`, o `degradado` si falla Storage o falta una
 * variable crítica); 503 si la base no responde (`caido`).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Cada chequeo tiene 3 s de plazo y corren en paralelo. */
export const maxDuration = 10;

export async function GET() {
  const salud = await leerSalud();
  return NextResponse.json(salud, {
    status: salud.status === "caido" ? 503 : 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    },
  });
}

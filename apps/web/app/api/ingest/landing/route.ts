import { after } from "next/server";
import { atenderIngestaDeLanding } from "@/lib/webinar/endpoint-de-ingesta";

export const runtime = "nodejs";

/**
 * Ingesta de la landing de Limitless Webinars (SCRUM-528): registros y visitas
 * con `Authorization: Bearer <clave de ingesta>`. Es pública para el
 * middleware (no hay sesión) y la autentica la clave. El detalle está en
 * `lib/webinar/endpoint-de-ingesta.ts`.
 */
export async function POST(request: Request) {
  return atenderIngestaDeLanding(request, { enSegundoPlano: after });
}

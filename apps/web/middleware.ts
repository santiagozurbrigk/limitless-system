import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /**
   * El middleware corre en todo salvo assets estáticos.
   *
   * `opengraph-image`, `twitter-image`, `icon` y `apple-icon` se listan aparte
   * porque las rutas de metadata de Next **no tienen extensión** y por lo tanto
   * el filtro de extensiones de abajo no las agarra. Sin esto el middleware las
   * trata como ruta protegida y las redirige a /login: los crawlers sociales
   * reciben un HTML de login en vez de la imagen y el preview del link no carga.
   *
   * `api/ingest/landing$` (SCRUM-528): la ingesta de la landing no tiene sesión
   * y se autentica con su clave; sin el middleware se ahorra la consulta de
   * sesión en cada registro (hasta 50 por segundo). Sólo la ruta exacta.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|twitter-image|icon|apple-icon|robots.txt|sitemap.xml|api/ingest/landing$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

import { paths } from "@/routes";

/**
 * Rutas que el middleware deja pasar sin sesión. Una ruta pública NO queda
 * abierta: su handler tiene que autenticar la request por su cuenta (firma del
 * proveedor, CRON_SECRET, token en la URL). Ver `__tests__/public-paths.test.ts`.
 */
const PUBLIC_PATHS = [
  paths.auth.login,
  paths.auth.callback,
  paths.auth.recover,
  paths.auth.forgotPassword,
  paths.auth.updatePassword,
  paths.demo,
  paths.designSystem,
  paths.superAdmin.login,
] as const;

export function isPublicPath(pathname: string): boolean {
  if (pathname === paths.home) return true;
  if (pathname === paths.superAdmin.login) return true;
  if (pathname.startsWith(`${paths.superAdmin.login}/`)) return true;
  if (pathname === "/api/waitlist") return true;
  if (pathname.startsWith("/api/utm/")) return true;
  if (pathname.startsWith("/api/cron/")) return true;
  if (pathname.startsWith("/api/queue/")) return true;
  if (pathname.startsWith("/api/rag/")) return true;
  if (pathname === "/prueba" || pathname.startsWith("/prueba/")) return true;
  /*
   * La política de privacidad tiene que leerse sin cuenta: es la URL que se
   * declara en las apps OAuth (Google, Meta), y quien las revisa no inicia
   * sesión. Hasta el 2026-09-23 redirigía al login.
   */
  if (pathname === "/privacidad") return true;
  if (pathname === "/api/trial-confirm") return true;
  if (pathname.startsWith("/invite")) return true;
  /*
   * El formulario de onboarding que completa el cliente de un growth partner.
   * Lo protege el token del link (`client_onboarding_links`), que valida la
   * página y la Server Action del envío.
   */
  if (pathname.startsWith("/onboarding-cliente/")) return true;
  /*
   * Webhooks de proveedores y llamadas del bot de Discord: llegan sin sesión y
   * cada handler verifica su propia firma o secreto (fail-closed). Si el
   * middleware los manda a /login, la verificación nunca corre y el proveedor
   * recibe un 307 con el HTML del login.
   */
  if (pathname.startsWith("/api/webhooks/")) return true;
  if (pathname.startsWith("/api/discord/")) return true;
  if (pathname.startsWith("/api/integrations/")) {
    if (
      pathname.includes("/webhook") ||
      pathname.includes("/oauth/callback") ||
      pathname.includes("/oauth/start") ||
      pathname.endsWith("/callback") ||
      pathname.endsWith("/sync") ||
      pathname.endsWith("/poll") ||
      pathname.endsWith("/process") ||
      pathname.endsWith("/reanalyze")
    ) {
      return true;
    }
  }
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

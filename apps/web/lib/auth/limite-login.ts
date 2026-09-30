import { headers } from "next/headers";
import { rateLimit, type RateLimitResult } from "@/lib/rate-limit";

/**
 * [LOGIN-RATE-LIMIT] (SCRUM-24): límite de intentos de login.
 *
 * Antes el único contador era por email (`signin:<email>`, 5 cada 15 min):
 *   - cualquiera que conociera un email bloqueaba a esa persona 15 minutos,
 *     repetible, con 5 intentos desde su propia máquina;
 *   - probar una contraseña común contra muchos emails no tenía límite propio.
 *
 * Ahora cada intento consume dos contadores y alcanza con que uno se agote:
 *   - IP + email (5 cada 15 min): frena probar contraseñas contra una cuenta,
 *     y como incluye la IP, el dueño de la cuenta entra igual desde la suya;
 *   - sólo IP (30 cada 15 min, entre todos los emails y los dos logins):
 *     frena probar contra muchas cuentas desde el mismo lugar. 30 deja margen
 *     para una oficina que sale a internet con una sola IP.
 */

export const LIMITE_POR_IP_Y_EMAIL = { windowMs: 15 * 60 * 1000, maxRequests: 5 };
export const LIMITE_POR_IP = { windowMs: 15 * 60 * 1000, maxRequests: 30 };

type Flujo = "signin" | "signin-superadmin";

/** IP del cliente según los headers del proxy (Vercel), o "unknown". */
export function ipDesdeHeaders(h: { get(name: string): string | null }): string {
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

/** Las dos claves que consume un intento de login. */
export function clavesDeLogin(flujo: Flujo, ip: string, email: string) {
  return {
    porIpYEmail: `${flujo}:${ip}:${email.trim().toLowerCase()}`,
    porIp: `login-ip:${ip}`,
  };
}

/** Pasa sólo si pasan los dos; si no, el que se libera más tarde. */
export function combinarLimites(
  a: RateLimitResult,
  b: RateLimitResult
): { allowed: boolean; resetAt: number } {
  if (a.allowed && b.allowed) return { allowed: true, resetAt: Math.max(a.resetAt, b.resetAt) };
  const bloqueados = [a, b].filter((r) => !r.allowed);
  return { allowed: false, resetAt: Math.max(...bloqueados.map((r) => r.resetAt)) };
}

const porIpYEmail = rateLimit(LIMITE_POR_IP_Y_EMAIL);
const porIp = rateLimit(LIMITE_POR_IP);

/** Consume los dos contadores de un intento de login. */
export async function limiteDeLogin(
  flujo: Flujo,
  email: string
): Promise<{ allowed: boolean; resetAt: number }> {
  const ip = ipDesdeHeaders(await headers());
  const claves = clavesDeLogin(flujo, ip, email);
  const [a, b] = await Promise.all([porIpYEmail(claves.porIpYEmail), porIp(claves.porIp)]);
  return combinarLimites(a, b);
}

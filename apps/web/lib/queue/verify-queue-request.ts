/**
 * Verificación de autenticación para endpoints de cola (QStash + WORKER_AUTH_SECRET).
 *
 * Orden de verificación:
 *   1. WORKER_AUTH_SECRET — header X-Worker-Secret (custom) o Authorization: Bearer.
 *      QStash reenvía estos cuando se configuran en publishJSON({ headers }).
 *      Nunca por query param: QStash guarda la URL destino en su consola (SCRUM-51).
 *   2. QStash signature — fallback si no hay WORKER_AUTH_SECRET (signing keys configuradas).
 *
 * Consistente con la lógica de verifySignature() en apps/reel-worker/src/index.ts.
 */

import { safeEqual } from "@/lib/security/safe-equal";
import { verifyQStashRequest } from "./qstash-verify";

export async function verifyQueueRequest(
  request: Request,
  rawBody: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const workerSecret = process.env.WORKER_AUTH_SECRET?.trim();

  if (workerSecret) {
    // a) Header custom (nunca stripeado por proxies ni QStash)
    const xWorkerSecret = request.headers.get("x-worker-secret");
    if (safeEqual(xWorkerSecret, workerSecret)) return { ok: true };

    // b) Authorization: Bearer <secret>
    const authHeader = request.headers.get("authorization");
    if (safeEqual(authHeader, `Bearer ${workerSecret}`)) return { ok: true };

    console.warn("[Queue] WORKER_AUTH_SECRET configurado pero ningún método coincidió");
    return { ok: false, status: 401, error: "Invalid WORKER_AUTH_SECRET" };
  }

  // Fallback: QStash signature (requiere QSTASH_CURRENT_SIGNING_KEY + QSTASH_NEXT_SIGNING_KEY)
  return verifyQStashRequest(request, rawBody);
}

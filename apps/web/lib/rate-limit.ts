import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type RateLimitEntry = { count: number; resetAt: number };

/** Fallback para desarrollo local sin Supabase. No sirve en serverless. */
const inMemoryCounters = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

function consumeInMemory(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const entry = inMemoryCounters.get(identifier);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + config.windowMs;
    inMemoryCounters.set(identifier, { count: 1, resetAt });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Contador compartido en Postgres (`consume_rate_limit`), para que el límite
 * valga entre instancias serverless y sobreviva a los cold starts.
 */
export function rateLimit(config: RateLimitConfig) {
  return async function checkRateLimit(
    identifier: string
  ): Promise<RateLimitResult> {
    if (!isSupabaseConfigured()) {
      return consumeInMemory(identifier, config);
    }

    try {
      const { data, error } = await createAdminClient()
        .rpc("consume_rate_limit", {
          p_key: identifier,
          p_window_ms: config.windowMs,
          p_max_requests: config.maxRequests,
        })
        .single<{ allowed: boolean; remaining: number; reset_at: string }>();

      if (error || !data) {
        throw new Error(error?.message ?? "consume_rate_limit sin respuesta");
      }

      return {
        allowed: data.allowed,
        remaining: data.remaining,
        resetAt: new Date(data.reset_at).getTime(),
      };
    } catch (err) {
      // Fail-open: un problema de infraestructura no debe cortar el tráfico
      // legítimo. Queda el contador local de la instancia como red mínima.
      console.error("[rateLimit] fallback en memoria:", err);
      return consumeInMemory(identifier, config);
    }
  };
}

export function rateLimitExceeded(resetAt: number) {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return NextResponse.json(
    {
      error: "Demasiadas solicitudes. Intentá de nuevo en unos minutos.",
      retryAfter,
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    }
  );
}

export function rateLimitErrorMessage(resetAt: number): string {
  const seconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return `Demasiadas solicitudes. Intentá de nuevo en ${seconds} segundos.`;
}

/** Endpoints de IA — costo alto */
export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 10,
});

/**
 * Transcripción de audio (Whisper, hasta 25 MB por request) — por usuario.
 * Más holgado que `aiRateLimit` porque un audio largo llega partido en varios
 * pedidos seguidos.
 */
export const transcriptionRateLimit = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 30,
});

/** Auth — brute force */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
});

/** Integraciones — sync manual */
export const integrationRateLimit = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 30,
});

/** API general autenticada */
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 60,
});

/** Formularios públicos sin sesión (waitlist, confirmación de prueba) — por IP */
export const publicFormRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  maxRequests: 10,
});

/** Webhooks externos */
export const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 100,
});

/**
 * Ingesta de la landing de Limitless Webinars (SCRUM-528), por clave de
 * ingesta. Ventana fija de 10 segundos con 600 pedidos: la landing puede
 * sostener 50 por segundo con un 20% de margen (con 500 justos, una ventana
 * que arranca unos milisegundos tarde ya cortaría a una landing que manda 50
 * por segundo parejos), y una ráfaga de hasta 600 en un mismo segundo pasa si
 * la ventana venía tranquila. Lo que pasa de ahí recibe 429 con `Retry-After`.
 */
export const LIMITE_DE_INGESTA_DE_LANDING: RateLimitConfig = {
  windowMs: 10 * 1000,
  maxRequests: 600,
};
export const landingIngestRateLimit = rateLimit(LIMITE_DE_INGESTA_DE_LANDING);

/** Webhook Unipile — sin auth de header (dashboard no lo soporta) */
export const unipileWebhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 40,
});

/*
 * NO existe un límite para "conectar integración".
 *
 * Había uno de 5 intentos por hora y se quitó el 2026-08-30: estaba calibrado
 * como una defensa de fuerza bruta de login, pero se aplicaba a un formulario
 * de setup donde equivocarse cinco veces seguidas es normal —tokens largos,
 * un Location ID que hay que ir a buscar a otra pantalla— y dejaba al usuario
 * bloqueado 20 minutos en medio de la configuración.
 *
 * No protegía de nada real: la acción ya exige sesión iniciada, así que no hay
 * fuerza bruta que prevenir, y ningún humano tipeando puede acercarse a las
 * cuotas de los proveedores (GHL admite 100 requests cada 10 segundos).
 *
 * Si alguna vez hace falta volver a poner uno, que sea por ventanas cortas
 * (decenas de intentos en minutos) y no por horas.
 */

/** Generación de SOPs vía agente (por org) */
export const sopGenerateRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  maxRequests: 3,
});

export function getRequestIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

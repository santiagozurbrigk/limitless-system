import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { reportarFalla } from "@/lib/observability/reportar-falla";
import { landingIngestRateLimit, type RateLimitResult } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarClaveDeIngesta } from "@/lib/webinar/claves-de-ingesta";
import {
  guardarEventoCrudo,
  procesarEventoCrudo,
  type EventoCrudo,
} from "@/lib/webinar/ingesta-landing";
import { LIMITE_DEL_CUERPO_BYTES, validarEventoDeLanding } from "@/lib/webinar/normalize/evento";

/**
 * ⭐ `POST /api/ingest/landing` (SCRUM-528). La ruta sólo le pasa `after` de
 * `next/server`; todo lo demás está acá para poder probarlo.
 *
 * Orden, y qué responde cada paso (JSON corto, sin detalles internos):
 *   1. Clave de ingesta (`Authorization: Bearer <clave>`): inválida o revocada
 *      401; la base falla al verificarla, 500.
 *   2. Límite por clave (`landingIngestRateLimit`): 429 con `Retry-After`
 *      y el mismo formato que el resto (`{ ok: false, error }`).
 *   3. Cuerpo de hasta 16 KB, contado antes de parsear: 413.
 *   4. JSON, texto guardable (sin NUL ni surrogates sueltos, en valores y
 *      claves), profundidad, contrato (Zod) y ventana de `occurred_at`: 400
 *      con un motivo genérico. Lo que pasa se puede guardar siempre.
 *   5. Crudo en `landing_events` (`pending`): si falla, 500 y la landing
 *      reintenta.
 *   6. 200, y la normalización corre después de responder (`after`).
 *
 * Ni la clave, ni su hash, ni el payload (datos personales) van a un log o a
 * Sentry: los registros llevan texto fijo, el id del evento y la organización.
 */

/** Programa trabajo para después de responder: en la ruta, `after` de `next/server`. */
export type EnSegundoPlano = (tarea: Promise<void> | (() => Promise<void>)) => void;

export type DependenciasDeIngesta = {
  enSegundoPlano: EnSegundoPlano;
  /** Cliente con service role. Por defecto, `createAdminClient()`. */
  cliente?: () => SupabaseClient;
  /** Límite por clave. Por defecto, `landingIngestRateLimit`. */
  limite?: (identificador: string) => Promise<RateLimitResult>;
};

export const RESPUESTA_OK = { ok: true } as const;
export const NO_AUTORIZADO = "No autorizado.";
export const CUERPO_DEMASIADO_GRANDE = "El cuerpo supera los 16 KB.";
export const PAYLOAD_INVALIDO = "Payload inválido.";
export const ERROR_INTERNO = "Error interno. Reintentá más tarde.";

const ETIQUETA = "[ingest/landing]";

function respuesta(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Segundos hasta que se abre la ventana del límite (al menos 1). */
export function segundosParaReintentar(resetAt: number, ahora: number = Date.now()): number {
  return Math.max(1, Math.ceil((resetAt - ahora) / 1000));
}

/** 429 con la forma de las demás respuestas y un texto que coincide con `Retry-After`. */
export function demasiadasSolicitudes(resetAt: number): NextResponse {
  const segundos = segundosParaReintentar(resetAt);
  return NextResponse.json(
    {
      ok: false,
      error: `Demasiadas solicitudes. Reintentá en ${segundos} ${segundos === 1 ? "segundo" : "segundos"}.`,
    },
    { status: 429, headers: { "Retry-After": String(segundos) } },
  );
}

/** El token del header `Authorization: Bearer <token>`, o `null`. */
export function tokenDelPedido(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const encontrado = /^Bearer\s+(\S+)\s*$/i.exec(auth);
  return encontrado ? encontrado[1] : null;
}

type Cuerpo = { tipo: "ok"; texto: string } | { tipo: "grande" } | { tipo: "ilegible" };

/**
 * Lee el cuerpo contando bytes y corta apenas pasa el límite, sin bufferear
 * más. Un `Content-Length` declarado de más se rechaza sin leer nada. Un
 * cuerpo que no es UTF-8 válido es ilegible (400).
 */
export async function leerCuerpoConLimite(request: Request, limite: number): Promise<Cuerpo> {
  const declarado = request.headers.get("content-length");
  if (declarado !== null && Number(declarado) > limite) return { tipo: "grande" };
  if (!request.body) return { tipo: "ok", texto: "" };

  const lector = request.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await lector.cancel().catch(() => undefined);
      return { tipo: "grande" };
    }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let desde = 0;
  for (const parte of partes) {
    bytes.set(parte, desde);
    desde += parte.byteLength;
  }
  try {
    return { tipo: "ok", texto: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { tipo: "ilegible" };
  }
}

export async function atenderIngestaDeLanding(
  request: Request,
  dependencias: DependenciasDeIngesta,
): Promise<Response> {
  let admin: SupabaseClient;
  try {
    admin = (dependencias.cliente ?? createAdminClient)();
  } catch (error) {
    console.error(`${ETIQUETA} No se pudo crear el cliente de la base.`);
    reportarFalla(error, { provider: "landing" });
    return respuesta(500, ERROR_INTERNO);
  }

  // 1. Clave.
  let clave: Awaited<ReturnType<typeof verificarClaveDeIngesta>>;
  try {
    clave = await verificarClaveDeIngesta(tokenDelPedido(request), {
      cliente: admin,
      enSegundoPlano: dependencias.enSegundoPlano,
    });
  } catch (error) {
    // `verificarClaveDeIngesta` lanza con un texto fijo, sin la clave ni el hash.
    console.error(`${ETIQUETA} No se pudo verificar la clave de ingesta.`);
    reportarFalla(error, { provider: "landing" });
    return respuesta(500, ERROR_INTERNO);
  }
  if (!clave) return respuesta(401, NO_AUTORIZADO);
  const { organizationId } = clave;

  // 2. Límite por clave.
  const limite = await (dependencias.limite ?? landingIngestRateLimit)(
    `ingest-landing:${clave.claveId}`,
  );
  if (!limite.allowed) return demasiadasSolicitudes(limite.resetAt);

  // 3. Cuerpo.
  const cuerpo = await leerCuerpoConLimite(request, LIMITE_DEL_CUERPO_BYTES);
  if (cuerpo.tipo === "grande") return respuesta(413, CUERPO_DEMASIADO_GRANDE);
  if (cuerpo.tipo === "ilegible") return respuesta(400, PAYLOAD_INVALIDO);

  // 4. JSON y contrato.
  let json: unknown;
  try {
    json = JSON.parse(cuerpo.texto);
  } catch {
    return respuesta(400, PAYLOAD_INVALIDO);
  }
  const evento = validarEventoDeLanding(json, { referencia: new Date() });
  if (!evento) return respuesta(400, PAYLOAD_INVALIDO);

  // 5. Crudo primero: tal cual llegó.
  let crudo: EventoCrudo;
  try {
    crudo = await guardarEventoCrudo(admin, organizationId, evento.type, json);
  } catch (error) {
    console.error(`${ETIQUETA} No se pudo guardar el evento crudo.`, { organizationId });
    reportarFalla(error, { organizationId, provider: "landing" });
    return respuesta(500, ERROR_INTERNO);
  }

  // 6. Normalizar después de responder. `procesarEventoCrudo` no lanza.
  dependencias.enSegundoPlano(async () => {
    const resultado = await procesarEventoCrudo(admin, crudo);
    if (resultado.status === "error" || resultado.status === "sin_cerrar") {
      // Sin Sentry: el cron lo reprocesa y avisa si falla 5 veces.
      console.warn(`${ETIQUETA} La normalización no terminó; queda para el reproceso.`, {
        organizationId,
        eventoId: crudo.id,
        estado: resultado.status,
      });
    }
  });

  return NextResponse.json(RESPUESTA_OK, { status: 200 });
}

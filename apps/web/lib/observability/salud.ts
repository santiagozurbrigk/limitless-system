import { createAdminClient } from "@/lib/supabase/admin";
import { conPlazo } from "@/lib/observability/con-plazo";

/**
 * ⭐ Chequeo de salud de la app (SCRUM-85 · `[MONITOREO-Y-ALERTAS]`).
 *
 * Lo consultan `GET /api/health` (monitor externo y el workflow que avisa si
 * producción quedó atrás de `main`) y la página de Infraestructura del super
 * admin. Del 3 al 5 de octubre Vercel no desplegó y nadie se enteró en 36 horas:
 * por eso la respuesta lleva el commit desplegado.
 *
 * Qué mira, cada cosa con un plazo corto para que el monitor no quede colgado:
 *   - **base**: leer una sola fila de `organizations` con el cliente admin
 *     (también prueba que la clave de servicio sirva);
 *   - **storage**: listar un bucket con límite 1;
 *   - **variables**: que estén las variables sin las que la app no anda.
 *
 * La respuesta es mínima y pública: estados como booleanos, el commit corto, el
 * entorno y la hora. Nunca mensajes de error, nombres de tablas, buckets ni
 * variables, ni valores.
 *
 * Barata a propósito: el resultado se reusa durante `VIGENCIA_DEL_RESULTADO_MS`
 * y los pedidos que llegan mientras se mide esperan la misma medición. Mil
 * pedidos por segundo contra una instancia son, como mucho, una consulta a la
 * base y un listado de Storage cada 10 s.
 */

export type EstadoDeSalud = "ok" | "degradado" | "caido";

export type ChequeosDeSalud = {
  base: boolean;
  storage: boolean;
  variables: boolean;
};

export type RespuestaDeSalud = {
  status: EstadoDeSalud;
  chequeos: ChequeosDeSalud;
  version: { commit: string | null; entorno: string | null };
  /** Cuándo se midió (ISO). */
  hora: string;
};

export const PLAZO_POR_CHEQUEO_MS = 3000;
export const VIGENCIA_DEL_RESULTADO_MS = 10_000;

/** Bucket que crea una migración del repo (`20260805200000_content_thumbnails_bucket.sql`). */
const BUCKET_DE_PRUEBA = "content-thumbnails";

/**
 * Sin estas la app no anda: la base y la sesión (las de Supabase), los crons
 * (`CRON_SECRET`) y las credenciales cifradas de las integraciones
 * (`ENCRYPTION_MASTER_KEY`). Cada fila acepta cualquiera de sus nombres.
 */
const VARIABLES_CRITICAS: readonly (readonly string[])[] = [
  ["NEXT_PUBLIC_SUPABASE_URL"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
  ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"],
  ["CRON_SECRET"],
  ["ENCRYPTION_MASTER_KEY"],
];

type Entorno = Record<string, string | undefined>;

export function estadoDeSalud(chequeos: ChequeosDeSalud): EstadoDeSalud {
  if (!chequeos.base) return "caido";
  return chequeos.storage && chequeos.variables ? "ok" : "degradado";
}

export function variablesCriticasPresentes(entorno: Entorno = process.env): boolean {
  return VARIABLES_CRITICAS.every((nombres) => nombres.some((nombre) => Boolean(entorno[nombre]?.trim())));
}

/** El commit desplegado (7 caracteres) y el entorno de Vercel; `null` fuera de Vercel. */
export function versionDesplegada(entorno: Entorno = process.env): RespuestaDeSalud["version"] {
  const sha = entorno.VERCEL_GIT_COMMIT_SHA?.trim();
  const ambiente = entorno.VERCEL_ENV?.trim();
  return {
    commit: sha && /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : null,
    entorno: ambiente && /^[a-z]{1,20}$/.test(ambiente) ? ambiente : null,
  };
}

export async function baseResponde(signal: AbortSignal): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("organizations")
    .select("id")
    .limit(1)
    .abortSignal(signal);
  return !error;
}

export async function storageResponde(signal: AbortSignal): Promise<boolean> {
  const { error } = await createAdminClient()
    .storage.from(BUCKET_DE_PRUEBA)
    .list("", { limit: 1 }, { signal });
  return !error;
}

export type SondasDeSalud = {
  base: (signal: AbortSignal) => Promise<boolean>;
  storage: (signal: AbortSignal) => Promise<boolean>;
  variables: () => boolean;
  version: () => RespuestaDeSalud["version"];
  ahora: () => Date;
};

const sondasReales: SondasDeSalud = {
  base: baseResponde,
  storage: storageResponde,
  variables: () => variablesCriticasPresentes(),
  version: () => versionDesplegada(),
  ahora: () => new Date(),
};

/** Mide todo en paralelo. Un chequeo que lanza o vence cuenta como `false`. */
export async function medirSalud(
  sondas: SondasDeSalud = sondasReales,
  plazoMs: number = PLAZO_POR_CHEQUEO_MS
): Promise<RespuestaDeSalud> {
  const [base, storage] = await Promise.all([
    conPlazo(sondas.base, plazoMs, false),
    conPlazo(sondas.storage, plazoMs, false),
  ]);
  let variables = false;
  try {
    variables = sondas.variables();
  } catch {
    variables = false;
  }
  const chequeos: ChequeosDeSalud = { base, storage, variables };
  return {
    status: estadoDeSalud(chequeos),
    chequeos,
    version: sondas.version(),
    hora: sondas.ahora().toISOString(),
  };
}

/**
 * Envuelve `medir` para que sea barata ante muchos pedidos: reusa el último
 * resultado mientras tenga menos de `vigenciaMs` y comparte la medición en curso.
 */
export function crearLectorDeSalud(
  medir: () => Promise<RespuestaDeSalud>,
  vigenciaMs: number = VIGENCIA_DEL_RESULTADO_MS,
  reloj: () => number = Date.now
): () => Promise<RespuestaDeSalud> {
  let ultimo: { valor: RespuestaDeSalud; medidoEn: number } | null = null;
  let enCurso: Promise<RespuestaDeSalud> | null = null;

  return () => {
    if (ultimo && reloj() - ultimo.medidoEn < vigenciaMs) return Promise.resolve(ultimo.valor);
    if (!enCurso) {
      enCurso = medir()
        .then((valor) => {
          ultimo = { valor, medidoEn: reloj() };
          return valor;
        })
        .finally(() => {
          enCurso = null;
        });
    }
    return enCurso;
  };
}

/** El lector de la app: uno por instancia. */
export const leerSalud = crearLectorDeSalud(() => medirSalud());

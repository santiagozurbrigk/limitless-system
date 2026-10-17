import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildHealth,
  estadoSinLeer,
  type IntegrationHealth,
} from "@/lib/integrations/health";
import { reportarFalla } from "@/lib/observability/reportar-falla";
import { FallaDeLaBase } from "@/lib/server/action-result";
import { lecturaDegradable, valorSiNoEsFalla } from "@/lib/server/lectura-degradable";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Claves de ingesta de la landing de Limitless Webinars (SCRUM-527).
 *
 * La landing del lanzamiento manda los registros y las visitas a
 * `POST /api/ingest/landing` (SCRUM-528) con `Authorization: Bearer <clave>`.
 * La clave identifica a la organización: quien la tiene escribe registros en
 * su nombre. Por eso:
 *   - se genera con 32 bytes de `crypto.randomBytes` (nunca `Math.random`);
 *   - en la base sólo queda su sha256 (`ingest_keys.key_hash`); la clave en
 *     texto se devuelve una sola vez, al crearla, y no se puede volver a ver;
 *   - ni la clave ni su hash van a un log, a Sentry ni al texto de un error.
 *
 * `ingest_keys` no tiene policies (sólo service role): todo lo de acá usa el
 * cliente admin, y quien llama decide quién puede (las acciones de
 * `app/webinar/claves-de-ingesta-actions.ts` exigen founder o admin).
 */

/** Prefijo reconocible: una clave filtrada en un repo o un log se identifica sola. */
export const PREFIJO_CLAVE_DE_INGESTA = "lmt_ing_";

/** Bytes aleatorios de la clave (256 bits). */
export const BYTES_ALEATORIOS_DE_LA_CLAVE = 32;

/** 32 bytes en base64url son 43 caracteres, sin relleno. */
const FORMATO_DE_LA_CLAVE = /^lmt_ing_[A-Za-z0-9_-]{43}$/;

/**
 * Cada cuánto se reescribe `last_used_at` como mucho. La landing puede mandar
 * decenas de eventos por segundo (el límite de SCRUM-528 es 50 por segundo):
 * una escritura por evento sería una escritura de más por cada registro, para
 * un dato que se muestra con precisión de minutos.
 */
export const INTERVALO_MINIMO_ULTIMO_USO_MS = 60_000;

export type ClaveDeIngestaNueva = {
  /** La clave en texto. Se muestra una sola vez y no se guarda. */
  clave: string;
  /** Su sha256 en hexadecimal: lo único que va a `ingest_keys.key_hash`. */
  hash: string;
};

export function hashDeClaveDeIngesta(clave: string): string {
  return createHash("sha256").update(clave, "utf8").digest("hex");
}

export function generarClaveDeIngesta(): ClaveDeIngestaNueva {
  const clave =
    PREFIJO_CLAVE_DE_INGESTA +
    randomBytes(BYTES_ALEATORIOS_DE_LA_CLAVE).toString("base64url");
  return { clave, hash: hashDeClaveDeIngesta(clave) };
}

/** Si el texto tiene la forma de una clave de ingesta. El formato es público. */
export function tieneFormatoDeClaveDeIngesta(token: unknown): token is string {
  return typeof token === "string" && FORMATO_DE_LA_CLAVE.test(token);
}

/** Lo que devuelve una clave válida: de qué organización es y cuál es. */
export type ClaveDeIngestaVerificada = {
  organizationId: string;
  claveId: string;
};

type FilaDeVerificacion = {
  id: string;
  organization_id: string;
  key_hash: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

export type OpcionesDeVerificacion = {
  /** Cliente con service role. Por defecto, `createAdminClient()`. */
  cliente?: SupabaseClient;
  /** Reloj, para los tests. */
  ahora?: () => Date;
  /**
   * Qué hacer con la escritura de `last_used_at`, que no se espera.
   * Obligatoria (AR pasada 1): suelta, en una función serverless puede no
   * completarse nunca. El endpoint de SCRUM-528 pasa `after` de `next/server`;
   * un test, la función que junta las tareas.
   */
  enSegundoPlano: (tarea: Promise<void>) => void;
};

/**
 * ⭐ Verifica una clave de ingesta. Devuelve la organización y el id de la
 * clave si el hash existe y la clave no está revocada; si no, `null`.
 *
 * - La comparación es por hash: se busca el sha256 del token (nunca el token)
 *   y, encontrada la fila, se compara con `timingSafeEqual`. El tiempo de la
 *   búsqueda no dice nada útil: depende del sha256 del token, que quien ataca
 *   no puede acercar al de una clave real.
 * - Un token con otra forma se rechaza sin consultar la base. El formato es
 *   público (prefijo y largo), así que rechazarlo antes no filtra nada.
 * - `last_used_at` se actualiza sin esperar y sin poder tumbar la
 *   verificación: si falla, se registra con un texto fijo y la clave sigue
 *   valiendo.
 * - Si la base falla al buscar, lanza `FallaDeLaBase` con un texto fijo (sin
 *   el token ni el hash): no es "clave inválida", y el endpoint tiene que
 *   poder responder 500 en vez de 401.
 */
export async function verificarClaveDeIngesta(
  token: unknown,
  opciones: OpcionesDeVerificacion,
): Promise<ClaveDeIngestaVerificada | null> {
  if (!tieneFormatoDeClaveDeIngesta(token)) return null;

  const cliente = opciones.cliente ?? createAdminClient();
  const hash = hashDeClaveDeIngesta(token);

  const { data, error } = await cliente
    .from("ingest_keys")
    .select("id, organization_id, key_hash, revoked_at, last_used_at")
    .eq("key_hash", hash)
    .maybeSingle();

  if (error) {
    throw new FallaDeLaBase({
      message: "No se pudo leer la clave de ingesta.",
      code: (error as { code?: string | null }).code ?? null,
    });
  }

  const fila = data as FilaDeVerificacion | null;
  if (!fila || !hashesIguales(fila.key_hash, hash)) return null;
  if (fila.revoked_at !== null) return null;

  const ahora = (opciones.ahora ?? (() => new Date()))();
  if (hayQueAnotarElUso(fila.last_used_at, ahora)) {
    const tarea = anotarUltimoUso(cliente, fila, ahora);
    opciones.enSegundoPlano(tarea);
  }

  return { organizationId: fila.organization_id, claveId: fila.id };
}

function hashesIguales(guardado: string, calculado: string): boolean {
  const a = Buffer.from(guardado, "utf8");
  const b = Buffer.from(calculado, "utf8");
  // Con largos distintos `timingSafeEqual` lanza en vez de devolver false.
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hayQueAnotarElUso(ultimoUso: string | null, ahora: Date): boolean {
  if (ultimoUso === null) return true;
  const anterior = Date.parse(ultimoUso);
  // Una fecha ilegible no puede dejar la clave sin anotar para siempre.
  if (Number.isNaN(anterior)) return true;
  return ahora.getTime() - anterior >= INTERVALO_MINIMO_ULTIMO_USO_MS;
}

const NO_SE_ANOTO_EL_USO = "No se pudo anotar el último uso de la clave de ingesta.";

/** Nunca rechaza: una falla se registra (sin la clave ni el hash) y listo. */
async function anotarUltimoUso(
  cliente: SupabaseClient,
  fila: FilaDeVerificacion,
  ahora: Date,
): Promise<void> {
  try {
    const { error } = await cliente
      .from("ingest_keys")
      .update({ last_used_at: ahora.toISOString() })
      .eq("id", fila.id)
      .eq("organization_id", fila.organization_id);
    if (error) {
      registrarUsoSinAnotar(fila.organization_id, (error as { code?: string | null }).code ?? null);
    }
  } catch {
    registrarUsoSinAnotar(fila.organization_id, null);
  }
}

/** Una clave como la ve la pantalla: sin el hash, que nunca sale de la base. */
export type ClaveDeIngestaResumen = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type ClavesActivas = {
  activas: number;
  /** El último uso de cualquiera de las claves activas. */
  ultimoUso: string | null;
};

/** Cuántas claves activas tiene la organización y cuándo se usó la última. */
export async function leerClavesActivas(
  organizationId: string,
  cliente: SupabaseClient = createAdminClient(),
): Promise<ClavesActivas> {
  const { data, error } = await cliente
    .from("ingest_keys")
    .select("last_used_at")
    .eq("organization_id", organizationId)
    .is("revoked_at", null);
  if (error) throw new FallaDeLaBase(error);
  const filas = (data ?? []) as Array<{ last_used_at: string | null }>;
  const usos = filas
    .map((fila) => fila.last_used_at)
    .filter((uso): uso is string => uso !== null)
    .sort();
  return { activas: filas.length, ultimoUso: usos.at(-1) ?? null };
}

const MOTIVO_SIN_LEER = "no se pudieron leer las claves de ingesta.";

/**
 * El estado de la tarjeta Landing en Integraciones. Es una lectura secundaria
 * de la pantalla: si falla, se registra (`lecturaDegradable`, tag
 * `lectura_degradada`) y la tarjeta dice que no se pudo leer, en vez de
 * mostrar "Sin conectar" (SCRUM-519). Sin sesión, tampoco se sabe: mismo
 * estado, sin registrarlo como falla.
 *
 * `organizacion` resuelve la organización de la sesión (en Integraciones,
 * `requireOrganizationId`) y corre dentro de la lectura protegida.
 *
 * `puedeVerDetalle` dice si quien mira es founder o admin (AR pasada 1): sólo
 * a ellos la tarjeta les muestra cuántas claves hay y cuándo se usó la última,
 * lo mismo que ven al abrir el panel. Al resto le dice si hay alguna activa
 * (conectada o no) y que el detalle lo ven el founder o un admin.
 */
export async function saludDeLaLanding(
  organizacion: () => Promise<string>,
  puedeVerDetalle: () => Promise<boolean>,
  leer: (organizationId: string) => Promise<ClavesActivas> = leerClavesActivas,
): Promise<IntegrationHealth> {
  const lectura = await lecturaDegradable<{ claves: ClavesActivas; detalle: boolean } | null>(
    "integraciones:landing",
    async () => {
      const organizationId = await organizacion();
      const [claves, detalle] = await Promise.all([leer(organizationId), puedeVerDetalle()]);
      return { claves, detalle };
    },
    null,
  ).catch((error: unknown) =>
    valorSiNoEsFalla<{ claves: ClavesActivas; detalle: boolean } | null>(error, null),
  );

  if (!lectura) {
    return estadoSinLeer({
      provider: "landing",
      recordsLabel: "claves activas",
      motivo: MOTIVO_SIN_LEER,
    });
  }

  const { claves, detalle } = lectura;
  if (!detalle) {
    return buildHealth({
      provider: "landing",
      connected: claves.activas > 0,
      issues: [
        {
          level: "info",
          message: "El detalle de las claves de ingesta lo ven el founder o un admin.",
        },
      ],
    });
  }

  return buildHealth({
    provider: "landing",
    connected: claves.activas > 0,
    lastSyncAt: claves.ultimoUso,
    records: claves.activas,
    recordsLabel: "claves activas",
    issues:
      claves.ultimoUso === null
        ? [
            {
              level: "info",
              message: "Ninguna clave activa se usó todavía.",
              action:
                "Cargá la clave en la función de la landing que manda los registros a Limitless.",
            },
          ]
        : [],
  });
}

function registrarUsoSinAnotar(organizationId: string, code: string | null): void {
  console.warn(`[verificarClaveDeIngesta] ${NO_SE_ANOTO_EL_USO}`);
  reportarFalla(new FallaDeLaBase({ message: NO_SE_ANOTO_EL_USO, code }), {
    organizationId,
    provider: "landing",
  });
}

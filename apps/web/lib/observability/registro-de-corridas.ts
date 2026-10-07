import { createAdminClient } from "@/lib/supabase/admin";
import { conPlazo } from "@/lib/observability/con-plazo";
import {
  correrEnCorrida,
  nuevasAnotaciones,
  type AnotacionesDeCorrida,
} from "@/lib/observability/corrida-en-curso";
import { nombreSinQuery } from "@/lib/observability/limpiar-evento-sentry";
import { errorParaReportar } from "@/lib/observability/reportar-falla";

/**
 * ⭐ Registro de corridas de los crons en `corridas_de_procesos` (SCRUM-85).
 *
 * Antes no había forma de responder "¿qué corrió anoche y qué orgs fallaron?"
 * sin leer los logs de Vercel, y la página de Infraestructura mostraba estados
 * escritos a mano. `conMonitorDeCron` envuelve cada corrida autorizada con
 * `conRegistroDeCorrida`: abre la fila en `en_curso`, corre el cron y la cierra
 * con su estado. Una fila que queda en `en_curso` es una corrida que se cortó.
 *
 * Estado al cerrar:
 *   - `fallo`: el cron lanzó o respondió 5xx (el mismo criterio que el monitor
 *     de Sentry);
 *   - `parcial`: respondió bien pero alguna organización falló (las anota
 *     `reportarFalla` o `publishCronFanout`, ver `corrida-en-curso.ts`);
 *   - `ok`: el resto.
 *
 * Registrar nunca rompe el cron: cada escritura tiene plazo y cualquier error
 * queda en la consola. Retención: cada cierre borra las corridas de ese proceso
 * con más de 30 días.
 */

export const TABLA_DE_CORRIDAS = "corridas_de_procesos";
export const RETENCION_DE_CORRIDAS_DIAS = 30;
/** Plazo de cada escritura del registro: no puede comerle el tiempo al cron. */
export const PLAZO_DEL_REGISTRO_MS = 2000;
const LARGO_MAXIMO_DEL_ERROR = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EstadoDeCorrida = "en_curso" | "ok" | "fallo" | "parcial";
export type EstadoDeCierre = Exclude<EstadoDeCorrida, "en_curso">;

export type CierreDeCorrida = {
  /** La fila que se abrió al empezar; `null` si no se pudo abrir (se inserta entera). */
  id: string | null;
  proceso: string;
  inicio: Date;
  fin: Date;
  estado: EstadoDeCierre;
  /** `null` cuando el proceso no informó organizaciones. */
  orgsProcesadas: number | null;
  orgsFallidas: number | null;
  organizacionesFallidas: string[];
  error: string | null;
};

/** Dónde se guardan las corridas. Los tests pasan uno en memoria. */
export type AlmacenDeCorridas = {
  abrir(proceso: string, inicio: Date, signal: AbortSignal): Promise<string | null>;
  cerrar(cierre: CierreDeCorrida, signal: AbortSignal): Promise<void>;
  borrarViejas(proceso: string, antesDe: Date, signal: AbortSignal): Promise<void>;
};

export function estadoDeCierre(fallo: boolean, orgsFallidas: number): EstadoDeCierre {
  if (fallo) return "fallo";
  return orgsFallidas > 0 ? "parcial" : "ok";
}

/**
 * El texto de un error, apto para guardarse en una tabla que lee el staff: sin
 * query de URLs, emails, tokens ni claves, y corto. El detalle completo va a
 * Sentry por `reportarFalla`.
 */
export function mensajeDeErrorSaneado(error: unknown): string {
  const { error: comoError } = errorParaReportar(error);
  const limpio = nombreSinQuery(comoError.message || "Error sin mensaje")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]")
    .replace(/\b(bearer|basic)\s+\S+/gi, "$1 [oculto]")
    .replace(
      /\b(api[_-]?key|apikey|token|access[_-]?token|refresh[_-]?token|secret|password|contrase(?:n|ñ)a|authorization)(["']?\s*[:=]\s*)\S+/gi,
      "$1$2[oculto]"
    )
    .replace(/\beyJ[\w-]+\.[\w-]+(?:\.[\w-]+)?/g, "[oculto]")
    .replace(/\b(?:sk|pk|rk|whsec|sb_secret|sb_publishable)[-_][\w-]{8,}/g, "[oculto]")
    .replace(/[A-Za-z0-9_+=]{32,}/g, "[oculto]")
    .replace(/\s+/g, " ")
    .trim();
  return limpio.length > LARGO_MAXIMO_DEL_ERROR
    ? `${limpio.slice(0, LARGO_MAXIMO_DEL_ERROR - 1)}…`
    : limpio;
}

/** Lo que se anotó durante la corrida, en columnas. Sin anotaciones, `null`. */
export function organizacionesDeLaCorrida(anotaciones: AnotacionesDeCorrida): {
  orgsProcesadas: number | null;
  orgsFallidas: number | null;
  organizacionesFallidas: string[];
} {
  if (anotaciones.procesadas.size === 0) {
    return { orgsProcesadas: null, orgsFallidas: null, organizacionesFallidas: [] };
  }
  return {
    orgsProcesadas: anotaciones.procesadas.size,
    orgsFallidas: anotaciones.fallidas.size,
    // La columna es uuid[]: un id que no lo es contaría pero no se lista.
    organizacionesFallidas: [...anotaciones.fallidas].filter((id) => UUID.test(id)),
  };
}

/** Una escritura del registro: con plazo, sin lanzar, con el motivo en la consola. */
async function sinRomper<T>(
  que: string,
  trabajo: (signal: AbortSignal) => Promise<T>,
  siFalla: T
): Promise<T> {
  const vencido = Symbol("vencido");
  const resultado = await conPlazo<T | typeof vencido>(
    async (signal) => {
      try {
        return await trabajo(signal);
      } catch (error) {
        console.error(`[corridas] no se pudo ${que}:`, mensajeDeErrorSaneado(error));
        return siFalla;
      }
    },
    PLAZO_DEL_REGISTRO_MS,
    vencido
  );
  if (resultado === vencido) {
    console.error(`[corridas] no se pudo ${que}: venció el plazo de ${PLAZO_DEL_REGISTRO_MS} ms`);
    return siFalla;
  }
  return resultado;
}

/**
 * Corre `ejecutar` registrando la corrida de `proceso`. Devuelve (o lanza) lo
 * mismo que `ejecutar`: el registro no cambia el resultado del cron.
 */
export async function conRegistroDeCorrida(
  proceso: string,
  ejecutar: () => Promise<Response>,
  almacen: AlmacenDeCorridas = almacenEnLaBase,
  ahora: () => Date = () => new Date()
): Promise<Response> {
  const inicio = ahora();
  const id = await sinRomper("abrir la corrida", (signal) => almacen.abrir(proceso, inicio, signal), null);
  const anotaciones = nuevasAnotaciones();

  const cerrar = async (fallo: boolean, error: string | null) => {
    const organizaciones = organizacionesDeLaCorrida(anotaciones);
    const cierre: CierreDeCorrida = {
      id,
      proceso,
      inicio,
      fin: ahora(),
      estado: estadoDeCierre(fallo, organizaciones.orgsFallidas ?? 0),
      ...organizaciones,
      error,
    };
    await sinRomper("cerrar la corrida", (signal) => almacen.cerrar(cierre, signal), undefined);
    const limite = new Date(cierre.fin.getTime() - RETENCION_DE_CORRIDAS_DIAS * 24 * 60 * 60 * 1000);
    await sinRomper(
      "borrar las corridas viejas",
      (signal) => almacen.borrarViejas(proceso, limite, signal),
      undefined
    );
  };

  let response: Response;
  try {
    response = await correrEnCorrida(anotaciones, ejecutar);
  } catch (error) {
    await cerrar(true, mensajeDeErrorSaneado(error));
    throw error;
  }
  const fallo = response.status >= 500;
  await cerrar(fallo, fallo ? `El proceso respondió con estado ${response.status}` : null);
  return response;
}

function lanzarSiHayError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/** El registro real: `corridas_de_procesos` con el cliente admin. */
export const almacenEnLaBase: AlmacenDeCorridas = {
  async abrir(proceso, inicio, signal) {
    const { data, error } = await createAdminClient()
      .from(TABLA_DE_CORRIDAS)
      .insert({ proceso, inicio: inicio.toISOString(), estado: "en_curso" })
      .select("id")
      .abortSignal(signal)
      .single<{ id: string }>();
    lanzarSiHayError(error);
    return data?.id ?? null;
  },

  async cerrar(cierre, signal) {
    const fila = {
      fin: cierre.fin.toISOString(),
      estado: cierre.estado,
      orgs_procesadas: cierre.orgsProcesadas,
      orgs_fallidas: cierre.orgsFallidas,
      organizaciones_fallidas: cierre.organizacionesFallidas,
      error: cierre.error,
    };
    const tabla = createAdminClient().from(TABLA_DE_CORRIDAS);
    const { error } = cierre.id
      ? await tabla.update(fila).eq("id", cierre.id).abortSignal(signal)
      : await tabla
          .insert({ ...fila, proceso: cierre.proceso, inicio: cierre.inicio.toISOString() })
          .abortSignal(signal);
    lanzarSiHayError(error);
  },

  async borrarViejas(proceso, antesDe, signal) {
    const { error } = await createAdminClient()
      .from(TABLA_DE_CORRIDAS)
      .delete()
      .eq("proceso", proceso)
      .lt("inicio", antesDe.toISOString())
      .abortSignal(signal);
    lanzarSiHayError(error);
  },
};

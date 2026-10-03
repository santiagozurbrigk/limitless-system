/**
 * El aviso de QStash cuando un job agota sus reintentos ("failure callback").
 *
 * Forma del cuerpo: `docs/external-apis/qstash/callbacks.md` § "What is a
 * Failure-Callback?". Lógica pura, aparte de la ruta para poder testearla.
 *
 * ⚠️ `sourceBody` es el cuerpo original del job y puede traer datos sensibles
 * (el job de variaciones de reels lleva un token de Google Drive; el de análisis
 * de Fathom, el transcript). De ahí sólo se leen `organizationId` y `jobId`; el
 * resto no se guarda ni se manda a ningún lado. Lo mismo la URL: puede llevar
 * el secreto del worker en la query, así que se queda sólo con la ruta.
 */
export type FallaDeQStash = {
  /** Ruta del worker que falló, sin dominio ni query (`/api/queue/...`). */
  worker: string;
  /** Status HTTP de la última respuesta del worker. */
  status: number | null;
  retried: number | null;
  maxRetries: number | null;
  sourceMessageId: string | null;
  dlqId: string | null;
  organizationId: string | null;
  jobId: string | null;
};

function numero(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (typeof valor === "string" && valor.trim() && Number.isFinite(Number(valor))) {
    return Number(valor);
  }
  return null;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function rutaSinSecretos(url: unknown): string {
  const crudo = texto(url);
  if (!crudo) return "desconocido";
  try {
    return new URL(crudo).pathname;
  } catch {
    return crudo.split("?")[0] ?? "desconocido";
  }
}

/** De `sourceBody` (base64 de JSON) sólo salen los dos identificadores. */
function identificadoresDelJob(sourceBody: unknown): {
  organizationId: string | null;
  jobId: string | null;
} {
  const crudo = texto(sourceBody);
  if (!crudo) return { organizationId: null, jobId: null };
  try {
    const job = JSON.parse(Buffer.from(crudo, "base64").toString("utf8")) as Record<
      string,
      unknown
    >;
    return { organizationId: texto(job.organizationId), jobId: texto(job.jobId) };
  } catch {
    return { organizationId: null, jobId: null };
  }
}

export function leerFallaDeQStash(cuerpo: unknown): FallaDeQStash | null {
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return null;
  const c = cuerpo as Record<string, unknown>;

  return {
    worker: rutaSinSecretos(c.url),
    status: numero(c.status),
    retried: numero(c.retried),
    maxRetries: numero(c.maxRetries),
    sourceMessageId: texto(c.sourceMessageId),
    dlqId: texto(c.dlqId),
    ...identificadoresDelJob(c.sourceBody),
  };
}

/**
 * El "código de referencia" de un error del servidor: el `digest` que Next le
 * pone al error y que la pantalla de error le muestra al usuario (SCRUM-108).
 *
 * Sirve para ponerle el tag `error_digest` al evento del servidor, así soporte
 * lo encuentra con el código que le pasa el usuario (el evento del navegador
 * lleva el mismo tag, pero sólo con el texto genérico de Next; el mensaje real
 * y el stack están en el del servidor).
 *
 * Por qué se calcula y no sólo se lee: el SDK de Sentry envuelve cada Server
 * Component y captura el error en el momento en que se lanza, antes de que
 * Next le asigne el `digest`; después, la captura de `onRequestError` se
 * descarta porque ese error ya se mandó. Next calcula el digest así
 * (`create-error-handler.js`): el hash de `message + stack` (`string-hash`,
 * djb2 con xor, sin signo) y, si el error trae `__NEXT_ERROR_CODE`, `@<código>`
 * al final. Un test lo compara con el `string-hash` de Next.
 *
 * Sin imports, para que lo use también `instrumentation.ts`.
 */

/** El `string-hash` que usa Next (`next/dist/compiled/string-hash`). */
export function hashDeTexto(texto: string): number {
  let hash = 5381;
  let i = texto.length;
  while (i) hash = (hash * 33) ^ texto.charCodeAt(--i);
  return hash >>> 0;
}

export function digestDeNext(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const { digest, message, stack, __NEXT_ERROR_CODE: codigo } = error as {
    digest?: unknown;
    message?: unknown;
    stack?: unknown;
    __NEXT_ERROR_CODE?: unknown;
  };
  let base: string;
  if (typeof digest === "string") {
    if (!digest) return null;
    base = digest;
  } else if (typeof message === "string") {
    base = String(hashDeTexto(message + (typeof stack === "string" ? stack : "")));
  } else {
    return null;
  }
  // Next guarda en `error.digest` el hash solo y le manda al navegador el hash
  // con `@<código>`: el código de referencia que ve el usuario lleva el sufijo.
  if (typeof codigo === "string" && codigo && !base.includes("@")) base = `${base}@${codigo}`;
  return base.slice(0, 64);
}

type EventoConExcepcion = {
  tags?: Record<string, unknown>;
  exception?: { values?: Array<{ mechanism?: { type?: string } }> };
};

/**
 * Para `beforeSend` del servidor: si el evento es un error de render o de una
 * ruta que capturó la integración de Next (`auto.function.nextjs.*`), le pone
 * el tag `error_digest`. Los demás eventos (una server action, un cron) no lo
 * llevan: ningún usuario vio ese código.
 */
export function etiquetarDigest<T extends EventoConExcepcion>(
  evento: T,
  errorOriginal: unknown
): T {
  if (evento.tags?.error_digest) return evento;
  const deNext = (evento.exception?.values ?? []).some((v) =>
    v.mechanism?.type?.startsWith("auto.function.nextjs")
  );
  if (!deNext) return evento;
  const digest = digestDeNext(errorOriginal);
  if (digest) evento.tags = { ...(evento.tags ?? {}), error_digest: digest };
  return evento;
}

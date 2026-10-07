/**
 * Corre `trabajo` con un plazo (SCRUM-85). Si no termina a tiempo, aborta su
 * `signal` y devuelve `siVence`; si lanza, también devuelve `siVence`.
 *
 * Lo usan el chequeo de salud (que el monitor no quede colgado esperando a la
 * base) y el registro de corridas (que registrar no le coma el tiempo al cron).
 * No tira nunca y no deja promesas rechazadas sin atender.
 */
export async function conPlazo<T>(
  trabajo: (signal: AbortSignal) => Promise<T>,
  plazoMs: number,
  siVence: T
): Promise<T> {
  const controlador = new AbortController();
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const vencimiento = new Promise<T>((resolver) => {
    reloj = setTimeout(() => {
      controlador.abort();
      resolver(siVence);
    }, plazoMs);
  });
  try {
    const intento = Promise.resolve()
      .then(() => trabajo(controlador.signal))
      .catch(() => siVence);
    return await Promise.race([intento, vencimiento]);
  } finally {
    clearTimeout(reloj);
  }
}

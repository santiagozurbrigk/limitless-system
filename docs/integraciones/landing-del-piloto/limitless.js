/**
 * Envío de eventos de la landing del piloto a Limitless (SCRUM-530).
 *
 * Archivo para copiar en la landing del cliente piloto (proyecto aparte, en
 * Vercel), junto a `api/register.js` y `api/visit.js`. Corre SÓLO en el
 * servidor (funciones de Vercel): la clave de ingesta nunca llega al navegador.
 *
 * Contrato: `POST /api/ingest/landing` de Limitless (SCRUM-528,
 * `apps/web/lib/webinar/normalize/evento.ts`). Respuestas:
 *   - 200 `{ ok: true }`: guardado.
 *   - 400: el payload no cumple el contrato. No se reintenta.
 *   - 401: clave inválida o revocada. No se reintenta.
 *   - 413: más de 16 KB. No se reintenta.
 *   - 429: límite por clave (600 cada 10 s). No se reintenta acá: la landing
 *     no frena al usuario por esto.
 *   - 500: Limitless no pudo guardar. Un único reintento después de 1 s.
 *
 * Variables de entorno de la landing (cargadas a mano en Vercel, sólo
 * servidor, nunca `NEXT_PUBLIC_`):
 *   - LIMITLESS_INGEST_KEY: la clave de ingesta (`lmt_ing_...`), creada en
 *     Limitless → Integraciones → Landing. Se ve una sola vez.
 *   - LIMITLESS_LAUNCH_ID: el `public_id` del lanzamiento en Limitless.
 *   - LIMITLESS_INGEST_URL (opcional): por defecto, producción.
 */

const URL_POR_DEFECTO = "https://otc-plaform.vercel.app/api/ingest/landing";
const TIMEOUT_MS = 3000;
const ESPERA_ANTES_DE_REINTENTAR_MS = 1000;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Un POST con timeout propio. Nunca lanza: devuelve el status o un error corto. */
async function enviarUnaVez(evento) {
  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    const respuesta = await fetch(process.env.LIMITLESS_INGEST_URL || URL_POR_DEFECTO, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LIMITLESS_INGEST_KEY}`,
      },
      body: JSON.stringify(evento),
      signal: controlador.signal,
    });
    return { status: respuesta.status };
  } catch (error) {
    return { status: 0, error: error && error.name === "AbortError" ? "timeout" : "red" };
  } finally {
    clearTimeout(corte);
  }
}

/**
 * Envía un evento a Limitless. Reintenta una sola vez, al segundo, si
 * Limitless respondió 500. Un reintento manda exactamente el mismo cuerpo
 * (mismo `client_registration_id`), así que Limitless no lo duplica.
 * Nunca lanza: devuelve `{ ok, status, intentos }` para dejarlo en el log de
 * la landing, sin datos personales.
 */
export async function enviarALimitless(evento) {
  if (!process.env.LIMITLESS_INGEST_KEY || !process.env.LIMITLESS_LAUNCH_ID) {
    return { ok: false, status: 0, intentos: 0, error: "faltan LIMITLESS_INGEST_KEY o LIMITLESS_LAUNCH_ID" };
  }
  let resultado = await enviarUnaVez(evento);
  let intentos = 1;
  if (resultado.status === 500) {
    await esperar(ESPERA_ANTES_DE_REINTENTAR_MS);
    resultado = await enviarUnaVez(evento);
    intentos = 2;
  }
  return { ok: resultado.status === 200, status: resultado.status, intentos, error: resultado.error };
}

/** Los UTM y el fbclid que la landing ya captura, con los nombres del contrato. */
export function trackingDesde(datos) {
  const t = datos.tracking || datos || {};
  const texto = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    utm_source: texto(t.utm_source),
    utm_medium: texto(t.utm_medium),
    utm_campaign: texto(t.utm_campaign),
    utm_content: texto(t.utm_content),
    utm_term: texto(t.utm_term),
    fbclid: texto(t.fbclid),
    sl: texto(t.sl),
  };
}

/**
 * El evento de un registro. `clientRegistrationId` tiene que ser ÚNICO POR
 * REGISTRO (no por persona): Limitless lo usa para no duplicar reintentos, y es
 * único por organización, así que si se reusara para la misma persona en otro
 * lanzamiento, el segundo registro se perdería. Usar `crypto.randomUUID()` al
 * recibir el formulario, y reusar ese mismo valor sólo para el reintento.
 */
export function eventoDeRegistro({ clientRegistrationId, nombre, email, telefono, datos, variante, calificacion }) {
  return {
    type: "registration",
    launch_public_id: process.env.LIMITLESS_LAUNCH_ID,
    client_registration_id: clientRegistrationId,
    name: nombre || null,
    email,
    phone: telefono || null,
    tracking: trackingDesde(datos),
    ab_variant: variante || null,
    qualification: calificacion || null,
    occurred_at: new Date().toISOString(),
  };
}

/** El evento de una visita. `visitorId` es el id anónimo que la landing guarda en una cookie. */
export function eventoDeVisita({ visitorId }) {
  return {
    type: "visit",
    launch_public_id: process.env.LIMITLESS_LAUNCH_ID,
    visitor_id: visitorId,
    occurred_at: new Date().toISOString(),
  };
}

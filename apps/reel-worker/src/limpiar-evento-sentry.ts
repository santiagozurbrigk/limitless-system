/**
 * ⭐ Saca de un evento de Sentry todo lo que puede traer datos del usuario o
 * secretos antes de que salga del proceso (SCRUM-501).
 *
 * El SDK de Node guarda el cuerpo de cada request entrante (hasta 10 KB, sin
 * importar `sendDefaultPii`) y lo adjunta a todo evento capturado durante ese
 * request como `request.data`. En una server action ese cuerpo son los
 * argumentos: contraseñas, API keys, datos de clientes. Las configs de Sentry
 * además apagan la captura en origen (`maxIncomingRequestBodySize: "none"`);
 * esto es la segunda barrera, que también cubre lo que no pasa por esa
 * integración.
 *
 * Qué saca:
 *   - `request.data` (el cuerpo), `request.cookies` y `request.query_string`;
 *   - la query de `request.url` y del header `referer`;
 *   - todo header que no esté en `HEADERS_PERMITIDOS` (lista blanca: un header
 *     nuevo con un token no se escapa por no estar en una lista negra);
 *   - en `extra` y en `contexts`, las claves con nombre de cuerpo o de secreto;
 *   - los breadcrumbs de consola (un log puede traer cualquier cosa) y, en los
 *     demás, el cuerpo, los headers y la query de su `data`;
 *   - en los atributos de los spans y de la traza (`contexts.trace.data`) y en
 *     los demás contextos (`contexts.nextjs.request_path`), el cuerpo, la query
 *     y los headers fuera de la lista blanca;
 *   - la query del nombre de la transacción (`transaction`), de la descripción
 *     de cada span y de los atributos de nombre (`next.span_name`), cuando
 *     tienen forma de pedido HTTP.
 *
 * Copia exacta en `apps/reel-worker/src/limpiar-evento-sentry.ts` y
 * `apps/discord-bot/src/utils/limpiar-evento-sentry.ts`: esos dos se
 * despliegan solos (su Dockerfile sólo copia su carpeta) y no pueden importar
 * de acá. `lib/observability/__tests__/limpiar-evento-sentry.test.ts` falla si
 * las copias se separan. Sin imports a propósito, para que compile en las tres.
 */

/** Lo único de los headers que se manda. Todo lo demás se descarta. */
export const HEADERS_PERMITIDOS = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "content-length",
  "content-type",
  "host",
  "next-action",
  "user-agent",
  "x-vercel-id",
]);

/** Claves de `extra`, `contexts` y `data` de breadcrumbs que nunca se mandan. */
const CLAVE_SENSIBLE =
  /^(body|data|payload|request_?body|response_?body|args|arguments|params|query|query_?string|headers|cookies?|password|contrase(n|ñ)a|token|access_?token|refresh_?token|secret|api_?key|apikey|authorization|credentials?)$/i;

type Diccionario = Record<string, unknown>;

type RequestLimpiable = {
  url?: string;
  data?: unknown;
  cookies?: unknown;
  query_string?: unknown;
  headers?: Record<string, string>;
};

type BreadcrumbLimpiable = {
  category?: string;
  data?: Diccionario;
};

type SpanLimpiable = { data?: Diccionario; description?: string };

export type EventoLimpiable = {
  transaction?: string;
  request?: RequestLimpiable;
  extra?: Diccionario;
  contexts?: Diccionario;
  breadcrumbs?: BreadcrumbLimpiable[];
  spans?: SpanLimpiable[];
};

/** `https://x.com/a?token=1#h` → `https://x.com/a`. */
export function sinQuery(url: string): string {
  const corte = url.search(/[?#]/);
  return corte === -1 ? url : url.slice(0, corte);
}

/**
 * Un nombre de transacción o de span sin la query de las rutas o URLs que
 * contiene: `GET /team?token=X` → `GET /team`, `render route (app)
 * /invite?token=Z` → `render route (app) /invite`, `POST
 * https://api.x.com/v1?key=Y` → `POST https://api.x.com/v1`. Sólo corta un `?`
 * o `#` pegado a una ruta (`/…`) o URL, así que una consulta SQL con `?` como
 * parámetro (`where id = ?`) queda igual.
 */
export function nombreSinQuery(nombre: string): string {
  return nombre.replace(/((?:https?:\/\/|\/)[^\s?#]*)[?#]\S*/g, "$1");
}

function sinClavesSensibles(objeto: Diccionario | undefined): Diccionario | undefined {
  if (!objeto) return objeto;
  const limpio: Diccionario = {};
  for (const [clave, valor] of Object.entries(objeto)) {
    if (CLAVE_SENSIBLE.test(clave)) continue;
    limpio[clave] = valor;
  }
  return limpio;
}

/** `data` de un breadcrumb o de un span: sin claves sensibles y sin query en las URLs. */
function limpiarDatos(datos: Diccionario | undefined): Diccionario | undefined {
  const limpio = sinClavesSensibles(datos);
  if (!limpio) return limpio;
  for (const [clave, valor] of Object.entries(limpio)) {
    // Los headers que OpenTelemetry copia a los atributos del span
    // (`http.request.header.x_api_key`): la misma lista blanca.
    const header = /^http\.(request|response)\.header\.(.+)$/i.exec(clave);
    if (header) {
      if (!HEADERS_PERMITIDOS.has(header[2].toLowerCase().replace(/_/g, "-"))) delete limpio[clave];
      continue;
    }
    if (/query/i.test(clave)) {
      delete limpio[clave];
    } else if (typeof valor === "string" && /url|target|route|path|referr?er|^from$|^to$/i.test(clave)) {
      limpio[clave] = sinQuery(valor);
    } else if (typeof valor === "string" && /name|description|transaction/i.test(clave)) {
      // `next.span_name`, `sentry.transaction`...
      limpio[clave] = nombreSinQuery(valor);
    }
  }
  return limpio;
}

function limpiarRequest(request: RequestLimpiable): RequestLimpiable {
  const limpio: RequestLimpiable = { ...request };
  delete limpio.data;
  delete limpio.cookies;
  delete limpio.query_string;
  if (typeof limpio.url === "string") limpio.url = sinQuery(limpio.url);
  if (limpio.headers) {
    const headers: Record<string, string> = {};
    for (const [nombre, valor] of Object.entries(limpio.headers)) {
      const clave = nombre.toLowerCase();
      if (HEADERS_PERMITIDOS.has(clave)) headers[nombre] = valor;
      else if (clave === "referer" && typeof valor === "string") headers[nombre] = sinQuery(valor);
    }
    limpio.headers = headers;
  }
  return limpio;
}

/**
 * Para `beforeSend` y `beforeSendTransaction`. Modifica el evento y lo
 * devuelve, para no perder ningún campo que Sentry espere.
 */
export function limpiarEventoDeSentry<T extends EventoLimpiable>(evento: T): T {
  const e: EventoLimpiable = evento;
  if (typeof e.transaction === "string") e.transaction = nombreSinQuery(e.transaction);
  if (e.request) e.request = limpiarRequest(e.request);
  if (e.extra) e.extra = sinClavesSensibles(e.extra);
  if (e.contexts) {
    const contextos = sinClavesSensibles(e.contexts) ?? {};
    e.contexts = contextos;
    for (const [nombre, contexto] of Object.entries(contextos)) {
      if (!contexto || typeof contexto !== "object" || Array.isArray(contexto)) continue;
      if (nombre === "trace") {
        // La traza de una transacción lleva los atributos del span raíz.
        const traza = contexto as { data?: Diccionario; description?: unknown };
        if (traza.data) traza.data = limpiarDatos(traza.data);
        if (typeof traza.description === "string") traza.description = nombreSinQuery(traza.description);
      } else {
        // Los demás (`nextjs.request_path`, `response`...): la misma limpieza
        // que los atributos de un span.
        contextos[nombre] = limpiarDatos(contexto as Diccionario);
      }
    }
  }
  if (e.breadcrumbs) {
    e.breadcrumbs = e.breadcrumbs
      .filter((miga) => miga.category !== "console")
      .map((miga) => (miga.data ? { ...miga, data: limpiarDatos(miga.data) } : miga));
  }
  if (e.spans) {
    e.spans = e.spans.map((span) => {
      const limpio = span.data ? { ...span, data: limpiarDatos(span.data) } : { ...span };
      if (typeof limpio.description === "string") limpio.description = nombreSinQuery(limpio.description);
      return limpio;
    });
  }
  return evento;
}

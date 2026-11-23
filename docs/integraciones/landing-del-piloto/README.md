# Landing del piloto enviando a Limitless (SCRUM-530)

Kit para que la landing del cliente piloto, además de mandar cada registro a GoHighLevel como hoy, se lo mande a
Limitless Webinars, y avise de cada visita. Requerimientos técnicos, sección 5.1. El endpoint que recibe es el de
SCRUM-528 (`POST /api/ingest/landing`); su contrato está en `apps/web/lib/webinar/normalize/evento.ts` y en
`docs/areas/embudos.md`.

> **Estado:** preparado sin acceso a la landing del piloto ni cliente piloto elegido (SCRUM-522). Falta adaptar la
> llamada actual a GHL dentro de `register.js` y probar con un registro real. Lo que no se pudo probar está en
> `docs/operacion/verificacion-manual.md` § V-LANDING-1.

## Archivos

| Archivo | Va en la landing como | Qué hace |
|---|---|---|
| `limitless.js` | `api/limitless.js` | Arma los eventos del contrato y los manda con timeout de 3 s y un único reintento al segundo si Limitless responde 500 |
| `register.js` | `api/register.js` | Manda el registro a GHL y a Limitless en paralelo (`Promise.allSettled`). La respuesta al navegador depende sólo de GHL |
| `visit.js` | `api/visit.js` | Manda la visita con la clave del lado del servidor. Siempre responde 204 |

## Pasos

1. **Prerrequisitos en Limitless** (después de la ventana de SCRUM-532 y los merges de 526–528):
   1. el lanzamiento del piloto creado, con su `public_id`;
   2. una clave de ingesta creada en Integraciones → Landing. Se muestra una sola vez: copiarla directo a Vercel.
2. **En el proyecto de Vercel de la landing**, variables de entorno (Production, sólo servidor, nunca `NEXT_PUBLIC_`):
   - `LIMITLESS_INGEST_KEY` = la clave (`lmt_ing_...`);
   - `LIMITLESS_LAUNCH_ID` = el `public_id` del lanzamiento;
   - `LIMITLESS_INGEST_URL` sólo si se prueba contra otro entorno (por defecto, producción).
3. **Copiar los tres archivos** a `api/`.
   - En `register.js`, reemplazar el cuerpo de `enviarAGhl` por la llamada que la landing ya hace hoy, sin cambiar lo que hace.
   - En el navegador, después de cargar la página, un `fetch("/api/visit", { method: "POST", body: JSON.stringify({ visitor_id }) })` con un id anónimo guardado en una cookie propia (1 año).
4. **Probar** (V-LANDING-1): un registro real llega a Limitless una sola vez, GHL lo sigue recibiendo igual, y una visita aparece en el embudo.

## Reglas que el kit ya cumple

- **La clave nunca llega al navegador**: sólo la leen las funciones del servidor.
- **Limitless no puede romper la landing**: GHL decide la respuesta. Si Limitless falla, el registro igual se guarda en GHL y queda en el log de la landing (sin datos personales).
- **Sin duplicados**: `client_registration_id` se genera con `randomUUID()` por cada registro y el reintento manda el mismo cuerpo. Limitless lo deduplica.
- **No reusar el id para la misma persona en otro lanzamiento.** Es único por organización, así que reusarlo haría que el segundo registro se pierda en silencio (revisión del #146).
- **Qué se reintenta:** sólo el 500, que es lo único que Limitless pide reintentar. Un 400 (payload inválido) o un 401 (clave inválida) no se reintentan: hay que arreglar el dato o la clave. Un 429 tampoco: se pierde ese envío a Limitless, y el registro queda igual en GHL.

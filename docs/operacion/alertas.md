# Alertas de procesos de fondo (Sentry)

SCRUM-84 / `[OBS-SIN-ALERTAS]`. El código ya manda todo a Sentry. Lo que falta es del lado de Sentry: comprar el plan
Team y crear las reglas de esta página. Decisión del 2026-10-02: las alertas van por **mail**.

## Qué manda el código

| Qué | Cómo llega a Sentry | Etiquetas |
|---|---|---|
| Un cron de `vercel.json` que no corrió en su horario, tardó más de 15 min o terminó en error / 5xx | Cron Monitor (`conMonitorDeCron`), slug `cron-…` o `integrations-…` | — |
| Un error de una org dentro de un cron (GHL, Calendly, Fathom) | `reportarFalla` | `proceso_de_fondo`, `cron`, `org_id`, `provider` |
| Un worker de QStash que falla | `reportarFalla` en el catch del worker | `proceso_de_fondo`, `cron`, `org_id` |
| Un job de QStash que agotó sus reintentos | `/api/queue/failure` | `proceso_de_fondo`, `cron` (ruta del worker), `org_id`, `provider=qstash` |
| Errores del bot de Discord y del reel-worker | `@sentry/node` (si tienen `SENTRY_DSN`) | `app=discord-bot` / `app=reel-worker`, `proceso_de_fondo` |

Detalle técnico en [`arquitectura/jobs-webhooks-y-colas.md`](../arquitectura/jobs-webhooks-y-colas.md) § Instrumentación y Sentry.

## Qué datos no llegan a Sentry (SCRUM-501)

El SDK de Node guarda por defecto el cuerpo de cada request (hasta 10 KB, aunque `sendDefaultPii` esté apagado) y lo
adjunta a todo evento; en una server action ese cuerpo son sus argumentos (contraseñas, API keys, datos de clientes).
Además mandaba el header `cookie` (con la sesión de Supabase) y `authorization`. Desde SCRUM-501 las cinco configs
(`apps/web/sentry.{server,edge,client}.config.ts`, `apps/reel-worker/src/sentry.ts`, `apps/discord-bot/src/utils/sentry.ts`)
van sin el cuerpo del request (`maxIncomingRequestBodySize: "none"` y `requestDataIntegration` sin `data`, `cookies` ni `query_string`) y con `beforeSend`/`beforeSendTransaction` que pasan todo evento por `limpiarEventoDeSentry` (`lib/observability/limpiar-evento-sentry.ts`): sin cuerpo, cookies ni query; URL y referer sin query; headers por lista blanca (también los que OpenTelemetry copia a la traza y a los spans); `extra` y `contexts` sin claves de cuerpo o de secreto; sin breadcrumbs de consola; la query del nombre de la transacción, de la traza y de los spans (`next.span_name`) y de los demás contextos (`contexts.nextjs.request_path`). El reel-worker y el bot llevan una copia exacta del módulo (se despliegan solos); un test falla si se
separan. El mensaje y el stack del error sí viajan: una acción no tiene que meter datos del usuario en el texto de un
error.

**Antes de SCRUM-501** (verificado con un build de `origin/main` `e8dcb4a7` y un Sentry falso, evidencia del
incidente). Pasa desde que `instrumentation.ts` empezó a cargar Sentry en el servidor (2026-09-22, `d1a35ccb`):
- **Eventos (Issues):** todo error lanzado por una server action o un Server Component que capturaba `onRequestError`
  llegaba con `request.data` (los argumentos), los headers `cookie` (el token de sesión de Supabase, access y
  refresh), `authorization`, `x-api-key` y cualquier otro, `request.query_string` y la query en `request.url`, en el
  `referer` y en `contexts.nextjs.request_path`.
- **Transacciones (Performance, 5% de los pedidos del servidor):** lo mismo en `request` (`request.data` con los
  argumentos de la acción, por ejemplo una contraseña; headers `cookie`, `authorization`, `x-api-key` y el resto;
  `request.cookies`; `query_string`; la query en `url` y `referer`) y,
  además, la query en `contexts.trace.data` (`next.span_name`, `http.target`) y en el referer de
  `http.request.header.referer`. Una transacción se registra aunque el pedido no falle: cualquier pantalla abierta con
  la sesión pudo dejar la cookie.

Qué hay que revisar y borrar en Sentry, desde el 2026-09-22:
1. Issues del servidor cuyos eventos tengan `request.data`, el header `cookie`, `authorization` o `x-api-key`.
2. Transacciones de Performance con `request.data`, `request.headers.cookie`, `request.cookies`,
   `request.headers.authorization`, `request.headers.x-api-key` o query en `request.url`, `next.span_name` o `http.target` (sobre todo `?token=` de `/invite` y `?code=`/`?state=`
   de OAuth). Si el plan no deja borrar transacciones sueltas, se borra el proyecto o se espera la retención.
3. Si apareció alguna cookie de sesión, cerrar esas sesiones (o rotar el JWT secret si no se puede saber de quién).

## Una vez comprado el plan Team

1. **Monitores de crons:** aparecen solos en Sentry → Crons después de la primera corrida de cada uno (19). Cada uno
   abre un issue a las 2 fallas seguidas. Revisar que estén los 19 y que el horario coincida con `vercel.json`.
2. **Regla "issue nuevo de un proceso de fondo"** (Alerts → Create alert → Issues):
   - Cuándo: *A new issue is created*.
   - Filtro: tag `proceso_de_fondo` igual a `true`.
   - Acción: mail a los miembros del equipo.
   - Frecuencia: una vez cada 30 minutos por issue.
3. **Regla "pico de errores"**:
   - Cuándo: *The issue is seen more than 50 times in 1 hour*.
   - Mismo filtro y misma acción que la anterior.
4. **Regla de los monitores**:
   - Cuándo: un issue de Cron Monitor (categoría *Crons*) se crea o cambia de estado.
   - Acción: mail.
5. **Bot y worker:** cargar `SENTRY_DSN` (el mismo valor que en Vercel) en Railway (bot) y en Fly (`fly secrets set`,
   reel-worker), y redesplegar.
6. **Tope de gasto:** pay-as-you-go en USD 30, como se decidió.

## Prueba de aceptación (cierra SCRUM-84)

Anotar el resultado en [`verificacion-manual.md`](./verificacion-manual.md) § Alertas de procesos de fondo.

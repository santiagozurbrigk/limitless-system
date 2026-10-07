# Alertas: disponibilidad, producción al día y procesos de fondo

Tres capas, de afuera hacia adentro:

| Qué detecta | Con qué | Dónde se configura |
|---|---|---|
| La app no responde o la base está caída | Monitor externo contra `GET /api/health` (SCRUM-85) | [§ Monitor externo](#monitor-externo-de-disponibilidad-paso-a-paso), sin código |
| Producción quedó atrás de `main` (Vercel no desplegó) | Workflow `produccion-al-dia.yml` (SCRUM-85) | [§ Producción desactualizada](#producción-desactualizada) |
| Un cron, un worker o una org que falla | Sentry (SCRUM-84) y el registro de corridas (SCRUM-85) | Lo que sigue, y [§ Registro de corridas](#registro-de-corridas-de-los-crons) |

SCRUM-84 / `[OBS-SIN-ALERTAS]`. El código ya manda todo a Sentry. Lo que falta es del lado de Sentry: comprar el plan
Team y crear las reglas de esta página. Decisión del 2026-10-02: las alertas van por **mail**.

## Qué manda el código

| Qué | Cómo llega a Sentry | Etiquetas |
|---|---|---|
| Un cron de `vercel.json` que no corrió en su horario, tardó más de 15 min o terminó en error / 5xx | Cron Monitor (`conMonitorDeCron`), slug `cron-…` o `integrations-…` | — |
| Un error de una org dentro de un cron (GHL, Calendly, Fathom) | `reportarFalla` | `proceso_de_fondo`, `cron`, `org_id`, `provider` |
| Un worker de QStash que falla | `reportarFalla` en el catch del worker | `proceso_de_fondo`, `cron`, `org_id` |
| Un job de QStash que agotó sus reintentos | `/api/queue/failure` | `proceso_de_fondo`, `cron` (ruta del worker), `org_id`, `provider=qstash` |
| Una server action que falla por algo inesperado (la red, la base, un bug) en los módulos que separan sus errores (SCRUM-497: Auth, Clientes, Equipo, Closing) o una falla de infraestructura dentro de `runMutation` en el resto | `registrarFallaDeAccion` → `reportarFalla` (`lib/server/action-result.ts`) | `server_action` (etiqueta de la acción; sin `proceso_de_fondo`) |
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

## Chequeo de salud (`/api/health`)

SCRUM-85 / `[MONITOREO-Y-ALERTAS]`. `GET https://www.optimizatucontrol.com/api/health`, público y sin sesión
(`lib/observability/salud.ts`, `app/api/health/route.ts`). Responde:

```json
{
  "status": "ok",
  "chequeos": { "base": true, "storage": true, "variables": true },
  "version": { "commit": "cdfca43", "entorno": "production" },
  "hora": "2026-10-07T15:00:00.000Z"
}
```

| `status` | HTTP | Cuándo |
|---|---|---|
| `ok` | 200 | La base, Storage y las variables críticas están bien |
| `degradado` | 200 | La base responde pero Storage no, o falta una variable crítica |
| `caido` | 503 | La base no responde (o no responde en 3 s) |

- **base:** lee una fila de `organizations` con la clave de servicio (también prueba que la clave sirva).
- **storage:** lista el bucket `content-thumbnails` con límite 1.
- **variables:** las de Supabase (URL, anon o publishable, service role o secret), `CRON_SECRET` y
  `ENCRYPTION_MASTER_KEY`. Dice sólo si están todas; nunca cuál falta ni su valor.
- **version.commit:** los 7 primeros caracteres de `VERCEL_GIT_COMMIT_SHA` (`null` fuera de Vercel).
- Nunca lleva mensajes de error, nombres de tablas, buckets ni variables.
- Cada chequeo tiene 3 s de plazo y corren en paralelo: la respuesta nunca tarda mucho más que eso.
- Es barata a propósito: cada instancia reusa el resultado 10 s y los pedidos que llegan mientras mide esperan la
  misma medición. Muchos pedidos seguidos son, como mucho, una consulta a la base y un listado de Storage cada 10 s
  por instancia. `Cache-Control: no-store`: no la guarda ninguna caché.
- La página Super-admin → Infraestructura muestra el mismo chequeo.

## Monitor externo de disponibilidad (paso a paso)

No se puede crear desde el código: hace falta una cuenta. Cualquiera de estos dos tiene plan gratis:
**UptimeRobot** (uptimerobot.com) o **Better Stack Uptime** (betterstack.com/uptime). Antes de elegir, revisa en la
página de precios de cada uno las condiciones del plan gratis (uso comercial, intervalo mínimo y canales de aviso
incluidos), porque cambian seguido. Los pasos son casi iguales en los dos:

1. Crear la cuenta con un mail del equipo (no personal), así el aviso no depende de una persona.
2. Nuevo monitor de tipo **HTTP(s)** (en Better Stack, "URL becomes unavailable"):
   - URL: `https://www.optimizatucontrol.com/api/health`
   - Intervalo: el mínimo del plan gratis (5 min en UptimeRobot, 3 min en Better Stack al momento de escribir esto).
   - Timeout: 30 s.
   - Alerta cuando la respuesta no es 2xx: así avisa con 503 (`caido`) y si la app no responde.
3. Opcional, para enterarte también de `degradado` (Storage o una variable): un segundo monitor de tipo **Keyword**
   sobre la misma URL que alerte si la respuesta **no contiene** `"status":"ok"`.
4. Canal de aviso:
   - **Mail:** viene por defecto; suma a todo el equipo como contacto.
   - **Discord:** en el servidor del equipo, Ajustes del canal → Integraciones → Webhooks → Nuevo webhook → Copiar URL.
     En el monitor, agrega un contacto o integración de tipo Discord (o webhook) y pega esa URL. Si el plan gratis no
     incluye Discord, quédate con el mail.
5. Probarlo: el monitor tiene que quedar en verde. Para ver la alerta, pausa un momento el monitor y apúntalo a una URL
   que dé 503 o 404 (por ejemplo `https://www.optimizatucontrol.com/api/health-no-existe`, que redirige al login y no
   es 2xx si se configura sin seguir redirecciones; si el servicio sigue redirecciones, usa el monitor Keyword), confirma
   que llega el aviso y vuelve a la URL correcta.
6. Anota en [`verificacion-manual.md`](./verificacion-manual.md) § Salud y producción al día qué servicio se eligió, la
   cuenta y quién recibe los avisos.

## Producción desactualizada

`.github/workflows/produccion-al-dia.yml` corre después de cada push a `main`, todos los días a las 12:17 UTC y a mano
(Actions → Producción al día → Run workflow). Ejecuta `.github/scripts/verificar-produccion.sh`, que consulta
`/api/health` cada 30 s durante hasta 20 min y compara `version.commit` con el commit de `main`. Si producción tiene ese
commit, o uno posterior, termina en verde. Si no, **falla** con el mensaje "Producción no está al día: main está en X y
después de 20 min … responde commit Y" y qué revisar. Sin tokens de Vercel.

- **Quién se entera:** GitHub manda un mail cuando falla un workflow a quien lo disparó (el que hizo el merge) y, en
  la corrida diaria, a quien escribió o cambió por última vez el `cron` del workflow; cada uno tiene que tener
  activadas las notificaciones de Actions (GitHub → Settings → Notifications → Actions).
- **Aviso en Discord (opcional):** crea un webhook en el canal del equipo (como en el paso 4 de arriba) y guárdalo en
  el repo como secreto `DISCORD_WEBHOOK_ALERTAS` (GitHub → Settings → Secrets and variables → Actions → New repository
  secret). Si el secreto existe, el workflow también avisa ahí cuando falla; si no existe, sólo falla en GitHub.
- **Un merge nuevo cancela la espera del anterior** (`concurrency`): importa que llegue el último.
- **Probar el aviso sin tocar producción:** Run workflow con `sha_esperado` = un commit que no esté desplegado (por
  ejemplo, uno de otra rama) y `plazo_segundos` = `60`. Falla al minuto, manda el mail y, si está el secreto, el aviso
  a Discord. Los inputs se validan (un commit de 7 a 40 caracteres hexadecimales, un número de segundos).
- **Qué hacer cuando falla:** Vercel → Deployments. Si el último deploy de `main` no existe, el proyecto perdió la
  conexión con el repo (lo que pasó del 3 al 5 de octubre): reconectarlo en Settings → Git y redesplegar. Si existe y
  falló, mirar su log. Si está `READY` pero no es el de producción, promoverlo. Runbook en
  [`incidentes.md`](./incidentes.md).
- **Si Vercel saltea builds a propósito** (Ignored Build Step) el workflow avisaría de más. Hoy no hay ninguno
  configurado en el repo; si se agrega, hay que adaptar el script.
- **Cómo se probó:** `act` no está disponible; el script se probó contra un servidor falso con diez casos (al día,
  atrasado, deploy que llega dentro del plazo, commit posterior, base caída con el commit correcto, sin versión,
  aviso a un webhook de Discord falso, producción que no responde, commit y plazo inválidos). La primera corrida real
  queda en Actions después del merge.

## Registro de corridas de los crons

Cada corrida autorizada de los 19 crons de `vercel.json` queda en la tabla `corridas_de_procesos`
(`lib/observability/registro-de-corridas.ts`, desde `conMonitorDeCron`): inicio, fin, estado (`en_curso`, `ok`,
`fallo`, `parcial`), orgs procesadas y fallidas, los ids de las fallidas y un mensaje de error saneado (sin query,
emails, tokens ni claves; 300 caracteres como mucho). Se ve en Super-admin → Infraestructura → Procesos programados.

- `fallo`: el cron lanzó o respondió 5xx. `parcial`: respondió bien pero alguna org falló (la que pasó por
  `reportarFalla` con su `organizationId` o cuyo job de QStash no se pudo publicar).
- Una fila que sigue en `en_curso` más de 15 min es una corrida que se cortó (por ejemplo, el plazo de 60 s de Vercel).
- Informan sus orgs los 6 crons con fan-out por QStash y las syncs de GHL, Calendly, Fathom y métricas de contenido. El
  resto queda con las columnas de orgs vacías hasta que pasen a `correrPorOrganizacion()` (`[AUD-SALUD-3]`).
- Registrar nunca rompe un cron: cada escritura tiene 2 s de plazo y una falla queda en la consola.
- Retención: cada cierre borra las corridas de ese proceso con más de 30 días.

Consulta útil (Supabase → SQL Editor, sólo lectura):

```sql
select proceso, inicio, estado, orgs_procesadas, orgs_fallidas, organizaciones_fallidas, error
from public.corridas_de_procesos
where estado in ('fallo', 'parcial')
   or (estado = 'en_curso' and inicio < now() - interval '15 minutes')
order by inicio desc
limit 50;
```


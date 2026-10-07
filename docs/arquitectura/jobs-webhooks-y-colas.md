# Jobs, webhooks y colas

> Verificado contra el código el 2026-09-23 (commit 038caca). Backlog: `PENDIENTES.md` § Infraestructura.

## Qué es

Todo lo que corre en `apps/web` sin un usuario mirando: los 19 crons de Vercel, los webhooks que mandan los proveedores, los workers de la cola QStash, el rate limiting compartido y la instrumentación con Sentry. Los procesos permanentes (bot de Discord, worker de reels) están en `docs/operacion/entorno-y-deploy.md`.

Mapa de autenticación de cada tipo de endpoint:

| Tipo | Ruta | Cómo se autentica | Público en middleware |
|---|---|---|---|
| Cron | `/api/cron/*` y varios `/api/integrations/*/sync`, `/poll`, `/process`, `/reanalyze` | `assertCronAuthorized` (`Bearer CRON_SECRET`, tiempo constante, **lanza si falta la variable**) | sí |
| Worker de cola | `/api/queue/*` | `verifyQueueRequest` o `verifyQStashRequest` | sí |
| Webhook | `/api/webhooks/*`, `/api/integrations/*/webhook*` | firma o secreto del proveedor, por handler | sí |
| Bot de Discord | `/api/discord/*` | `Bearer LIMITLESS_WEBHOOK_SECRET` (o `OTC_WEBHOOK_SECRET`) | sí |
| OAuth | `/api/integrations/*/oauth/start`, `*/callback` | sesión en el start; `state` en cookie httpOnly en el callback | sí |
| Sesión | `/api/agent/*`, `/api/content/analyze`, `/api/integrations/*/connect`, `disconnect`, `google/thumbnail`, `unipile/attendee-picture` | `requireAuth` / `requireOrganizationId` | no |

La lista de rutas públicas está en `apps/web/lib/supabase/public-paths.ts` (con tests). **Público en el middleware no significa abierto**: significa que el middleware no redirige a `/login` y que el handler se autentica solo.

## Crons (`apps/web/vercel.json`)

Vercel invoca los crons con **GET** y el header `Authorization: Bearer <CRON_SECRET>`. Todos los handlers exportan `GET` y `POST` y llaman a `assertCronAuthorized` como primera línea. Horarios en UTC (ART = UTC−3).

| Path | Schedule | Qué hace | maxDuration | Fan-out QStash |
|---|---|---|---|---|
| `/api/integrations/fathom/process` | `*/10 * * * *` | Procesa la cola de `fathom_calls` pendientes (no lista reuniones); reclama llamadas trabadas (`lib/fathom/reclaim-stuck.ts`) y encola el análisis profundo | 60 | análisis vía `publishFathomAnalysisJob` |
| `/api/integrations/fathom/sync` | `0 * * * *` | Lista reuniones nuevas de Fathom por API key: la de cada org (`syncAllFathomIntegrations`) y la de cada miembro conectado desde la sección por miembro (`sincronizarTodosLosMiembrosFathom`, SCRUM-448). Plazo común de 45 s y orden rotativo (`lib/fathom/plazo-del-cron.ts`, SCRUM-36): lo que no entra queda para la próxima corrida | 60 | no |
| `/api/integrations/typeform/sync` | `0 * * * *` | Formularios y respuestas de Typeform → `forms`, `form_responses` | 60 | no |
| `/api/integrations/google-forms/sync` | `0 * * * *` | Formularios y respuestas de Google Forms | 60 | no |
| `/api/cron/calendly-sync` | `0 * * * *` | Respaldo de turnos de Calendly (org) → `closing_calls`; 500 si falla | 60 | no |
| `/api/cron/calendly-sync-closers` | `0 * * * *` | Mismo sync con la integración propia de cada closer (`lib/calendly/closer-sync.ts`) | 60 | no |
| `/api/cron/ghl-sync` | `0 * * * *` | Turnos del calendario de GHL → `closing_calls`; acepta `?organizationId=` | 60 | no |
| `/api/integrations/instagram/sync` | `0 * * * *` | **Legacy** Instagram Graph → `content_assets` | 60 | no |
| `/api/integrations/instagram/poll` | `*/5 * * * *` | **Legacy** poll de DMs de Instagram Graph | 60 | no |
| `/api/cron/mercadopago-token-refresh` | `0 4 * * *` | Refresca tokens OAuth de Mercado Pago | default | no |
| `/api/cron/intelligence-snapshot` | `0 0,12 * * *` | Snapshot de inteligencia por org | 60 | sí → `/api/queue/process-cron-intelligence-snapshot` |
| `/api/cron/founder-tone-analysis` | `0 12 * * 1` | Análisis del tono del founder (lunes) | 60 | sí → `/api/queue/process-cron-founder-tone` |
| `/api/cron/executive-report-daily` | `0 11 * * *` | Pulso diario | 60 | sí → `/api/queue/process-cron-executive-report` (`period` en el body) |
| `/api/cron/executive-report-weekly` | `30 12 * * 1` | Reporte semanal | 60 | ídem |
| `/api/cron/executive-report-monthly` | `0 13 1 * *` | Reporte mensual | 300 | ídem |
| `/api/cron/sync-content-metrics` | `0 6 * * *` | Métricas de `content_pieces` vía Zernio | 60 | sí → `/api/queue/process-cron-sync-metrics` |
| `/api/cron/cleanup-trial-reels` | `0 3 * * *` | Borra del bucket `trial-reels` los archivos de jobs `done`/`failed` con más de 30 días | 60 | no |
| `/api/cron/capture-ad-metrics` | `30 5 * * *` | Snapshot diario de anuncios de Zernio → `ad_metrics_daily` (el único histórico de Spend) | 60 | no |
| `/api/cron/daily-signals` | `20 7 * * *` | Clasifica mensajes nuevos de Discord y propone hitos desde Discord y desde llamadas de entrega | 600 | no |

Patrón de los crons con fan-out: `?organizationId=<uuid>` corre una sola org (test manual o retry); si `QSTASH_TOKEN` está configurado publica un job por org con `publishCronFanout` (2 reintentos); si no, corre en serie dentro del mismo `maxDuration`.

Endpoints que usan `assertCronAuthorized` pero **no están agendados**: `/api/integrations/fathom/reanalyze`, `/api/integrations/manychat/reanalyze` y `/api/rag/ingest`. Se disparan a mano:

```bash
curl -X POST "https://<app>/api/cron/sync-content-metrics?organizationId=<uuid>" \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Registro de corridas (SCRUM-85):** cada corrida autorizada de los 19 crons queda en `corridas_de_procesos` sin tocar las rutas: `conMonitorDeCron` envuelve el handler con `conRegistroDeCorrida` (`lib/observability/registro-de-corridas.ts`), que genera el `id` de la corrida, abre la fila en `en_curso`, corre el handler dentro de un `AsyncLocalStorage` (`lib/observability/corrida-en-curso.ts`) y la cierra con un upsert por ese `id` (una apertura que vence pero se escribe igual cae en la misma fila) como `fallo` (lanzó o 5xx, como el monitor de Sentry), `parcial` (alguna org falló), `encolado` (fan-out con todos los jobs publicados: no dice cómo terminaron los workers, que reportan a Sentry) u `ok`, con las orgs procesadas y fallidas, los jobs encolados y un mensaje saneado. Anotan orgs `reportarFalla` (con `organizationId`, como fallida), `publishCronFanout` (cada job encolado, o fallida si no se pudo publicar) y las syncs de GHL, Calendly, Fathom y métricas de contenido (la org que terminó bien); el resto deja las columnas de orgs en null. Cada escritura tiene 2 s de plazo y nunca rompe el cron; cada cierre borra las corridas de ese proceso con más de 30 días. Una fila en `en_curso` por más de 15 min es una corrida que se cortó. Lo lee Super-admin → Infraestructura. La tabla está pensada para el contrato común de ADR-015 (`correrPorOrganizacion()`, lock y una fila por org con `corrida_id`).

Lo que falta en los crons (detalle en `pendientes-infra`): no hay lock entre corridas ni patrón común de aislamiento por org (`[AUD-SALUD-3]`); `calendly-sync` y `calendly-sync-closers` corren a la misma hora y se pisan (`[AUD-CONF-3]`); `cleanup-trial-reels` reprocesa los mismos jobs todos los días (`[AUD-CONF-8]`); los dos crons de Instagram legacy siguen corriendo cada 5 min y cada hora con una sola integración en prod (`[AUD-SALUD-1]`).

## Webhooks entrantes

| Ruta | Proveedor | Verificación | Replay | Dedupe | Notas |
|---|---|---|---|---|---|
| `/api/webhooks/whop` | Whop | Standard Webhooks (`webhook-id.timestamp.body`, HMAC-SHA256 base64) con secreto por org en `payment_integrations` | ventana 5 min (`WEBHOOK_TOLERANCE_SECONDS`) | `payment_webhook_events (provider, external_event_id)` | `lib/payments/verify-signature.ts` |
| `/api/webhooks/fanbasis` | Commas (ex Fanbasis) | HMAC-SHA256 hex sobre el body crudo (`verifyHmacWebhook`) | **no** (el proveedor no manda timestamp) | ídem | Commas no reintenta |
| `/api/webhooks/ghl` | GoHighLevel | Ed25519 de plataforma (app del Marketplace) **o** secreto compartido por org (Workflow) | **no** | `ghl_webhook_events`, `ghl_stage_transitions (organization_id, external_event_id)` | `lib/ghl/verify-webhook.ts` |
| `/api/webhooks/mercadopago` | Mercado Pago | HMAC de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con `MERCADOPAGO_WEBHOOK_SECRET` + rate limit | **no** valida `ts`; la firma sólo cubre `data.id` | — | `lib/mercadopago/webhook-verify.ts` |
| `/api/webhooks/instagram/messages` | Meta (Instagram Graph) | `X-Hub-Signature-256` con `INSTAGRAM_APP_SECRET` sobre el raw body; `GET` de verificación con `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | — | — | legacy |
| `/api/webhooks/unipile` y `/api/integrations/unipile/webhook` | Unipile | Secreto compartido `UNIPILE_WEBHOOK_SECRET` (header `Unipile-Auth`/`x-unipile-secret`/`x-webhook-secret` o `?secret=`), **fail-closed 503** sin variable | — | — | Las dos rutas llaman a `handleUnipileIncomingWebhook`; legacy |
| `/api/integrations/unipile/callback` | Unipile (hosted auth) | `verifyUnipileSecret` | — | — | |
| `/api/integrations/zernio/webhook` | Zernio | HMAC sobre raw body (`x-zernio-signature`, `x-hub-signature-256` o `x-signature`) con `ZERNIO_WEBHOOK_SECRET`, **503 sin variable** | — | — | Escribe `zernio_messages`/`zernio_comments` |
| `/api/integrations/calendly/webhook` | Calendly | HMAC `t.body` con `webhook_signing_key` de la integración + rate limit (`lib/calendly/webhook-signature.ts`); la clave `NO_WEBHOOK_SIGNING_KEY` de las integraciones sin suscripción nunca vale | `t` a ±5 min del reloj | índice único en `closing_calls` | |
| `/api/integrations/fathom/webhook/[token]` | Fathom (por miembro) | token en la URL → un solo secreto; firma `webhook-id`/`webhook-timestamp`/`webhook-signature` (5 min) | crudo en `fathom_webhook_events`, dedup por `webhook-id` | 500 si no guarda la llamada (Fathom reintenta) | vía recomendada |
| `/api/integrations/fathom/webhook` | Fathom (legacy) | HMAC contra el `webhook_secret` de cada org (o `FATHOM_WEBHOOK_SECRET`) + rate limit; **409** si la firma valida para más de una org | — | — | |
| `/api/integrations/manychat/webhook/[token]` | ManyChat (External Request) | token de la URL contra `manychat_integrations.webhook_token` + rate limit | — | — | 404 si el token no existe |
| `/api/discord/{message,pending-link,testimonial}` | Bot propio | `Bearer` del secreto compartido, tiempo constante, fail-closed | — | — | `message` es un stub que responde `ok` |

Regla general de los webhooks nuevos (Whop, Commas, GHL): **se persiste el payload crudo antes de interpretarlo** y lo que no se entiende queda `unmapped` con motivo, nunca como cero.

## QStash (Upstash)

Cliente: `apps/web/lib/queue/qstash-client.ts`. Verificación: `lib/queue/qstash-verify.ts` y `lib/queue/verify-queue-request.ts`.

| Worker | Lo publica | Verificación | maxDuration |
|---|---|---|---|
| `/api/queue/process-rag-ingestion` | `lib/business-context/schedule-rag-indexing.ts` (3 reintentos; si falla, ingesta inline) | firma QStash | 300 |
| `/api/queue/process-fathom-analysis` | `lib/fathom/process-call.ts` (2 reintentos) | `verifyQueueRequest` | 300 |
| `/api/queue/process-sop-video` | `lib/sops/enqueue-video-job.ts` | `verifyQueueRequest` | 800 |
| `/api/queue/process-cron-{sync-metrics,intelligence-snapshot,executive-report,founder-tone}` | `publishCronFanout` desde los crons | `verifyQueueRequest` | 60–120 |
| `/api/queue/process-reel-variations` | `app/marketing/content/reel-variation-actions.ts` cuando falta `REEL_WORKER_URL` (fallback local del worker de Fly) | firma QStash | 300 |
| `/api/queue/publish-reel-variation` | reel-variation-actions, con `delay` por posición | `verifyQueueRequest` + `WORKER_AUTH_SECRET` | 60 |
| Fly.io `POST /` (`apps/reel-worker`) | reel-variation-actions con `REEL_WORKER_URL` | `WORKER_AUTH_SECRET` o firma QStash | — |
| `/api/queue/failure` | QStash, como `failureCallback` de todos los jobs, cuando agotan sus reintentos | firma QStash (`verifyQStashRequest`) | — |

`verifyQueueRequest`: si `WORKER_AUTH_SECRET` está configurado **acepta sólo ese secreto** (header `x-worker-secret`, `Authorization: Bearer` o `?workerSecret=`) y no mira la firma; si no, exige la firma QStash (`QSTASH_CURRENT_SIGNING_KEY` + `QSTASH_NEXT_SIGNING_KEY`; 503 sin las dos). En producción `WORKER_AUTH_SECRET` está seteado, así que los workers de cron se autentican por secreto compartido.

Riesgos abiertos: `verifyQStashRequest` no pasa `url` al `Receiver`, así que un cuerpo firmado para una ruta `/api/queue/*` sirve para otra (`[AUD-SEG-4]`); el secreto viaja en query string en la URL publicada a QStash y queda en sus logs (`[SEG-WORKER-SECRET-QUERY]`).

`packages/queue` (BullMQ + Redis) está reservado y vacío; no hay Redis en uso (la variable `REDIS_URL` que existe en Vercel no la lee nadie).

## Rate limiting

`apps/web/lib/rate-limit.ts`. Contador compartido en Postgres vía RPC `consume_rate_limit` (tabla `rate_limits`), para que valga entre lambdas. Sin Supabase configurado, contador en memoria. **Fail-open**: si la RPC falla, cae al contador en memoria de la instancia.

| Limitador | Ventana / máximo | Clave | Dónde |
|---|---|---|---|
| `limiteDeLogin` (`lib/auth/limite-login.ts`) | 15 min / 5 y 15 min / 30 | `signin:<ip>:<email>` y `signin-superadmin:<ip>:<email>` (5), `login-ip:<ip>` (30, compartido) | `app/auth/actions.ts` |
| `authRateLimit` | 15 min / 5 | `signup:<email>` | `app/auth/actions.ts` (alta de cuenta) |
| `aiRateLimit` | 1 min / 10 | usuario | agente (`app/agent/actions.ts`, `lib/agent/stream-agent-message.ts`) |
| `transcriptionRateLimit` | 1 min / 30 | usuario | `/api/agent/transcribe` |
| `sopGenerateRateLimit` | 1 h / 3 | org | generación de SOPs |
| `apiRateLimit` | 1 min / 60 | IP | `/api/utm/track`, `/api/utm/click` |
| `integrationRateLimit` | 1 min / 30 | usuario (`fathom-sync:<user>`) | sync manual de Fathom (`app/fathom/actions.ts`) |
| `publicFormRateLimit` | 10 min / 10 | IP (`getRequestIp`) | `/api/waitlist`, `/api/trial-confirm`, envío de `/onboarding-cliente` (`app/onboarding-cliente/actions.ts`) |
| `webhookRateLimit` | 1 min / 100 | IP | Fathom legacy, Calendly, Mercado Pago, ManyChat |
| `unipileWebhookRateLimit` | 1 min / 40 | | Unipile |

No hay límite para "conectar integración" a propósito (comentario en el archivo). El límite de login va por IP + email y por IP desde el 2026-09-30 (SCRUM-24): un tercero no bloquea a otro desde su IP y probar contra muchos emails desde la misma IP queda frenado; falta el captcha tras varios fallos (`[LOGIN-RATE-LIMIT]`).

## Instrumentación y Sentry

- `apps/web/instrumentation.ts` carga `sentry.server.config.ts` (Node) o `sentry.edge.config.ts` (Edge) y exporta `onRequestError = Sentry.captureRequestError` para errores no capturados de Server Components, route handlers y middleware. `sentry.client.config.ts` cubre el navegador.
- DSN: `SENTRY_DSN` o `NEXT_PUBLIC_SENTRY_DSN`. Habilitado sólo con `NODE_ENV=production` o `SENTRY_FORCE=true`. `sampleRate 1.0`, `tracesSampleRate 0.05`. `beforeSend` descarta errores "Rate limit exceeded". Las configs van sin el cuerpo del request (`maxIncomingRequestBodySize: "none"` y `requestDataIntegration` sin `data`, `cookies` ni `query_string`) y pasan todo evento y transacción por `limpiarEventoDeSentry` (`lib/observability/limpiar-evento-sentry.ts`): sin cuerpo, cookies ni query, headers por lista blanca, sin breadcrumbs de consola (SCRUM-501; detalle y qué estaba expuesto antes en `docs/operacion/alertas.md` § Qué datos no llegan a Sentry).
- Source maps: `withSentryConfig` en `next.config.ts` los sube sólo si hay `SENTRY_AUTH_TOKEN` (+ `SENTRY_ORG`, `SENTRY_PROJECT`). Las cuatro están en Vercel.
- `captureException` explícito en paths críticos (holding refresh, agente SSE).
- **Procesos de fondo (SCRUM-84):** `lib/observability/reportar-falla.ts` (`reportarFalla(error, { cron, organizationId, provider })`) manda el error a Sentry con los tags `proceso_de_fondo`, `cron`, `org_id` y `provider`. Lo usan los 8 workers de `/api/queue/*`, el error por org de GHL, Calendly (también el inesperado, desde SCRUM-85) y Fathom (sync), y el aviso de QStash. El resto de los catch internos siguen con `console.*`. Dentro de la corrida de un cron, además deja la org como fallida en el registro de corridas (SCRUM-85).
- **Server actions (SCRUM-497):** una excepción que una acción atrapa no pasa por `onRequestError`. `mutacionConErroresEsperables` (`lib/server/action-result.ts`) devuelve con su mensaje sólo un `ErrorEsperable` (`lib/server/error-esperable.ts`) y manda el resto a `registrarFallaDeAccion` (consola y `reportarFalla` con el tag `server_action`), con un texto fijo para el usuario. `runMutation` mantiene el mensaje de siempre y además registra y reporta lo que `esFallaParaReportar` clasifica como falla de infraestructura o bug. Es una heurística, no una garantía: reporta un error que no es `Error` o es de otra clase, uno con `code` de PostgREST (`PGRST*` salvo `PGRST116`) o de Postgres de las clases 08, 22, 23, 40, 42, 53, 54, 55, 57, 58 y XX, y uno con el texto típico de la red, Postgres, PostgREST, la RLS o un gateway. Un `Error` sin `code` con un texto que no está en la lista queda como `console.warn`, sin Sentry, aunque sea una falla real; un rechazo de negocio también, para no llenar Sentry de ruido.
- **Cron Monitors:** el `GET` de los 19 crons pasa por `conMonitorDeCron(path, handler)` (`lib/observability/cron-monitor.ts`). Manda un check-in `in_progress` y después `ok`, o `error` si el handler tira o responde 5xx. El horario sale de `vercel.json` (UTC, margen 5 min, máx. 15 min, issue a las 2 fallas seguidas) y el slug de la ruta (`/api/cron/ghl-sync` → `cron-ghl-sync`). Sólo cuenta las corridas autorizadas con `CRON_SECRET`. Un test exige que todo cron de `vercel.json` esté envuelto. El mismo wrapper registra la corrida en `corridas_de_procesos` (§ Crons).
- **Salud (SCRUM-85):** `GET /api/health` (público, `lib/observability/salud.ts`) responde `ok`/`degradado` (200) o `caido` (503) según la base, Storage y las variables críticas, con el commit desplegado. Lo consultan el monitor externo y el workflow `.github/workflows/produccion-al-dia.yml`, que avisa si producción no tiene el commit de `main` ([`operacion/alertas.md`](../operacion/alertas.md)).
- **Jobs que agotan reintentos:** cada `publishJSON` lleva `failureCallback` → `/api/queue/failure`, que verifica la firma de QStash, lee el worker, la org y el job (`lib/queue/failure-callback.ts`, sin el resto del cuerpo ni la query de la URL) y lo reporta a Sentry. Doc bajada en `docs/external-apis/qstash/`.
- `apps/discord-bot` (cada `logError`) y `apps/reel-worker` (excepciones del proceso y fallas de job) reportan a Sentry con `@sentry/node` si tienen `SENTRY_DSN`.
- Las reglas de alerta (mail) se configuran en Sentry: [`operacion/alertas.md`](../operacion/alertas.md).

## Archivos clave

- `apps/web/vercel.json`
- `apps/web/lib/integrations/cron-auth.ts`, `apps/web/lib/security/safe-equal.ts`
- `apps/web/lib/supabase/public-paths.ts`
- `apps/web/lib/queue/{qstash-client,qstash-verify,verify-queue-request}.ts`
- `apps/web/lib/payments/verify-signature.ts`, `apps/web/lib/ghl/verify-webhook.ts`, `apps/web/lib/mercadopago/webhook-verify.ts`, `apps/web/lib/instagram/verify-webhook-signature.ts`, `apps/web/lib/unipile/incoming-webhook.ts`, `apps/web/lib/discord/webhook-auth.ts`
- `apps/web/lib/rate-limit.ts`
- `apps/web/instrumentation.ts`, `apps/web/sentry.server.config.ts`
- `apps/web/lib/observability/{cron-monitor,registro-de-corridas,corrida-en-curso,salud,con-plazo}.ts`, `apps/web/app/api/health/route.ts`
- `.github/workflows/produccion-al-dia.yml`, `.github/scripts/verificar-produccion.sh`

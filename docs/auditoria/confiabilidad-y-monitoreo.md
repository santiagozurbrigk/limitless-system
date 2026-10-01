# Auditoría · Confiabilidad y monitoreo

> **Qué cubre:** para cada flujo que mueve plata o datos importantes (webhooks entrantes, los 19 crons, las colas de
> QStash, las llamadas a IA, las integraciones salientes y las operaciones críticas de la UI), tres preguntas:
> **¿qué pasa si falla?**, **¿cómo nos enteramos?**, **¿cómo se recupera?** Más un inventario de la observabilidad real.
>
> **Fecha:** 2026-09-23 · **Código auditado:** `038caca` (`main`).
>
> **Método:** lectura del código de cada handler (`apps/web/app/api/**`, `apps/web/lib/**`, `apps/discord-bot`,
> `apps/reel-worker`); `apps/web/vercel.json`; migraciones. En producción, **sólo estructura y agregados**: nombres de
> tablas y extensiones de Supabase (`information_schema`, `pg_extension`), **nombres** de las variables de entorno del
> proyecto `otc-plaform` en Vercel (sin valores) y el agregado de errores de runtime de Vercel
> (`get_runtime_errors`, ventana de 7 días; cada grupo trae su primera y última aparición). No se leyeron filas de
> tablas con datos de clientes.
>
> **Qué no se pudo verificar:** el dashboard de Sentry (si llegan eventos, qué reglas de alerta hay, si hay alguien
> suscripto); la consola de Upstash/QStash (dead letter queue, mensajes fallidos); el comportamiento de reintento de
> cada proveedor ante 4xx/5xx cuando no está en `docs/external-apis/` (Calendly, Fathom, Zernio, Discord); Railway
> (bot) y Fly.io (reel-worker): logs y política de reinicio; si `sentry.client.config.ts` se carga con
> `@sentry/nextjs` 10.70 (el SDK recomienda `instrumentation-client.ts`). Qué org o llamada está detrás de cada error
> de runtime (identificarlo exige leer filas).

## Resumen

- **El sistema guarda bien, pero avisa mal.** Los webhooks de plata (Whop, Commas) y GHL guardan el payload crudo antes
  de interpretarlo y deduplican por id de evento. Lo que falla es el camino de error: si no se pudo guardar, igual
  responden "OK" y el proveedor no reintenta (ya registrado en `[EMBUDOS-WEBHOOK-PERDIDA]`). **Resuelto el 2026-09-30 (SCRUM-6).**
- **Nadie se entera de nada.** No hay alertas. Sentry está configurado y tiene DSN en producción, pero sólo recibe lo
  que "explota": casi todos los crons, colas y webhooks atrapan el error y lo escriben en el log de Vercel. No hay
  tabla de corridas de crons. Hoy mismo el agregado de errores de Vercel muestra fallas repetidas durante semanas que
  no figuraban en ningún pendiente: 168 fallas de GHL por token inválido de una org, ~3.000 fallas de análisis de
  llamadas de Fathom por clave de IA inválida (≈10 llamadas reintentadas ~296 veces cada una), 849 rechazos por
  límite de pedidos de Zernio y 99 crons cortados por el tope de 60 segundos.
- **Hay pérdidas silenciosas de datos** que no dependen de un proveedor caído: la sync de Fathom adelanta su marca
  aunque alguna llamada no se haya guardado (esa llamada no vuelve a pedirse nunca), y los crons que recorren las orgs
  en serie se cortan a los 60 s y dejan sin sincronizar a las últimas.
- **Lo que sí funciona bien:** la cola de Fathom (toma atómica y rescate de llamadas trabadas), el fan-out por org de
  los crons de IA con QStash, el reporte ejecutivo que responde 500 para que QStash reintente, el aislamiento por org
  de Typeform y Google Forms, y la verificación de firmas de todos los webhooks.
- **Hallazgos:** 12 (ninguno crítico nuevo; 4 altos, 6 medios, 2 bajos). 11 son ítems nuevos y 1 amplía un ítem
  existente; además se proponen 5 ampliaciones de ítems existentes con evidencia nueva.

## 1. Webhooks entrantes

"Crudo antes" = se persiste el payload tal como llegó antes de interpretarlo. "Respuesta ante falla" = qué código
recibe el proveedor si falla el guardado o el procesamiento (un 2xx hace que el proveedor **no** reintente).

| Flujo | Crudo antes | Respuesta ante falla | Dedupe | Reproceso | Cómo nos enteramos | Veredicto | ID |
|---|---|---|---|---|---|---|---|
| Whop `/api/webhooks/whop` | sí, `payment_webhook_events` (`lib/payments/ingest.ts:33-43`) | **200** aunque falle el insert del crudo o el upsert (`route.ts:75`) | `(provider, external_event_id)`, índice parcial `WHERE external_event_id IS NOT NULL` | no hay herramienta | `console.error` en Vercel | **Falla** **Resuelto el 2026-09-30 (SCRUM-6).** | `[EMBUDOS-WEBHOOK-PERDIDA]`, `[AUD-CONF-5]` |
| Commas `/api/webhooks/fanbasis` | sí, ídem | **200** (`route.ts:71`); Commas no reintenta nunca | ídem | no | log | **Falla** **Resuelto el 2026-09-30 (SCRUM-6).** | ídem |
| GoHighLevel `/api/webhooks/ghl` | sí, `ghl_webhook_events` (sólo eventos `Opportunity*`) | **200** (`route.ts:113`) | `external_event_id` global (sin org) | no | log | **Falla** **Resuelto el 2026-09-30 (SCRUM-6).** | `[EMBUDOS-WEBHOOK-PERDIDA]`, `[EMBUDOS-GHL-WEBHOOK-HARDENING]` |
| Calendly `/api/integrations/calendly/webhook` | **no** | 500 ante excepción (`route.ts:187-191`) → Calendly reintenta (no verificado en doc) | índice único en `closing_calls.calendly_event_id` | el cron `calendly-sync` barre 120 días cada hora | **nada**: el `catch` no loguea, sólo devuelve `e.message` | Revisar | `[CALENDLY-WEBHOOK-REPLAY]`, `[ERRORES-INTERNOS-AL-CLIENTE]`, nuevo `[WEBHOOK-FECHAS-INVENTADAS]` |
| Mercado Pago `/api/webhooks/mercadopago` | no (no persiste el pago) | 200 | — | — | — | Revisar (sin uso) | `[FIN-MP-WEBHOOK]`, `[FIN-STRIPE-MP-DECIDIR]` |
| Fathom org (legacy) `/api/integrations/fathom/webhook` | no (upsert directo a `fathom_calls`) | 500 si falla el upsert (lanza, `lib/fathom/process-call.ts:577-586`); 503 si no puede leer integraciones | `(organization_id, fathom_call_id)` — pero la reentrega **resetea** estado y análisis | cron `fathom/sync` cada hora | log | Revisar | nuevo `[WEBHOOK-FECHAS-INVENTADAS]` |
| Fathom por miembro `/fathom/webhook/[token]` | intenta guardar `raw_payload` en una columna que no existe | 500 siempre | ídem | botón "Sincronizar mis llamadas" | `last_error` en la fila sólo para firma inválida | **Falla** | `[FATHOM-WEBHOOK-MIEMBRO-ROTO]` |
| Zernio `/api/integrations/zernio/webhook` | no | 503 en prod (falta el secreto); los `upsert` no miran `error` y responden 200 | upsert por id de mensaje/comentario | no hace falta: las pantallas leen en vivo | log | Revisar | `[ENV-ZERNIO-WEBHOOK-SECRET]`, `[ZERNIO-WEBHOOK-SIN-EVENTOS]`, `[ZERNIO-WEBHOOK-DISCONNECTED]` |
| Stripe | **no existe** webhook (sólo OAuth `/api/integrations/stripe/callback`) | — | — | — | — | N/A | `[FIN-STRIPE-MP-DECIDIR]` |
| Discord (gateway → bot en Railway) | el bot escribe directo en `discord_messages` | error de guardado sólo `console.error` (`apps/discord-bot/src/lib/supabase.ts:168-172`); si el bot está caído, **Discord no reenvía** | upsert por `discord_message_id` | **no hay backfill** del historial al reiniciar | logs de Railway, sin Sentry | **Falla** | nuevo `[DISCORD-BOT-SIN-RECUPERACION]` |
| Discord endpoints `/api/discord/*` | no | `pending-link` no mira el `error` del upsert; `message` es stub | — | — | — | Revisar | `[DISCORD-STUB-MESSAGE]` |
| Instagram Graph / Unipile / ManyChat (legacy) | ManyChat sí (`manychat_events`); Instagram y Unipile no | 500 ante excepción | — | — | log | Revisar (legacy) | `[LEGACY-INBOX-BORRAR]`, `[AUD-CONF-7]`, `[AUD-CONF-9]` |

Notas:
- El índice de dedupe de pagos es **parcial** (`20260829200000_payments_whop_fanbasis.sql:114-116`): un evento cuyo
  cuerpo no trae `id`/`event_id`/`eventId` no se deduplica. La doble carga de plata la frena igual el upsert por
  `(organization_id, provider, external_id)` de `payment_orders`/`payment_transactions`, si el objeto trae id.
- Un evento de pago o GHL cuyo lambda muere entre el insert del crudo y el `finish()` queda en `status = 'pending'`
  para siempre (default de la columna) y el reintento del proveedor vuelve `duplicate`. Se propone sumarlo a
  `[AUD-CONF-5]`.

## 2. Crons (`apps/web/vercel.json`, 19)

"Fan-out" = cómo recorre las orgs. "Si falla a mitad" = qué pasa con las orgs siguientes. "Registro" = dónde queda
la falla. Ninguno tiene lock (`[AUD-SALUD-3]`) ni fila en una tabla de corridas (no existe; verificado en
`information_schema`).

| Cron | Fan-out | Si falla una org / a mitad | Respuesta | Registro | Recupera en el siguiente run | Veredicto | ID |
|---|---|---|---|---|---|---|---|
| `fathom/process` (10 min) | serie, 50 llamadas, presupuesto 20 s | la llamada queda `processing`; se rescata a los 15 min y se reintenta **sin tope** durante 7 días; después queda `processing` para siempre | 200 | `console.error` por llamada | sí, pero reintenta errores permanentes ~cada 20-30 min | Revisar | nuevo `[FATHOM-REINTENTOS-SIN-TOPE]` |
| `fathom/sync` (hora) | serie por org, aislado | una llamada que falla al guardarse **se saltea para siempre**: el cursor avanza igual | 200 siempre | log | **no** para esa llamada | **Falla** | nuevo `[FATHOM-SYNC-CURSOR]` |
| `typeform/sync` (hora) | serie, aislado por org | sigue con la siguiente | 200 | log | sí (salvo `[AUD-CONF-4]`) | Revisar | `[AUD-CONF-4]`, `[AUDITORIA-ABIERTOS §6]` |
| `google-forms/sync` (hora) | serie, aislado (`lib/google-forms/sync.ts:281-291`) | sigue; pero **timeouts de 60 s** en prod | 200 con `orgErrors` | log | sólo las orgs que llegan antes del corte | Revisar | nuevo `[CRONS-CORTE-60S]` |
| `calendly-sync` (hora) | serie sin orden (`lib/calendly/sync-pipeline.ts:186`) | sigue; timeouts en prod | 500 ante excepción (bien) | log | ventana de 120 días lo cubre si la org llega a correr | Revisar | `[AUD-CONF-3]`, `[CALENDLY-CRONS-SUPERPUESTOS]`, nuevo `[CRONS-CORTE-60S]` |
| `calendly-sync-closers` (hora) | serie | — | **200 `ok: true` con ceros ante excepción** (`route.ts:35-37`) | log | sí | **Falla** (enmascara) | ampliar `[EMBUDOS-CRON-ERRORES]` |
| `ghl-sync` (hora) | `Promise.all` de todas las orgs (`lib/ghl/sync-pipeline.ts:118`) | la org devuelve ceros; un timeout corta todas | 200 con ceros | log (`[ghl-sync] Error org=…`: 168 veces token inválido de una org) | ventana fija sí; token muerto nunca | **Falla** | `[EMBUDOS-CRON-ERRORES]`, nuevo `[INTEGRACIONES-ERROR-SIN-MARCA]`, nuevo `[CRONS-CORTE-60S]` |
| `instagram/sync`, `instagram/poll` | serie | `.catch` por org | 200 | log | ver `[AUD-CONF-9]` | Revisar (legacy) | `[AUD-SALUD-1]`, `[AUD-CONF-9]` |
| `mercadopago-token-refresh` (diario) | serie, aislado | la org no se marca | 200 con `failed` | log | reintenta mañana | Revisar (sin uso) | `[FIN-STRIPE-MP-DECIDIR]` |
| `intelligence-snapshot` (2×día) | QStash por org, 2 reintentos | worker responde **200** con `failed` | — | log | no reintenta | **Falla** | `[INTELIGENCIA-SIN-REINTENTO]`, `[CRONS-ORGS-INACTIVAS]` |
| `founder-tone-analysis` (lunes) | ídem | ídem | — | log | no | **Falla** | ídem |
| `executive-report-{daily,weekly,monthly}` | QStash por org | worker responde **500** con `failed` → QStash reintenta | — | log | sí, pero puede duplicar | OK con reparo | `[REPORTES-DUPLICADOS]` |
| `sync-content-metrics` (diario) | QStash por org | 50 pedidos en paralelo a Zernio → **429** masivo (849 en 7 días) | 200 con `failed` | `console.warn` | las piezas viejas se reintentan mañana, y vuelven a chocar | Revisar | nuevo `[ZERNIO-METRICAS-429]` |
| `cleanup-trial-reels` (diario) | serie | — | 200 con `errors` | log | reprocesa siempre lo mismo | Revisar | `[AUD-CONF-8]` |
| `capture-ad-metrics` (diario) | serie por org | la org va a `errors` con 200 | 200 | log | **no solo**: el día perdido se rellena a mano con `?date=` (si Zernio aún lo devuelve), y nadie sabe que se perdió | Revisar | `[EMBUDOS-CRON-ERRORES]`, nuevo `[OBS-SIN-ALERTAS]` |
| `daily-signals` (diario, 600 s) | serie; cada paso aislado con `step()` | sigue | 200; los errores de cada paso van **sólo en el cuerpo de la respuesta**, no al log (`route.ts:70-77`) | ninguno | depende del paso | Revisar | ampliar `[EMBUDOS-CRON-ERRORES]` |

Crons superpuestos: no hay lock. Los de 1 hora con `maxDuration 60` no se pisan consigo mismos; sí entre sí
(`calendly-sync` / `calendly-sync-closers`, ya en `[AUD-CONF-3]`). `publishCronFanout` no usa `deduplicationId`: una
corrida duplicada (disparo manual + cron) publica dos jobs por org y, en reportes y snapshots, duplica filas
(`[REPORTES-DUPLICADOS]`).

## 3. Colas (QStash) y procesos largos

| Worker | Reintentos | Si falla | Trabado | Recuperación | Veredicto | ID |
|---|---|---|---|---|---|---|
| `process-rag-ingestion` | 3 | responde 200 con `error` → no reintenta | — | ninguna | **Falla** | `[RAG-INGESTA-SIN-REINTENTO]` |
| `process-fathom-analysis` | 2 | 500 → reintenta | — | si QStash no publica, corre inline con `void` (`lib/fathom/process-call.ts:503-511`) | Revisar | `[AUD-CONF-6]` (ampliar) |
| `process-cron-*` | 2 | ver §2 | — | — | ver §2 | — |
| `process-sop-video` (800 s) | 1 | marca `failed` y responde 200; el botón "Reintentar" existe **sólo** para `failed` (`components/sops/sop-video-creator.tsx:275`) | si el lambda muere por tiempo o memoria, queda en `transcribing`/`generating` para siempre, con spinner | ninguna | **Falla** | nuevo `[JOBS-TRABADOS-SIN-SALIDA]`, `[OPS-SOP-VIDEO-MEMORIA]` |
| reel-worker (Fly) / `process-reel-variations` | QStash (fallback) | marca `failed` y responde 200 | si el proceso muere a mitad, el job queda `processing` y cualquier reintento lo saltea (`apps/reel-worker/src/processor.ts:176`) | ninguna | **Falla** | nuevo `[JOBS-TRABADOS-SIN-SALIDA]`, `[TRIAL-RETRY-GENERACION]` |
| `publish-reel-variation` | QStash con `delay` | variación `failed` + mail de resumen | — | botón reintentar (sólo sirve si hay archivo) | Revisar | `[TRIAL-RETRY-GENERACION]` |

Dead letter: QStash manda a su DLQ los mensajes que agotan los reintentos, pero **no hay `failureCallback`** en ningún
`publishJSON` (`lib/queue/qstash-client.ts`) y nadie revisa la DLQ. No hay jobs de BullMQ/Redis (`packages/queue`
vacío).

## 4. Llamadas a IA

| Tema | Estado | Veredicto | ID |
|---|---|---|---|
| Reintentos | SDK de Anthropic y OpenAI con sus defaults (2 reintentos con backoff, timeout 10 min — mayor que casi todos los `maxDuration`, así que manda el corte de Vercel). No hay `maxRetries`/`timeout` propios. | OK con reparo | `[AUD-CONF-1]` |
| Fallback BYOK → global | `executeWithCredentialFallback` reintenta con la global ante 401/403 y marca la clave de la org; el agente SSE no lo usa; una clave sin créditos no cae | Revisar | `[AGENTE-SIN-FALLBACK-CLAVE]`, `[IA-CLAVE-SIN-CREDITOS]`, `[IA-CLAVES-INVALIDAS]` |
| Clave global | `ANTHROPIC_API_KEY` **no está** en las variables del proyecto (confirmado hoy); puede ser Shared del team | Revisar | `[ENV-ANTHROPIC-VERCEL]`, `[1A1-CLAVE-ANTHROPIC-ROTA]` |
| Evidencia en prod | ~10 llamadas de Fathom fallaron con `401 authentication_error` ~296 veces cada una entre 2026-09-02 y 2026-09-21 (`/api/integrations/fathom/process`) | **Falla** | ampliar `[1A1-CLAVE-ANTHROPIC-ROTA]`, nuevo `[FATHOM-REINTENTOS-SIN-TOPE]` |
| Respuesta con formato inválido | snapshot de inteligencia falla con "Respuesta de IA con formato inválido" (5 + 3 + 2 casos en prod) y no se reintenta | Revisar | ampliar `[INTELIGENCIA-SIN-REINTENTO]` |
| Qué ve el usuario | `mapAnthropicCallError` traduce a mensajes en castellano en el agente; en los jobs de fondo el usuario no ve nada (el reporte o el análisis simplemente no aparece) | Revisar | `[OBS-SIN-ALERTAS]` |
| Costos | `token_usage` se escribe en 3 lugares; subestima | Revisar | `[IA-COSTOS-INCOMPLETOS]` |
| Compaction del agente | sin try/catch | Revisar | `[AGENTE-COMPACTION-FRAGIL]` |

## 5. Integraciones salientes

| Tema | Estado | Veredicto | ID |
|---|---|---|---|
| Timeouts | ningún `AbortSignal.timeout` en Zernio, GHL, Hyros, VTurb, WebinarJam, Calendly, Typeform, Fathom (salvo `share-link`) | **Falla** | `[AUD-CONF-1]`, `[API-TIMEOUTS]`, `[EMBUDOS-TIMEOUTS]`, `[AUDITORIA §3 confiabilidad 1]` |
| Rate limits del proveedor | Fathom traduce el 429 a un mensaje; Hyros lee `Retry-After` pero no espera; **Zernio no tiene control** y el cron de métricas choca todos los días | Revisar | nuevo `[ZERNIO-METRICAS-429]` |
| Tokens vencidos | Calendly refresca al usar (`lib/calendly/oauth-token.ts:110-131`); Mercado Pago por cron; GHL usa token privado (no se refresca). **Ninguno marca la integración como rota** cuando el proveedor la rechaza: sólo VTurb, Hyros, WebinarJam y Fathom por miembro guardan `last_error`, que es lo que muestra el tablero de Integraciones (`lib/integrations/health.ts` `lastErrorIssue`) | **Falla** | nuevo `[INTEGRACIONES-ERROR-SIN-MARCA]` |
| Desconexión | Zernio ignora `account.disconnected`; Mercado Pago sí maneja `deauthorized` | Revisar | `[ZERNIO-WEBHOOK-DISCONNECTED]` |

## 6. Observabilidad: qué existe y qué falta

**Existe**

| Pieza | Detalle | Evidencia |
|---|---|---|
| Sentry servidor y edge | `instrumentation.ts` carga `sentry.server.config.ts` / `sentry.edge.config.ts`; `onRequestError = Sentry.captureRequestError`; habilitado en `NODE_ENV=production`; `sampleRate 1.0`, `tracesSampleRate 0.05`; `beforeSend` descarta "Rate limit exceeded" y borra cookies | `apps/web/instrumentation.ts`, `sentry.server.config.ts` |
| Sentry navegador | `sentry.client.config.ts` con `NEXT_PUBLIC_SENTRY_DSN`, sin breadcrumbs de consola | `apps/web/sentry.client.config.ts` |
| DSN y source maps | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` presentes en Production y Preview | listado de env de Vercel (sólo nombres) |
| `captureException` explícito | sólo 2 lugares: `app/api/agent/send/route.ts` y `lib/holding/refresh-auth-session.ts` | grep |
| Logs | `console.*` con prefijo por módulo (`[Fathom:sync]`, `[ghl-sync]`…): ~514 llamadas en 181 archivos. Retención y búsqueda: las de Vercel | grep |
| Registros en base | `payment_webhook_events`, `ghl_webhook_events`, `manychat_events` (crudos), `token_usage` (costos IA), `super_admin_deletions` (bajas), `rate_limits`, `reel_variation_jobs`, `sop_generation_jobs`, `last_error` en integraciones de VTurb/Hyros/WebinarJam y `team_member_integrations` | `information_schema` de prod |
| Estado de integraciones | tablero de Integraciones con contrato único (`lib/integrations/health.ts`) | código |
| Worker de reels | `GET /` de salud en Fly (`apps/reel-worker/src/index.ts:37`) | código |

**Falta**

| Qué | Consecuencia | ID |
|---|---|---|
| Alertas de cualquier tipo (Sentry, mail, Slack) | un error repetido durante semanas no lo ve nadie (ver §1 del resumen) | nuevo `[OBS-SIN-ALERTAS]` |
| Errores atrapados hacia Sentry | crons, workers y webhooks atrapan el error y lo loguean; Sentry sólo ve lo que no se atrapó. Los timeouts de Vercel (el proceso muere) tampoco llegan | `[OBS-SIN-ALERTAS]` |
| Contexto en Sentry | sin `org_id` ni usuario como tag: no se puede filtrar por cliente | `[OBS-SIN-ALERTAS]` |
| Monitor de crons | ni Sentry Cron Monitors ni tabla `cron_runs`; Vercel sólo muestra el status de cada invocación y varios crons responden 200 con errores adentro | `[OBS-SIN-ALERTAS]`, `[EMBUDOS-CRON-ERRORES]` |
| Revisión de la DLQ de QStash / `failureCallback` | un job que agota reintentos desaparece | `[OBS-SIN-ALERTAS]` |
| Formato de logs | sin `request_id`; `org_id` a veces en el texto, a veces en un objeto, a veces ausente; mensajes informativos con `console.error` (`[RAG] ingestDocument start`, `lib/rag/ingest.ts:75`) que ensucian el agregado de errores | nuevo `[LOGS-SIN-CONTEXTO]` |
| Sentry en bot de Discord y reel-worker | errores sólo en logs de Railway y Fly | `[OBS-SIN-ALERTAS]` |
| Auditoría de acciones de usuario | salvo bajas del super admin, no hay registro de quién registró/borró un pago, cerró una venta o cambió un rol | (fuera de alcance; se menciona) |

## 7. Concurrencia e idempotencia en operaciones críticas

| Operación | Estado | Veredicto | ID |
|---|---|---|---|
| Cerrar venta | 5 escrituras desde el navegador, sin transacción | **Falla** | `[CLOSING-CIERRE-ATOMICO]` |
| Registrar pago | el botón se deshabilita mientras corre (`client-payments-section.tsx:405`), pero el servidor no tiene clave de idempotencia ni índice único: un reintento tras un corte de red duplica el cobro. La marca de cuota paga es leer-modificar-escribir sobre `clients.installments` y **no mira el error** (`app/sales/payment-actions.ts:259-263`) | Revisar | nuevo `[PAGO-SIN-IDEMPOTENCIA]` |
| Dos webhooks iguales | pagos y GHL: dedupe por id (con el hueco de `pending`/`error`); Calendly: índice único; Fathom org: la reentrega pisa el estado | Revisar | `[AUD-CONF-5]`, `[WEBHOOK-FECHAS-INVENTADAS]` |
| Crons superpuestos | sin lock; Fathom se protege con toma atómica | Revisar | `[AUD-SALUD-3]`, `[AUD-CONF-3]` |
| Refresh de token de Calendly | si el refresh sale bien y falla el `update`, el refresh token nuevo se pierde (Calendly rota el refresh token: **a confirmar** en su doc, no está bajada) | Revisar | se menciona en `[INTEGRACIONES-ERROR-SIN-MARCA]` |

## 8. Hallazgos

### H1 · No hay ninguna alerta y Sentry casi no recibe nada — Alta · nuevo `[OBS-SIN-ALERTAS]`
- **Hecho:** `captureException` aparece sólo en `app/api/agent/send/route.ts` y `lib/holding/refresh-auth-session.ts`;
  el resto de crons, workers y webhooks atrapa el error y hace `console.*`. No hay tabla de corridas (prod:
  `information_schema` sin `cron_runs` ni similar). `publishCronFanout` no pasa `failureCallback`. El agregado de
  errores de Vercel (7 días) muestra fallas repetidas que no estaban en ningún pendiente: 168 × `Invalid Private
  Integration token` (GHL, una org, desde 2026-09-03), ~3.000 × `401 authentication_error` de Anthropic en
  `fathom/process` (2026-09-02 → 09-21), 849 × 429 de Zernio, 99 × `Task timed out after 60 seconds`.
- **Observación:** la información existe (logs de Vercel), pero nadie la mira y no dispara nada.
- **Riesgo:** si un proceso de fondo falla de forma persistente (token vencido, clave de IA, proveedor caído),
  entonces se entera el cliente cuando nota datos faltantes, días o semanas después. Pasa hoy.
- **Recomendación:** (1) helper común de crons/workers (`[AUD-SALUD-3]`) que llame a `Sentry.captureException` con
  tags `org_id`, `cron`, `provider`; (2) Sentry Cron Monitors (`Sentry.withMonitor`) en los 19 crons, que alerta si
  uno no corre o falla; (3) reglas de alerta en Sentry a mail/Slack; (4) `failureCallback` en QStash hacia un
  endpoint que registre y alerte; (5) Sentry en el bot y el reel-worker.

### H2 · Las integraciones rotas siguen figurando como conectadas — Alta · nuevo `[INTEGRACIONES-ERROR-SIN-MARCA]`
- **Hecho:** `syncGHLOrganizationSafe` (`lib/ghl/sync-pipeline.ts:28-…`) atrapa el 401 y devuelve ceros, sin tocar
  la integración. Lo mismo Calendly (org y closer), Fathom org, Typeform y Zernio. Sólo VTurb, Hyros, WebinarJam y
  Fathom por miembro guardan `last_error`, que es lo único que el tablero convierte en estado `error`
  (`lib/integrations/health.ts`, `lastErrorIssue`). En prod, la org `46cce98c-…` falló 168 veces con token de GHL
  inválido entre 2026-09-03 y 2026-09-23.
- **Riesgo:** si el cliente revoca o vence un token, entonces la sync falla cada hora para siempre y el tablero sigue
  en verde. Pasa hoy.
- **Recomendación:** guardar `last_error`/`last_error_at` (y limpiar al primer éxito) en todas las integraciones con
  sync de fondo, y que el tablero y el aviso del founder lo muestren.

### H3 · La sync de Fathom saltea para siempre una llamada que no se pudo guardar — Alta · nuevo `[FATHOM-SYNC-CURSOR]`
- **Hecho:** `syncFathomMeetingsForOrganization` recorre las reuniones y cuenta las que se guardaron
  (`lib/fathom/sync.ts:268`); si guardó al menos una, pone `last_sync_at = now()` (`:274-277`) aunque otras hayan
  fallado (`upsertFathomCallFromMeeting` devuelve `false`). La próxima corrida pide `created_after = last_sync_at`
  (`lib/fathom/sync-window.ts:50-58`). El webhook por miembro está roto (`[FATHOM-WEBHOOK-MIEMBRO-ROTO]`), así que esta
  sync es la única vía automática.
- **Riesgo:** si falla el guardado de una llamada (error transitorio de base, dato inesperado) y otra de la misma
  corrida entra bien, entonces la que falló no se vuelve a pedir nunca. Además, el cursor es la hora del servidor y no
  el `created_at` más nuevo recibido: una reunión creada mientras la sync corre también queda afuera (depende de la
  semántica de `created_at` de Fathom, no verificada).
- **Recomendación:** avanzar el cursor al `created_at` máximo **de las guardadas bien** y, si alguna falló, no pasar de
  la más vieja fallida; con un solape de unos minutos (el upsert ya deduplica).

### H4 · Los crons en serie se cortan a los 60 s y dejan orgs sin sincronizar — Media · nuevo `[CRONS-CORTE-60S]`
- **Hecho:** 99 × `Vercel Runtime Timeout Error: Task timed out after 60 seconds` en `/api/cron/ghl-sync`,
  `/api/integrations/google-forms/sync` y `/api/cron/calendly-sync`. Calendly y Google Forms recorren las orgs en serie
  y sin orden explícito (`lib/calendly/sync-pipeline.ts:186`, `lib/google-forms/sync.ts:281`); GHL las corre todas en
  paralelo en un solo `Promise.all` (`lib/ghl/sync-pipeline.ts:118`). Un timeout mata el proceso: no hay respuesta,
  no hay log de qué quedó sin hacer.
- **Riesgo:** si la suma de orgs pasa los 60 s, entonces las últimas de la lista quedan sin sincronizar en cada
  corrida, siempre las mismas. Turnos y respuestas de formularios que no llegan.
- **Recomendación:** pasar estos tres al fan-out por QStash que ya usan los crons de IA, o ordenar por
  `last_sync_at` ascendente con un presupuesto de tiempo (como `fathom/process`). Encaja en `[AUD-SALUD-3]`.

### H5 · Las llamadas de Fathom que fallan se reintentan sin tope y después quedan colgadas — Media · nuevo `[FATHOM-REINTENTOS-SIN-TOPE]`
- **Hecho:** si `processSingleFathomCall` lanza, la llamada queda `processing` (`lib/fathom/process-call.ts:112-114`);
  `reclaimStuckFathomCalls` la devuelve a `pending` a los 15 min y la reintenta hasta 7 días
  (`lib/fathom/reclaim-stuck.ts:28,36`); después la deja `processing` para siempre. No hay contador de intentos ni
  estado `failed`. En prod, ~10 llamadas fallaron ~296 veces cada una con 401 de Anthropic.
- **Riesgo:** un error permanente (clave inválida, transcript que rompe el prompt) consume la cola y cuota cada 10
  min durante una semana, y al final la llamada queda invisible, sin análisis y sin aviso.
- **Recomendación:** columna `attempts`; después de N (p. ej. 5) pasar a `failed` con `error_message`, mostrarlo en
  Llamadas y permitir reintentar a mano; distinguir errores permanentes (401/400) de transitorios (429/5xx).

### H6 · El cron de métricas choca con el límite de Zernio todos los días — Media · nuevo `[ZERNIO-METRICAS-429]`
- **Hecho:** `syncContentMetricsForOrg` lanza hasta 50 `getPostAnalytics` en paralelo
  (`lib/marketing/sync-content-metrics.ts:8,56-77`). Zernio responde 429 con `limit: 6` y `retryAfterSeconds: 1`;
  849 rechazos en `/api/queue/process-cron-sync-metrics` en 7 días. `zernioFetchJson` no reintenta.
- **Riesgo:** las métricas de gran parte de las piezas no se actualizan; como el orden es "más viejas primero", las
  mismas vuelven a chocar al día siguiente. Datos de contenido desactualizados en Marketing.
- **Recomendación:** limitar la concurrencia (p. ej. 4 a la vez) y respetar `retryAfterSeconds` con uno o dos
  reintentos en `zernioFetchJson` para 429.

### H7 · Jobs largos que quedan "procesando" para siempre — Media · nuevo `[JOBS-TRABADOS-SIN-SALIDA]`
- **Hecho:** SOP desde video: un corte por tiempo o memoria deja `sop_generation_jobs.status` en
  `transcribing`/`generating`; el botón de reintentar sólo aparece con `failed`
  (`components/sops/sop-video-creator.tsx:275`). Reels: si el worker de Fly muere a mitad, el job queda `processing`
  y cualquier reentrega lo saltea (`apps/reel-worker/src/processor.ts:176`). Ninguno tiene rescate como Fathom.
- **Riesgo:** el usuario ve un spinner eterno y no puede reintentar; el video o los reels no salen.
- **Recomendación:** `processing_started_at` + rescate por antigüedad (reusar la idea de `lib/fathom/reclaim-stuck.ts`)
  y permitir reintentar un job trabado más de X minutos.

### H8 · Registrar un pago no es idempotente — Media · nuevo `[PAGO-SIN-IDEMPOTENCIA]`
- **Hecho:** `recordClientPaymentAction` hace `insert` en `client_payments` sin clave de idempotencia ni índice único
  (`app/sales/payment-actions.ts:221-237`; migración `20260715100000_client_payments.sql` sólo índices no únicos). La
  cuota se marca con leer-modificar-escribir de `clients.installments` sin mirar el `error` del `update` (`:259-263`).
- **Riesgo:** si la respuesta se pierde (red, timeout) y el usuario vuelve a registrar, queda el cobro duplicado; si
  falla el update, el pago existe pero la cuota figura impaga. Dos pagos simultáneos del mismo cliente pueden pisarse
  la lista de cuotas.
- **Recomendación:** clave de idempotencia generada en el cliente (columna con índice único) y marca de cuota en SQL
  (RPC o update con `jsonb_set`), mirando el error. Coordinar con `[CLOSING-CIERRE-ATOMICO]`.

### H9 · Webhooks que inventan la fecha y reentrega que pisa el análisis — Baja · nuevo `[WEBHOOK-FECHAS-INVENTADAS]`
- **Hecho:** el webhook de Fathom (org) guarda `call_date = now()` si no viene `recorded_at`
  (`lib/fathom/process-call.ts:554`) y, como hace `upsert` con `status: "pending"`, `association_candidates: []` y
  `ai_next_steps: []` (`:546-561`), una reentrega del mismo evento vuelve a poner la llamada en cola y borra esos
  campos. El de Calendly usa `new Date()` si no encuentra `start_time` (`calendly/webhook/route.ts:162`). Además su
  `catch` no loguea nada (`:187-191`).
- **Riesgo:** llamadas o turnos con fecha falsa (afecta métricas por período) y reprocesos de IA pagados de nuevo.
  Contra la regla de CLAUDE.md §3 ("nunca inventes un valor").
- **Recomendación:** dejar la fecha en `null` (o rechazar con 4xx y que la sync lo traiga); en Fathom, si la fila
  existe, actualizar sólo los campos que vienen del proveedor; loguear el error en Calendly.

### H10 · Logs sin contexto y con niveles mezclados — Baja · nuevo `[LOGS-SIN-CONTEXTO]`
- **Hecho:** no hay `request_id` en ningún log (grep sin resultados); `org_id` aparece de formas distintas;
  mensajes informativos con `console.error` (`lib/rag/ingest.ts:75`, 31 apariciones como "error" en prod);
  `fathom/process` imprime varias líneas de diagnóstico por corrida.
- **Riesgo:** buscar qué le pasó a un cliente o una corrida lleva mucho tiempo, y el ruido tapa los errores reales.
- **Recomendación:** helper mínimo `log({ level, scope, orgId, requestId, ... })` en JSON, usado primero por crons y
  webhooks.

### H11 · Errores de crons que no quedan en ningún lado — Alta · amplía `[EMBUDOS-CRON-ERRORES]`
- **Hecho:** `calendly-sync-closers` responde `200 { ok: true, orgs: 0, … }` ante una excepción
  (`app/api/cron/calendly-sync-closers/route.ts:35-37`); `daily-signals` devuelve los errores de cada paso sólo en el
  cuerpo, sin loguearlos (`app/api/cron/daily-signals/route.ts:70-77`); `fathom/sync`, `typeform/sync`,
  `capture-ad-metrics` y `ghl-sync` responden 200 con los errores por org adentro.
- **Riesgo:** falla silenciosa de procesos importantes: Vercel marca la corrida como exitosa.
- **Recomendación:** lo de `[EMBUDOS-CRON-ERRORES]` (207/500 si alguna org falló) extendido a estos crons, y loguear
  cada error por org.

Además, con evidencia nueva sobre ítems existentes (ya aplicada en esos ítems de `PENDIENTES.md`): `[AUD-CONF-5]` (el caso
`pending`), `[1A1-CLAVE-ANTHROPIC-ROTA]` (errores reales en prod), `[INTELIGENCIA-SIN-REINTENTO]` (formato
inválido), `[AUD-CONF-6]` (análisis profundo e ingesta RAG de Fathom con `void`), `[AUD-SALUD-3]` (timeouts). Y un
nuevo ítem sobre el bot de Discord:

### H12 · Si el bot de Discord se cae, los mensajes de ese rato se pierden — Media · nuevo `[DISCORD-BOT-SIN-RECUPERACION]`
- **Hecho:** el bot sólo escucha `messageCreate` (`apps/discord-bot/src/index.ts`); no hay backfill del historial al
  arrancar (`ready.ts` hace un diagnóstico) y un error al guardar sólo va a `console.error`
  (`src/lib/supabase.ts:168-172`). Sin Sentry. `touchIntegrationEvent` guarda la última actividad por servidor, pero
  nada la compara.
- **Riesgo:** un corte de Railway o un deploy fallido pierde los mensajes de ese período: wins, señales de
  `daily-signals` y atribución de clientes. Nadie se entera.
- **Recomendación:** al arrancar, pedir a la API de Discord los mensajes posteriores al último `discord_message_id`
  guardado por canal monitoreado (upsert ya deduplica); alerta si un servidor conectado pasa N horas sin eventos.

(Conteo final: 12 hallazgos — 4 Altos: H1, H2, H3, H11; 6 Medios: H4, H5, H6, H7, H8, H12; 2 Bajos: H9, H10.
11 ítems nuevos y 1 ampliación, más 5 ampliaciones con evidencia.)

## 9. Lo que está bien

- **Crudo antes de interpretar** en Whop, Commas, GHL y ManyChat, con lo no entendido marcado `unmapped` y motivo
  (`lib/payments/ingest.ts`, `lib/ghl/ingest-opportunity-event.ts`). Tablas de crudos sin policies (sólo servidor).
- **Firmas** verificadas en todos los webhooks, fail-closed (503) cuando falta el secreto (Zernio, Unipile, Mercado
  Pago); Fathom legacy rechaza con 409 una firma ambigua entre orgs.
- **Cola de Fathom**: toma atómica (`.neq("status","processing")`), rescate de llamadas trabadas con ventana, y
  presupuesto de tiempo para no pasarse del `maxDuration`.
- **Fan-out por QStash** en los 6 crons de IA/métricas, con `?organizationId=` para correr una org a mano y fallback en
  serie si falta `QSTASH_TOKEN`; `Promise.allSettled` al publicar para que una org no frene a las demás.
- **Reporte ejecutivo** responde 500 cuando el generador devuelve `failed`, así QStash reintenta.
- **`calendly-sync`** devuelve 500 ante error no controlado (con el comentario de por qué).
- **Typeform y Google Forms** aíslan el error por org.
- **Métricas de contenido** ya no pisan con ceros cuando Zernio devuelve algo no reconocible
  (`lib/marketing/sync-content-metrics.ts:60-66`; la parte del cron de `[AUD-CONF-11]` está resuelta).
- **`capture-ad-metrics`** permite rellenar un día con `?date=`.
- **Sentry** configurado en servidor, edge y navegador, con DSN y source maps en Vercel; filtra cookies.
- **SOP desde video** no vuelve a pagar Whisper al reintentar (reusa la transcripción).
- **Bajas del super admin** quedan registradas en `super_admin_deletions`.

Relacionado: [`../arquitectura/jobs-webhooks-y-colas.md`](../arquitectura/jobs-webhooks-y-colas.md),
[`../../PENDIENTES.md`](../../PENDIENTES.md), [`../operacion/entorno-y-deploy.md`](../operacion/entorno-y-deploy.md).

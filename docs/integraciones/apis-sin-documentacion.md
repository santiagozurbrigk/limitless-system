# APIs implementadas con suposiciones sin verificar

> Verificado contra el código y contra `docs/external-apis/` el 2026-09-23 (commit 038caca).
> Reemplaza a `docs/archivo/API_DOCS_PENDIENTES.md` (archivado). Acá queda **sólo lo que todavía no está
> verificado**; lo que la documentación local ya resolvió se lista al final, en una línea.

## Cómo agregar una entrada

La regla viene del `CLAUDE.md` (regla 3). En orden:

1. **Buscá la doc antes de asumir.** `docs/external-apis/` tiene copias locales de
   GoHighLevel, VTurb, Whop, Commas, Hyros, WebinarJam, Fathom y Zoom, cada una con su
   `RESUMEN-LIMITLESS.md`. Si el proveedor no está, **probá la URL** (el bloqueo de red que
   originó este archivo resultó no existir) y buscá un spec OpenAPI antes de raspar HTML.
   Bajala con `docs/external-apis/tools/regenerar.sh` como modelo y commiteala.
2. Si de verdad no hay documentación legible, implementá con estas tres precauciones:
   - **Persistí el payload crudo antes de interpretarlo** (patrón:
     `payment_webhook_events`, `ghl_webhook_events`, columnas `raw` de los catálogos,
     `vturb_stats_cache.stats`, `fathom_calls.share_payload`). El primer dato real es la
     fuente de verdad.
   - **Nunca inventes un valor.** Lo que no se entiende queda `unmapped` o `null` con su
     motivo. Un cobro cuyo monto no se lee no es un cobro de cero; una fecha que no se
     parsea no es "hoy".
   - **Aislá el mapeo en un solo archivo por proveedor**, con la advertencia en el
     encabezado (ej. `lib/fathom/share-link.ts`, `lib/ghl/opportunity-event.ts`,
     `lib/webinarjam/normalize-registrant.ts`).
3. Agregá la entrada acá con este formato y sumá la prueba manual a
   `docs/operacion/verificacion-manual.md`:

```
## <Proveedor> — <qué parte>
Archivo del mapeo: `apps/web/lib/...`
| Suposición | Confianza | Qué falta para verificarla |
```

4. Cuando se verifique, **borrá la fila** y dejá una línea en "Ya verificado".

Confianza: **alta** = el nombre o un ejemplo de la doc lo respaldan; **media** = inferido
de un tipo sin descripción; **baja** = no hay nada en la doc.

---

## GoHighLevel — webhook de oportunidades por Workflow

Archivos: `apps/web/lib/ghl/opportunity-event.ts` (mapeo), `apps/web/app/api/webhooks/ghl/route.ts`.
Crudo en `ghl_webhook_events.payload`.

Limitless no tiene app del Marketplace (`[FEAT-GHL-OAUTH]`), así que la vía que funciona es
una acción "Webhook" dentro de un Workflow de la sub-cuenta, autenticada con un secreto por
org en la URL. **El payload de esa vía no está en `docs/external-apis/gohighlevel/`** (se
buscó "workflow", "custom webhook", "customData": sólo aparece la vía de app).

| Suposición | Confianza | Qué falta |
|---|---|---|
| El cuerpo trae `type` (o `event`/`eventType`) con un nombre `Opportunity*`. Si no, la ruta responde 200 `ignored` y **no guarda nada** | Baja | Primer evento real. Si el Workflow no manda `type`, hay que agregarlo como custom data o todos los eventos se descartan en silencio |
| El id de la oportunidad viene como `opportunityId`/`opportunity_id` o `id`, en la raíz o bajo `data`/`opportunity`/`customData`. Se recorre capa por capa empezando por la raíz, así que un `id` en la raíz gana sobre un `opportunityId` anidado (en un Workflow ese `id` podría ser el del contacto) | Baja | Primer evento real |
| Un Workflow puede mandar `pipelineStageId`. Sin eso sólo sirve para altas (M21) y M22/M23/M25 quedan atadas a la app del Marketplace | Baja | **Es la verificación que decide la unidad I-4** (`docs/archivo/PLAN_VERIFICACION.md` §5.2) |
| El id del evento para deduplicar viene en `webhookId` | Media — la guía de webhooks de app lo usa en su ejemplo; para Workflow no hay nada | Si el Workflow no lo manda, `external_event_id` queda `NULL` y un reintento duplica la transición |

## GoHighLevel — REST de pipelines y oportunidades

Archivos: `apps/web/lib/ghl/client.ts`, `apps/web/lib/ghl/sync-pipelines.ts`. Crudo en `ghl_pipelines.raw`, `ghl_pipeline_stages.raw`.

| Suposición | Confianza | Qué falta |
|---|---|---|
| Cada etapa de `pipelines[].stages[]` trae su id en `id` o `_id` | Media — `get-pipeline.md` declara `stages: array[]` sin expandir; el body de `create-pipeline` muestra `name`, `position`, `showInFunnel` pero no el id | Mirar `raw` del primer sync |
| El objeto `opportunity` de las respuestas REST tiene los mismos campos que el webhook | Media — la doc devuelve `opportunity: {}` | Sólo importa cuando se construya `[EMBUDOS-GHL-BACKFILL]` (hoy `searchGHLOpportunities` no se usa) |

## VTurb

Archivos: `apps/web/lib/vturb/client.ts`, `apps/web/lib/vturb/resolve-stats.ts`. Crudo en `vturb_stats_cache.stats` / `engagement`.

| Suposición | Confianza | Qué falta |
|---|---|---|
| `X-Api-Version: v1` es el valor aceptado. La página de autenticación dice `v1`; `openapi.json` declara `info.version: "v3"` | Media | Primera llamada real: un 401 con key válida es esto |
| `total_viewed` = visitantes de la página (M08), no reproducciones | Media — el schema `Stats` lista el campo sin descripción | Comparar contra el dashboard de VTurb (`docs/archivo/PLAN_VERIFICACION.md` §6.2) |
| `total_started` = le dieron play (M10) | Alta por el nombre, sin descripción | idem |
| `total_over_pitch` = llegaron al segundo del CTA (M12), válido sólo con `pitch_time > 0` | Alta — el request de `/sessions/stats` documenta `pitch_time` como "tiempo que hay que ver para considerarse pitch" | Cruzar contra `/times/user_engagement` en el segundo `pitch_time` |
| Qué deduplican `_device_uniq` y `_session_uniq`. Limitless usa los totales brutos | Baja | Ver cuál coincide con el dashboard |

## WebinarJam / EverWebinar

Archivos: `apps/web/lib/webinarjam/normalize-registrant.ts` (mapeo), `apps/web/lib/webinarjam/client.ts`. Crudo en `webinarjam_registrants.raw`. Bloqueado por la API key, que requiere aprobación (`[WEBINARJAM-API-KEY]`).

| Suposición | Confianza | Qué falta |
|---|---|---|
| El array de `/registrants` viene bajo `registrants`, `users` o `data` (se aceptan las tres). El ejemplo de la doc es una captura de pantalla | Baja | Primer response |
| `signup_date`, `date_live`, `date_replay` (declarados `integer`) son epoch; segundos vs milisegundos se decide por magnitud | Media | Comparar `signup_at` contra el panel |
| `attended_live`/`attended_replay` en la **respuesta**: `0` = no, positivo = sí. La doc publica la tabla 0–4 del **filtro**, no la del campo | Media | Un registrante que sí asistió debe quedar `true` |
| La paginación termina con una página vacía (no hay total documentado). Tope de 200 páginas / 5.000 filas por webinar | Media | Un webinar grande: comparar el total contra el panel |
| `schedule` viene siempre en cada registrante | Media — está en la tabla de respuesta | Si llega vacío, el upsert duplica filas (`schedule_external_id` nulo no choca en el índice único) |

Sin camino, no es una suposición: **M16 (clicks al CTA en el webinar)** no existe en la API.
`time_live`/`time_replay` (unidad sin declarar) y `revenue_*` no se usan.

## Hyros

Archivos: `apps/web/lib/hyros/resolve-attribution.ts` (mapeo), `apps/web/lib/hyros/client.ts`. Crudo en `hyros_attribution_cache.payload`.

| Suposición | Confianza | Qué falta |
|---|---|---|
| Qué plan incluye la API. Un 401/403 puede ser key inválida o plan sin API | Baja — la doc no lo dice | Confirmar con Hyros al conectar la primera cuenta |
| **`revenue` es el campo correcto para M05.** El spec ofrece `revenue`, `total_revenue` y `recurring_revenue` sin definirlos; la descripción de `/roas` dice que *"rebills are already counted inside `total_revenue`"*, lo que sugiere que `revenue` excluye recurrencias | Media — **parcialmente verificado 2026-09-23**, ver abajo | Comparar contra el dashboard de Hyros con una cuenta que tenga suscripciones; decidir cuál representa el revenue atribuido del documento |
| `new_visits` es lo que el cliente entiende por "visitantes" (M08) | Media | Confirmar con el cliente |
| Los importes pueden venir como texto con símbolo (el request fija `currency=usd`, igual se tolera) | Media | Primer response |

## Commas (ex Fanbasis) y Whop — pagos

Archivo: `apps/web/lib/payments/normalize.ts`. Crudo en `payment_webhook_events.payload`.
El mapeo **se corrigió contra la doc local** (ver "Ya verificado"). Lo que queda no es de
documentación sino de cuenta real (`[EMBUDOS-PAGOS-VERIFICAR]`):

| Suposición | Confianza | Qué falta |
|---|---|---|
| El payload real de cada evento que Limitless escucha coincide con `webhook-events-reference.md` (Commas) y los ejemplos de Whop | Alta | Un evento real de cada uno con estado `processed` |
| El `id` del cuerpo es estable entre reentregas y sirve para deduplicar | Alta en Whop (Standard Webhooks, `msg_...`); media en Commas | Commas no reintenta, así que un duplicado sería un replay |

## Zernio — comentarios como disparadores (M34)

Archivo: `apps/web/lib/zernio/triggers.ts`. **Zernio no tiene copia local en
`docs/external-apis/`.** Se asume que `GET /inbox/comments` devuelve
`{ comments: [{ createdAt, ... }] }` sin filtro de fecha ni cursor (confianza media: el
mismo endpoint ya alimenta la UI de comentarios). Si el endpoint pagina o filtra, la regla
"sólo cuento si vi un comentario más viejo que el inicio del período" deja de ser necesaria.
Falta: bajar la doc de Zernio si es alcanzable.

## Fathom — link compartido (fuera del área Embudos)

Archivo: `apps/web/lib/fathom/share-link.ts` (advertencia en el header). Crudo en
`fathom_calls.share_payload`. Lee el `data-page` de `fathom.video/share/{token}`, que Fathom
no documenta.

| Suposición | Confianza | Qué falta |
|---|---|---|
| `props.call.id` del link compartido es el mismo número que `recording_id` de la API | Media-alta | Subir a mano una llamada que la sync ya bajó: tiene que reusar la fila. **Camino alternativo documentado:** `GET /meetings` devuelve `share_url` como campo requerido (`docs/external-apis/fathom/api-reference/meetings/list-meetings.md`); hoy `lib/fathom/api.ts` guarda `url` antes que `share_url`, así que no se puede cruzar por token |
| `copyTranscriptUrl` funciona para cualquier grabación compartida | Media — probado en una | Un link de un coach de otra cuenta |

Loom no tiene entrada: no publica API para bajar un video desde un link y el flujo pide
subir el archivo. No hay suposición abierta.

---

## Ya verificado (una línea cada uno)

- **Whop** — monto en `settlement_amount` (decimales), eventos literales (`membership.activated`, no `.created`), firma Standard Webhooks con el secreto `ws_` literal. `lib/payments/normalize.ts`, `verify-signature.ts`. (2026-08-30, confirmado 2026-09-08)
- **Commas** — host `www.fanbasis.com`, montos en centavos, firma HMAC-SHA256 hex en `x-webhook-signature` sin timestamp, entrega at-most-once, contrato = `amount_cents × auto_expire_after_x_periods`. (2026-08-30)
- **GHL** — base URL, `Version: v3` para oportunidades, payload plano de `OpportunityStageUpdate` (sin etapa anterior ni hora del cambio), no hay endpoint de historial, firma Ed25519 `X-GHL-Signature` y RSA legacy `X-WH-Signature` (deprecada el 2026-09-01). (2026-08-30)
- **GHL** — el objeto pipeline trae `id`, `name` y `stages[]`; las etapas se crean con `name` y `position` numérico (`get-pipeline.md`, `create-pipeline.md`). **Verificado 2026-09-23.**
- **GHL** — `status = "won"` en minúscula es un valor válido (`open`, `won`, `lost`, `abandoned` en `search-opportunity.md`), así que el filtro de `ghl_opportunities_won` usa el literal correcto. **Verificado 2026-09-23.**
- **GHL** — reintenta hasta 12 veces ante cualquier respuesta no-2xx (`WebhookIntegrationGuide.md`). Consecuencia: un 404/401 del endpoint dispara reintentos; un 200 con error interno no. **Verificado 2026-09-23.**
- **VTurb** — `/players/list` devuelve un **array pelado** de `{ id, name, pitch_time, duration, created_at }`, con `pitch_time = 0` cuando no está configurado (`openapi.json`). **Verificado 2026-09-23.**
- **VTurb** — `engagement_rate` de `/times/user_engagement` = `average_watched_time / video_duration × 100` (documentado). (2026-08-30)
- **VTurb** — `/quota/usage` devuelve `{ quotas: [{ interval_seconds, queries: { used, limit, remaining }, read_bytes }] }`, no un array. `getVTurbQuotaUsage` lee `usage`, así que devolvería siempre `[]`; la función no se usa. **Verificado 2026-09-23** — anotado como deuda, no como suposición.
- **WebinarJam** — misma API para `/webinarjam` y `/everwebinar`, api_key en el body, 20 req/s, filtros `attended_live=4` + `attended_live_timestamp` para M15, `date_range` sólo presets, UTMs por registrante. (2026-08-30)
- **Hyros** — base URL, header `API-Key`, `/attribution/ad-account` con `ids` de una cuenta, rate limit 30 req/s y 1000/min, parámetros desconocidos ignorados en silencio. (2026-08-30)
- **Hyros** — las filas de `result` vuelven con los nombres de `fields` pedidos (el ejemplo muestra `sales`, `leads`, `total_revenue`, `cost`); `revenue` y `total_revenue` son campos distintos del enum de `fields`. **Verificado 2026-09-23.**

# Marketing

> Verificado contra el código el 2026-09-23 (commit 038caca). Backlog del área: `PENDIENTES.md` § Marketing.

## Qué es

Todo lo que el founder publica y cómo rinde: la biblioteca de contenido (posts, reels, historias y videos
de YouTube) sincronizada desde **Zernio**, métricas, análisis con IA de cada pieza, variantes y **Trial
Reels** (cinco versiones de un reel generadas con FFmpeg en un worker de Fly.io), anuncios de Meta
(vía Zernio), comentarios, formularios (Typeform / Google Forms) con scoring de leads, UTMs de YouTube
con atribución hasta la venta y lead magnets. Lo usa el founder y su equipo con permiso `marketing`.

**No hace:** no publica en Instagram directamente (todo sale como **borrador en Zernio**), no guarda
comentarios ni anuncios en la base (salvo la foto diaria de anuncios, ver Anuncios), y no es la bandeja
de DMs (eso es Ventas, aunque comparte `app/integrations/zernio/actions.ts`).

## Pantallas y rutas

Todas bajo `app/(platform)`; los paths salen de `apps/web/routes/paths.ts` (`paths.platform.marketing.*`)
y el menú de `apps/web/lib/navigation/sidebar-modules.ts` (items con `hidden: true` no aparecen en la
notch nav pero la ruta funciona).

| Ruta | Archivo | Qué muestra | En menú |
|---|---|---|---|
| `/marketing` | `marketing/page.tsx` → `components/marketing/marketing-overview.tsx` | KPIs, funnel, heatmap, distribución por etiqueta (AUTORIDAD/ATRACCIÓN/NUTRICIÓN/VENTA) con insight de Haiku, tarjeta UTM | Sí |
| `/marketing/content` | `marketing/content/page.tsx` | Biblioteca (`content_pieces` con `variants_of IS NULL`, **máx. 50**) y tab `?tab=borradores` (variantes IA). Dispara `maybeSyncZernioContentAction` al cargar | Sí |
| `/marketing/content/[id]` | `marketing/content/[id]/page.tsx` → `marketing-content-detail-page-client.tsx` → `content-piece-detail.tsx` | Tabs Métricas, Análisis, Comentarios, Anuncios, Variantes, Trial Reels. `maxDuration = 300` | — |
| `/marketing/anuncios` | `marketing/anuncios/page.tsx` → `ads-dashboard.tsx` | Anuncios de Meta en vivo desde Zernio (`getMarketingAdsAction`) | Sí |
| `/marketing/administrar` | `marketing/administrar/page.tsx` → `drive-admin-view.tsx` | Explorador del Google Drive de la org para vincular archivos a piezas | Oculto |
| `/marketing/sales-connection` | `marketing/sales-connection/page.tsx` → `marketing-sales-connection.tsx` (client) | Ranking de contenido por revenue, recorridos de compradores, reporte de patrones IA | Oculto |
| `/marketing/forms` y `/[id]` | `marketing/forms/*` | Formularios sincronizados, respuestas con score IA, sync y desconexión | Sí |
| `/marketing/utms` | `marketing/utms/page.tsx` → `utm-page-content.tsx` | "UTMs de YouTube": generador, tabla y funnel por link | Oculto |
| `/marketing/automatizaciones` | `marketing/automatizaciones/page.tsx` | Lista de flows de **ManyChat** (sólo lectura) | Sí |
| `/marketing/lead-magnets` | `marketing/lead-magnets/page.tsx` | CRUD de lead magnets y sus leads/atribución | Sí |
| `/comentarios` | `(platform)/comentarios/page.tsx` → `components/comentarios/comentarios-page-content.tsx` | Comentarios de todas las cuentas Zernio: responder y ocultar | No (cuelga del módulo marketing en `lib/navigation/module-for-path.ts`) |

`app/(platform)/marketing/layout.tsx` es un passthrough: no hay subnav (la notch nav lo reemplaza).

## Modelo de datos

Los conteos de filas en prod son al 2026-09-22/23.

| Tabla | Columnas clave | Notas |
|---|---|---|
| `content_pieces` | `type` (`reel`,`story`,`post`,`carousel`,`youtube`,`brief`), `source` (`zernio`,`manual`,`ai_generated`,`google`), `platform`, `platform_post_id`, `metrics` JSONB, `metrics_updated_at`, `metrics_checked_at`, `metrics_intentos_sin_dato`, `metrics_reintentar_desde`, `analysis` JSONB, `format_type`/`hook_type`/`cta_type`, `drive_file_id/name/url`, `transcript`, `variants_of` (FK a sí misma), `brief` JSONB, `sales_attributed` JSONB, `status` | Tabla central. Índice **único común** `(organization_id, platform_post_id)` (`20260922110000`) e índice parcial `content_pieces_metrics_cola_idx` para la cola del cron de métricas (`20261004120000`). Trigger `set_updated_at`. RLS por `get_my_organization_id()`. 150 filas en prod |
| `content_pattern_reports` | `organization_id`, reporte JSON | Uno nuevo por cada "generar" (`pattern-report-actions.ts`) |
| `reel_variation_jobs` | `source_piece_id`, `status` (`pending`,`processing`,`preview_ready`,`publishing`,`done`,`failed`), `delay_hours` (0–72, default 2), `variations` JSONB[], `error_message` | Trial Reels (`20260810120000`, realtime en `20260810200000`). Cada variación: `type`, `storage_path`, `preview_url`, `description`, `hashtags`, `included`, `status`, `zernio_post_id`, `error` |
| `organizations.reel_music_path` | path en bucket `trial-reels` | Música propia de la org para la variante V3 (`20260811120000`) |
| `zernio_integrations` | `zernio_profile_id` (sólo el `_id`), `connected_accounts` JSONB `[{accountId, platform, username, avatarUrl}]`, `api_key` (cifrada), `webhook_secret`, `is_active` | Sin policies de miembro: sólo service role (`20260922110000`) |
| `zernio_comments`, `zernio_messages` | `zernio_comment_id`, `is_replied`, `is_hidden`, `raw_payload` | Los llena el webhook de Zernio. **0 filas en prod** |
| `ad_metrics_daily` | `(organization_id, metric_date, platform, ad_external_id)` único, `spend`, `impressions`, `reach`, `clicks` | Única excepción al live-fetch de ads. Escribe sólo el cron. **0 filas en prod** |
| `forms` / `form_responses` | `forms.platform` (`typeform`,`google_forms`), único `(organization_id, platform, external_form_id)`; `form_responses` único `(organization_id, external_response_id)` (SCRUM-57), `ai_lead_score`, `ai_lead_qualification`, `answers` JSONB | 38 forms y **0 respuestas** en prod |
| `typeform_integrations`, `google_forms_integrations`, `youtube_integrations` | tokens OAuth / API key | Tokens OAuth en texto plano (auditoría §3 seguridad 2). `google_forms_integrations` guarda el token Google unificado (Drive+Forms+YouTube) |
| `utm_links` | `utm_campaign`, `youtube_video_id` (external id de YouTube), `full_url`, `manychat_ref` (`yt-<campaign>`), contadores `clicks`, `leads_captured`, `bookings_attributed`, `sales_attributed`, `revenue_attributed` | Contadores vía RPC `increment_utm_*` (revocadas a anon/authenticated; sólo service role) |
| `utm_lead_captures`, `utm_booking_attributions`, `utm_sale_attributions` | índices únicos por `closing_call_id` / `client_id` | Cadena lead → booking → venta |
| `lead_magnets`, `lead_magnet_leads` | `channel`, `asset_url`, `redirect_url`, `attributed_client_id`, `conversation_id` | `lead_magnet_clicks` existe pero ningún código la usa |
| `content_assets` | `platform`, `external_id`, `platform_metadata`, `ai_content_label`, contadores de conversión | **Legacy** (Instagram Graph). Sólo `lib/instagram/sync.ts` crea filas; el Overview le reescribe los contadores en cada carga (`recomputeContentAssetAttribution`) y dos acciones huérfanas editan etiqueta y minuto de CTA. 6 filas en prod, pero el Overview todavía lee de acá |
| `story_sequences`/`story_frames`, `competitors`/`competitor_posts` | — | Creadas para `[FEAT-1]`/`[FEAT-2]`, sin código |

Buckets: `trial-reels` (privado; fuente, variantes y música) y `content-thumbnails` (**público**, thumbnails
persistidas porque las URLs del CDN de Instagram vencen en 1–2 h; `lib/marketing/story-thumbnail-storage.ts`).

## Cómo fluye el dato

### Contenido desde Zernio

```
/marketing/content (page load)
  └─ maybeSyncZernioContentAction          app/marketing/content/sync-actions.ts
       ├─ repairExpiredCdnThumbnails (void) → pone en null thumbnails del CDN de IG
       └─ si no hay piezas zernio o la más nueva tiene updated_at > 30 min → syncZernioContentAction
            ├─ por cuenta IG/YouTube: listInstagramStories + syncExternalStories   (historias PRIMERO)
            ├─ syncExternalPosts (POST /posts/sync-external)
            ├─ listPublishedPosts source=external limit=200
            ├─ dedupe por platform_post_id (gana la primera: la historia tipada)
            ├─ insert nuevas / update existentes (thumbnail persistida en content-thumbnails)
            └─ void syncContentMetricsForOrg
cron 06:00 UTC /api/cron/sync-content-metrics
  └─ con QStash: fan-out a /api/queue/process-cron-sync-metrics por org; sin QStash: secuencial
       └─ lib/marketing/sync-content-metrics.ts: cierra sin pedirlas las historias abiertas de más de 72 h;
            lote de 50 piezas source=zernio (lib/marketing/cola-de-metricas.ts):
            nuevas (historias desde las 30 h) → con métricas → reintentos sin dato con la espera vencida (cupo 10);
            GET /analytics?postId= → resolvePostAnalytics; un update por pieza: siempre metrics_checked_at = now;
            con dato metrics + metrics_updated_at; sin dato intentos + 1 y metrics_reintentar_desde
```

- **YouTube** va por otro camino: `lib/google/sync-youtube.ts` upsertea `content_pieces` con
  `source='google'`, `type='youtube'`. Corre **sólo al conectar** (callback OAuth de YouTube o de Google
  Forms, o `connectYoutubeApiKeyAction`); no hay cron y el cron de métricas filtra `source='zernio'`, así que
  las métricas de YouTube quedan congeladas en el momento de conectar.
- **Análisis IA** (`POST /api/content/analyze` → `analyzeContentPieceAction`): exige `drive_file_id`,
  baja el archivo de Drive, si es video extrae audio + frames con `lib/content/video-processor.ts`
  (ffmpeg-installer en la lambda), transcribe con **Whisper de OpenAI** (`OPENAI_API_KEY`, límite 25 MB)
  y llama a Claude con visión (`callClaudeVisionJson`, task `analyze_content_piece`). Guarda
  `analysis`, `transcript`, `format_type`, `hook_type`, `cta_type`.
- **Variantes** (`createContentVariantsAction`, 1–5): Claude genera briefs y se insertan como
  `content_pieces` `source='ai_generated'`, `status='draft'`, `variants_of=<padre>`. Hoy sólo las invoca el
  **agente** (`lib/agent/agent-tool-handler.ts` y `app/agent/actions.ts`); se ven en el tab "Borradores".
- **Reporte de patrones** (`generateContentPatternReportAction`): Claude sobre las piezas analizadas → fila
  nueva en `content_pattern_reports`. Los rankings y el prompt salen de `lib/marketing/patrones-de-contenido.ts`.

### Trial Reels

```
TrialReelsButton (detalle de pieza) → createTrialReelsJobAction   app/marketing/content/reel-variation-actions.ts
  ├─ exige drive_file_id + token Google; lee metadatos de Drive (límite 500 MB)
  ├─ inserta reel_variation_jobs (pending, delay_hours=2)
  └─ QStash publishJSON → REEL_WORKER_URL (Fly.io, app otc-reel-worker, gru)
        body: jobId, driveFileId, driveAccessToken, reelMusicPath…; retries 2, timeout 900 s
apps/reel-worker (Express)
  ├─ auth: WORKER_AUTH_SECRET (header X-Worker-Secret, Bearer o ?workerSecret=) o firma QStash
  ├─ procesa sincrónicamente (si responde antes, Fly apaga la máquina)
  ├─ baja de Drive, 5 variantes FFmpeg (V1 +25 %, V2 ≈ −13 % (`setpts=1.15`, `atempo=0.87`), V3 música (sin archivo de música conserva el audio original), V4 subtítulos, V5 LUT warm.cube)
  ├─ anti-fingerprint: metadatos falsos, bitrate ±5 %, crop 1–2 px
  ├─ sube a trial-reels/{org}/variations/{job}/…, signed URL 7 días, captions con Haiku
  └─ job → preview_ready  (la UI escucha por Supabase Realtime)
publishVariationsAction → un mensaje QStash por variante incluida con delay = posición × delay_hours
  └─ /api/queue/publish-reel-variation: presign Zernio (POST /media/presign) → PUT del video
       → createPost status="draft" → variación "published"; al terminar todas: job "done" + mail al founder
cron 03:00 UTC /api/cron/cleanup-trial-reels: borra del bucket los archivos de jobs done/failed > 30 días
```

### Formularios

Cron horario `/api/integrations/typeform/sync` y `/api/integrations/google-forms/sync` (o botón "Sincronizar",
`syncFormAction`). Cada sync upsertea `forms`, trae respuestas desde `last_synced_at` (paginado, ver abajo), y puntúa hasta 20 pendientes por form con Haiku
(`lib/forms/sync-scoring.ts` → `score-response.ts`). `scoreFormResponsesAction` (botón del detalle) puntúa hasta 20
pendientes y después hace el análisis agregado del form (Sonnet).

**Paginación y cursor (SCRUM-57, 2026-10-04):** `lib/forms/paginar-respuestas.ts` trae todas las páginas de
respuestas: Typeform con el cursor `before` (orden `submitted_at,desc`, 1.000 por página) y Google Forms con
`nextPageToken`, manteniendo el filtro de fecha. Tope: 50 páginas por formulario y corrida. Si una página falla,
se llega al tope o falla un guardado, `forms.last_synced_at` no avanza, y tampoco el `last_sync_at` de la
integración: la próxima corrida vuelve a pedir desde el mismo punto (el upsert deduplica). El upsert es por
`(organization_id, external_response_id)`. Docs: `docs/external-apis/typeform/` y `docs/external-apis/google-forms/`.

### UTMs

```
createUTMLinkAction (utm-actions.ts): arma full_url (website_url de la org o NEXT_PUBLIC_APP_URL)
  + manychat_ref yt-<campaign> + link ig.me/m.me; guarda el external id de YouTube (no el UUID del asset)
Landing de Limitless: components/landing/utm-capture.tsx → POST /api/utm/click (increment_utm_clicks)
  waitlist → trackUTMLeadCapture con NEXT_PUBLIC_UTM_ORGANIZATION_ID
Landing externa del cliente: POST /api/utm/track (sólo registra si existe el link: requireKnownLink)
ManyChat ref → lib/utm/attribute-manychat-ref.ts
Calendly sync (sync-events.ts / closer-sync.ts) → attributeBookingToUTM (match por email o nombre)
Alta de cliente (app/clients/actions.ts) → attributeSaleToUTM (+ attributeLeadMagnetToClient)
Overview → recomputeContentAssetAttribution (escribe contadores en content_assets en cada carga)
```

`/api/utm/*` es público (`lib/supabase/public-paths.ts`) con rate limit por IP (`lib/rate-limit.ts`).

### Resto

- **Anuncios:** `getMarketingAdsAction` → `GET /ads` en vivo (100 máx.; el filtro "error" se aplica en
  memoria). Por pieza: `getContentPieceAdsAction` → `GET /ads?effectiveInstagramMediaId=`. El cron
  `/api/cron/capture-ad-metrics` (05:30 UTC) guarda el día anterior en `ad_metrics_daily` para Embudos
  (etapa Spend); acepta `?date=` y `?organizationId=`.
- **Comentarios:** `/comentarios` usa `listZernioCommentsAction` (inbox de todas las cuentas),
  `replyToZernioCommentAction`, `hideZernioCommentAction`. En el detalle de pieza,
  `getContentPieceCommentsAction` pagina `GET /inbox/comments/{postId}`.
- **Webhook Zernio** (`/api/integrations/zernio/webhook`): HMAC SHA-256 con **`ZERNIO_WEBHOOK_SECRET`
  global** (503 si falta), headers `x-zernio-signature` / `x-hub-signature-256` / `x-signature`. Guarda
  `message.received`/`message.sent` y `comment.received`; `account.connected` agrega la cuenta a `connected_accounts`.
  `account.disconnected` no se maneja (sólo figura en el comentario de eventos a suscribir).
- **Lead magnets:** CRUD en `lead-magnets-actions.ts`. Los leads sólo se registran cuando alguien corre el
  análisis IA de una conversación de Zernio (`analyzeZernioConversationAction`) y un mensaje saliente contiene
  el `asset_url`/`redirect_url` (`lib/marketing/lead-magnets-internal.ts`). La atribución a cliente se hace
  al crear el cliente.
- **Automatizaciones:** lee flows de ManyChat (`lib/manychat/client.ts`); si no hay ManyChat, empty state.
- **Meta Pixel / CAPI:** sólo para la landing de Limitless, no por org. `components/landing/meta-pixel.tsx`
  (`NEXT_PUBLIC_META_PIXEL_ID`) y `lib/meta/conversions-api.ts` (`META_CONVERSIONS_API_TOKEN`), evento `Lead`
  desde `/api/waitlist` y `/api/trial-confirm` (este último es el alta de prueba de la landing, no Trial Reels).
- **Instagram Graph legacy:** `/api/integrations/instagram/sync` (horario) escribe `content_assets`.

## Integraciones externas

| Proveedor | Qué se lee / escribe | Cliente | Sin conexión |
|---|---|---|---|
| Zernio | Posts, historias, analytics, ads, comentarios, crear borradores, subir media | `lib/zernio/client.ts`, `lib/zernio/integration.ts` `getZernioClientForOrganization` tira "Zernio no está conectado" si la org no tiene integración activa con key; anuncios muestra ese aviso y comentarios "Conectá Zernio" (sin key global, ver Reglas) |
| Google (OAuth unificado) | Drive (lectura/descarga), Forms, YouTube Data + Analytics | `lib/google/*`, token en `lib/google/get-access-token.ts` | Análisis, Trial Reels y Administrar piden conectar Google |
| YouTube (API key alternativa) | Canal y videos | `app/youtube/actions.ts`, `lib/google/sync-youtube.ts` | — |
| Typeform (OAuth) | Forms y respuestas | `lib/typeform/sync.ts` | Empty state |
| OpenAI Whisper | Transcripción para el análisis | `lib/content/transcribe-whisper.ts` | El análisis de video falla |
| Anthropic | Análisis, variantes, captions, scoring, insight de distribución, patrones | `lib/ai/anthropic.ts` (BYOK); los captions del worker usan el SDK directo con `ANTHROPIC_API_KEY` (`apps/reel-worker/src/captions.ts`, sin BYOK) | — |
| QStash + Fly.io | Trial Reels, fan-out de métricas | `lib/queue/qstash-client.ts`, `apps/reel-worker` | Sin QStash el job queda `failed` |
| ManyChat | Flows (Automatizaciones), refs UTM | `lib/manychat/*` | Empty state |
| Meta CAPI | Evento Lead de la landing | `lib/meta/conversions-api.ts` | No-op |

### Zernio

Base `ZERNIO_API_BASE` = `ZERNIO_BASE_URL` o `https://zernio.com/api/v1` (`lib/zernio/constants.ts`).
Auth `Authorization: Bearer <api_key>`. `zernioFetchJson` (valida status, detecta HTML y JSON inválido)
se usa en los métodos marcados con ✓; el resto hace `fetch` crudo sin esas defensas. Ninguna llamada tiene
timeout. **No hay copia local de la documentación de Zernio** en `docs/external-apis/`.

| Método (`createZernioClient`) | HTTP | Path / query | zernioFetchJson | Quién lo usa |
|---|---|---|---|---|
| `listAccounts` | GET | `/accounts` | — | `app/integrations/zernio/actions.ts` |
| `validateApiKey` | — | alias de `listAccounts` | — | nadie |
| `listConversations` | GET | `/inbox/conversations[?accountId=]` | — | inbox (Ventas), `content-sales-attribution.ts` |
| `getMessages` | GET | `/inbox/conversations/{id}/messages?accountId=` | — | inbox |
| `sendMessage` | POST | `/inbox/conversations/{id}/messages` body `{message, accountId}` | — | inbox (`sendZernioMessageAction`) |
| `listComments` | GET | `/inbox/comments[?accountId=]` | — | `/comentarios`, Embudos (triggers), `content-sales-attribution.ts` |
| `getPostComments` | GET | `/inbox/comments/{postId}?accountId=&limit=25&cursor=` | ✓ | detalle de pieza, `lib/sales/lead-journey.ts` |
| `replyToComment` | POST | `/inbox/comments/{postId}` body `{accountId, commentId, message}` | — | `/comentarios` |
| `hideComment` | POST | `/inbox/comments/{postId}/{commentId}/hide` | — | `/comentarios` |
| `getLinkedAds` | GET | `/ads?effectiveInstagramMediaId=&source=all&limit=10` | ✓ | tab Anuncios de la pieza |
| `listAds` | GET | `/ads?source=all&limit=100&status=&platform=&fromDate=&toDate=` | ✓ | `/marketing/anuncios`, cron `capture-ad-metrics` (limit 200) |
| `listPublishedPosts` | GET | `/posts?status=published&limit=50&source=zernio&profileId=&accountId=&type=` | ✓ | sync (source=external, limit=200) |
| `listInstagramStories` | GET | `/accounts/{accountId}/instagram/stories` | ✓ (404/405/400 → `[]`) | sync |
| `syncExternalStories` | POST | `/posts/sync-stories` body `{accountId}` | ✓ (404/405/400 → `[]`) | sync. Según el comentario del código devuelve 405 en prod |
| `syncExternalPosts` | POST | `/posts/sync-external` body `{accountId}` | ✓ | sync |
| `getMediaPresignedUrl` | POST | `/media/presign` body `{filename, contentType}` → `{uploadUrl, fileUrl}` | ✓ | `publish-reel-variation` |
| `createPost` | POST | `/posts` body `{profileId, platform, postType, status, content, accountId?, mediaItems?}` | — | Trial Reels, `publishVariantAsZernioDraftAction` |
| `getPostAnalytics` | GET | `/analytics?postId=` | ✓ | cron de métricas |
| `listPostAnalytics` | GET | `/analytics?source=all&limit=50&accountId=&platform=&profileId=` | ✓ | nadie |
| `getAccountAnalytics` | GET | `/analytics/account/{accountId}?startDate=&endDate=` | — | nadie |
| `getPostsAnalytics` | GET | `/analytics/posts` | — | nadie |

`client.ts` sólo exporta `createZernioClient(apiKey)`: no hay cliente con key global. Analytics:
usar siempre `resolvePostAnalytics` (`lib/zernio/resolve-analytics.ts`), que devuelve
`{ metrics, lastUpdated, recognized }` y reconoce formato plano o anidado por plataforma
(`{instagram:{…}}` o `{platforms:{…}}`, que suma). `profileId` siempre por `extractProfileId()`
(`lib/zernio/profile-id.ts`); `getZernioIntegrationForOrg` corrige en la base los valores legacy guardados
como JSON.

## Reglas de negocio y decisiones no obvias

- **Comentarios y anuncios son live-fetch.** No persistirlos. Excepción única: `ad_metrics_daily`, porque sin
  la foto diaria el histórico de gasto no se puede reconstruir.
- **Un analytics no reconocido no es un cero.** Ni el cron ni la sync de contenido (`sync-actions.ts`) pisan
  métricas si `recognized=false`: una pieza nueva queda con `metrics` en null y una existente conserva las
  suyas (`lib/zernio/metricas-para-guardar.ts`, SCRUM-172). Lo mismo con la sync de YouTube por Google: si YouTube
  no devuelve el detalle de un video (cuota o token), la pieza nueva queda con `metrics` en null y la existente conserva
  las suyas (`metricasDeVideoParaGuardar`, `lib/youtube/video-metrics.ts`). Ojo: `views` cae a `impressions || reach` si Zernio no manda `views`.
- **La cola del cron de métricas no se traba ni se diluye con piezas sin dato** (SCRUM-172, reabierta;
  reglas en `lib/marketing/cola-de-metricas.ts`). `metrics_checked_at` es la fecha del último intento de medir la
  pieza, con o sin dato; `metrics_updated_at`, la de las métricas guardadas. El lote diario de 50 se arma así:
  1. Piezas nuevas (`metrics_checked_at` null): se miden primero. Una historia recién entra a las 30 h.
  2. Piezas con métricas: se refrescan, la que hace más tiempo que no se intenta primero.
  3. Piezas ya intentadas sin dato (nunca historias): sólo si venció `metrics_reintentar_desde`, y a lo sumo 10 lugares si hay
     piezas con métricas esperando (si sobran lugares, los ocupan).
  - Sin dato, la pieza suma `metrics_intentos_sin_dato` y espera 1, 2, 4, 8 y después 16 días. Con métricas,
    vuelve a 0 y sin espera. Un error del pedido (429, red) marca el intento pero no suma espera.
  - **Una historia se mide una sola vez.** Meta sólo expone historias vigentes (24 h) y Zernio guarda sus
    métricas con el webhook `story_insights` al vencer (`lib/zernio/client.ts`): antes no hay números finales y
    después no cambian. La historia entra a la cola a las 30 h (6 h de margen para el webhook), se pide una vez y,
    con o sin dato, queda con `metrics_reintentar_desde = infinity`. Un error pasajero no la marca y se vuelve a
    pedir al día siguiente. Al empezar cada corrida, una sola consulta cierra sin pedirlas las historias abiertas
    de más de 72 h o sin `published_at`. Costo: un pedido por historia; con 100 reels y 8 historias por día cada
    reel se refresca cada 2,4 días.
  - El refresco manual de piezas puntuales (`contentPieceIds`) no mira esperas.
  - La sync de contenido y la de YouTube no tocan estas columnas: una pieza nueva entra con null y el cron la
    mide primero.
- **Quien lee `metrics` no trata "sin dato" como cero.** Una pieza con `metrics` en null no se midió. El ranking
  de la tool `get_top_performing_content` la deja afuera y devuelve `piezas_sin_metricas`
  (`lib/marketing/ranking-de-contenido.ts`); el reporte de patrones promedia sólo sobre piezas medidas y le dice
  a la IA "sin métricas todavía"; las tools `get_marketing_overview` y `get_business_snapshot` promedian sobre
  piezas medidas y cuentan las que no tienen dato (`lib/marketing/metricas-medidas.ts`). El ranking se calcula
  sobre todas las piezas de la org, paginando con `fetchAllRows`. En la grilla,
  al ordenar por views o engagement, las piezas sin métricas van al final (`lib/marketing/orden-de-piezas.ts`).
- **Historias primero en el dedupe.** `GET /posts?type=story` de Zernio no filtra: usarlo para tipar
  convierte reels en historias. Sólo `listInstagramStories` es confiable y cubre las **últimas 24 h** (Meta
  no expone más). Historias con ID interno de Zernio se guardan como `zstory_<id>`.
- **IDs de plataforma:** `platform_post_id` es el media ID de Instagram (o video ID de YouTube, o el ID de
  Zernio de un borrador publicado). `resolveContentPieceRow` acepta UUID interno o ID de plataforma.
- **Throttle de 30 min basado en `updated_at`:** cualquier update (vincular Drive, analizar) también lo
  refresca y posterga la próxima sync.
- **Trial Reels salen como borrador en Zernio** (`status: "draft"`). Decisión registrada en
  `docs/historial/CHANGES-2026-07-a-08.md` (entrada 2026-08-10):
  para reels de Instagram Zernio pide terminar la publicación desde su UI. En Limitless la variación queda `published`.
- **El worker procesa sincrónicamente** y responde 200 aun si falla (el job ya queda `failed`): un 5xx haría
  reintentar a QStash. Idempotencia: si el job no está `pending`, se saltea.
- **Holding:** content, sync, Drive y Trial Reels resuelven la org con `getCurrentProfile().organization_id`
  en vez de `requireOrganizationId()`, así que **ignoran el negocio activo** del holding (auditoría §3 salud 7).
  El resto del área (overview, ads, comentarios, forms, UTMs, lead magnets) usa `requireOrganizationId()`.
- **Sin key global de Zernio:** `getZernioApiKeyForOrganization` devuelve sólo la key de la integración activa de
  la org (`is_active = true` y `api_key` no nulo); si no hay, devuelve `null` y `getZernioClientForOrganization` tira
  "Zernio no está conectado". No existe `ZERNIO_API_KEY`: una org sin Zernio nunca lee datos de otra cuenta. El cron
  `capture-ad-metrics` recorre sólo integraciones activas y con key; las actions de inbox y comentarios exigen
  `api_key` además de la fila activa. Tests: `lib/zernio/__tests__/integration.test.ts`,
  `lib/marketing/__tests__/ad-metrics-snapshot-orgs.test.ts`.
- **Scope Google:** `drive.readonly`; por eso `createDriveFolderAction` es un stub que siempre tira error
  (el botón "Nueva carpeta" de Administrar falla siempre). Se pide `youtube.upload` y ningún código lo usa.
- **UTM:** `youtube_video_id` debe ser el external id de YouTube; `resolveYoutubeVideoExternalId` convierte el
  UUID de `content_assets` si llega. La atribución de booking/venta es por coincidencia de email o nombre.
- **Overview y Conexión con Ventas leen fuentes legacy:** los KPIs, funnel y heatmap del Overview salen de
  `content_assets` (sólo Instagram Graph); el ranking de Conexión con Ventas sale de `conversations` (inbox
  legacy, **0 filas en prod**). Con Zernio sólo, esas pantallas quedan vacías. Existe
  `lib/marketing/content-sales-attribution.ts` (atribución vía Zernio a `content_pieces.sales_attributed`) pero
  `updateSalesAttributionAction` no tiene callers.

## Limitaciones conocidas y deuda

- Content ignora el negocio activo del holding `[MKT-HOLDING-ORG]`.
- Música propia de Trial Reels nunca llega al worker (zod la descarta) y no hay pantalla para subirla `[TRIAL-REELS-MUSICA]`, `[TRIAL-4]`.
- `WORKER_AUTH_SECRET` viaja en la URL de QStash y se loguea `[TRIAL-SECRET-EN-URL]`.
- Overview y Conexión con Ventas sobre tablas legacy `[MKT-OVERVIEW-LEGACY]`, `[MKT-SALES-CONN-VACIA]`.
- YouTube sin cron y métricas congeladas `[YT-SIN-CRON]`.
- `cleanup-trial-reels` reprocesa los mismos jobs para siempre `[TRIAL-CLEANUP-LOOP]`.
- Código huérfano: `marketing-subnav.tsx`, `marketing-content-library.tsx`, `marketing-content-detail.tsx`,
  `youtube-video-performance.tsx` (y con ellos el minuto de CTA / retención de YouTube y la etiqueta manual),
  `marketing-charts.tsx`, `instagram-empty-state.tsx`, `overview/conversion-strip.tsx`,
  `overview/marketing-stat-card.tsx`, `overview/metrics-sections.tsx` (con fallback a mocks), `overview/rate-bar.tsx`,
  `overview/index.ts`, `reel-music-upload.tsx`; por arrastre, `content-platform-metrics.tsx`, `cta-minute-input.tsx`,
  `content-label-badge.tsx`; acciones sin caller:
  `publishVariantAsZernioDraftAction`, `generateVariantCaptionAction`,
  `deleteContentPieceAction`, `updateSalesAttributionAction`, `syncZernioMetricsAction`,
  `getContentPatternsAnalysisAction`, `getContentLabelDistributionAction`, `getInstagramIntegrationStatusAction`,
  `getContentAssetByIdAction`, `getUtmBaseUrlAction`, `getUTMLeadsAction`, `getDriveFileAction`,
  `getDriveFolderPathAction`, `searchDriveFilesAction`, `getReelMusicPathAction`, `getReelVariationJobAction`,
  `syncInstagram*Action` `[MKT-CODIGO-MUERTO]`.

Detalle y prioridades: `PENDIENTES.md` (entregado al integrador del backlog).

## Tests

| Qué | Archivo |
|---|---|
| Mapeo y dedupe de la foto diaria de anuncios | `apps/web/lib/marketing/__tests__/ad-metrics-snapshot.test.ts` |
| Cola del cron de métricas: nuevas primero, piezas medidas antes que reintentos, espera creciente, historias una sola vez, simulación de 40 días con 5, 8 y 15 historias por día | `apps/web/lib/marketing/__tests__/sync-content-metrics.test.ts`, `cola-de-metricas.test.ts` |
| Lectores sin ceros inventados: promedios, ranking y prompt de patrones | `apps/web/lib/marketing/__tests__/metricas-medidas.test.ts`, `ranking-de-contenido.test.ts`, `patrones-de-contenido.test.ts`, `orden-de-piezas.test.ts`, `apps/web/app/marketing/content/__tests__/top-performing-content.test.ts` |
| Tools del agente con piezas sin métricas | `apps/web/lib/agent/__tests__/contenido-sin-metricas.test.ts`, `top-contenido-tool.test.ts` |
| Triggers de comentarios Zernio (Embudos) | `apps/web/lib/zernio/__tests__/triggers.test.ts` |
| `/api/cron/sync-content-metrics` pasa sin sesión y `/api/content/analyze` exige sesión (`isPublicPath`; `/api/utm/*` no tiene caso de test) | `apps/web/lib/supabase/__tests__/public-paths.test.ts` |

Sin cubrir: `resolve-analytics.ts` `[T-11]`, `lib/utm/*` `[T-5]`, `overview-metrics.ts` `[T-12]`,
`lib/typeform` y el mapeo de la sync de contenido. `apps/reel-worker` no tiene tests. No hay e2e del área
(el único spec de `apps/web/e2e/` es `holding.spec.ts`).

## Archivos clave

1. `apps/web/lib/zernio/client.ts` — todas las llamadas a Zernio
2. `apps/web/lib/zernio/integration.ts` — key por org (sin fallback global), lookup por account/profile
3. `apps/web/lib/zernio/resolve-analytics.ts` — normalización de métricas
4. `apps/web/app/marketing/content/sync-actions.ts` — sync de contenido e historias
5. `apps/web/lib/marketing/sync-content-metrics.ts` + `app/api/cron/sync-content-metrics/route.ts`
6. `apps/web/app/marketing/content/actions.ts` — piezas, análisis IA, variantes
7. `apps/web/app/marketing/content/reel-variation-actions.ts` — Trial Reels (lado web)
8. `apps/reel-worker/src/index.ts`, `processor.ts`, `ffmpeg-variants.ts` — worker Fly.io
9. `apps/web/app/api/queue/publish-reel-variation/route.ts` — publicación a Zernio
10. `apps/web/app/marketing/actions.ts` — overview, distribución, Conexión con Ventas
11. `apps/web/app/marketing/utm-actions.ts`, `apps/web/lib/utm/*`, `app/api/utm/*`
12. `apps/web/app/forms/actions.ts`, `lib/typeform/sync.ts`, `lib/google-forms/sync.ts`
13. `apps/web/app/marketing/content/ad-actions.ts`, `lib/marketing/ad-metrics-snapshot.ts`
14. `apps/web/app/integrations/zernio/actions.ts` (comentarios) y `app/api/integrations/zernio/webhook/route.ts`

## Lo que ya no existe

- `/sales/marketing-insights/**` (redirige vía `lib/navigation/redirects.ts`) y el subnav de Marketing.
- La carga de música de Trial Reels en `/integrations` (se sacó; el componente quedó sin montar).
- El fallback en la lambda `/api/queue/process-reel-variations` existe pero exige `sourceStoragePath`, que la
  acción ya no manda (sólo Drive): sin `REEL_WORKER_URL`, la lambda responde 400 y el job queda en `pending`.

## Escondido para el release de octubre (SCRUM-490)

Banderas en `apps/web/lib/release/escondido.ts`:
- **Overview** (`marketingOverview`): fuera del menú y del ⌘K; `/marketing` redirige a Contenido, que pasa a ser la
  entrada del módulo (`[MKT-OVERVIEW-LEGACY]`).
- **Conexión con Ventas** (`marketingConexionVentas`): `/marketing/sales-connection` redirige a Contenido y el detalle
  de una pieza no muestra "Atribución de ventas".
- **"Nueva carpeta"** en Administrar (`marketingNuevaCarpeta`, `[MKT-DRIVE-CARPETA]`).
- **Lead Magnets** (`leadMagnetsCanalesSinCaptura`): al crear sólo se ofrecen DM de Instagram (viene elegido) y
  Manual (`lib/marketing/lead-magnet-canales.ts`). Los ya guardados con otro canal se muestran igual
  (`[MKT-LEAD-MAGNETS-CAPTURA]`).

# Integraciones

> Verificado contra el código el 2026-09-23 (commit 038caca): `apps/web/lib/integrations/registry.ts`, `app/api/integrations/*`, `app/api/webhooks/*`, `apps/web/vercel.json` y conteo de filas de las tablas `*_integrations` en producción. Reemplaza a `docs/archivo/INTEGRACIONES_MAPA.md` (archivado). Backlog: `PENDIENTES.md` § Infraestructura y el § de cada área.

## Cómo está armado

- **`constants/integrations.ts`** tiene los 21 ids de proveedor.
- **`lib/integrations/registry.ts`** es el registro único: por proveedor, categoría, autenticación, flujos de datos (`in`/`out`, tabla destino, transporte), qué módulos alimenta, superficie de conexión (`redirect`/`dialog`/`panel`), doc local y si se lista en la pantalla (con `unlistedReason` obligatorio si no). La pantalla `/integrations` se arma sola a partir de esto.
- **`lib/integrations/health.ts`** es el estado en vivo (conectada, última sync, incidencias). `getIntegrationsOverviewAction` en `app/integrations/actions.ts` devuelve un `IntegrationHealth` por proveedor.
- **`lib/integrations/brand-colors.ts`** + `public/integrations/<id>.{svg,png}` para la marca.
- Cada proveedor tiene su cliente en `lib/<proveedor>/` y sus credenciales en `<proveedor>_integrations` (sin lectura para el usuario; ver `docs/arquitectura/seguridad.md`).

Para agregar una: id en `constants/integrations.ts` → entrada en el registro → color y logo → `IntegrationHealth` en `getIntegrationsOverviewAction`. `lib/integrations/__tests__/health.test.ts` (23 tests) falla si falta alguno de los primeros pasos.

Cuatro formas de que entren los datos (el registro suma una quinta, `oneshot`, para la importación puntual de ClickUp), que deciden qué tan fresco está cada número:

| Transporte | Significa |
|---|---|
| Webhook | el proveedor avisa; lo más fresco y lo único que sirve si el proveedor no guarda historial (GHL) |
| Cron | Limitless consulta cada tanto (`vercel.json`) |
| Manual | lo dispara alguien desde la pantalla; para catálogos que cambian poco |
| En vivo | no se persiste; se consulta al abrir la pantalla (inbox y comentarios de Zernio, anuncios, Drive, atribución de Hyros, stats de VTurb) |

Lo que se consulta en vivo **no se duplica en la base a propósito**. Excepción: `ad_metrics_daily`, porque sin snapshot diario no hay histórico de Spend.

`last_sync_at` significa "últimos datos recibidos", no "última consulta": varios syncs sólo lo escriben cuando ingestaron algo. No derivar alarmas de su antigüedad.

## Mapa de proveedores

Estado: **activo** = listado y con integraciones en prod; **sin uso** = listado pero 0 integraciones en prod; **legacy** = no listado, reemplazado; **sin probar** = nunca verificado contra una cuenta real (ver `PENDIENTES.md`). Filas = integraciones conectadas en prod el 2026-09-23.

### Ventas y conversaciones

| Proveedor | Para qué | Transporte | Rutas | Tablas | Áreas | Estado |
|---|---|---|---|---|---|---|
| **Zernio** | Inbox IG/WhatsApp, contenido publicado y métricas, comentarios, anuncios de Meta | API key por org (cifrada) · en vivo + cron + webhook | `/api/integrations/zernio/webhook`; actions en `app/integrations/zernio/`, `app/marketing/content/` | `zernio_integrations`, `content_pieces`, `ad_metrics_daily`, `zernio_messages`, `zernio_comments`, `zernio_conversation_analysis` | [ventas](../areas/ventas.md), [marketing](../areas/marketing.md), [embudos](../areas/embudos.md) | activo (9). El webhook responde 503 en prod: falta `ZERNIO_WEBHOOK_SECRET` |
| **ManyChat** | DMs de Instagram con scoring de IA | API key · webhook External Request con token en la URL | `/api/integrations/manychat/webhook/[token]`, `/reanalyze` | `manychat_integrations`, `conversations`, `manychat_events` | [ventas](../areas/ventas.md) | listado, 4 integraciones, 0 conversaciones en prod |
| **Calendly** | Turnos agendados/cancelados → llamadas de cierre | OAuth (org y por closer) · webhook + 2 crons horarios | `/api/integrations/calendly/{oauth,closer,webhook}`, `/api/cron/calendly-sync{,-closers}` | `calendly_integrations`, `closing_calls` | [ventas](../areas/ventas.md) | activo (3) |
| **GoHighLevel** | Turnos del calendario (alternativa a Calendly) y oportunidades del pipeline | API key de sub-cuenta (cifrada) · cron + webhook + manual | `/api/webhooks/ghl`, `/api/cron/ghl-sync`; actions en `app/ghl/` | `ghl_integrations`, `closing_calls`, `ghl_pipelines`, `ghl_pipeline_stages`, `ghl_opportunities`, `ghl_stage_transitions`, `ghl_webhook_events` | [ventas](../areas/ventas.md), [embudos](../areas/embudos.md) | activo (6); webhooks de oportunidades sin probar |
| **Fathom** | Grabaciones y transcripciones de llamadas; análisis IA; 1-1 por link compartido | API key por org o por miembro (cifrada) · cron + webhook + manual | `/api/integrations/fathom/{connect,sync,process,reanalyze,webhook,webhook/[token]}`, `/api/queue/process-fathom-analysis` | `fathom_integrations`, `team_member_integrations`, `fathom_calls`, `call_analyses`, `client_identities` | [ventas](../areas/ventas.md), [clientes](../areas/clientes.md), [agente-ia](../areas/agente-ia.md) | activo (7) |
| **Unipile** (WhatsApp / IG DMs) | Inbox personal | OAuth hosted auth · webhook | `/api/integrations/unipile/*`, `/api/webhooks/unipile` | `unipile_integrations`, `conversations` | [ventas](../areas/ventas.md) | legacy (reemplazado por Zernio), 6 filas en prod |

### Marketing y contenido

| Proveedor | Para qué | Transporte | Rutas | Tablas | Áreas | Estado |
|---|---|---|---|---|---|---|
| **Ecosistema Google** (Drive + Forms + YouTube) | Archivos de Drive, formularios, carpetas creadas desde Contenido | OAuth · en vivo (Drive) + cron (Forms) | `/api/integrations/google-forms/{oauth,sync}`, `/api/integrations/google/thumbnail` | `google_forms_integrations`, `forms`, `form_responses` | [marketing](../areas/marketing.md), [agente-ia](../areas/agente-ia.md) | activo (3) |
| **YouTube** | Videos del canal y métricas | OAuth dentro del ecosistema o API key propia · sync al conectar y manual (**no hay cron**, aunque el registro dice `cron`) | `/api/integrations/youtube/oauth/*`; `app/youtube/actions.ts` | `youtube_integrations`, `content_pieces` (el registro dice `content_assets`) | [marketing](../areas/marketing.md) | activo (2) |
| **Typeform** | Formularios, respuestas y calificación de leads | OAuth · cron horario | `/api/integrations/typeform/{oauth,sync}` | `typeform_integrations`, `forms`, `form_responses` | [marketing](../areas/marketing.md) | sin uso (0) |
| **Google Forms suelto** | Igual que el ecosistema, sin Drive | OAuth · cron | mismas de google-forms | ídem | [marketing](../areas/marketing.md) | no listado: se conecta por el ecosistema |
| **Instagram Graph** | Contenido y DMs por la app de Meta propia | OAuth · crons cada hora y cada 5 min + webhook | `/api/integrations/instagram/{connect,callback,sync,poll}`, `/api/webhooks/instagram/messages` | `instagram_integrations`, `content_assets`, `instagram_messages`, `instagram_threads`, `conversations` | [marketing](../areas/marketing.md), [ventas](../areas/ventas.md) | legacy (1 integración; los crons siguen corriendo) |

### Medición de embudos

| Proveedor | Para qué | Transporte | Tablas | Áreas | Estado |
|---|---|---|---|---|---|
| **VTurb** | Reproducciones, retención y llegadas al CTA del VSL | API key (cifrada) · catálogo manual + stats en vivo con caché | `vturb_integrations`, `vturb_players`, `vturb_stats_cache` | [embudos](../areas/embudos.md) | sin uso (0), sin probar |
| **WebinarJam / EverWebinar** | Registrados, asistencia, permanencia hasta la oferta | API key (cifrada; requiere aprobación del proveedor) · manual | `webinarjam_integrations`, `webinarjam_webinars`, `webinarjam_registrants` | [embudos](../areas/embudos.md) | sin uso (0), sin probar |
| **Zoom Webinars** | Registro de leads con link personal y asistencia por sesión (alternativa a WebinarJam) | **No construido.** Evaluación en [`external-apis/zoom/RESUMEN-LIMITLESS.md`](../external-apis/zoom/RESUMEN-LIMITLESS.md): OAuth de app admin-managed publicada (o S2S por cliente) · webhooks + reporte | — | [embudos](../areas/embudos.md) | no construido; veredicto provisorio luz verde condicionada (SCRUM-531), falta probar con cuenta real |
| **Hyros** | Atribución por fuente y ROAS por fuente | API key (cifrada) · cuentas manual + reporte en vivo con caché | `hyros_integrations`, `hyros_ad_accounts`, `hyros_attribution_cache` | [embudos](../areas/embudos.md), [operaciones](../areas/operaciones.md) (reportes) | sin uso (0), sin probar |

Las tres dicen "sin datos" en vez de un número equivocado cuando falta configuración del lado del proveedor (pitch time en VTurb, segundo de la oferta en WebinarJam, cuentas publicitarias en Hyros), y la pantalla de Integraciones lo muestra como incidencia.

### Cobros

| Proveedor | Para qué | Transporte | Rutas | Tablas | Áreas | Estado |
|---|---|---|---|---|---|---|
| **Whop** | Cobros, reembolsos, altas de membresía | Webhook Standard Webhooks, secreto `ws_…` por org (cifrado) | `/api/webhooks/whop`; actions `app/payments/` | `payment_integrations`, `payment_transactions`, `payment_orders`, `payment_webhook_events` | [embudos](../areas/embudos.md), [finanzas](../areas/finanzas.md) | sin uso (0), mapeo sin verificar con eventos reales |
| **Commas** (ex Fanbasis; id `fanbasis`) | Cobros, reembolsos, suscripciones | Webhook HMAC por org | `/api/webhooks/fanbasis` | ídem | ídem | ídem |
| **Stripe** | Cobros vía Stripe Connect | OAuth · lectura en vivo (no hay ruta de webhook) | `/api/integrations/stripe/{connect,callback,disconnect}` | `stripe_integrations` | [finanzas](../areas/finanzas.md) | no listado (0) |
| **Mercado Pago** | Cobros y saldo estimado | OAuth (tokens cifrados) · webhook + cron de refresh de token | `/api/integrations/mercadopago/*`, `/api/webhooks/mercadopago`, `/api/cron/mercadopago-token-refresh` | `mercadopago_integrations` | [finanzas](../areas/finanzas.md) | no listado (0) |

Whop y Commas usan convenciones opuestas (Whop: decimales en la moneda, `settlement_amount`; Commas: centavos, `amount_cents`). El mapeo es por proveedor en un solo archivo (`lib/payments/normalize.ts`), nunca por heurística de nombre de campo. El payload crudo se guarda antes de interpretarlo.

### Operación y datos

| Proveedor | Para qué | Transporte | Rutas | Tablas | Áreas | Estado |
|---|---|---|---|---|---|---|
| **Discord** | Mensajes de canales de clientes, testimonios, sugerencias de hitos | Bot OAuth (instalación) + proceso permanente en Railway que escribe con service role y llama a `/api/discord/*` | `/api/integrations/discord/{oauth/start,callback}`, `/api/discord/*`, cron `daily-signals` | `discord_integrations`, `discord_messages`, `discord_client_links`, `discord_channel_clients`, `discord_team_members`, `discord_pending_links` | [discord](../areas/discord.md), [clientes](../areas/clientes.md) | activo (2) |
| **ClickUp** | Importación puntual de clientes con mapeo de campos | Token pedido en el momento · one-shot, no guarda conexión | `app/integrations/clickup/import-actions.ts` (cliente en `lib/clickup/`) | `clients` | [clientes](../areas/clientes.md) | activo (su tarjeta nunca dice "conectada") |

### Servicios de plataforma (fuera del registro)

| Servicio | Para qué | Config | Área |
|---|---|---|---|
| Supabase | base, auth, storage, realtime | `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY` | [plataforma](../areas/plataforma.md) |
| Anthropic | todos los pipelines de IA; BYOK por org | `ANTHROPIC_API_KEY`, `organizations.claude_api_key_encrypted` | [agente-ia](../areas/agente-ia.md) |
| OpenAI | embeddings del RAG, Whisper | `OPENAI_API_KEY` | [agente-ia](../areas/agente-ia.md) |
| Upstash QStash | cola HTTP | `QSTASH_*`, `WORKER_AUTH_SECRET` | `docs/arquitectura/jobs-webhooks-y-colas.md` |
| Resend | emails de bienvenida, waitlist | `RESEND_*` | [plataforma](../areas/plataforma.md) |
| Meta Pixel / Conversions API | eventos de `/prueba` y waitlist | `NEXT_PUBLIC_META_PIXEL_ID`, `META_CONVERSIONS_API_TOKEN` | [marketing](../areas/marketing.md) |
| Miro | lectura de tableros para el "cerebro de IA" del super-admin | `MIRO_ACCESS_TOKEN` | [plataforma](../areas/plataforma.md) |
| Google Drive del super-admin | documentos del super-admin | `SUPER_ADMIN_GOOGLE_REDIRECT_URI`, `super_admin_google_tokens` | [plataforma](../areas/plataforma.md) |
| Sentry | errores | `SENTRY_*` | `docs/arquitectura/jobs-webhooks-y-colas.md` |
| Fly.io / Railway | reel-worker / discord-bot | ver `docs/operacion/entorno-y-deploy.md` | |

## Diferencias entre el registro y el código

El registro es lo que pinta la pantalla; donde discrepa con el código, el código es lo que pasa:

| Registro dice | Código hace |
|---|---|
| YouTube: `transport: cron`, destino `content_assets` | No hay cron de YouTube en `vercel.json`; `lib/google/sync-youtube.ts` escribe `content_pieces` y corre al conectar y a mano |
| Discord: mensajes por `webhook` | El bot escribe `discord_messages` directo con service role; `/api/discord/message` es un stub |
| Stripe / Mercado Pago: cobros → `payments` por webhook | No existe tabla `payments`; Stripe no tiene webhook; MP tiene webhook pero sin tabla de destino propia |
| `docs/archivo/INTEGRACIONES_MAPA.md` (archivado): Discord "no se ofrece" | `listed: true` |

Ver `[INTEGRACIONES-REGISTRO-DESALINEADO]` en pendientes.

## Documentación local de APIs externas

`docs/external-apis/` tiene copias navegables de la documentación oficial, capturadas el 2026-08-30 (Fathom después), porque el entorno remoto bloquea varios dominios de documentación:

| Carpeta | Proveedor | Contenido |
|---|---|---|
| `gohighlevel/` | GHL (API v3 / Marketplace) | 948 páginas, 634 endpoints, 77 webhooks |
| `vturb/` | VTurb Analytics | `openapi.json` con 28 endpoints |
| `whop/` | Whop | 3 specs OpenAPI, ~450 endpoints |
| `commas/` | Commas (ex Fanbasis) | 36 endpoints |
| `hyros/` | Hyros | 3 specs OpenAPI, 51 endpoints, 10 webhooks |
| `webinarjam/` | WebinarJam / EverWebinar | 17 artículos, 10 endpoints |
| `fathom/` | Fathom | referencia de API |

Cómo usarla:
1. Empezar por `docs/external-apis/<proveedor>/RESUMEN-LIMITLESS.md`: lo que Limitless usa de ese proveedor, con sus trampas. Después `INDEX.md` o `ENDPOINTS*.md`.
2. Cada archivo tiene la URL de origen en el front-matter; si algo no cierra, manda la fuente viva.
3. Si falta un proveedor, probar su URL y buscar un spec OpenAPI; bajarlo con `docs/external-apis/tools/regenerar.sh` como modelo (hay un `build_<proveedor>.py` por cada uno, salvo Fathom, que se bajó con la lista `tools/fathom-urls.txt` y no está en `regenerar.sh`) y commitearlo.
4. Si no se puede leer la documentación oficial, registrar lo asumido en `docs/integraciones/apis-sin-documentacion.md`, persistir el payload crudo antes de interpretarlo, nunca inventar un valor (lo no entendido queda `unmapped` con motivo) y aislar el mapeo en un archivo por proveedor.

Zernio, Calendly, ManyChat, Typeform, Google, Meta, Stripe, Mercado Pago, Unipile y Discord **no** tienen copia local.

## Archivos clave

- `apps/web/lib/integrations/registry.ts`, `health.ts`, `brand-colors.ts`, `cron-auth.ts`, `oauth-redirect.ts`
- `apps/web/constants/integrations.ts`
- `apps/web/app/integrations/actions.ts` (`getIntegrationsOverviewAction`)
- `apps/web/app/(platform)/integrations/`, `apps/web/components/integrations/`
- `apps/web/lib/<proveedor>/` (cliente, integración, sync)
- `docs/external-apis/README.md`, `docs/integraciones/apis-sin-documentacion.md`

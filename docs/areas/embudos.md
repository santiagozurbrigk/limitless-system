# Embudos y Lanzamientos

> Verificado contra el código el 2026-09-23 (commit 038caca). Backlog del área: `PENDIENTES.md` § Embudos.
> Specs de diseño (no se reescriben, el código las cita por número de sección):
> [`../specs/FUNNELS_ARCHITECTURE.md`](../specs/FUNNELS_ARCHITECTURE.md) y
> [`../specs/FUNNELS_SOURCE_MAP.md`](../specs/FUNNELS_SOURCE_MAP.md).
> Suposiciones de APIs sin verificar: [`../integraciones/apis-sin-documentacion.md`](../integraciones/apis-sin-documentacion.md).

## Qué es

**Embudos** es un módulo de medición: toma los números que ya viven en otras partes
(anuncios, inbox, llamadas, formularios, pagos) y los que traen integraciones propias
(GHL, VTurb, WebinarJam, Hyros, Whop, Commas) y los ordena en las **7 etapas del spine**
del documento *Funnel Metrics Standard v1.0*. Cada embudo es una **instancia** de una
**plantilla en código** (webinar, VSL book-a-call, DM). Lo usa el founder para ver si un
embudo funciona (KPIs), dónde se rompe (spine) y el detalle paso por paso con la fuente
de cada cifra.

**Qué NO hace:** no carga datos a mano (decisión 3 de la spec: webinar y VSL "sí o sí con
integración"), no pinta semáforos de salud (el motor existe, la UI está en pausa —
`[EMBUDOS-SALUD]`), no guarda historia de embudos (no hay snapshots) y no reparte
spend ni revenue por embudo: **las medidas de dinero y anuncios son de la org entera**
(ver "Reglas").

**Lanzamientos** está **apagado en la UI** (placeholder "Próximamente"); ver la sección
propia al final.

## Pantallas y rutas

| Ruta | Archivo | Qué muestra |
|---|---|---|
| `/funnels` | `apps/web/app/(platform)/funnels/page.tsx` | Índice: tarjetas con "N de M pasos con fuente" (no resuelve números a propósito), formulario de alta, y la lista de herramientas `partial`/`missing` con su `otcNote` |
| `/funnels/[funnelId]?period=7d\|30d\|90d` | `apps/web/app/(platform)/funnels/[funnelId]/page.tsx` | Detalle genérico: switcher, período, avisos de instrumentación, 3 punteros de la plantilla, KPIs universales, spine, tabla de pasos |
| `/funnels/[funnelId]/configurar` | `apps/web/app/(platform)/funnels/[funnelId]/configurar/page.tsx` | Binding paso → fuente, con selector de etapa GHL / video VTurb / webinar / formulario |
| `/lanzamientos`, `/lanzamientos/[id]` | `apps/web/app/(platform)/lanzamientos/*` | Placeholder "Próximamente". El item de nav está `disabled` |
| `/integrations` (sección de cada proveedor) | `apps/web/components/integrations/settings/{ghl-opportunities,vturb,webinarjam,hyros,payment}-settings.tsx` | Conexión, sync manual, secreto del webhook de GHL, pitch time de webinars |

- Navegación: `embudosDirectModule` en `apps/web/lib/navigation/sidebar-modules.ts`. **No es
  add-on**: aparece siempre y lo filtra el permiso `funnels`. El `AddOnId` `"embudos"`
  sigue declarado en `lib/auth/add-on-ids.ts` sólo por compatibilidad.
- Permiso: `permissionModuleForPath` mapea `/funnels` y `/lanzamientos` al módulo `funnels`
  y `app/(platform)/layout.tsx` bloquea la página. **Las server actions no chequean el
  permiso** (sólo `requireOrganizationId()`).
- `paths.platform.funnels.comparar` existe en `routes/paths.ts` pero **no hay página**.

## Modelo de datos

Todas las tablas tienen `organization_id` y RLS `organization_id = get_my_organization_id()`.
Las tablas que alimenta una integración son **sólo lectura** para miembros (escribe el
service role); las de credenciales y las de eventos crudos de webhook (`payment_webhook_events`,
`ghl_webhook_events`, con `organization_id` nullable) tienen RLS activo pero ninguna policy. Todas las migraciones del
área están aplicadas en producción (verificado con `list_migrations` el 2026-09-23).

### Núcleo del módulo — `20260829120000_funnels_phase1.sql`

| Tabla | Columnas clave | Notas |
|---|---|---|
| `funnel_instances` | `template_id` (texto, id de plantilla en código), `name`, `currency`, `price_point`, `product_id`, `reporting_timezone` (default `America/New_York`), `is_active` | RLS `FOR ALL` para miembros. Si la plantilla desaparece del código, la instancia se filtra |
| `funnel_step_bindings` | `funnel_instance_id`, `step_id`, `source_id`, `config` JSONB | `UNIQUE (funnel_instance_id, step_id)`. `config` según la fuente: `{stageId}`, `{playerId}`, `{webinarId}`, `{formId}` |
| `funnel_benchmarks` | `metric_id`, `benchmark` JSONB, `source` (`offer_override`\|`org_baseline`) | **Sin uso en código.** Pensada para la precedencia de benchmarks |
| `funnel_period_snapshots` | `period_start`, `granularity`, `step_counts`, `metrics`, `provenance` | **Sin uso en código.** Fase 5 (snapshots) no construida |

### Tablas que alimentan fuentes

| Tabla | Migración | Qué guarda | Quién escribe |
|---|---|---|---|
| `ad_metrics_daily` | `20260829180000` | Una fila por anuncio de Meta y día: `spend`, `impressions`, `reach`, `clicks`. `UNIQUE (org, metric_date, platform, ad_external_id)` | cron `capture-ad-metrics` |
| `payment_integrations` | `20260829200000` | `provider` (`whop`\|`fanbasis`), `webhook_secret_encrypted`, `api_key_encrypted` (se guarda, no se usa) | server actions de pagos |
| `payment_orders` / `payment_transactions` | idem | Órdenes (`contract_value`, `is_recurring`, `ordered_at`) y movimientos (`kind` payment\|refund, `amount`, `occurred_at`). `UNIQUE (org, provider, external_id)` | webhooks Whop/Commas |
| `payment_webhook_events` | idem | Payload crudo + `status` (`pending/processed/unmapped/error`). Índice único `(provider, external_event_id)` **sin org** | webhooks |
| `ghl_integrations` (+cols) | `20260824100000`, `20260826130621`, `20260830140000` | `api_key_encrypted` (PIT), `location_id`, calendarios, `webhook_secret_encrypted`, **`stage_history_since`** (borde del período ciego) | acciones GHL / ingest |
| `ghl_pipelines`, `ghl_pipeline_stages` | `20260830140000` | Catálogo, con `raw` | sync manual |
| `ghl_opportunities` | idem | **Estado actual** de cada oportunidad (última etapa conocida), `raw` | webhook |
| `ghl_stage_transitions` | idem | Historial propio: `kind` (`created`\|`stage_change`\|`status_change`), `from/to_stage_external_id`, `status`, `occurred_at` (= hora de recepción). Dedupe por `(org, external_event_id)` | webhook |
| `ghl_webhook_events` | idem | Crudo + `auth_path` + `status`. Índice único sobre `external_event_id` **global, sin org** | webhook |
| `vturb_integrations`, `vturb_players`, `vturb_stats_cache` | `20260830170000` | Key cifrada, `timezone` (default `America/Argentina/Buenos_Aires`), catálogo con `pitch_time`, caché de respuestas crudas por (player, rango) con `is_final` | acciones VTurb / resolver |
| `webinarjam_integrations`, `webinarjam_webinars`, `webinarjam_registrants` | `20260830190000` | Catálogo (`product` webinarjam\|everwebinar, `schedules`, `pitch_second` que carga el usuario) y personas (`signup_at`, `attended_*`, `*_watched_at`, `stayed_past_pitch`, UTMs, `raw`) | sync manual |
| `hyros_integrations`, `hyros_ad_accounts`, `hyros_attribution_cache` | `20260830210000` | Key, `attribution_model`, `accessible_account_id`; cuentas publicitarias; caché del reporte por (rango, modelo) | acciones Hyros / resolver |

Además el resolver lee tablas de otras áreas: `conversations` (inbox legacy),
`closing_calls`, `clients`, `client_payments`, `form_responses`/`forms`.

## Cómo fluye el dato

```
Plantilla (lib/funnels/templates/*.ts)          Bindings (funnel_step_bindings)
        │                                                │
        └──────────────► resolveFunnel() ◄───────────────┘   lib/funnels/resolve.ts (IO, sólo servidor)
                             │
     por step: resolveSource(sourceId, config)  ── Supabase (tablas de arriba)
                             │                  ── VTurb API (vía vturb_stats_cache)
                             │                  ── Hyros API (vía hyros_attribution_cache)
                             │                  ── Zernio listComments (live)
     por org:  resolveOrgMeasures()  ── payment_orders/transactions, ad_metrics_daily, Hyros
                             │
                     computeFunnel()  lib/funnels/compute.ts (puro)
                             │
           stages (skipped|no_data|measured) · metrics · transitions · kpis
```

**Entradas de datos del área:**

| Mecanismo | Ruta | Qué hace |
|---|---|---|
| Cron `30 5 * * *` | `app/api/cron/capture-ad-metrics/route.ts` → `lib/marketing/ad-metrics-snapshot.ts` | Pide los ads de Zernio del día anterior y hace upsert en `ad_metrics_daily`. `?date=YYYY-MM-DD` rellena un día; `?organizationId=` una sola org |
| Cron `0 * * * *` | `app/api/cron/ghl-sync/route.ts` → `lib/ghl/sync-pipeline.ts` | **Sólo citas** GHL → `closing_calls` (±90 días). No sincroniza pipelines ni oportunidades |
| Webhook | `app/api/webhooks/ghl/route.ts` → `lib/ghl/ingest-opportunity-event.ts` | Eventos `Opportunity*`: guarda crudo → normaliza → deriva transición contra `ghl_opportunities` → upsert estado → fija `stage_history_since` la primera vez |
| Webhook | `app/api/webhooks/whop/route.ts`, `app/api/webhooks/fanbasis/route.ts` → `lib/payments/ingest.ts` | Verifica firma, guarda crudo, normaliza (`lib/payments/normalize.ts`), upsert en `payment_orders`/`payment_transactions`. Sin integración activa: 404; conectado pero el secreto no se puede leer (`getWebhookSecret` → `unavailable`: clave maestra cambiada o base caída): 500 |
| Manual (botones en `/integrations`) | `app/ghl/opportunity-actions.ts`, `app/vturb/actions.ts`, `app/webinarjam/actions.ts`, `app/hyros/actions.ts` | Sync de catálogos (pipelines, players, webinars, cuentas publicitarias) y **de registrantes de WebinarJam**. No hay cron para ninguno |
| On-demand al abrir un embudo | `lib/vturb/stats.ts`, `lib/hyros/attribution.ts` | Consulta la API con caché: período cerrado → `is_final`, nunca se repide; período abierto → TTL 30 min (VTurb) / 60 min (Hyros) |

**Server actions** (`apps/web/app/funnels/actions.ts`): `listFunnelInstancesAction`,
`getFunnelAction`, `createFunnelInstanceAction` (aplica `DEFAULT_BINDINGS`),
`listFunnelTemplatesAction` (la única sin `requireOrganizationId()`: sólo lee el registro en código),
`getFunnelBindingsAction`, `setFunnelStepBindingAction` (valida que la fuente sirva para la
etapa del step; `config` no se valida), `listFunnelFormOptionsAction`,
`listFunnelIndexAction`. **No hay** acciones para renombrar, archivar ni borrar un embudo.

## El motor (lib/funnels)

| Archivo | Rol |
|---|---|
| `spine.ts` | Las 7 etapas **inmutables**: spend, click, lead, engaged, intent, sales_conv, cash |
| `types.ts` | `FunnelTemplate`, `FunnelStep` (N:1 a una etapa), `MetricDefinition` con numerador y denominador explícitos, `Benchmark` normalizado, `StageState` |
| `templates/{webinar,vsl-call,dm}.ts` | Transcripción del documento. Cada plantilla define steps, métricas, benchmarks, `sourceHint` y 3 punteros (north-star, leading indicator, governing rate) |
| `kpis.ts` | 11 KPIs universales (CAC, ROAS blended y by-source, EPL, EPC, CPL, AOV, LTV, cash vs contracted, LTV:CAC, EPL:CPL). `DECISIVE_RATIOS` = EPL:CPL y LTV:CAC |
| `sources.ts` | Catálogo de 24 fuentes: `provenance`, `suitableFor` (etapas donde se puede bindear) y `configFields` requeridos. `DEFAULT_BINDINGS` por plantilla |
| `resolve.ts` | IO. **No se re-exporta** desde `index.ts` para que un Client Component no arrastre Supabase |
| `compute.ts` | Puro: estados de etapa, métricas, transiciones, KPIs |
| `source-signal.ts` | Detección de fuente vacía (I-3) y resultado de llamadas |
| `health-bands.ts` | Evaluador de bandas y tabla cross-funnel. **Sin consumidor en la UI** |
| `instrumentation.ts` | Sección 05 del doc: herramienta dueña de cada etapa y su `otcStatus`/`otcNote` (texto que se muestra en `/funnels`) |
| `validate-template.ts` | Validador de plantillas (lo usan los tests) |
| `period.ts` | Presets 7/30/90 días, en **UTC** |

**Agregar un tipo de embudo** = un archivo en `templates/`, registrarlo en
`templates/index.ts`, transcribir el documento en `__tests__/document-fixture.ts` y correr
los tests de conformidad. Si hace falta tocar un componente, la arquitectura falló
(spec §0).

### Catálogo de fuentes por etapa

| Etapa | Fuentes (`source_id`) |
|---|---|
| click | `ad_clicks`, `zernio_comment_triggers`, `hyros_landing_visitors`, `vturb_page_views` |
| lead | `hyros_optins`, `conversations_opened`, `ghl_opportunities_created`, `ghl_stage_entered`, `form_submissions`, `webinar_registrants` |
| engaged | `conversations_replied`, `ghl_stage_entered`, `vturb_plays`, `vturb_reached_cta`, `webinar_attendees`, `webinar_stayed_to_pitch` |
| intent | `conversations_booked`, `closing_calls_scheduled`, `ghl_stage_entered`, `vturb_cta_clicks`, `vturb_reached_cta`, `form_submissions`, `form_qualified` |
| sales_conv | `closing_calls_attended`, `closing_calls_closed`, `ghl_stage_entered` |
| cash | `closing_calls_closed`, `clients_new`, `client_payments_count`, `ghl_stage_entered`, `ghl_opportunities_won` |

Bindings por defecto al crear: DM → inbox legacy y llamadas (`dm.trigger` queda sin fuente);
webinar y VSL → sólo `ad_clicks` en su paso Click. Ninguna plantilla tiene steps en la etapa
**spend**, así que siempre sale `skipped`; el spend entra por `OrgMeasures`.

## Integraciones externas

| Proveedor | Cliente | Lee / escribe | Sin conectar |
|---|---|---|---|
| **Meta Ads vía Zernio** | `lib/zernio/client.ts` (`listAds`) | Snapshot diario en `ad_metrics_daily` | Etapa Click (`ad_clicks`) y spend/reach/impressions en `null` |
| **Zernio comentarios** | `lib/zernio/triggers.ts` | Live `listComments`, cuenta los del período sólo si vio uno más viejo que el inicio | `null` |
| **GoHighLevel** | `lib/ghl/client.ts` (PIT + `location_id`; `Version: v3` para oportunidades) | Webhook de oportunidades → historial propio; catálogo de pipelines manual; citas → `closing_calls` (área Ventas) | Fuentes `ghl_*` en `null`; sin webhook recibido, `outside_history` |
| **VTurb** | `lib/vturb/client.ts` (`X-Api-Token` + `X-Api-Version: v1`) | `/players/list`, `/sessions/stats`, `/times/user_engagement` | Fuentes `vturb_*` en `null` |
| **WebinarJam / EverWebinar** | `lib/webinarjam/client.ts` (api_key en el body; los dos prefijos) | `/webinars`, `/webinar`, `/registrants` (todo, `date_range=allTime`; M15 filtrado con `attended_live=4`) | Fuentes `webinar_*` en `null` |
| **Hyros** | `lib/hyros/client.ts` (`API-Key`) | `/attribution/ad-account` por cuenta publicitaria activa (`revenue, leads, new_leads, new_visits, cost`) | `attributed_*`, `hyros_*` en `null` |
| **Whop** | `lib/payments/verify-signature.ts` + `normalize.ts` | Webhooks Standard Webhooks (ventana 5 min) | Cash, AOV, LTV en `null` |
| **Commas (ex Fanbasis)** | idem; id de proveedor `fanbasis` (el código no llama a su API; el host `www.fanbasis.com` es el de la doc) | Webhooks HMAC-SHA256 hex sin timestamp. **Nunca reintenta** | idem |

Resúmenes por proveedor: `docs/external-apis/<proveedor>/RESUMEN-LIMITLESS.md`.
Mapa general de integraciones: `docs/integraciones/README.md` y `lib/integrations/registry.ts`.

## Reglas de negocio y decisiones no obvias

1. **`null` nunca es `0`** (spec §9.1). Un step sin binding, con config incompleta, con
   error de consulta o con la API caída resuelve a `null` y la UI dice "sin datos". Un
   cero aparece sólo cuando hay señal de que la fuente funciona. Es la regla que un
   refactor rompe más fácil: cualquier `?? 0` en `resolve.ts` o `compute.ts` es sospechoso.
2. **Detección de fuente vacía** (`source-signal.ts`): cero en el período + la org nunca
   tuvo filas → `null`; cero en el período con historia → `0`. Aplica a
   `conversations_opened`, `closing_calls_scheduled`, `clients_new`, `form_submissions`,
   `webinar_registrants`. **No** aplica a `conversations_replied`, `conversations_booked`
   ni `client_payments_count`, que pueden devolver `0` en una org que nunca usó la tabla.
3. **Llamadas sin resultado cargado**: si todas las llamadas del período están
   `scheduled` (o `cancelled`), asistencia y cierres son `null`, no `0`. Un `no_show` sí
   es señal.
4. **GHL: el historial lo construye Limitless.** La API no expone historial de etapas;
   cada webhook se compara contra `ghl_opportunities` para derivar la transición.
   `occurred_at` es la **hora de recepción** (el payload no trae la hora del cambio;
   `dateAdded` es la creación de la oportunidad). Las fuentes `ghl_*` cuentan
   **oportunidades distintas**, no filas.
5. **Período ciego de GHL**: `stage_history_since` se fija con el primer webhook y nunca
   avanza. Un período que **empieza** antes del borde resuelve `null` con
   `nullReason: "outside_history"`, aunque termine después.
6. **Una oportunidad que Limitless ve por primera vez se registra como `created`**, aunque
   exista en GHL desde antes (no hay backfill de estado — `[EMBUDOS-GHL-BACKFILL]`).
7. **Fuentes con parámetro**: `ghl_stage_entered` (etapa), `vturb_*` (player),
   `webinar_*` (webinar), `form_*` (formulario). Sin el parámetro → `missing_config`, y la
   consulta no se ejecuta (contar sin filtro sería contar todo).
8. **VTurb `pitch_time = 0`** significa "no configurado": `vturb_reached_cta` queda `null`
   porque `total_over_pitch` contaría a casi todos. El `avg_watch_pct` del embudo sale del
   **primer** player bindeado.
9. **WebinarJam**: la API sólo acepta presets de fecha, así que se trae todo y el recorte
   al período se hace en SQL/JS. M15 (se quedaron hasta la oferta) necesita
   `pitch_second` cargado a mano por webinar; sin él, `null`. **M16 (clicks al CTA) no
   existe en la API** y no hay fuente para ese paso a propósito.
10. **Hyros vs pasarela**: `attributed_revenue`/`attributed_spend` (Hyros) son medidas
    propias; el ROAS blended usa revenue de Whop/Commas y spend de Meta, el by-source
    usa las de Hyros. **Que den distinto es el punto**, no un bug. El modelo de
    atribución es parte de la llave de caché.
11. **Pagos**: Whop manda decimales (`settlement_amount`), Commas centavos
    (`amount_cents`); la unidad se declara por proveedor. En Commas el valor contratado
    es cuota × `auto_expire_after_x_periods`; una suscripción indefinida queda `unmapped`.
    Commas no reintenta: el handler responde 200 a todo evento con firma válida.
12. **Retención (I-9)**: `purchases` y `retention_rate` se miden sobre una ventana de 365
    días (`lib/payments/retention.ts`), no sobre el período del embudo.
13. **Todo el dinero y todos los anuncios son de la org, no del embudo.**
    `resolveOrgMeasures` no filtra por instancia, producto, precio ni moneda: dos embudos
    de la misma org muestran el mismo spend, revenue, CAC, ROAS y LTV. Sólo los steps con
    parámetro (etapa GHL, video, webinar, formulario) son específicos del embudo. Choca con
    la decisión 1 de la spec (varias instancias por oferta) — `[EMBUDOS-MEDIDAS-POR-EMBUDO]`.
14. **Monedas**: `aggregatePayments` suma montos sin mirar `currency`; la moneda del
    embudo sólo formatea.
15. **Zona horaria**: los períodos se cortan en UTC. `reporting_timezone` se guarda y se
    muestra, pero no se usa para calcular. VTurb recibe la `timezone` de su integración.
16. **Webhooks**: el `organizationId` de la URL no autentica, sólo elige contra qué
    secreto verificar. En GHL, con firma de plataforma la org sale del `locationId`
    firmado y tiene que coincidir. Los eventos GHL que no son `Opportunity*` se descartan
    sin guardarse (traen datos personales).
17. **El texto de `instrumentation.ts` se muestra al usuario** en `/funnels` y en
    `/funnels/[funnelId]/configurar`, pero sólo el de las herramientas `partial`/`missing`
    (`blockingTools()`). Hoy tiene notas desactualizadas (ver deuda).

## Limitaciones conocidas y deuda

- Medidas org-wide presentadas como si fueran del embudo `[EMBUDOS-MEDIDAS-POR-EMBUDO]`.
- (Resuelto el 2026-10-02, SCRUM-60) Las notas de herramientas de `lib/funnels/instrumentation.ts`
  ya dicen lo que existe: GHL trae pipelines y etapas y arma el historial con el webhook (sigue
  `partial`, porque hay que asociar etapas y no hay historial previo); checkout está
  `available` vía Whop y Fanbasis y aclara que Stripe y Mercado Pago no alimentan los embudos;
  Meta Ads persiste en `ad_metrics_daily`; el pulso diario existe pero no lee embudos.
- (Resuelto el 2026-09-30, SCRUM-6) Los webhooks de Whop, Commas y GHL responden 500 si el
  evento no quedó guardado y procesado, para que el proveedor reintente; un reintento de un
  evento en `error` o trabado en `pending` se reprocesa (`lib/webhooks/reclamar.ts`). Commas no
  reintenta: si no se llegó a guardar, queda un log `[ALERTA][fanbasis]` con el payload. Los
  eventos en `unmapped`/`error` se reprocesan con `scripts/reprocesar-webhooks.ts`.
- Sin cron para registrantes de WebinarJam ni catálogos: los números envejecen hasta que
  alguien aprieta "sincronizar" `[EMBUDOS-SYNC-PROGRAMADO]`.
- Salud (bandas) sin UI `[EMBUDOS-SALUD]`; snapshots sin construir `[EMBUDOS-SNAPSHOTS]`
  (el pulso diario sí existe como reporte ejecutivo de la org —cron `executive-report-daily`,
  `lib/executive-reports/generate-daily.ts`— pero no lee los embudos; `REPORTING_CADENCE.daily`
  lo marca `partial`); `/funnels/comparar` sin construir `[EMBUDOS-COMPARAR]`.
- Sin backfill del estado de oportunidades de GHL `[EMBUDOS-GHL-BACKFILL]`; webhooks sólo
  por Workflow hasta que exista la app del Marketplace `[FEAT-GHL-OAUTH]`.
- `ghl_opportunities_won` cuenta cualquier transición con `status = 'won'` en el período,
  no sólo el paso a ganada `[EMBUDOS-GHL-WON]`.
- Upsert de `webinarjam_registrants` con `schedule_external_id` nulo duplica filas
  `[EMBUDOS-WJ-SCHEDULE-NULL]`; tope silencioso de 5.000 registrantes por webinar.
- Código muerto: `searchGHLOpportunities`, `getVTurbQuotaUsage` (además lee `usage` y el
  spec devuelve `quotas`), `countHyrosLeadsInPeriod`, journeys de Hyros, parámetro
  `configuredPitchTime` de VTurb, tablas `funnel_benchmarks` y `funnel_period_snapshots`.
- Clientes HTTP sin timeout (GHL, VTurb, Hyros, WebinarJam).
- Todo lo de integraciones está **sin verificar contra cuentas reales**
  `[EMBUDOS-CUENTAS-REALES]`; la lista de verificación del área está en
  `docs/operacion/verificacion-manual.md` (sección Embudos).

## Tests

| Cubierto (Vitest, entorno node) | Archivos |
|---|---|
| Plantillas contra el documento, fila por fila | `lib/funnels/__tests__/templates.conformance.test.ts` + `document-fixture.ts` |
| Cálculo puro, `null` vs `0`, KPIs, bandas, fuentes, período, spine, instrumentación, validador, fuente vacía | `lib/funnels/__tests__/*.test.ts` (10 archivos) |
| GHL: normalización del evento, transición, firma, estado de citas | `lib/ghl/__tests__/*.test.ts` |
| VTurb: mapeo de `Stats` a medidas, `isClosedPeriod` | `lib/vturb/__tests__/*.test.ts` |
| WebinarJam: normalización de registrante | `lib/webinarjam/__tests__/normalize-registrant.test.ts` |
| Hyros: mapeo del reporte | `lib/hyros/__tests__/resolve-attribution.test.ts` |
| Pagos: normalización, firmas, agregado, retención | `lib/payments/__tests__/*.test.ts` |
| Triggers de Zernio, snapshot de ads | `lib/zernio/__tests__/triggers.test.ts`, `lib/marketing/__tests__/ad-metrics-snapshot.test.ts` |

**Sin tests:** todo el IO — `lib/funnels/resolve.ts`, `lib/ghl/ingest-opportunity-event.ts`,
`lib/vturb/stats.ts`, `lib/webinarjam/sync.ts`, `lib/hyros/attribution.ts`,
`lib/payments/ingest.ts`, las server actions de `app/funnels/actions.ts` y las rutas de
webhook. No hay e2e del módulo (`apps/web/e2e/` sólo tiene holding). Backlog: `[T-6]`,
`[T-6b]`–`[T-6e]`, `[T-7]`, `[T-8]`, `[T-17]`.

## Lanzamientos

**Estado:** módulo dormido. Las dos páginas son un `EmptyState` "Próximamente" y el item de
navegación `lanzamientosDirectModule` está `disabled` y no se inserta en la barra.
`components/lanzamientos/*` (lista, detalle, modal de alta, panel de post-mortem) **no se
importa desde ninguna página**.

Lo que sí está vivo:

| Pieza | Dónde | Uso actual |
|---|---|---|
| Tablas `launches` (objetivos, `actual_revenue`, `actual_clients`, `post_mortem`, `product_id`) y `launch_metrics` (una fila por día, `UNIQUE (launch_id, date)`) | `supabase/migrations/20260617300000_launches.sql` | RLS por org, CRUD completo para miembros |
| `workboard_tasks.launch_id` | misma migración | El Workboard asigna y filtra tareas por lanzamiento |
| `listLaunchPickerOptionsAction` | `apps/web/app/lanzamientos/actions.ts` | Lo consume `app/(platform)/workboard/page.tsx` |
| Resto de acciones (crear, editar, métricas diarias manuales que recalculan los totales, post-mortem con Claude vía `callClaudeJson`, `feature: "launch_post_mortem"`) | idem | Sin UI que las llame |

No tiene relación con el motor de embudos (no usa `funnel_instances`) ni con la fecha de
"próximo lanzamiento" del onboarding de clientes, que es un campo configurable del área
Clientes.

### Limitless Webinars (Fase 1: modelo de datos, claves e ingesta de la landing)

SCRUM-526 (épica SCRUM-521) creó las tablas de los lanzamientos de webinars en
`supabase/migrations/20261016120000_webinars_modelo_de_datos.sql`: `webinar_launches`,
`webinar_sessions`, `launch_ad_campaigns`, `launch_products`, `leads`,
`launch_registrations`, `landing_visits`, `lead_events`, `ingest_keys` y `landing_events`.
No reutiliza `launches` ni `launch_metrics` (quedan como están). Las claves de ingesta
(SCRUM-527) y la ingesta de la landing (SCRUM-528) son el código que las usa hoy (abajo).

Lo que ya hace cumplir la base:
- Cada miembro lee sólo lo de su organización; la configuración del lanzamiento (lanzamiento,
  sesiones, campañas, productos) la escriben founder o admin.
- Leads, registros, visitas y eventos sólo los escribe el service role (la ingesta). Los
  eventos del lead son append-only para los usuarios, y un lanzamiento con registros,
  visitas o eventos no se puede borrar (un borrador vacío sí). Archivar en vez de borrar
  queda para decidir en SCRUM-522.
- Las claves de ingesta (sólo el hash) y los crudos de la landing no los ve nadie con sesión.
- Un reintento de la landing no duplica: `client_registration_id` es único por organización y
  la llave natural de `lead_events` también.
- Una fila no puede apuntar a un lanzamiento, un lead o un crudo de otra organización (FK
  compuestas con `organization_id`).
- `launch_registrations` está en realtime y `leads` tiene índices trigram para buscar por
  nombre o email.
- `landing_events` tiene las columnas de `lib/webhooks/reclamar.ts` (`status`,
  `error_message`, `processed_at`), para que la ingesta reutilice ese reclamo y reproceso.

Detalle de columnas y reglas: `docs/arquitectura/base-de-datos.md` § Limitless Webinars.
Tests: `supabase/ci/tests/97_webinars_modelo_de_datos.sql`.

#### Claves de ingesta de la landing (SCRUM-527)

La landing del lanzamiento manda registros y visitas a `POST /api/ingest/landing` (SCRUM-528)
con `Authorization: Bearer <clave>`. La clave dice de qué organización es lo que llega.

- Se crean, se listan y se revocan en Integraciones → Landing (categoría Medición de embudos,
  `provider: "landing"` en `lib/integrations/registry.ts`). Hoy la entrada está escondida
  con `ESCONDIDO.ingestaLanding` (`lib/release/escondido.ts`): no se lista, la página no lee
  las claves ni monta el panel y las acciones responden "Las claves de ingesta todavía no
  están disponibles.". SCRUM-523/524 la pasan a depender de la experiencia webinar de la
  organización.
- Formato: `lmt_ing_` más 32 bytes de `crypto.randomBytes` en base64url (51 caracteres). En
  `ingest_keys.key_hash` queda sólo el sha256 en hexadecimal; la clave se muestra una vez, al
  crearla, con un botón para copiarla y el aviso de que no se vuelve a ver. Si se pierde, se
  crea otra y se revoca la vieja.
- Sólo founder o admin de la organización activa (`requireOrgRole` con
  `current_user_has_org_role`, que incluye al founder de un holding operando un negocio)
  pueden ver la lista, crear y revocar: `ingest_keys` no tiene policies, así que las acciones
  usan el service role y el chequeo es ése. Toda consulta filtra por `organization_id`;
  revocar una clave de otra organización, inexistente o ya revocada responde "No encontramos
  esa clave o ya estaba revocada.". Revocar pide confirmación dentro del panel (el foco va a
  «Cancelar» y vuelve al cerrar); si la respuesta es ésa, por ejemplo porque otra pestaña ya la
  revocó, el panel cierra la confirmación y relee la lista.
- `verificarClaveDeIngesta(token)` (`lib/webinar/claves-de-ingesta.ts`) es lo que va a usar el
  endpoint: devuelve `{ organizationId, claveId }` si el hash existe y la clave no está
  revocada, y si no `null`. Busca por el sha256 del token y compara el hash de la fila con
  `timingSafeEqual`; un token sin el formato se rechaza sin consultar la base. Si la base
  falla, lanza `FallaDeLaBase` con un texto fijo (el endpoint responde 500, no 401).
- `last_used_at` se anota sin esperar y como mucho una vez por minuto por clave. La opción
  `enSegundoPlano` es obligatoria (el endpoint pasa `after` de `next/server`; suelta, en una
  función serverless la escritura puede no completarse). Una fecha ilegible se vuelve a anotar.
  El intervalo: con 50 eventos por segundo, una
  escritura por evento no tiene sentido para un dato que se muestra en minutos. Si falla, se
  registra con un texto fijo y la clave sigue valiendo.
- La tarjeta de Integraciones (`saludDeLaLanding`, en paralelo con el resto del panorama)
  muestra cuántas claves activas hay y su último uso sólo a founder o admin; al resto le dice si
  hay alguna activa y que el detalle lo ven ellos. Si la lectura o el chequeo del rol fallan,
  dice que no se pudo leer en vez de "Sin conectar".
- Errores como valor (`mutacionConErroresEsperables`): sesión, permiso, nombre vacío, de más
  de 100 caracteres o con caracteres de control (saltos de línea, tabulaciones, NUL) y clave
  inexistente vuelven con su motivo; lo demás va a la consola y a
  Sentry con el tag `server_action` y el usuario ve el texto fijo. Ni la clave ni su hash van a
  un log, a Sentry ni al texto de un error.

Archivos: `lib/webinar/claves-de-ingesta.ts`, `app/webinar/claves-de-ingesta-actions.ts`,
`components/integrations/settings/landing-settings.tsx`. Tests en `lib/webinar/__tests__/`,
`app/webinar/__tests__/`, `app/integrations/__tests__/panorama-con-landing.test.ts`,
`app/(platform)/integrations/__tests__/` y `components/integrations/__tests__/landing-settings.test.ts`.

#### Ingesta de la landing (SCRUM-528)

`POST /api/ingest/landing` recibe los registros y las visitas de la landing del lanzamiento.
La seguridad del endpoint (clave, límite, cuerpo, respuestas) está en
`docs/arquitectura/seguridad.md` § Endpoint público de ingesta de la landing.

Contrato (Zod, `lib/webinar/normalize/evento.ts`):

```json
{ "type": "registration" | "visit", "launch_public_id", "client_registration_id",
  "name", "email", "phone",
  "tracking": { "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "sl" },
  "ab_variant", "qualification", "visitor_id", "occurred_at" }
```

- Un registro necesita `launch_public_id`, `client_registration_id` y `email`; una visita,
  `launch_public_id` y `visitor_id`. El resto es opcional y puede venir en `null`; un texto
  vacío vale lo mismo que no mandarlo. `occurred_at` es ISO 8601 con zona y tiene que caer
  entre 30 días antes y 5 minutos después de la hora en que llega (fuera de eso, 400); si no
  viene, vale la hora en que llegó. Las claves de más se ignoran al normalizar pero el crudo
  las guarda.
- Antes de guardar nada se rechaza con 400 (AR pasada 1): todo texto, valor o clave, también
  las de más, con NUL o con un surrogate suelto (no es UTF-16 bien formado: lo produce una
  landing que corta un nombre en la mitad de un emoji); estructuras de más de 10 niveles;
  textos más largos que su columna; y un `occurred_at` fuera de la ventana (un año 0 o 10000
  no entra en un `timestamptz`, y un 1900 o un 2999 movería las métricas por fecha). Así, lo
  que se acepta siempre se puede guardar como jsonb y normalizar.

Cómo fluye:

1. Clave → organización; límite por clave; cuerpo de hasta 16 KB; JSON y contrato.
2. **Crudo primero:** el payload tal cual llegó va a `landing_events` en `pending` y la
   landing recibe `{"ok":true}`. Si no se pudo guardar, 500 y la landing reintenta.
3. **Normalización después de responder** (`after` de `next/server`,
   `lib/webinar/ingesta-landing.ts`):
   - el lanzamiento se busca por `public_id` **dentro de la organización de la clave**. Si no
     existe ahí (también si es de otra organización) o está cerrado, el crudo queda
     `unmapped` con el motivo en `error_message` y no se escribe nada más. Un borrador sí
     recibe (así se prueba la landing antes de abrir);
   - **registro:** si el `client_registration_id` ya está registrado con otro email (la
     persona corrigió el email y la landing reusó el id), se conserva el primer registro, no
     se crea un lead suelto y el crudo queda `processed` con una nota fija en
     `error_message` ("client_registration_id ya registrado con otro email..."). Si no, el
     lead se crea por `(organization_id, email_normalized)` (email en Unicode NFC, sin
     caracteres de ancho cero, sin ningún espacio y en minúsculas, `lib/webinar/identity.ts`) con
     `insert ... on conflict do nothing`. Si ya existía, se queda con lo primero que se supo
     de él y sólo se completan el nombre o el teléfono que le faltaban. El teléfono va en
     E.164 sólo si trae código de país (`+` o `00`); si no, `null` (completarlo con un país
     sería inventar). Después, el registro en `launch_registrations` con el tracking y
     `raw_event_id`, y el evento `registered` en `lead_events` (`source = 'landing'`,
     `source_ref` = `client_registration_id`);
   - **visita:** una fila en `landing_visits` por `(launch_id, visitor_id, day)`, con el día
     en UTC (da lo mismo en cualquier servidor).
   - Al terminar, el crudo pasa a `processed` con `processed_at`.
4. **Idempotencia:** cada escritura tiene su llave única y un 23505 es "ya estaba". Un
   reenvío con el mismo `client_registration_id` no duplica nada; el mismo lead con otro
   `client_registration_id` en el mismo lanzamiento se queda con el primer registro, y el
   evento `registered` sale siempre del registro guardado, así no hay dos. Una normalización
   que se corta a la mitad y se reprocesa tampoco duplica.
5. **Si la normalización falla**, el crudo queda en `error` con un texto fijo (el paso y el
   SQLSTATE, por ejemplo "Falló la normalización en registro (código 57014)."), sin datos
   personales. Si ni siquiera se pudo cerrar, queda en `pending`.

**Reproceso** (`/api/cron/reprocesar-landing`, cada 10 minutos, `lib/webinar/reprocesar-landing.ts`):
toma los `error` y los `pending` de más de 5 minutos, de todas las organizaciones, hasta 200
por corrida, filtrando por columnas (índice parcial `landing_events_a_reprocesar`). El estado
del reproceso vive en columnas propias (migración `20261016130000_landing_events_reprocesos`,
AR pasada 1): `reprocess_attempts` cuenta los reprocesos que arrancó el cron y `status =
'failed'` es el error definitivo. Cada evento se reclama con un UPDATE condicionado al
estado, a `reprocess_attempts` y, en un `pending`, a la marca `processed_at` (patrón de
`lib/webhooks/reclamar.ts`), que suma uno a `reprocess_attempts`: dos corridas no lo
procesan dos veces ni cuentan mal, y un proceso que se corta igual gasta su intento. Si falla
el quinto reproceso (o se cortó sin cerrarse), el evento pasa a `failed`, el cron ya no lo
lee y avisa a Sentry con la organización, el id del evento, el paso y el SQLSTATE. Para
revivirlo: `docs/operacion/alertas.md` § Evento de la landing en `failed`. `error_message`
queda como texto fijo que describe la última falla y nada lo interpreta. `unmapped` no se
reprocesa. El cron usa el monitor de crons y el registro de corridas como los demás.

Medido contra un Supabase local con `next start` (evidencia de SCRUM-528, con el fix-pack de
la AR pasada 1): 50 registros por segundo durante 2 minutos (6000 pedidos, 300 reenvíos)
respondieron todos 200 con p50 12,1 ms, p95 27,5 ms y p99 41,3 ms; quedaron 5700 registros,
leads y eventos para 5700 ids distintos, sin duplicados ni pérdidas.

El alta en Zoom por QStash es la Fase 2 y no está. El endpoint no mira
`ESCONDIDO.ingestaLanding`: mientras la entrada está escondida la app no deja crear claves, y
sin una clave activa todo pedido es 401.

Archivos: `app/api/ingest/landing/route.ts`, `app/api/cron/reprocesar-landing/route.ts`,
`lib/webinar/{endpoint-de-ingesta,ingesta-landing,reprocesar-landing,identity}.ts`,
`lib/webinar/normalize/{evento,filas,reproceso}.ts`. Tests:
`lib/webinar/__tests__/{identidad-y-normalizacion,ingesta-de-la-landing}.test.ts` (con la base
falsa `base-falsa-de-ingesta.ts`, que aplica las llaves únicas de la migración).

## Archivos clave

1. `apps/web/lib/funnels/resolve.ts` — de dónde sale cada número
2. `apps/web/lib/funnels/sources.ts` — catálogo de fuentes y defaults
3. `apps/web/lib/funnels/compute.ts` — cálculo puro
4. `apps/web/lib/funnels/source-signal.ts` — `null` vs `0`
5. `apps/web/lib/funnels/templates/*.ts` y `__tests__/document-fixture.ts`
6. `apps/web/lib/funnels/instrumentation.ts` — texto visible en `/funnels`
7. `apps/web/app/funnels/actions.ts`
8. `apps/web/app/(platform)/funnels/[funnelId]/page.tsx`
9. `apps/web/app/api/webhooks/ghl/route.ts` + `apps/web/lib/ghl/{ingest-opportunity-event,stage-transition,verify-webhook}.ts`
10. `apps/web/lib/payments/{ingest,normalize,aggregate,retention}.ts` + `app/api/webhooks/{whop,fanbasis}/route.ts`
11. `apps/web/lib/vturb/stats.ts`, `apps/web/lib/webinarjam/sync.ts`, `apps/web/lib/hyros/attribution.ts`
12. `apps/web/lib/marketing/ad-metrics-snapshot.ts` + `app/api/cron/capture-ad-metrics/route.ts`
13. `apps/web/app/lanzamientos/actions.ts`

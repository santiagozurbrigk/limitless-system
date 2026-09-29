# Base de datos

> Verificado contra el código el 2026-09-23 (commit 038caca) y contra producción (Supabase `OTC`, `nrzlylzbmsuowzhpdnjl`) con `list_migrations` y `list_tables` en sólo lectura. Backlog: `PENDIENTES.md` § Infraestructura.

## Qué es

Una sola base PostgreSQL 17 en Supabase (Auth + Storage + pgvector), multi-tenant por `organization_id`. **El schema se define sólo con las migraciones de `supabase/migrations/`**: no hay `database.types.ts` generado ni ORM; los tipos de fila se escriben a mano en `apps/web/types/` o junto al mapper de cada dominio. Producción tiene 147 tablas en `public`, todas con RLS habilitado. **Producción está en plan Free de Supabase: no hay backups ni PITR** (`[DR-BACKUPS-SUPABASE]`; ver [`../auditoria/backups-y-recuperacion.md`](../auditoria/backups-y-recuperacion.md)).

## Migraciones

### Cómo están organizadas

- 175 archivos `supabase/migrations/<AAAAMMDDHHMMSS>_<nombre_snake>.sql`, del `20260521000000_phase1_orgs_profiles` al `20260923140000_onboarding_de_clientes`.
- Una migración por cambio de feature; las primeras usan nombres en inglés, las de septiembre en español.
- Idempotentes en lo posible (`if not exists`, `drop policy if exists`), porque parte de producción se armó a mano antes de ordenar el historial.
- `supabase/scripts/` guarda SQL que **no** es migración: `legacy_RUN_ALL_PHASE1_NO_EJECUTAR.sql` (pisa `get_my_organization_id()`; no correr) y `mark_fathom_business_context_calls.sql`.
- No hay `supabase/config.toml` ni stack local de Supabase: el entorno local apunta a un proyecto remoto.

### Invariante de versiones

**El historial de producción (`supabase_migrations.schema_migrations`) tiene exactamente las versiones de `supabase/migrations/`.** Verificado el 2026-09-23: 175 en el repo, las mismas 175 en producción, mismos nombres y orden.

Matices que un dev tiene que saber:
- `20260711180000_org_ai_credentials` figura aplicada **aunque sus columnas OAuth de Claude no existen en producción**. Es a propósito: si quedara pendiente, `supabase db push` recrearía la vista `organization_claude_status` sin el filtro por org. Si algún día se quiere OAuth de Claude, va en una migración nueva.
- Producción tiene objetos que el repo no crea: la función `current_user_is_founder_or_admin()` (la usa la policy consolidada de `profiles` en prod) y `rls_auto_enable()` (de la plataforma). Y policies consolidadas con otros nombres (`Users read own or portfolio clients` en vez de dos policies). Detalle en `docs/historial/DB_DIFF_PRODUCCION_2026-09-22.md`.
- En prod `authenticated` tiene SELECT a nivel tabla sobre `organizations`; en el repo es por columna. Un miembro puede leer el ciphertext de la key de Claude de su propia org (inútil sin `ENCRYPTION_MASTER_KEY`). Ver `[DB-ORGS-SELECT-COLUMNAS]`.

### Cómo aplicar una migración

1. Crear `supabase/migrations/AAAAMMDDHHMMSS_descripcion.sql` con versión **única** (el CI falla si se repite o si el nombre no es `^[0-9]{14}_[a-z0-9_]+\.sql$`).
2. Aplicar dejando en el historial **la misma versión que el archivo**:
   - `supabase db push` con la CLI vinculada: registra la versión del archivo.
   - MCP `apply_migration`: registra la hora actual como versión. Después hay que renombrar el archivo o corregir la fila en `supabase_migrations.schema_migrations`.
   - SQL Editor: no registra nada; insertar la fila a mano.
3. En la misma migración: RLS, policies y grants. En Supabase las tablas y funciones nuevas nacen con GRANT explícito a `anon`/`authenticated`; `revoke ... from public` no alcanza, hay que revocar a cada rol (comentario en `20260922110000_rpcs_y_policies_entre_organizaciones.sql`).
4. Una migración ya aplicada **no se edita**: cualquier corrección es un archivo nuevo.
5. Si la migración borra o transforma datos (`drop`, `delete`, `update` masivo, cambio de tipo), antes de aplicarla hacer un dump de las tablas afectadas (`supabase db dump --data-only -t <tabla>`), guardarlo fuera del repo y escribir en el comentario del archivo cómo se revierte. Preferir expand/contract: primero agregar, después (en otro deploy) borrar, para que un rollback de Vercel siga funcionando.

### Chequeo en CI

El job `migrations` de `.github/workflows/ci.yml` levanta `pgvector/pgvector:pg17`, carga `supabase/ci/supabase-stubs.sql` (roles `anon`/`authenticated`/`service_role`, schemas `auth`/`storage`, `auth.uid()`/`auth.jwt()`, tablas mínimas de storage, publicación de realtime) y corre `supabase/ci/check-migrations.sh`: valida nombres y versiones únicas y aplica las 175 en orden, cada una en su transacción. Si una migración nueva usa otra pieza de la plataforma (otro schema, otra extensión), hay que sumarla a los stubs.

## RLS y acceso

### Patrón estándar

```sql
USING (organization_id = public.get_my_organization_id())
WITH CHECK (organization_id = public.get_my_organization_id())
```

`get_my_organization_id()` (SECURITY DEFINER, `search_path = public`, última versión en `20260620100000_holding_jwt_claim_hook.sql`):

```sql
SELECT COALESCE(
  (SELECT (auth.jwt() ->> 'active_business_org_id')::uuid WHERE ... IS NOT NULL),
  (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
)
```

El claim `active_business_org_id` lo agrega el Auth Hook `custom_access_token_hook` a partir de `holding_active_sessions`, verificado contra `holding_businesses`. El hook se activa a mano en el dashboard (Authentication → Hooks); sin eso un holding que entra a un negocio lee con la org del perfil.

Lectura de portfolio del holding: `get_my_holding_business_org_ids()` + policies `holding_reads_*` sobre `organizations`, `clients`, `closing_calls`, `conversations` (`20260630100000_holding_portfolio_rls.sql`). **No miran el rol**: cualquier miembro de la org holding lee esas tablas de todos los negocios (`[HOLDING-PORTFOLIO-ROL]`).

**Casi ninguna policy filtra por rol**: la única excepción en el repo es `Founders update org profiles` (UPDATE de `profiles`, `20260616100000_workboard_time_tracking.sql`), que deja a un `founder`/`admin` editar los perfiles de su org; en prod esa lógica está en la policy consolidada con `current_user_is_founder_or_admin()`. Los permisos por módulo (`team_roles.permissions`) se aplican en el render de `app/(platform)/layout.tsx`, no en la base ni en las actions (`[PERMISOS-SERVER-ACTIONS]`).

### Tablas sin lectura para el usuario

Estas tablas se leen sólo con `createAdminClient()` (service role). El cliente con sesión recibe cero filas:

| Tabla | Por qué |
|---|---|
| `calendly_integrations`, `manychat_integrations`, `fathom_integrations`, `typeform_integrations`, `google_forms_integrations`, `youtube_integrations` | Tokens/API keys. Policies SELECT eliminadas en `20260606100000_security_hardening_rls.sql`; `youtube` y `zernio` cerradas del todo en `20260922110000` |
| `zernio_integrations` | `api_key` (cifrada) y `webhook_secret` |
| `instagram_integrations`, `stripe_integrations`, `mercadopago_integrations`, `vturb_integrations`, `webinarjam_integrations`, `hyros_integrations`, `payment_integrations`, `super_admin_google_tokens` | RLS sin policies |
| `ghl_integrations` | El miembro puede insertar/actualizar/borrar la de su org, pero no leerla |
| `ai_brain_documents`, `super_admin_users`, `super_admin_deletions`, `waitlist_leads`, `rate_limits`, `holding_active_sessions` | Sólo service role / plataforma |

Excepciones que **sí** son editables por cualquier miembro: `discord_integrations` y `unipile_integrations` (policy `FOR ALL` por org) y `team_member_integrations` (sólo la fila propia).

### Columnas protegidas

- `profiles`: trigger `protect_profile_columns` (`20260922100000`). Para `anon`/`authenticated` bloquea `id`, `organization_id`, `role`, `is_holding_admin` y la contraseña temporal; quien no es `founder` ni `admin` de la org sólo cambia nombre, email y avatar.
- `organizations`: UPDATE por columna sólo en `name, industry, website_url, timezone, currency, language, country`; SELECT por columna en el repo (ver matiz de prod arriba).

## Funciones SQL

| Función | Para qué | Quién la ejecuta |
|---|---|---|
| `get_my_organization_id()` | Org efectiva para RLS | `authenticated` |
| `get_my_holding_business_org_ids()` | Negocios activos del holding del usuario | `authenticated` |
| `custom_access_token_hook(jsonb)` | Agrega `active_business_org_id` al JWT | `supabase_auth_admin` |
| `protect_profile_columns()` | Trigger de columnas protegidas en `profiles` | trigger |
| `consume_rate_limit(p_key, p_window_ms, p_max_requests)` | Contador atómico de rate limit sobre `rate_limits` (SECURITY DEFINER; fix de `reset_at` ambiguo en `20260907100000`) | service role (`lib/rate-limit.ts`) |
| `search_rag_chunks(vector, uuid, int, text[])` | Búsqueda vectorial del RAG | sólo service role (revocada a usuarios en `20260922110000`) |
| `get_active_sales_script(uuid)` | Guion de ventas activo | sólo service role |
| `increment_utm_clicks/leads/bookings/sales` | Contadores de UTM | sólo service role |
| `get_holding_dashboard_stats(uuid)` | Métricas agregadas del holding | sólo service role |
| `create_default_roles(uuid)` | Siembra roles al crear una org | `authenticated`, service role |
| `client_last_activity(uuid)` | Última novedad por cliente (onboarding de clientes) | sólo service role |
| `onboarding_connected_source_count`, `onboarding_org_progress` | Checklist de onboarding | ver `docs/areas/plataforma.md` |
| `get_current_week_start()` | Semana de weekly inputs | |
| `set_updated_at()` | Trigger genérico de `updated_at` | trigger |

Vistas: `organization_claude_status` (estado de la key de Claude, filtrada por org) y `workboard_time_by_member`. Ninguna vista de `public` tiene escritura para `anon` ni `authenticated` (`20260928200000_vistas_sin_escritura`): los default privileges del proyecto les dan `GRANT ALL` a las vistas nuevas, así que la migración que crea una vista tiene que revocarles INSERT, UPDATE, DELETE y TRUNCATE. `supabase/ci/check-migrations.sh` falla si alguna queda con escritura. Realtime publicado en `business_context_documents`, `reel_variation_jobs` y `sop_generation_jobs`. Extensión: `vector`.

## Storage

Buckets creados por migraciones: `avatars`, `agent-documents`, `content-thumbnails` (público, con policy pública de listado), `trial-reels`, `client-wins`, `sop-videos`, `discord-bot-avatars`.

**Buckets que el código usa y ninguna migración crea** (existen sólo en el dashboard; confirmar que son privados): `client-payment-receipts`, `business-context-documents`, `sop-attachments`, `workboard-task-attachments`, `ai-brain-documents` (`[AUD-SEG-9]`). El bucket `import-files` (legacy del importador viejo) se borró el 2026-09-28/29: sus policies abiertas salieron en `20260928210000_import_files_sin_policies` y el bucket con sus 2 archivos se borró desde el panel, después de descargarlos. Tamaño por bucket: [`../auditoria/backups-y-recuperacion.md`](../auditoria/backups-y-recuperacion.md). Las rutas de objeto se validan contra la carpeta de la org en `lib/storage/org-path.ts`.

## Inventario de tablas por área

Una línea por tabla de producción. Filas = conteo aproximado de prod el 2026-09-23 (sólo para distinguir tablas vivas de vacías).

### Plataforma, cuentas y permisos
| Tabla | Propósito |
|---|---|
| `organizations` | Raíz multi-tenant: nombre, `account_type` (founder/holding), `status`, `enabled_add_ons`, BYOK de Claude cifrado, preferencias |
| `profiles` | Usuario (= `auth.users.id`) → `organization_id`, `role`, contraseña temporal, `is_holding_admin` |
| `team_roles` | Roles custom con `permissions` por módulo |
| `team_invitations` | Invitaciones por token (`/invite`) |
| `notification_preferences` | Preferencias por usuario |
| `onboarding_state`, `onboarding_responses` | Estado del onboarding guiado y respuestas del founder |
| `token_usage` | Consumo de IA por org/feature/modelo |
| `rate_limits` | Contadores de `consume_rate_limit` |
| `waitlist_leads` | Altas de waitlist / prueba (`/api/waitlist`, `/api/trial-confirm`) |

### Holding y super-admin
| Tabla | Propósito |
|---|---|
| `holding_businesses` | Portfolio: `holding_org_id` → `business_org_id` |
| `holding_active_sessions` | Negocio activo por usuario; fuente del Auth Hook |
| `holdings`, `holding_organizations` | Modelo de holdings del super-admin (panel de holdings) |
| `super_admin_users`, `super_admin_deletions`, `super_admin_google_tokens` | Staff Limitless, registro de bajas, Drive del super-admin |
| `organization_notes` | Notas internas por org del super-admin |
| `ai_brain_documents` | "Cerebro de IA" del super-admin |

### Clientes (`docs/areas/clientes.md`)
`clients`, `client_payments`, `client_timeline_entries`, `client_problems`, `client_tasks`, `client_revenue_entries`, `client_sub_clients`, `client_onboarding_links`, `client_onboarding_submissions`, `client_journey_stages`, `client_checkpoints`, `client_checkpoint_events`, `client_checkpoint_proposals`, `client_wins`, `win_attachments`, `win_usages`, `field_definitions`, `plans`, `plan_durations`, `metrics_snapshots` (baseline importado de Excel), `client_identities` (identidades de Fathom para cruzar 1-1).
Propósito de cada una en el doc del área. Las notas del cliente son columnas de `clients` (`20260906100000_client_notes.sql`), no una tabla.

### Ventas (`docs/areas/ventas.md`)
| Tabla | Propósito |
|---|---|
| `closing_calls` | Llamadas de cierre (Calendly/GHL), disposición, UTM |
| `sales_leads` | Leads del seguimiento |
| `sales_follow_up_options` | Opciones configurables del seguimiento |
| `fathom_calls`, `call_analyses` | Grabaciones y análisis profundo |
| `conversations` | Inbox legacy (ManyChat/Unipile/IG). 0 filas en prod |
| `zernio_conversation_analysis` | Análisis IA de conversaciones de Zernio |
| `zernio_messages`, `zernio_comments` | Escritas por el webhook de Zernio. 0 filas en prod |
| `instagram_messages`, `instagram_threads` | Inbox legacy de Instagram Graph. 0 filas |
| `manychat_events` | Eventos de ManyChat. 0 filas |
| `sales_scripts` | Guion de ventas (RPC `get_active_sales_script`) |
| `team_compensation` | Comisiones de closers |

### Integraciones (credenciales)
`calendly_integrations`, `manychat_integrations`, `fathom_integrations`, `team_member_integrations` (keys de Fathom por miembro, cifradas), `youtube_integrations`, `typeform_integrations`, `google_forms_integrations`, `instagram_integrations`, `stripe_integrations`, `mercadopago_integrations`, `unipile_integrations`, `zernio_integrations`, `ghl_integrations`, `vturb_integrations`, `webinarjam_integrations`, `hyros_integrations`, `payment_integrations` (Whop/Commas), `discord_integrations`. Ver `docs/integraciones/README.md`.

### Marketing (`docs/areas/marketing.md`)
| Tabla | Propósito |
|---|---|
| `content_pieces` | Contenido sincronizado (Zernio, Drive, YouTube) con `metrics` JSONB |
| `content_assets` | Contenido legacy (Instagram Graph / YouTube) |
| `content_pattern_reports` | Reportes de patrones de contenido generados por IA |
| `ad_metrics_daily` | Snapshot diario de anuncios (cron `capture-ad-metrics`) |
| `forms`, `form_responses` | Typeform / Google Forms |
| `utm_links`, `utm_lead_captures`, `utm_booking_attributions`, `utm_sale_attributions` | Atribución UTM |
| `lead_magnets`, `lead_magnet_leads` | Lead magnets entregados por DM |
| `reel_variation_jobs` | Trial reels (worker de Fly.io) |
| `custom_metrics` | Métricas propias del usuario |

### Embudos (`docs/areas/embudos.md`)
`funnel_instances`, `funnel_step_bindings`, `ghl_pipelines`, `ghl_pipeline_stages`, `ghl_opportunities`, `ghl_stage_transitions`, `ghl_webhook_events`, `vturb_players`, `vturb_stats_cache`, `webinarjam_webinars`, `webinarjam_registrants`, `hyros_ad_accounts`, `hyros_attribution_cache`, `payment_orders`, `payment_transactions`, `payment_webhook_events` (las tres de pagos también alimentan Finanzas).

### Finanzas (`docs/areas/finanzas.md`)
`payment_platforms`, `fixed_expenses`, `subscriptions` (gastos recurrentes), más las de pagos de arriba.

### Producto (`docs/areas/producto.md`)
`products`, `customer_avatars`, `value_ladder`, `value_propositions`, `sales_frameworks`, `business_graph_node_positions`.

### Agente IA y conocimiento (`docs/areas/agente-ia.md`)
`agent_conversations`, `agent_messages`, `agent_graph_proposals`, `business_stages`, `business_context_documents`, `knowledge_base_categories`, `rag_documents`, `rag_chunks` (pgvector), `founder_communication_tone`.

### Operaciones (`docs/areas/operaciones.md`)
`workboard_tasks`, `workboard_task_attachments`, `workboard_task_documents`, `sprints`, `sops`, `sop_versions`, `sop_attachments`, `sop_generation_jobs`, `weekly_inputs`, `weekly_reports`, `intelligence_snapshots`, `executive_reports`, `launches`, `launch_metrics`.

### Discord (`docs/areas/discord.md`)
`discord_integrations`, `discord_client_links`, `discord_messages`, `discord_pending_links` (vacía), `discord_channel_clients`, `discord_team_members`.

## Tablas huérfanas o legacy

Sin ninguna referencia en `apps/` (grep de `.from("<tabla>")` y del nombre suelto):

| Tabla | Origen | Qué hacer |
|---|---|---|
| `agent_projects` | `20260522100000_agent_module` (2 filas) | Decidir si se borra |
| `competitors`, `competitor_posts` | `20260811150000` — `[FEAT-2]` nunca construido | Feature futura o borrar |
| `story_sequences`, `story_frames` | `20260811140000` — `[FEAT-1]` nunca construido | Ídem |
| `funnel_benchmarks`, `funnel_period_snapshots` | `20260829120000_funnels_phase1`, reservadas para bandas de salud e histórico | Ver `[EMBUDOS-SALUD]` |
| `lead_magnet_clicks` | `20260806120000` | Ninguna ruta la escribe |

Legacy vivo pero vacío en prod: `conversations`, `instagram_messages`, `instagram_threads`, `manychat_events`, `zernio_messages`, `zernio_comments` (estos dos, porque el webhook de Zernio responde 503 sin `ZERNIO_WEBHOOK_SECRET`; ver `[ENV-ZERNIO-WEBHOOK-SECRET]`), `discord_pending_links`, `utm_lead_captures`, `utm_*_attributions`.

**Lo que ya no existe** (por si aparece en código viejo): `metric_snapshots` (borrada en `20260922140000`; no confundir con `metrics_snapshots`, que sigue), 15 columnas vacías borradas en `20260922130000`, `discord_pending_channels` (`20260917120000`), el sistema de import viejo (`20260722000000_remove_import_system`).

## Archivos clave

- `supabase/migrations/20260521000000_phase1_orgs_profiles.sql` (base), `20260620100000_holding_jwt_claim_hook.sql`, `20260630100000_holding_portfolio_rls.sql`
- `supabase/migrations/20260606100000_security_hardening_rls.sql`, `20260922100000_profiles_columnas_protegidas.sql`, `20260922110000_rpcs_y_policies_entre_organizaciones.sql`
- `supabase/migrations/20260808100000_distributed_rate_limits.sql`, `20260907100000_rate_limit_reset_at_ambiguo.sql`
- `supabase/ci/check-migrations.sh`, `supabase/ci/supabase-stubs.sql`
- `apps/web/lib/supabase/{server,admin,fetch-all-rows}.ts`
- `docs/historial/DB_DIFF_PRODUCCION_2026-09-22.md` (diff histórico con prod)

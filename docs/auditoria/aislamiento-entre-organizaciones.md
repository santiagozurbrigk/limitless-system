# Aislamiento entre organizaciones

| | |
|---|---|
| **Qué cubre** | Si un usuario autenticado de la organización A puede leer o escribir datos de la organización B. Dos capas: la **base de datos** (hablando directo con Supabase/PostgREST, Storage y Realtime con su propio JWT, sin pasar por la app) y la **aplicación** (Server Actions, rutas, jobs con service role). |
| **Fecha** | 2026-09-23 |
| **Código auditado** | `038caca` (`main`) |
| **Método (capa de base de datos)** | MCP de Supabase contra producción (`nrzlylzbmsuowzhpdnjl`), **sólo catálogo**: `pg_class.relrowsecurity`, `pg_policies` (public y storage), `pg_proc` + `has_function_privilege` para `anon`/`authenticated`, `pg_get_functiondef` de las funciones de org/holding y del trigger de `profiles`, `information_schema.column_privileges`/`role_table_grants`, vistas (`reloptions`, definición), `storage.buckets`, `pg_publication_tables`, `pg_event_trigger`, `pg_constraint` (FKs), `supabase_migrations.schema_migrations` y `get_advisors(security)`. No se leyó ninguna fila de tablas con datos de clientes ni de `storage.objects`. En el repo: estado final de policies simulado a partir de las 175 migraciones (`create/drop/alter policy` en orden) y comparado tabla por tabla contra producción; lectura de los consumidores de los identificadores externos (`lib/ghl/ingest-opportunity-event.ts`, `lib/unipile/integration.ts`, `apps/discord-bot/src/lib/supabase.ts`). |
| **Qué no se pudo verificar (base de datos)** | Configuración de Auth que no está en SQL: que el Custom Access Token Hook esté habilitado, la duración del JWT (`jwt_expiry`) y qué esquemas expone PostgREST (se asume el default `public`). No se probó ningún ataque con un JWT real (todo lo de abajo sale de leer las policies y las funciones; donde digo "puede" es por lo que permiten, no porque lo haya ejecutado). No se contaron objetos por bucket. |

## Resumen

**En una línea:** las tablas aíslan bien a las organizaciones; los huecos entre organizaciones están en el
**almacenamiento de archivos**, en las **conexiones de integraciones (OAuth)** y en el **holding**.

**Capa de base de datos**

- **La base aísla bien a las organizaciones en casi todo.** Las 147 tablas de `public` tienen RLS activado en producción; 138 quedan en OK y ninguna tabla deja leer ni escribir filas de otra organización por sí sola. Todas las policies de datos de negocio filtran por `get_my_organization_id()` tanto al leer como al escribir, y las 16 tablas de secretos (API keys y tokens de integraciones) no son legibles por los usuarios.
- **Un usuario no puede "mudarse" de organización**: el trigger de `profiles` le impide cambiar su `organization_id`, su rol o su marca de admin de holding, y el dato de "negocio activo" del holding viaja firmado dentro del JWT, así que no lo puede inventar.
- **La falla concreta está en Storage**: el bucket `import-files` deja a cualquier usuario logueado, de cualquier organización, listar, bajar, subir y borrar archivos de todo el bucket (ya está en PENDIENTES como `[SEG-BUCKET-IMPORT-FILES]`).
- **Hay un problema nuevo de diseño**: tres tablas de integraciones dejan que cualquier miembro escriba por su cuenta el identificador de la cuenta externa (el servidor de Discord, la sub-cuenta de GoHighLevel, la cuenta de Unipile), y el sistema usa ese identificador para decidir a qué organización mandar los mensajes que llegan. Eso abre la puerta a quedarse con los mensajes de otra organización o a cortárselos, si se conoce el identificador.
- **El holding sigue siendo el punto débil**: cualquier miembro del holding (no sólo el founder o el admin) lee clientes, llamadas y conversaciones de todos los negocios (ya en PENDIENTES), y además quien entró a un negocio y después perdió el permiso sigue pudiendo operar en ese negocio porque el sistema no vuelve a mirar su rol.
- Producción y el repo difieren en Storage y Realtime en cosas que el diff del 2026-09-22 no miró: el bucket abierto salió justamente de esa diferencia.
- Dentro de una misma organización la base **no** hace cumplir roles (un miembro puede darse permisos editando su rol): eso está en `[PERMISOS-SERVER-ACTIONS]` y no es tema de esta auditoría.

**Capa de aplicación**

- **En el uso diario la app no mezcla organizaciones**: las acciones resuelven la org desde la sesión (también
  cuando usan service role), y crons, colas, bot de Discord, búsqueda de la IA y caches respetan la org.
- **Hueco nuevo grave — conectar integraciones de otra organización**: los 10 callbacks de OAuth toman la org de
  una cookie sin firmar y no miran la sesión. Conociendo el UUID de otra org, cualquiera le conecta su propia
  cuenta de Stripe, Calendly, Google, etc. (`[OAUTH-ESTADO-SIN-FIRMA]`, P0; resuelto el 2026-09-30, SCRUM-10).
- **Hueco nuevo grave — archivos de otra organización**: en 7 tablas el usuario puede escribir la ruta de un
  archivo, y 11 lugares del servidor la abren o la borran con service role sin re-validar el prefijo de la org
  (`[STORAGE-RUTA-DESDE-FILA]`, P1; resuelto el 2026-10-01 en SCRUM-81).
- Se confirmaron y ampliaron: Fathom asociado a un cliente ajeno escribe en su ficha (`[FATHOM-CLIENTID-SIN-VALIDAR]`),
  la key global de Zernio está cargada en producción (`[ZERNIO-KEY-GLOBAL]`) y un miembro sin permisos del holding
  también **escribe** en los negocios vía acciones con service role (`[HOLDING-PORTFOLIO-ROL]`).

## Capa de base de datos

### Cómo decide la base de qué organización es cada usuario

- `get_my_organization_id()` (SECURITY DEFINER, `search_path=public`): devuelve el claim `active_business_org_id` del JWT si existe; si no, `profiles.organization_id` del usuario (`pg_get_functiondef` en prod; `supabase/migrations/20260620100000_holding_jwt_claim_hook.sql`).
- El claim lo pone sólo `custom_access_token_hook` (EXECUTE sólo para `supabase_auth_admin`; revocado a `anon`/`authenticated` en prod) a partir de `holding_active_sessions` ⋈ `holding_businesses` activo. `holding_active_sessions` tiene RLS `deny_all`, así que el usuario no puede escribirse un negocio activo. El JWT está firmado: el usuario no puede agregar ese claim.
- `profiles`: el UPDATE deja editar la fila propia (o, a founder/admin, las de su org), pero el trigger `protect_profile_columns` (`20260922100000_profiles_columnas_protegidas.sql`) rechaza con `42501` cualquier cambio de `id`, `organization_id`, `role`, `is_holding_admin`, `must_change_password` o `temp_password_expires_at` hecho por `authenticated`/`anon`. No hay policy de INSERT ni de DELETE. Resultado: **nadie puede apuntar su perfil a otra organización**.
- Postgres aplica el USING de una policy UPDATE o ALL como WITH CHECK cuando éste falta. Por eso las policies sin WITH CHECK explícito (`plans`, `plan_durations`, `value_propositions`, `zernio_comments`, `reel_variation_jobs`, `discord_*`, etc.) igual impiden mover una fila a otra org.

### Tablas de `public` (producción, 2026-09-23)

Leyenda: **org** = `organization_id = get_my_organization_id()` (en USING y, para escrituras, en WITH CHECK o por el USING). **org+portfolio** = org propia **o** `organization_id IN get_my_holding_business_org_ids()`. **false** = policy que niega todo. **—** = sin policy para esa operación (denegado para `anon`/`authenticated`; sólo service role). Todas las policies son para el rol `public` salvo el UPDATE de `profiles` (`authenticated`). `anon` tiene grants de tabla completos (default de Supabase), pero sin JWT `get_my_organization_id()` devuelve `null` y ninguna policy pasa.

| Tabla | org_id | RLS | SELECT | INSERT | UPDATE | DELETE | Veredicto | Nota |
|---|---|---|---|---|---|---|---|---|
| `ad_metrics_daily` | si | si | org | — | — | — | OK |  |
| `agent_conversations` | si | si | org | org | org | org | OK |  |
| `agent_graph_proposals` | si | si | org | org | org | — | OK | UPDATE sin WITH CHECK explícito: se aplica el USING. |
| `agent_messages` | si | si | org | org | — | — | OK |  |
| `agent_projects` | si | si | org | org | org | org | OK |  |
| `ai_brain_documents` | no | si | — | — | — | — | OK | Biblioteca del super admin, sin org. Sin policies: sólo service role. |
| `business_context_documents` | si | si | org | org | org | org | OK | En la publicación de realtime; RLS aplica a postgres_changes. |
| `business_graph_node_positions` | si | si | org | org | org | org | OK | UPDATE sin WITH CHECK explícito: se aplica el USING. |
| `business_stages` | si | si | org | org | org | org | OK |  |
| `calendly_integrations` | si | si | — | — | — | — | OK | Tabla de secretos. Sin policies: `authenticated` no lee ni escribe filas (sólo service role). |
| `call_analyses` | si | si | org | org | org | — | OK |  |
| `client_checkpoint_events` | si | si | org | org | org | org | OK |  |
| `client_checkpoint_proposals` | si | si | org | org | org | org | OK |  |
| `client_checkpoints` | si | si | org | org | org | org | OK |  |
| `client_identities` | si | si | org | org | org | org | OK |  |
| `client_journey_stages` | si | si | org | org | org | org | OK |  |
| `client_onboarding_links` | si | si | org | org | org | — | OK | `token` legible por la propia org (es su link). |
| `client_onboarding_submissions` | si | si | org | — | — | — | OK |  |
| `client_payments` | si | si | org | org | — | — | OK |  |
| `client_problems` | si | si | org | — | — | — | OK |  |
| `client_revenue_entries` | si | si | org | org | org | org | OK |  |
| `client_sub_clients` | si | si | org | org | org | org | OK |  |
| `client_tasks` | si | si | org | org | org | org | OK |  |
| `client_timeline_entries` | si | si | org | — | — | — | OK |  |
| `client_wins` | si | si | org | org | org | org | OK |  |
| `clients` | si | si | org+portfolio | org | org | org | Revisar | SELECT de portfolio sin rol ([HOLDING-PORTFOLIO-ROL]). Escrituras sólo org propia. |
| `closing_calls` | si | si | org+portfolio | org | org | — | Revisar | SELECT de portfolio sin rol ([HOLDING-PORTFOLIO-ROL]). |
| `competitor_posts` | si | si | org | org | org | org | OK |  |
| `competitors` | si | si | org | org | org | org | OK |  |
| `content_assets` | si | si | org | — | org | — | OK |  |
| `content_pattern_reports` | si | si | org | org | — | — | OK |  |
| `content_pieces` | si | si | org | org | org | org | OK |  |
| `conversations` | si | si | org+portfolio | org | org | — | Revisar | SELECT de portfolio sin rol ([HOLDING-PORTFOLIO-ROL]). En la publicación de realtime sin migración que lo agregue (H5). |
| `custom_metrics` | si | si | org | org | org | org | OK |  |
| `customer_avatars` | si | si | org | org | org | org | OK |  |
| `discord_channel_clients` | si | si | org | org | org | org | OK |  |
| `discord_client_links` | si | si | org | org | org | org | OK | Policy ALL sin WITH CHECK: el USING (org) vale para INSERT/UPDATE. |
| `discord_integrations` | si | si | org | org | org | org | Revisar | `guild_id` escribible por PostgREST; el bot resuelve la org por `guild_id` (H2). Único global, así que sólo sirve para ocupar un servidor antes que su dueño. |
| `discord_messages` | si | si | org | org | org | org | OK | Policy ALL sin WITH CHECK: el USING (org) vale para INSERT/UPDATE. |
| `discord_pending_links` | si | si | org | org | org | org | OK | Policy ALL sin WITH CHECK: el USING (org) vale para INSERT/UPDATE. |
| `discord_team_members` | si | si | org | org | org | org | OK |  |
| `executive_reports` | si | si | org | — | — | — | OK |  |
| `fathom_calls` | si | si | org+usuario | — | — | — | OK | Org **y** (vinculada a cliente, o grabada por el usuario, o sin usuario). |
| `fathom_integrations` | si | si | — | — | — | — | OK | Tabla de secretos. Sin policies: `authenticated` no lee ni escribe filas (sólo service role). |
| `field_definitions` | si | si | org | org | org | org | OK |  |
| `fixed_expenses` | si | si | org | org | org | org | OK |  |
| `form_responses` | si | si | org | — | — | — | OK |  |
| `forms` | si | si | org | — | — | — | OK |  |
| `founder_communication_tone` | si | si | false | false | false | false | OK | Policy `deny_all` (`false`). |
| `funnel_benchmarks` | si | si | org | org | org | org | OK |  |
| `funnel_instances` | si | si | org | org | org | org | OK |  |
| `funnel_period_snapshots` | si | si | org | org | org | org | OK |  |
| `funnel_step_bindings` | si | si | org | org | org | org | OK |  |
| `ghl_integrations` | si | si | — | org | org | org | Revisar | Sin SELECT (bien: API key y secreto no legibles). Pero INSERT/UPDATE dejan escribir `location_id` a cualquier miembro y el webhook de plataforma resuelve la org por ese valor (H2). |
| `ghl_opportunities` | si | si | org | — | — | — | OK |  |
| `ghl_pipeline_stages` | si | si | org | — | — | — | OK |  |
| `ghl_pipelines` | si | si | org | — | — | — | OK |  |
| `ghl_stage_transitions` | si | si | org | — | — | — | OK |  |
| `ghl_webhook_events` | si | si | — | — | — | — | OK | Payload crudo de webhooks. Sin policies: sólo service role. |
| `google_forms_integrations` | si | si | — | — | — | — | OK | Tabla de secretos. Sin policies: `authenticated` no lee ni escribe filas (sólo service role). |
| `holding_active_sessions` | no | si | false | false | false | false | OK | `deny_all`. La escribe la app con service role; la lee el hook del JWT. |
| `holding_businesses` | no | si | holding propio | — | — | — | OK | Sin org_id: filtra `holding_org_id` contra la org del propio perfil. Sólo lectura. |
| `holding_organizations` | si | si | false | false | false | false | OK | Policy `super_admin_only` = `false`. |
| `holdings` | no | si | false | false | false | false | OK | Policy `super_admin_only` = `false`. |
| `hyros_ad_accounts` | si | si | org | — | — | — | OK |  |
| `hyros_attribution_cache` | si | si | org | — | — | — | OK |  |
| `hyros_integrations` | si | si | — | — | — | — | OK | Tabla de secretos. Sin policies: `authenticated` no lee ni escribe filas (sólo service role). |
| `instagram_integrations` | si | si | — | — | — | — | OK | Tabla de secretos. Sin policies: `authenticated` no lee ni escribe filas (sólo service role). |
| `instagram_messages` | si | si | org | — | — | — | OK |  |
| `instagram_threads` | si | si | org | — | — | — | OK |  |
| `intelligence_snapshots` | si | si | org | — | — | — | OK |  |
| `knowledge_base_categories` | si | si | org | org | org | org | OK |  |
| `launch_metrics` | si | si | org | org | org | org | OK |  |
| `launches` | si | si | org | org | org | org | OK |  |
| `lead_magnet_clicks` | si | si | org | — | — | — | OK |  |
| `lead_magnet_leads` | si | si | org | org | org | org | OK |  |
| `lead_magnets` | si | si | org | org | org | org | OK |  |
| `manychat_events` | si | si | org | org | org | org | Revisar | Prod tiene una policy de más (`org_members_manychat_events`, ALL) que no está en el repo (H5). Filtra por org; no cruza orgs. |
| `manychat_integrations` | si | si | — | — | — | — | OK | Tabla de secretos. Sin policies: `authenticated` no lee ni escribe filas (sólo service role). |
| `mercadopago_integrations` | si | si | — | — | — | — | OK | Tabla de secretos. Sin policies: `authenticated` no lee ni escribe filas (sólo service role). |
| `metrics_snapshots` | si | si | org | org | org | org | OK |  |
| `notification_preferences` | si | si | usuario | usuario | usuario | usuario | Revisar | Filtra sólo por `profile_id = auth.uid()`: el usuario puede escribir filas con `organization_id` de otra org. Hoy nadie consume esas filas fuera de su dueño (H6, Baja). |
| `onboarding_responses` | si | si | org | org | org | — | OK |  |
| `onboarding_state` | si | si | org | org | org | — | OK |  |
| `organization_notes` | si | si | org | org | org | org | OK |  |
| `organizations` | no (es la org) | si | org+portfolio | — | org (7 columnas) | — | Revisar | Portfolio sin rol ([HOLDING-PORTFOLIO-ROL]); SELECT de tabla entera incluye `claude_api_key_encrypted`, también de los negocios del portfolio ([DB-ORGS-SELECT-COLUMNAS]). UPDATE sólo 7 columnas por grant. |
| `payment_integrations` | si | si | — | — | — | — | OK | Tabla de secretos. Sin policies: `authenticated` no lee ni escribe filas (sólo service role). |
| `payment_orders` | si | si | org | — | — | — | OK |  |
| `payment_platforms` | si | si | org | org | org | org | OK |  |
| `payment_transactions` | si | si | org | — | — | — | OK |  |
| `payment_webhook_events` | si | si | — | — | — | — | OK | Payload crudo de webhooks. Sin policies: sólo service role. |
| `plan_durations` | si | si | org | org | org | org | OK | UPDATE sin WITH CHECK explícito: se aplica el USING. |
| `plans` | si | si | org | org | org | org | OK | UPDATE sin WITH CHECK explícito: se aplica el USING. |
| `products` | si | si | org | org | org | org | OK |  |
| `profiles` | si | si | propio u org | — | propio o founder/admin + trigger | — | OK | UPDATE propio o founder/admin de la org; trigger `protect_profile_columns` impide cambiar `organization_id`, `role`, `is_holding_admin` e `id` (probado en el cuerpo de la función). Sin INSERT/DELETE. Dentro de la org todos leen `hourly_rate`/`commission_pct` de todos (intra-org). |
| `rag_chunks` | si | si | org | org | org | org | OK |  |
| `rag_documents` | si | si | org | org | org | org | OK |  |
| `rate_limits` | no | si | — | — | — | — | OK | Sin policies: sólo service role (RPC `consume_rate_limit` sin EXECUTE para usuarios). |
| `reel_variation_jobs` | si | si | org | org | org | — | OK | En la publicación de realtime. UPDATE sin WITH CHECK explícito: Postgres usa el USING (org). |
| `sales_follow_up_options` | si | si | org | org | org | org | OK |  |
| `sales_frameworks` | si | si | org | org | org | org | OK |  |
| `sales_leads` | si | si | org | org | org | — | OK |  |
| `sales_scripts` | si | si | org | org | org | — | OK |  |
| `sop_attachments` | si | si | org | org | — | org | OK |  |
| `sop_generation_jobs` | si | si | org | org | org | org | OK | En la publicación de realtime. |
| `sop_versions` | si | si | org | org | org | — | OK |  |
| `sops` | si | si | org | org | org | org | OK |  |
| `sprints` | si | si | org | org | org | org | OK |  |
| `story_frames` | si | si | org | org | org | org | OK |  |
| `story_sequences` | si | si | org | org | org | org | OK |  |
| `stripe_integrations` | si | si | — | — | — | — | OK | Tabla de secretos. Sin policies: `authenticated` no lee ni escribe filas (sólo service role). |
| `subscriptions` | si | si | org | org | org | org | OK |  |
| `super_admin_deletions` | no | si | — | — | — | — | OK | Sin policies: sólo service role. |
| `super_admin_google_tokens` | no | si | — | — | — | — | OK | Secretos. Sin policies: sólo service role. |
| `super_admin_users` | no | si | — | — | — | — | OK | Sin policies: sólo service role. |
| `team_compensation` | si | si | org | org | org | org | OK |  |
| `team_invitations` | si | si | org | org | org | org | OK | Cross-org OK. Intra-org: cualquier miembro lee `token` y crea invitaciones ([PERMISOS-SERVER-ACTIONS]). |
| `team_member_integrations` | si | si | org+usuario | org+usuario | org+usuario | org+usuario | OK | Propia **y** de la propia org en USING y WITH CHECK (arreglado el 2026-09-22). |
| `team_roles` | si | si | org | org | org | org | OK | Cross-org OK. Intra-org: cualquier miembro edita permisos ([PERMISOS-SERVER-ACTIONS]). |
| `token_usage` | si | si | org | — | — | — | OK |  |
| `typeform_integrations` | si | si | — | — | — | — | OK | Tabla de secretos. Sin policies: `authenticated` no lee ni escribe filas (sólo service role). |
| `unipile_integrations` | si | si | org | org | org | org | Revisar | `unipile_account_id` escribible por PostgREST y único sólo por org; el webhook resuelve la org por ese valor (H2). |
| `utm_booking_attributions` | si | si | org | — | — | — | OK |  |
| `utm_lead_captures` | si | si | org | — | — | — | OK |  |
| `utm_links` | si | si | org | org | org | — | OK |  |
| `utm_sale_attributions` | si | si | org | — | — | — | OK |  |
| `value_ladder` | si | si | org | org | org | org | OK |  |
| `value_propositions` | si | si | org | org | org | — | OK | UPDATE sin WITH CHECK explícito: se aplica el USING. |
| `vturb_integrations` | si | si | — | — | — | — | OK | Tabla de secretos. Sin policies: `authenticated` no lee ni escribe filas (sólo service role). |
| `vturb_players` | si | si | org | — | — | — | OK |  |
| `vturb_stats_cache` | si | si | org | — | — | — | OK |  |
| `waitlist_leads` | no | si | false | false | false | false | OK | Policy `false` para todo. |
| `webinarjam_integrations` | si | si | — | — | — | — | OK | Tabla de secretos. Sin policies: `authenticated` no lee ni escribe filas (sólo service role). |
| `webinarjam_registrants` | si | si | org | — | — | — | OK |  |
| `webinarjam_webinars` | si | si | org | — | — | — | OK |  |
| `weekly_inputs` | si | si | org | org | org | org | OK |  |
| `weekly_reports` | si | si | org | org | org | — | OK |  |
| `win_attachments` | si | si | org | org | org | org | OK |  |
| `win_usages` | si | si | org | org | org | org | OK |  |
| `workboard_task_attachments` | si | si | org | org | — | org | OK |  |
| `workboard_task_documents` | si | si | org | org | — | org | OK |  |
| `workboard_tasks` | si | si | org | org | org | org | OK |  |
| `youtube_integrations` | si | si | — | — | — | — | OK | Tabla de secretos. Sin policies: `authenticated` no lee ni escribe filas (sólo service role). |
| `zernio_comments` | si | si | org | org | org | — | OK | UPDATE sin WITH CHECK explícito: se aplica el USING. |
| `zernio_conversation_analysis` | si | si | org | — | — | — | OK |  |
| `zernio_integrations` | si | si | — | — | — | — | OK | Tabla de secretos. Sin policies: `authenticated` no lee ni escribe filas (sólo service role). |
| `zernio_messages` | si | si | org | org | — | — | OK |  |

Totales: 147 tablas, **147 con RLS**, 138 OK, 9 Revisar, 0 Falla. 21 tablas tienen RLS sin ninguna policy (advisor `rls_enabled_no_policy`): son las de secretos, payloads crudos de webhooks, `rate_limits`, `ai_brain_documents` y `super_admin_*`, y está bien que sea así.

### Tablas de secretos

`calendly_integrations`, `fathom_integrations`, `google_forms_integrations`, `hyros_integrations`, `instagram_integrations`, `manychat_integrations`, `mercadopago_integrations`, `payment_integrations`, `stripe_integrations`, `typeform_integrations`, `vturb_integrations`, `webinarjam_integrations`, `youtube_integrations`, `zernio_integrations` y `super_admin_google_tokens`: RLS activo y **ninguna policy**, así que `authenticated` no ve filas aunque tenga grant de columna. `ghl_integrations` no tiene SELECT (la key y el secreto no se leen) pero sí INSERT/UPDATE/DELETE por org (ver H2). `team_member_integrations` sólo deja ver la fila propia **y** de la propia org. Dos columnas cifradas sí son legibles:
- `organizations.claude_api_key_encrypted`: `authenticated` tiene SELECT de tabla entera en prod (`relacl` = `authenticated=r`), y la policy de portfolio lo extiende a los negocios del holding (ver H7).
- `team_member_integrations.encrypted_api_key`, `webhook_secret`, `webhook_token`: sólo del propio usuario.

### Funciones SQL expuestas

| Función | SECURITY DEFINER | `search_path` | EXECUTE `anon` | EXECUTE `authenticated` | ¿Valida la org? | Veredicto |
|---|---|---|---|---|---|---|
| `get_my_organization_id()` | sí | `public` | **sí** | sí | Es la que define la org | OK (con `anon` devuelve `null`) |
| `get_my_holding_business_org_ids()` | sí | `public` | **sí** | sí | Sólo mira que la org del perfil sea holding y el vínculo activo; **no mira rol** | Revisar (H3) |
| `current_user_is_founder_or_admin()` | sí | `public` | **sí** | sí | Sólo el propio perfil | OK (sólo en prod, sin migración: H5) |
| `create_default_roles(org_id)` | sí | `public` | no | sí | Sí: `org_id IS DISTINCT FROM get_my_organization_id()` → excepción | OK |
| `custom_access_token_hook(event)` | sí | `public` | no | no | Vínculo activo; **no mira rol** | Revisar (H4) |
| `search_rag_chunks`, `get_active_sales_script`, `client_last_activity`, `consume_rate_limit`, `get_holding_dashboard_stats`, `increment_utm_*` (4), `onboarding_connected_source_count`, `onboarding_org_progress` | sí | `public` | no | no | Reciben la org por parámetro, pero sólo las llama el servidor con service role | OK (revocadas en `20260922110000_rpcs_y_policies_entre_organizaciones.sql`) |
| `rls_auto_enable()` | sí | `pg_catalog` | sí | sí | Es la función del event trigger `ensure_rls` de la plataforma; no se puede invocar como RPC útil | OK |
| `protect_profile_columns()`, `set_updated_at()`, `get_current_week_start()` | no | fijo / **no** / **no** | — | — | Triggers y utilitaria | OK (advisor: `search_path` mutable en las dos últimas, Baja, sin efecto entre orgs) |

No hay `pg_graphql` instalado (no hay una segunda API sobre las tablas) ni otras funciones SECURITY DEFINER en `public`. No hay triggers en `public` aparte del de `profiles`.

### Vistas

| Vista | Modo | Filtro | Veredicto |
|---|---|---|---|
| `organization_claude_status` | SECURITY DEFINER (advisor ERROR `security_definer_view`) | `WHERE current_user NOT IN (authenticated, anon) OR id = get_my_organization_id()`; expone sólo `has_claude_key`, estado y fecha. SELECT sólo a `authenticated` | OK: el filtro por org está dentro de la vista (cerrado en `20260922110000`). El aviso del advisor es esperado |
| `workboard_time_by_member` | `security_invoker=true` | RLS de `workboard_tasks` y `profiles` del que consulta | OK (el grant a `anon` no sirve de nada: RLS devuelve vacío) |

### Storage (13 buckets)

| Bucket | Público | Policies en `storage.objects` | ¿El path incluye la org y se valida? | Veredicto |
|---|---|---|---|---|
| `import-files` | no | SELECT, INSERT y DELETE para `authenticated` con **sólo** `bucket_id = 'import-files'` | **No.** Cualquier usuario logueado lista, baja, sube y borra todo | **Falla** (H1) |
| `agent-documents` | no | SELECT/INSERT/DELETE si `foldername[1] = get_my_organization_id()` | Sí | OK |
| `discord-bot-avatars` | sí | INSERT/UPDATE/DELETE por `foldername[1] = get_my_organization_id()`; sin SELECT (no se lista) | Sí | OK |
| `avatars` | sí | INSERT/UPDATE/DELETE por `foldername[1] = profiles.organization_id` (la org del perfil, no la efectiva del holding); **SELECT para `public`** | Escritura sí; lectura listable por cualquiera | Revisar (H8) |
| `content-thumbnails` | sí | **SELECT para `public`**; escritura sólo `service_role` | Lectura listable por cualquiera | Revisar (H8, ya en PENDIENTES) |
| `ai-brain-documents`, `business-context-documents`, `client-payment-receipts`, `client-wins`, `sop-attachments`, `sop-videos`, `trial-reels`, `workboard-task-attachments` | no | ninguna | Sólo service role; la app sirve URLs firmadas | OK |

### Realtime

- Publicación `supabase_realtime`: `conversations`, `business_context_documents`, `reel_variation_jobs`, `sop_generation_jobs`. La app sólo usa `postgres_changes` (`providers/platform-data-provider.tsx`, `lib/business-context/use-documents-realtime.ts`, `components/sops/sop-video-creator.tsx`, `components/marketing/trial-reels/trial-reels-panel.tsx`); Realtime evalúa la policy de SELECT de cada tabla con el JWT del suscriptor, así que el filtro por canal no importa: RLS manda. `conversations` hereda el portfolio sin rol (H3).
- Los DELETE se entregan sin evaluar RLS, pero con `REPLICA IDENTITY DEFAULT` (las cuatro tablas) sólo viaja la clave primaria: se puede ver que se borró un UUID de otra org, nada más. OK.
- `realtime.messages` (Broadcast/Presence privados): RLS activo y sin policies → canales privados denegados. La app no los usa. OK.
- `conversations` está en la publicación en prod pero **ninguna migración la agrega** (sí las otras tres): ver H5.

### Holding

- `get_my_holding_business_org_ids()` devuelve los negocios activos de la org holding del perfil. **No mira** `role` ni `is_holding_admin`. En prod la usan cuatro policies consolidadas: `Users read own or portfolio clients`, `… closing calls`, `… conversations` y `Users read own or linked business orgs` (en el repo son las `holding_reads_portfolio_*` de `20260630100000_holding_portfolio_rls.sql`: misma lógica, otro nombre). Sólo lectura: las escrituras siguen filtrando por `get_my_organization_id()`.
- `holding_businesses`: cualquier miembro del holding ve los vínculos de su holding. Sin escritura para usuarios. OK.
- El hook (`custom_access_token_hook`) sólo exige que exista `holding_active_sessions` para el perfil y que el vínculo esté activo. **No revisa rol ni `is_holding_admin`** y el claim, una vez emitido, no se revalida hasta que vence el JWT (H4).

### Producción contra migraciones

- **Historial**: `supabase_migrations.schema_migrations` tiene exactamente las 175 versiones de `supabase/migrations/` (diff vacío).
- **Policies de `public`**: coinciden en todo menos lo ya documentado en `docs/historial/DB_DIFF_PRODUCCION_2026-09-22.md` (policies consolidadas de `clients`, `closing_calls`, `conversations`, `organizations`, `profiles`) y **una que ese diff no registró**: `manychat_events` tiene en prod una tercera policy `org_members_manychat_events` (`ALL`, `USING get_my_organization_id() = organization_id`) que no está en ninguna migración; deja a los miembros hacer UPDATE/DELETE en su org, no cruza orgs.
- **Storage**: en prod hay 15 policies en `storage.objects`; el repo crea 11. Las tres de `import-files` y las cuatro de `avatars` de prod (`Avatar … por org`, `Avatar read público`) no están en el repo; las tres de avatars del repo (`Org members … avatars`, que usan `get_my_organization_id()`) no existen en prod.
- **Realtime**: `conversations` en la publicación sin migración.
- **Grants**: el repo hace `REVOKE ALL … FROM public` + `GRANT … TO authenticated` sobre `get_my_organization_id()` y `get_my_holding_business_org_ids()`, pero en prod `anon` conserva EXECUTE (Supabase da grant explícito a `anon`, y `FROM public` no lo saca, como ya advierte `20260922110000`). Sin efecto hoy: sin JWT devuelven `null`/vacío.

### Hallazgos

**H1 · Falla · Crítica — `import-files` abierto a todas las organizaciones.**
- **Hecho:** tres policies de `storage.objects` en prod — `Users can read import files` (SELECT), `Users can upload import files` (INSERT), `Users can delete import files` (DELETE) — para `authenticated`, con condición única `bucket_id = 'import-files'` (`pg_policies`). Ninguna migración las crea. El código ya no usa el bucket (`apps/web/lib/super-admin/deletion-plan.ts:35-39`).
- **Observación:** es el único lugar de la base donde un usuario de A lee y borra datos de B sin ninguna condición.
- **Riesgo:** cualquiera con cuenta lista `imports/` con su JWT y baja o borra lo que subieron otras orgs.
- **Recomendación:** migración que borre las tres policies (y el bucket tras respaldar su contenido).
- **PENDIENTES:** `[SEG-BUCKET-IMPORT-FILES]` (ya existe; esta revisión lo confirma).

**H2 · Revisar · Crítica — Identificadores de cuentas externas escribibles por cualquier miembro.**
- **Hecho:** `discord_integrations` (policy `org_access`, ALL), `unipile_integrations` (`Users manage own org unipile`, ALL) y `ghl_integrations` (INSERT/UPDATE/DELETE por org) dejan a cualquier miembro, por PostgREST, insertar o cambiar `guild_id`, `unipile_account_id`+`status` y `location_id` (grants de columna INSERT/UPDATE a `authenticated` confirmados en prod). El sistema elige la org dueña de un evento entrante por esos valores con service role: `getOrgByGuildId` (`apps/discord-bot/src/lib/supabase.ts:117-123`), `getUnipileIntegrationByAccountId` (`apps/web/lib/unipile/integration.ts:14-26`, `maybeSingle`) y `resolveOrganizationByLocation` (`apps/web/lib/ghl/ingest-opportunity-event.ts:172-185`, `maybeSingle`, usada en `app/api/webhooks/ghl/route.ts:56` y `:93`). Unicidad: `guild_id` único global; `unipile_account_id` único **por org**; `location_id` **sin** índice único.
- **Observación:** el flujo normal escribe esas columnas con admin client después de un OAuth o un hosted auth que prueba la propiedad de la cuenta; la base no exige ese camino.
- **Riesgo:** si un miembro de A escribe el identificador de la cuenta de B: (a) Unipile: dos filas `connected` con el mismo `unipile_account_id` hacen fallar el `maybeSingle` y los DMs de B dejan de guardarse sin aviso; si la de B no está `connected`, los recibe A. (b) GHL: con la vía de la app del Marketplace (hoy no existe, `[FEAT-GHL-OAUTH]`), los eventos firmados de la sub-cuenta de B irían a A o se rechazarían; la vía de workflow actual lleva `organizationId` en la URL y no se ve afectada. (c) Discord: A puede ocupar el `guild_id` de un servidor antes de que su dueño lo conecte; la conexión de B falla por la unicidad y los mensajes de ese servidor quedan en A. Hace falta conocer el identificador ajeno (el de Discord es visible para cualquier miembro del servidor; los otros dos son opacos).
- **Recomendación:** sacar INSERT/UPDATE de esas columnas a `authenticated` (grants por columna o policies sólo de SELECT/DELETE) y dejar la escritura a los callbacks con service role; índice único global en `unipile_account_id` (con `status = 'connected'`) y en `ghl_integrations.location_id`.
- **PENDIENTES:** nuevo `[SEG-RLS-IDENTIFICADORES-EXTERNOS]`.

**H3 · Revisar · Crítica — El portfolio del holding no mira el rol.**
- **Hecho:** las cuatro policies de portfolio de prod usan `get_my_holding_business_org_ids()`, cuyo cuerpo sólo exige `account_type = 'holding'` y vínculo `active`.
- **Riesgo e impacto:** ya descritos en PENDIENTES.
- **Recomendación:** además de lo que dice el ítem, la migración que lo arregle tiene que borrar las policies **con el nombre de prod** (`Users read own or portfolio …`, `Users read own or linked business orgs`), no las `holding_reads_portfolio_*` del repo, que en prod no existen.
- **PENDIENTES:** `[HOLDING-PORTFOLIO-ROL]` (existente; se propone ampliar). `[AUD-SEG-3]` describía lo mismo: se borró como duplicado.

**H4 · Revisar · Crítica — El negocio activo del holding no se revalida contra el rol.**
- **Hecho:** `custom_access_token_hook` agrega `active_business_org_id` si hay fila en `holding_active_sessions` y el vínculo está activo; no mira `role` ni `is_holding_admin`. `get_my_organization_id()` confía en el claim sin volver a mirar nada. `enterBusinessAction` sí exige `canManageHolding`, pero sólo al entrar (`docs/arquitectura/auth-organizaciones-y-permisos.md`, "Holding: qué org ve cada request").
- **Observación:** la fila de `holding_active_sessions` se borra sólo en `exitBusinessAction` y `signOutAction`.
- **Riesgo:** si a un admin del holding le sacan `is_holding_admin` (o deja de ser founder) mientras está dentro de un negocio, cada refresh del token le vuelve a dar el claim: sigue leyendo **y escribiendo** todo el negocio por PostgREST con permisos completos de org. Si se desactiva el vínculo, el claim sigue vigente hasta que vence el JWT (duración no verificada; default de Supabase 1 h).
- **Recomendación:** que el hook exija founder o `is_holding_admin` del holding; borrar `holding_active_sessions` del perfil al cambiarle el rol o la marca; opcionalmente que `get_my_organization_id()` revalide el vínculo activo.
- **PENDIENTES:** nuevo `[DB-CLAIM-HOLDING-SIN-REVALIDAR]`.

**H5 · Revisar · Media — Producción difiere del repo en Storage, Realtime y grants.**
- **Hecho:** ver "Producción contra migraciones" arriba: 7 policies de Storage sólo en prod (incluidas las de H1), 3 sólo en el repo, `manychat_events` con una policy de más, `conversations` en la publicación sin migración, `current_user_is_founder_or_admin()` sin migración, EXECUTE de `anon` sobre las funciones de org.
- **Observación:** `docs/historial/DB_DIFF_PRODUCCION_2026-09-22.md` comparó tablas, funciones y policies de `public`, pero no `storage.objects`, la publicación de realtime ni los grants de funciones; el bucket abierto (H1) vivía justamente ahí.
- **Riesgo:** una base levantada desde el repo no tiene las mismas reglas que prod, y un cambio a mano en prod puede abrir un agujero que nadie ve en el código.
- **Recomendación:** migración de reconciliación que declare las policies de `avatars` que se quieren, borre `org_members_manychat_events`, agregue `conversations` a la publicación y `current_user_is_founder_or_admin()`, y revoque EXECUTE a `anon`; sumar `storage.objects`, `pg_publication_tables` y grants de funciones al chequeo de diff.
- **PENDIENTES:** nuevo `[DB-DRIFT-STORAGE-REALTIME]`.

**H6 · Revisar · Media — Nada impide que una fila apunte a filas de otra organización.**
- **Hecho:** 115 FKs de tablas con `organization_id` hacia otras tablas con `organization_id` son de una sola columna (`pg_constraint`, ninguna compuesta con `organization_id`). Las policies de INSERT/UPDATE miran sólo el `organization_id` de la fila escrita. `notification_preferences` filtra sólo por `profile_id = auth.uid()`, así que el usuario puede escribir filas con el `organization_id` de otra org (hoy sólo las lee su dueño: `app/settings/actions.ts:295-370`).
- **Observación:** con RLS, el que inserta no puede leer la fila ajena; pero la FK confirma que el UUID existe (sirve de oráculo) y cualquier proceso con service role que siga la FK mezcla datos de dos orgs. `[FATHOM-CLIENTID-SIN-VALIDAR]` es un caso de esto del lado de la app.
- **Riesgo:** si un job con admin client lee una fila de A y sigue un `client_id` que apunta a B, entonces muestra o procesa datos de B dentro de A. Requiere conocer UUIDs ajenos.
- **Recomendación:** en las relaciones críticas (`client_id`, `sop_id`, `win_id`, `task_id`, `custom_role_id`) FK compuesta `(organization_id, x_id)` → `(organization_id, id)` o trigger de misma org; en `notification_preferences`, agregar `organization_id = get_my_organization_id()` al WITH CHECK.
- **PENDIENTES:** nuevo `[DB-FK-MISMA-ORG]`.

**H7 · Revisar · Media — Ciphertext de la key de Claude de los negocios, legible desde el holding.**
- **Hecho:** `authenticated` tiene SELECT de tabla sobre `organizations` en prod (incluye `claude_api_key_encrypted`, `mrr_usd`, `enabled_add_ons`), y la policy `Users read own or linked business orgs` extiende esas filas a los negocios del portfolio de cualquier miembro del holding.
- **Riesgo:** sin `ENCRYPTION_MASTER_KEY` el ciphertext no sirve; si esa clave se filtrara, cualquier miembro de un holding tendría las keys de los negocios.
- **Recomendación:** lo que ya dice el ítem (grant por columna sin `claude_api_key_encrypted`), sabiendo que también cierra el lado holding.
- **PENDIENTES:** `[DB-ORGS-SELECT-COLUMNAS]` (existente; se propone ampliar).

**H8 · Revisar · Baja — Buckets públicos que además se pueden listar.**
- **Hecho:** `content-thumbnails` y `avatars` son públicos y tienen una policy de SELECT para `public` (`Public read content thumbnails`, `Avatar read público`). Con ella cualquiera, sin cuenta, lista los objetos: las carpetas son UUIDs de organización. `discord-bot-avatars` es público sin policy de SELECT (no se lista): así debería ser.
- **Riesgo:** enumeración de IDs de organización y de nombres de archivo; el contenido ya es público por URL.
- **Recomendación:** borrar las dos policies de SELECT; las URLs públicas siguen funcionando.
- **PENDIENTES:** `[AUDITORIA §3 seguridad 9]` (existente; se propone sumar `avatars`).

### Lo que está bien

- RLS activado en las 147 tablas de `public` y en todas las de `storage`; el event trigger `ensure_rls` activa RLS en toda tabla nueva de `public`.
- Ninguna policy `true`, ninguna para `anon` que no dependa de `auth.uid()`, ninguna policy de escritura que confíe en un `organization_id` que el usuario pueda elegir libremente: todas exigen que sea el propio (USING y WITH CHECK, o USING aplicado como check).
- `profiles` no permite cambiar de organización ni de rol (trigger), y el negocio activo del holding sólo lo puede poner el hook firmado.
- Las 16 tablas con tokens y API keys no son legibles por usuarios; las RPCs que reciben una org por parámetro no las puede ejecutar `authenticated` (salvo `create_default_roles`, que valida la org).
- Las dos vistas filtran por org (una por dentro, la otra con `security_invoker`).
- Los 8 buckets privados con datos sensibles no tienen policies: sólo el servidor los toca y entrega URLs firmadas. `agent-documents` valida la org en el path.
- Realtime: sólo `postgres_changes`, que respeta RLS; canales privados cerrados.
- El historial de migraciones de prod coincide exactamente con los archivos del repo.

## Capa de aplicación

> Pregunta: ¿puede una request —de un usuario de la org A, de un anónimo o de un tercero que llama a un
> webhook— hacer que **el servidor** lea o escriba datos de la org B? La capa de base (RLS, policies,
> funciones) está en la sección anterior; acá se mira el código que corre con **service role** o que decide
> a qué org pertenece algo.

### Alcance y método

- **Código auditado:** `apps/web`, `apps/discord-bot`, `apps/reel-worker` en el commit `038caca`.
- **Qué se revisó:**
  - Los **189 archivos** que usan `createAdminClient()` / la service role key (grep de `createAdminClient|SERVICE_ROLE|SUPABASE_SECRET_KEY`, sin tests). En cada uno se buscó **de dónde sale el `organization_id`** que filtra.
  - Las **98 unidades `"use server"`** (44 usan el admin client). Un script sacó toda cadena `admin.from(...)`/`admin.storage...` que **no** filtra por `organization_id`, y se leyó cada una a mano (unas 110).
  - Los **84 route handlers** de `app/api/**`, su autenticación y la lista `isPublicPath`.
  - Webhooks, OAuth, crons y colas, holding, caches, RAG y agente, bot de Discord y worker de reels.
- **Producción (Supabase `nrzlylzbmsuowzhpdnjl`), sólo estructura:**
  - `pg_policies` y privilegios de columna (`information_schema.column_privileges`) de las tablas que guardan rutas de Storage.
  - Constraints y triggers de esas tablas; FKs hacia `clients`/`workboard_tasks`/`team_roles`/`profiles`.
  - `EXECUTE` de las RPCs `search_rag_chunks`, `get_holding_dashboard_stats`, `increment_utm_*` y `consume_rate_limit`.
  - No se leyeron filas.
- **Vercel (proyecto `otc-plaform`):** se listaron los **nombres** de las variables, sin descifrar ningún valor.
- **Qué no se pudo verificar:**
  - Ningún hallazgo se explotó contra producción: no hubo segunda cuenta ni segunda org de prueba.
  - No se sabe cuántas orgs tienen cada integración: contarlo exige leer filas.
  - No se sabe si el valor de `ZERNIO_API_KEY` en Vercel es una key real o el placeholder `sk_pending`.
  - No se sabe qué secrets tiene el worker de Fly.
  - No se revisó el comportamiento de cada proveedor OAuth frente a un `state` armado por un tercero. Se asume el flujo estándar: el proveedor devuelve el `state` que recibió.

### Resumen

En el uso diario, la app no mezcla organizaciones. Cada pantalla y cada acción averigua la organización a
partir de la sesión y filtra por ella, también cuando usa la llave maestra de la base. Los crons, las colas,
el bot de Discord y el buscador de la IA reciben la organización de una fuente confiable y la respetan. Los
caches internos siempre se guardan por organización.

Aparecieron **dos huecos nuevos graves**:

1. **Conectar integraciones de otra organización.** Al volver de conectar Stripe, Mercado Pago, Calendly,
   Instagram, Google, YouTube, Typeform o Discord, el servidor toma "a qué organización conectar" de un dato
   del navegador, sin firma y sin mirar la sesión. Cualquiera que conozca el identificador de otra
   organización puede enchufarle su propia cuenta de Stripe o de Calendly. Así le reemplaza la conexión y le
   mete datos falsos.
2. **Leer o borrar archivos de otra organización.** Varias tablas guardan la ubicación de un archivo, y un
   usuario puede escribir esa ubicación directamente en la base. Después el servidor abre o borra esa
   ubicación con la llave maestra sin volver a chequearla. Con eso un usuario puede, por ejemplo, hacer que
   se transcriba el video de un procedimiento de otra organización.

Además se confirmaron y ampliaron tres problemas ya anotados:

- **Asociar una llamada de Fathom a un cliente ajeno** escribe en la ficha de ese cliente, que sí ve la otra
  organización.
- **La llave global de Zernio** está cargada en producción.
- **El portfolio del holding:** un miembro sin permisos del holding también **escribe** en los negocios a
  través de las acciones que usan la llave maestra.

### Inventario 1 · Cómo se resuelve la organización en cada tipo de entrada

| Entrada | De dónde sale el org_id | Qué se valida | Veredicto |
|---|---|---|---|
| Server Actions y pantallas | `requireOrganizationId()` (`lib/auth/bootstrap.ts:220`): `auth.getUser()` → `profiles` por service role → negocio activo del holding | Holding: header `x-active-org-id` o cookie `limitless_active_org`, re-verificados contra `holding_businesses` activo (`lib/holding/resolve-org.ts:15-40`) | OK para cuentas founder. **Revisar** en holding: no mira `canManageHolding` (ver H-5) |
| API routes con sesión | `requireAuth()` / `requireAuthContext()` (`lib/auth/require-auth.ts`), la misma resolución | ídem | ídem |
| Acciones con `profile.organization_id` | `getCurrentProfile()` (contenido, workboard, closers, equipo, perfil) | Org del perfil, ignora el negocio activo | OK para aislamiento (nunca sale de la org propia). Bug funcional ya abierto: `[AUD-SALUD-ORG-HOLDING]` |
| Super admin | `requireSuperAdmin()` (allowlist `super_admin_users` por email); la org viene por parámetro | Rol de plataforma | OK (es el diseño) |
| Crons `/api/cron/*` y `*/sync`, `*/process`, `*/poll`, `*/reanalyze` | Fan-out sobre tablas de integraciones; `?organizationId=` opcional | `assertCronAuthorized` (`Bearer CRON_SECRET`, tiempo constante, lanza sin variable) | OK: quien tiene `CRON_SECRET` es de confianza |
| Colas `/api/queue/*` | `organizationId`/`jobId` del cuerpo | `verifyQueueRequest` (`WORKER_AUTH_SECRET` o firma QStash) / `verifyQStashRequest` | OK. Deuda ya abierta: la firma no se ata a la URL (`[AUD-SEG-4]`) |
| Webhooks de pagos (Whop, Commas/Fanbasis) | `?organizationId=` | La firma con el secreto **de esa org** (`getWebhookSecret`) | OK |
| Webhook GHL | `?organizationId=` (workflow) o `locationId` del payload (plataforma) | Secreto por org o firma Ed25519/RSA; en la vía plataforma exige que el `locationId` firmado resuelva a esa org (`app/api/webhooks/ghl/route.ts:88-100`). El `location_id` se valida con la API key al conectar | OK |
| Webhook Calendly | La org cuya `webhook_signing_key` valida la firma | HMAC por org | OK |
| Webhook Fathom por miembro | `webhook_token` de la URL → `team_member_integrations` | Token + HMAC con el secreto de esa fila | OK |
| Webhook Fathom legacy | La única org cuyo secreto valida; con más de una → 409 | Todas las filas usan el mismo secreto global (`lib/fathom/connect.ts:52`) | **Revisar** (H-7). Hoy `FATHOM_WEBHOOK_SECRET` no está en Vercel, así que responde 401 siempre |
| Webhook ManyChat | Token de 48 hex en la URL (`crypto.randomBytes(24)`) | Token | OK |
| Webhook Instagram (Meta) | `entry.id` → `instagram_integrations.instagram_user_id` | Firma de la app de Meta | OK |
| Webhook Zernio | `accountId` en `connected_accounts` / `profileId` | Firma HMAC con **un secreto global** | OK. Si dos orgs comparten workspace de Zernio, el evento va a la primera que aparezca (Baja, sin ítem). Hoy responde 503: `[ENV-ZERNIO-WEBHOOK-SECRET]` |
| Webhook Unipile y hosted auth (legacy) | `unipile_account_id` → integración; hosted auth: `name` codificado por Limitless al crear el link | Secreto global `UNIPILE_WEBHOOK_SECRET`, tiempo constante, fail-closed | OK (legacy, `[LEGACY-INBOX-BORRAR]`) |
| Webhook Mercado Pago | Ninguna: actualiza todas las orgs | Firma | Ya abierto: `[FIN-MP-WEBHOOK]` |
| **Callbacks OAuth** (Calendly org y closer, Discord, Google Forms/Drive, YouTube, Typeform, Instagram, Stripe, Mercado Pago, Drive del super-admin) | **Cookie JSON sin firmar** (`{organizationId, state}` o `{userId…}`) | Sólo `cookie.state === ?state`. Sin sesión: la ruta es pública | **Falla** (H-1) |
| Bot de Discord → app (`/api/discord/*`) | `organizationId` en el cuerpo, puesto por el bot | `LIMITLESS_WEBHOOK_SECRET` (en Vercel está cargada sólo `OTC_WEBHOOK_SECRET`, el respaldo que acepta el código) | OK |
| Bot de Discord (gateway) | `message.guildId` → `discord_integrations.guild_id` (único, sale del token OAuth) | Discord | OK |
| Worker de reels (Fly) | `organizationId`, `jobId`, `sourceStoragePath`, `reelMusicPath` del payload | Secreto o QStash (débil: `[SEG-REEL-WORKER-AUTH]`). No cruza `job.organization_id` ni el prefijo de las rutas | **Revisar**: defensa en profundidad |
| Públicos `/api/utm/track` y `/api/utm/click` | `organization_id` **del cuerpo** | `track` exige que la campaña exista en esa org; `click` sólo suma si existe; rate limit por IP | **Revisar** (H-6) |
| Públicos `/api/waitlist`, `/api/trial-confirm` | No tienen org (lista de espera de Limitless) | Rate limit y techo de largo | OK |
| `/onboarding-cliente/[token]` y su action | `client_onboarding_links.token` | Token, rate limit | OK |
| `/invite`, `/api/invite/validate` | `team_invitations.token` | Token | OK. Devuelve `error.message`: `[AUD-SEG-8]` |

### Inventario 2 · Uso de la service role key (189 archivos)

Veredicto por archivo o grupo. "Sesión" = `requireOrganizationId()` / `requireAuthContext()` / perfil.
"Llamador" = la función recibe la org de quien la llama y ese llamador está en el inventario 1.

**Núcleo**

| Archivo | Uso | Origen del org_id | Veredicto |
|---|---|---|---|
| `lib/supabase/{admin,env,middleware}.ts` | Cliente; `profiles` y `onboarding_state` del usuario logueado | `user.id` de `auth.getUser()` | OK |
| `lib/auth/{bootstrap,require-auth,require-super-admin,add-ons,regenerate-temp-password}.ts` | Perfil, org, allowlist, add-ons | Sesión. `regenerateUserTempPassword(userId)` sólo desde super admin y holding, con el vínculo verificado | OK |
| `lib/holding/switch-org.ts`, `app/(platform)/holding/actions.ts`, `app/(platform)/onboarding/holding/actions.ts` | `holding_businesses`, `holding_active_sessions`, alta de negocios | `requireHoldingProfile()` exige `canManageHolding`; cada `businessOrgId` se verifica contra `holding_businesses` | OK |
| `lib/rate-limit.ts`, `lib/track-token-usage.ts`, `lib/onboarding/{current,resolve}.ts` | Contadores, costos, estado de onboarding | Clave o org del llamador (sesión) | OK |
| `app/auth/actions.ts`, `app/auth/force-password-change/actions.ts` | Sign-out, contraseña | `user.id` | OK |

**Server Actions de producto (sesión)**

| Archivo | Origen | Veredicto |
|---|---|---|
| `app/settings/actions.ts`, `app/integrations/actions.ts`, `app/{ghl,hyros,stripe,mercadopago,unipile,youtube,manychat,payments,calendly}/actions.ts`, `app/ghl/import-actions.ts`, `app/manychat/cta-actions.ts`, `app/marketing/{actions,lead-magnets-actions,utm-actions}.ts`, `app/onboarding/actions.ts`, `app/clients/{signals-actions,onboarding-link-actions}.ts`, `app/closing/actions.ts`, `app/forms/actions.ts`, `app/sales/closer-actions.ts` | Sesión; cada id recibido se verifica con `organization_id` antes de usar el admin client. Ejemplos: `scoreFormResponsesAction`, `syncCloserCalendlyAction`, `assignOnboardingSubmissionAction` | OK (salvo permisos por rol: `[PERMISOS-SERVER-ACTIONS]`) |
| `app/integrations/zernio/actions.ts` | Sesión. `getZernioMessagesAction`, `sendZernioMessageAction`, `replyToZernioCommentAction` y `hideZernioCommentAction` no validan que `accountId` esté en `connected_accounts`; usan la key propia de la org, porque exigen integración activa y `connectZernioAction` siempre guarda key | OK (Baja: validar `accountId` si alguna vez hay keys compartidas) |
| `app/fathom/{one-on-one-actions,manual-upload-actions,member-actions}.ts` | Sesión; `clientId`/`callId` verificados con RLS antes del admin | OK |
| `app/fathom/actions.ts` → `lib/fathom/{process-call,deep-call-analysis,client-tasks}.ts` | Sesión, pero **`clientId` sin validar** | **Falla** (H-3, `[FATHOM-CLIENTID-SIN-VALIDAR]`) |
| `app/workboard/task-link-actions.ts`, `app/sales/payment-actions.ts`, `app/business-context/actions.ts`, `app/sops/{actions,video-actions}.ts`, `app/clients/win-actions.ts`, `app/marketing/content/{reel-variation-actions,reel-music-actions}.ts`, `app/api/queue/{process-sop-video,publish-reel-variation}/route.ts`, `app/api/cron/cleanup-trial-reels/route.ts` | Sesión o payload firmado para la **fila**; la **ruta de Storage** se lee de esa fila y se firma, descarga o borra sin re-validar el prefijo | **Falla** (H-2) |
| `app/team/actions.ts` | Sesión; invitaciones por token; `customRoleId` sin validar | Revisar: `[EQUIPO-CUSTOM-ROLE-ORG]` / `[INVITE-ROL-SIN-VALIDAR]` |
| `app/super-admin/{actions,delete-actions,drive-actions}.ts`, `lib/super-admin/*.ts`, `lib/ai-brain/*.ts` | `requireSuperAdmin()`; org por parámetro | OK. `ai_brain_documents` se inyecta en el contexto de **todas** las orgs a propósito (`lib/ai-brain/global-context.ts`); ver H-1 para el Drive del super-admin |
| `app/(platform)/operations/overview/page.tsx` | Sesión | OK |

**Librerías por dominio (org del llamador)**

| Grupo | Veredicto |
|---|---|
| `lib/agent/{jit-context,graph-proposal-tools,document-storage}.ts`, `lib/ai/{org-context,credential-resolver}.ts`, `lib/rag/{search,ingest,product-context-sources}.ts`, `lib/queue/processors/rag-ingestion.ts`, `lib/business-context/*` | OK. Org de la sesión (agente) o del payload firmado (cola). `search_rag_chunks` filtra `organization_id = org_id` dentro de la función y no es ejecutable por `authenticated` ni `anon` (verificado en prod). Las tools de lectura del agente (`lib/agent/data-reader-handlers.ts`) usan el cliente con RLS **y** `.eq("organization_id")`; las de escritura llaman Server Actions |
| `lib/executive-reports/*`, `lib/intelligence/*`, `lib/founder-tone/*`, `lib/metrics/baseline-service.ts`, `lib/discord/{classify-run,propose-checkpoints}.ts`, `lib/checkpoints/*`, `lib/sops/*`, `lib/forms/sync-scoring.ts` | OK. Org del fan-out del cron; todas las lecturas filtran por esa org |
| `lib/fathom/{sync,reclaim-stuck,identities,classify-recording,resolve-sales-call,knowledge-base-queries,diagnostics,one-on-ones,propose-checkpoints,connect}.ts` | OK. Las lecturas globales (`processPendingFathomCalls`, `reclaim-stuck`) usan después el `organization_id` de cada fila |
| `lib/fathom/process-call.ts:369`, `lib/fathom/deep-call-analysis.ts:159,193`, `lib/clients/client-tasks.ts:51` | **Falla** vía `[FATHOM-CLIENTID-SIN-VALIDAR]`: leen y actualizan `clients` por id sin `organization_id` |
| `lib/calendly/*`, `lib/ghl/*`, `lib/hyros/*`, `lib/vturb/*`, `lib/webinarjam/*`, `lib/typeform/sync.ts`, `lib/google-forms/sync.ts`, `lib/google/*`, `lib/youtube/analytics.ts`, `lib/instagram/*`, `lib/manychat/*`, `lib/mercadopago/tokens.ts`, `lib/payments/*`, `lib/unipile/*` | OK. Credenciales leídas por la org del llamador (sesión, cron o webhook resuelto como en el inventario 1) |
| `lib/zernio/integration.ts`, `lib/marketing/{ad-metrics-snapshot,sync-content-metrics,content-attribution,social-audience,story-thumbnail-storage,lead-magnets-internal}.ts` | **Falla** por la key global (H-4, `[ZERNIO-KEY-GLOBAL]`); el resto OK |
| `lib/utm/{track-lead,attribute-booking}.ts`, `lib/sales/lead-journey.ts` | `track-lead`: org del cuerpo público (H-6). `attributeSaleToUTM` lee `closing_calls.lead_name` por un `closingCallId` que manda el cliente sin validar org (Baja, dentro de `[AUD-SEG-5]`). `lead-journey` hereda la key global de Zernio |

**Otras apps**

| Archivo | Veredicto |
|---|---|
| `apps/discord-bot/src/lib/supabase.ts`, `events/ready.ts`, `index.ts` | OK. Org = `discord_integrations` por `guild_id` del gateway; todas las escrituras llevan esa org |
| `apps/reel-worker/src/processor.ts` | **Revisar**. Confía en `organizationId`, `jobId`, `sourceStoragePath` y `reelMusicPath` del payload: no cruza `reel_variation_jobs.organization_id` ni exige el prefijo `${organizationId}/` antes de descargar con service role. Con la autenticación débil de `[SEG-REEL-WORKER-AUTH]`, un payload armado lee y escribe archivos de cualquier org |

### Inventario 3 · Route handlers (84) por autenticación

| Autenticación | Rutas |
|---|---|
| Sesión (`requireOrganizationId`/`requireAuth*`) | `agent/send`, `agent/transcribe`, `content/analyze`, `*/oauth/start` y `*/connect` (Calendly, Discord, Google Forms, YouTube, Typeform, Instagram, Stripe, Mercado Pago, Unipile), `calendly/closer/start`, `fathom/connect`, `google/thumbnail`, `unipile/attendee-picture/[id]`, `*/disconnect` (MP, Stripe, Unipile). Super admin: `super-admin-google/oauth/start` |
| `CRON_SECRET` | 13 de `/api/cron/*`, `calendly/sync`, `fathom/{process,reanalyze,sync}`, `google-forms/sync`, `instagram/{poll,sync}`, `manychat/reanalyze`, `typeform/sync`, `rag/ingest` |
| QStash / `WORKER_AUTH_SECRET` | 9 de `/api/queue/*` |
| Firma o secreto del proveedor | `webhooks/{whop,fanbasis,ghl,instagram/messages,mercadopago,unipile}`, `integrations/{calendly,zernio,unipile}/webhook`, `fathom/webhook`, `fathom/webhook/[token]`, `manychat/webhook/[token]`, `unipile/callback` |
| Secreto del bot | `discord/{message,pending-link,testimonial}` |
| **Sólo `state` en cookie, sin sesión** | 10 callbacks OAuth + el alias `calendly/callback` → **H-1** |
| Ninguna (público a propósito) | `utm/track`, `utm/click`, `waitlist`, `trial-confirm`, `invite/validate` |

`isPublicPath` (`lib/supabase/public-paths.ts`) deja pasar sin sesión todo `/api/{cron,queue,rag,webhooks,discord,utm,invite}/`,
`/api/integrations/**` que contenga `/webhook`, `/oauth/callback`, `/oauth/start` o termine en `/callback|/sync|/poll|/process|/reanalyze`,
más `/prueba`, `/privacidad`, `/invite`, `/onboarding-cliente/`. Cada handler de esa lista autentica por su cuenta. La
excepción son los callbacks OAuth: la cookie de estado no autentica a nadie (H-1).

### Hallazgos

#### H-1 · Los callbacks OAuth aceptan una org que manda el navegador — **Crítica** · nuevo `[OAUTH-ESTADO-SIN-FIRMA]` · **Resuelto el 2026-09-30 (SCRUM-10)**

- **Hecho:**
  - Los `*/oauth/start` y `*/connect` guardan `JSON.stringify({ organizationId, state })` en una cookie httpOnly. Ejemplo: `app/api/integrations/stripe/connect/route.ts:28-37`.
  - El callback hace `JSON.parse` de esa cookie y sólo compara `cookie.state === ?state`. Después escribe con `createAdminClient()` en `organization_id: cookie.organizationId` (`stripe/callback/route.ts:57-106`).
  - Mismo patrón en `calendly/oauth/callback:73-192`, `calendly/closer/callback:65-131` (`profileId` y `organizationId` de la cookie), `discord/callback:41-114`, `instagram/callback:62-105`, `mercadopago/callback:62-114`, `google-forms/oauth/callback:37-111`, `typeform/oauth/callback:30-105` y `youtube/oauth/callback:31-74`.
  - `super-admin-google/oauth/callback:35-66` toma `cookie.userId`.
  - La cookie no tiene firma ni MAC (`lib/integrations/` no tiene helper de firma). Ningún callback llama a `getUser()` ni a `requireOrganizationId()`. Todas esas rutas son públicas en `isPublicPath`.
- **Observación:**
  - Una cookie httpOnly impide que la lea JavaScript de la página. No impide que el dueño del navegador, o un `curl`, mande la que quiera.
  - El `state` sirve contra CSRF sobre la víctima, no para atar la org: quien arma el flujo elige los dos lados.
  - PKCE (Calendly, MP, Drive del super-admin) tampoco ayuda: el `code_verifier` viaja en la misma cookie.
  - `docs/arquitectura/seguridad.md` § OAuth y § Webhooks afirma lo contrario ("lo ligan a org y usuario en una cookie httpOnly"; "atribución siempre desde un dato firmado o token propio").
- **Riesgo:** si alguien conoce el UUID de otra org, puede completar el OAuth con su propia cuenta (Stripe, Calendly, Google, Instagram, etc.) y mandar la cookie `{"organizationId":"<B>","state":"x"}` con `?state=x`. Entonces el servidor:
  - pisa la integración de B (`onConflict: organization_id`);
  - para Calendly, crea la suscripción de webhook y sincroniza turnos falsos en `closing_calls` de B;
  - para Discord, ata el servidor del atacante a B;
  - para el Drive del super-admin, reemplaza el token de un super admin por el de una cuenta ajena. Desde ahí se importan documentos al "cerebro" que se inyecta en el contexto de todas las orgs.

  No hace falta sesión. Los UUID de org no son secretos: van en las URLs de webhook de Whop, Commas y GHL que se cargan en terceros, en el snippet UTM de las landings y en la vista del holding.
- **Impacto:**
  - **Escritura en otra organización.** Se pierde su conexión real, entran datos falsos en Ventas, Finanzas, Marketing y Embudos, y la sync diaria sigue trayendo esos datos.
  - No da lectura directa de los datos de B, pero sí sabotaje e inyección.
  - Afecta a cualquier org cuyo UUID se conozca. No se contó cuántas tienen cada integración.
- **Recomendación:**
  - En cada callback, exigir sesión y comparar `requireOrganizationId()` (y `user.id` en closer y super-admin) contra lo que dice la cookie.
  - Además, firmar la cookie con HMAC (secreto de servidor) o guardar el `state` en una tabla con TTL.
  - Un helper común (`lib/integrations/oauth-state.ts`) con tests.
  - Corregir `seguridad.md`.

#### H-2 · Rutas de Storage guardadas en filas que el usuario puede escribir, usadas con service role — **Crítica** · nuevo `[STORAGE-RUTA-DESDE-FILA]` · **Resuelto el 2026-10-01 (SCRUM-81, `20261001100000`).**

- **Hecho (producción):**
  - `authenticated` tiene `INSERT` y `UPDATE` de columna sobre la columna de ruta de estas tablas:
    - `workboard_task_attachments`, `client_payments`, `business_context_documents`, `sop_attachments`, `win_attachments`: `storage_path`;
    - `sop_generation_jobs`: `video_path`;
    - `reel_variation_jobs`: `variations`.
  - Todas tienen policy de INSERT (algunas de UPDATE) que sólo exige `organization_id = get_my_organization_id()`.
  - Ninguna tiene constraint ni trigger sobre la ruta.
- **Hecho (código):** `assertOrgStoragePath` (`lib/storage/org-path.ts`) sólo se aplica cuando la ruta **llega del navegador** en los "finalize". Cuando se **lee de la fila** y se usa con el admin client, no se vuelve a validar:
  - `getTaskAttachmentUrlAction` / `deleteTaskAttachmentAction` (`app/workboard/task-link-actions.ts:367,327`);
  - `getClientPaymentReceiptUrlAction` (`app/sales/payment-actions.ts:348`);
  - `getDocumentOriginalFileUrlAction` / `deleteDocumentAction` (`app/business-context/actions.ts:606,646`);
  - `deleteSopAttachmentAction` y `resolveSopAttachmentUrlsAction` (`app/sops/actions.ts:504`, `app/sops/video-actions.ts:254`);
  - `deleteWinAction` / `deleteWinAttachmentAction` y URLs firmadas de wins (`app/clients/win-actions.ts:367,503,638`);
  - `refreshVariationPreviewUrlsAction` (`reel-variation-actions.ts:504`);
  - la cola `process-sop-video` (`route.ts:84`, descarga `job.video_path`);
  - la cola `publish-reel-variation` (`:239`, firma y **publica** en Zernio);
  - el cron `cleanup-trial-reels` (`:84`, borra).
- **Observación:** el comentario de `org-path.ts` describe justo este ataque, pero la defensa cubre una sola de las dos puertas. El dato de la fila también lo controla el usuario, vía PostgREST con su JWT.
- **Riesgo:** si un miembro de A conoce una ruta de B, hace un `PATCH /rest/v1/sop_generation_jobs` de un job propio con `video_path = "<B>/<uuid>-x.mp4"` y pulsa "Reintentar". Entonces el worker descarga el video de B, lo transcribe y genera el SOP en A.

  Con `reel_variation_jobs.variations[].storage_path = "<B>/music/background.mp3"`, que es una ruta **determinística** en el mismo bucket `trial-reels`:
  - `refreshVariationPreviewUrlsAction` devuelve una URL firmada del archivo de B;
  - el cron de limpieza lo borra.

  La mayoría de las rutas llevan UUIDs que no se exponen, y eso baja la probabilidad. Las determinísticas (música, carpetas por org) no.
- **Impacto:** lectura y borrado de archivos de otra org: comprobantes de pago, documentos de contexto, videos de SOP, adjuntos, capturas de wins y videos de reels. En el caso de reels, además, publicación del archivo ajeno en las redes de A.
- **Recomendación:**
  - Validar `isOrgStoragePath(row.storage_path, organizationId)` en **cada** lectura, firma, descarga y borrado con service role. Un helper tipo `signOrgStoragePath(bucket, path, org)`.
  - En la base, `CHECK (storage_path LIKE organization_id::text || '/%')`, o quitar `INSERT`/`UPDATE` de esas columnas a `authenticated` y escribirlas sólo desde el servidor.
  - En el worker de reels, cruzar el prefijo de `sourceStoragePath` y `reelMusicPath` contra `organizationId`.

#### H-3 · `associateFathomCallAction` escribe en la ficha de un cliente de otra org — **Crítica** · existente `[FATHOM-CLIENTID-SIN-VALIDAR]` (ampliar)

- **Hecho:**
  - El ítem dice que las filas escritas "la org víctima no ve".
  - Pero `finalizeAssociatedCall` encola `generateDeepCallAnalysis` (`lib/fathom/process-call.ts:476-509`) cuando hay transcript y la llamada dura 10 minutos o más.
  - Ese análisis ejecuta `syncClientLinkedCalls`, que hace `admin.from("clients").update({ linked_calls })`, con `.eq("id", clientId)` y **sin org** (`lib/fathom/deep-call-analysis.ts:159-196`).
  - La escritura cae en la fila del cliente de B, con el análisis de una llamada de A.
  - `lib/clients/client-tasks.ts:51` y `process-call.ts:369` leen `clients.name` de B por id.
- **Riesgo:** con un `clientId` ajeno, la org A le escribe a B en la ficha del cliente, y lo que se escribe (título, resumen, URL de Fathom de A) es visible para B.
- **Recomendación:** la del ítem, más `.eq("organization_id")` en `syncClientLinkedCalls` y en las lecturas de `clients` de `process-call.ts` y `client-tasks.ts` (defensa en profundidad).

#### H-4 · La key global de Zernio está cargada en producción — **Crítica** · existente `[ZERNIO-KEY-GLOBAL]` (actualizar)

- **Hecho:**
  - `ZERNIO_API_KEY` existe en Vercel (proyecto `otc-plaform`) en **Production y Preview**, tipo sensitive, creada el 2026-07-09. El valor no se puede ver.
  - Sin chequear integración antes de usar el cliente:
    - `getMarketingAdsAction` (`app/marketing/content/ad-actions.ts:50-54`, `/marketing/anuncios`);
    - `countZernioTriggers` (`lib/funnels/resolve.ts:300-313`);
    - `captureAdMetricsForOrganization` (`lib/marketing/ad-metrics-snapshot.ts:99`);
    - `fetchZernioCommentSteps` (`lib/sales/lead-journey.ts:221`).
  - Las acciones de inbox y comentarios (`app/integrations/zernio/actions.ts`) exigen fila activa, y esa fila siempre trae key propia. Esas no caen al fallback.
- **Riesgo:** si el valor es una key real, toda org sin Zernio ve **hoy** los anuncios de la cuenta global en `/marketing/anuncios`, y sus embudos cuentan comentarios ajenos.
- **Recomendación:** la del ítem. Anotar en el ítem que la variable existe y que falta saber si es real.

#### H-5 · Un miembro del holding sin permiso escribe en los negocios a través del admin client — **Crítica** · existente `[HOLDING-PORTFOLIO-ROL]` (corregir estado)

- **Hecho:**
  - El ítem dice que las escrituras las rechaza RLS porque el claim del JWT no se setea. Eso vale sólo para las acciones que escriben con `createClient()`.
  - Toda action que hace `requireOrganizationId()` + `createAdminClient()` opera sobre el negocio que dice la cookie, sin mirar `canManageHolding`. Ejemplos:
    - `saveClaudeApiKeyAction` (`app/settings/actions.ts:446-471`, vía `requireAuthContext`);
    - `disconnect*Action` (`app/integrations/actions.ts`);
    - `connectPaymentProviderAction`;
    - `createDocumentFromFileAction`, `deleteDocumentAction`;
    - `recordClientPaymentAction`, `getClientPaymentReceiptUrlAction`;
    - `getClientOneOnOnesAction`, que devuelve transcripts: el chequeo previo de `clients` pasa por la policy de portfolio.
  - Además, `middleware` sólo sobrescribe el header `x-active-org-id` cuando hay cookie (`lib/supabase/middleware.ts:61-65`). Sin cookie, el header que manda el navegador llega intacto a `resolveEffectiveOrganizationId`, que lo prioriza. No hace falta ni tocar la cookie.
- **Riesgo:** un miembro invitado al holding que no es founder ni `is_holding_admin` puede cambiar la clave de IA de un negocio, desconectar sus integraciones, cargar o borrar documentos y leer transcripts de 1-1. La lectura por PostgREST ya estaba descrita en el ítem.
- **Recomendación:**
  - La del ítem: `canManageHolding` en `resolveEffectiveOrganizationId`.
  - Además, que el middleware borre siempre el `x-active-org-id` entrante antes de setearlo desde la cookie.

#### H-6 · Tracking UTM público con la org en el cuerpo — **Media** · nuevo `[UTM-PUBLICO-ORG-EN-CUERPO]`

- **Hecho:**
  - `/api/utm/track` y `/api/utm/click` son públicos y toman `organization_id` y `utm_campaign` del JSON (`app/api/utm/track/route.ts:27-50`, `click/route.ts:21-31`).
  - `track` inserta en `utm_lead_captures` y suma `increment_utm_leads` si la campaña existe en esa org (`lib/utm/track-lead.ts:36-68`).
  - `click` llama `increment_utm_clicks(campaign, org_id)`.
  - Hay rate limit por IP (`apiRateLimit`), no por campaña. La respuesta `{ok:true|false}` revela si la campaña existe en esa org.
- **Riesgo:** cualquiera que vea una landing de B (UUID y nombre de campaña están en el snippet y en la URL) puede inflar clics y leads de sus campañas rotando IPs, y meter leads inventados con cualquier email.
- **Impacto:** métricas de marketing de B corruptas (clics, leads, conversión por UTM). Es inherente a un pixel público, pero hoy no hay nada que lo acote.
- **Recomendación:**
  - Un identificador público por link (no el UUID de la org) que el servidor resuelve a org y campaña.
  - Respuesta uniforme.
  - Límite por campaña además de por IP.

#### H-7 · El webhook Fathom legacy usa un único secreto para todas las orgs — **Baja** · nuevo `[FATHOM-WEBHOOK-LEGACY]`

- **Hecho:**
  - `connectFathom` guarda `webhook_secret: process.env.FATHOM_WEBHOOK_SECRET` en **todas** las filas de `fathom_integrations` (`lib/fathom/connect.ts:52`).
  - `/api/integrations/fathom/webhook` busca la org cuyo secreto valida la firma: con una sola org la elige, con más de una responde 409 (`route.ts:58-86`).
  - Hoy `FATHOM_WEBHOOK_SECRET` no está en Vercel, así que el secreto es null y la ruta responde 401 siempre. La UI no muestra esta URL: el flujo vigente es `/webhook/[token]`.
- **Riesgo:** si alguien carga la variable, quien la conozca manda llamadas a la única org conectada, o rompe la entrega (409) cuando hay varias.
- **Recomendación:** borrar la ruta legacy y la columna, o generar un secreto por org.

### Lo que está bien

- **Resolución de la org:**
  - Todas las Server Actions revisadas (44 archivos con admin) arrancan con `requireOrganizationId()`, `requireAuthContext()`, el perfil o `requireSuperAdmin()`.
  - Las ~110 cadenas del admin client sin filtro de org se revisaron una por una. Filtran por un id ya verificado contra la org, por `user.id`, o son tablas sin org (lista de espera, rate limit). Las excepciones son las de H-2 y H-3.
- **Ids recibidos:** el patrón "verificar con la sesión, después usar el admin" está bien aplicado y comentado en `getClientOneOnOnesAction`, `uploadOneOnOneFromShareLinkAction`, `assignOnboardingSubmissionAction`, `scoreFormResponsesAction`, `syncCloserCalendlyAction`, `retryOneOnOneTasksAction` y las acciones de reels y workboard (por fila).
- **Exports internos de archivos `"use server"`** que reciben `organizationId`: `loadTaskLinksBundle`, `deleteTaskAttachmentsForTask`, `getProductContextForOrg` y `getConversationIdByExternalRef`. Usan el cliente con RLS, así que con un UUID ajeno no devuelven nada. Siguen siendo deuda (`[AUD-SALUD-6]`).
- **Webhooks:** Whop, Commas, GHL, Calendly, Fathom por miembro, ManyChat, Instagram, Zernio y Unipile resuelven la org desde un secreto por org, un token de URL o un id de cuenta ligado a una firma. En GHL, un `?organizationId=` no le gana al `locationId` firmado. En Discord, el `guild_id` sale del token y es único.
- **Crons y colas:** todos exigen `CRON_SECRET`, QStash o `WORKER_AUTH_SECRET`. El fan-out usa el `organization_id` de cada fila de integración, y los procesadores (`rag-ingestion`, `process-cron-*`, `publish-reel-variation`) vuelven a filtrar la fila por `id` + `organization_id`.
- **Caches:** `credentialCache`, `orgContextCache`, `factsCache` de onboarding, el cache de `distribution-insight` y `loadEnabledAddOns` usan la org como clave. `RESOLVED_ATTENDEE_NAME_CACHE` usa `accountId:attendeeId`. `requireOrganizationId` usa `cache()` de React, que dura un request. No hay `unstable_cache` ni `"use cache"`.
- **RAG y agente:**
  - `search_rag_chunks` filtra por org dentro de la función y **no** la puede ejecutar `authenticated` ni `anon` (prod).
  - La org sale de la sesión (`requireAuthContext`) y la conversación se verifica con `.eq("organization_id")`.
  - Las tools de lectura van con RLS más filtro explícito. Las de escritura pasan por Server Actions.
- **RPCs con service role:** `get_holding_dashboard_stats`, `increment_utm_clicks`/`leads` y `consume_rate_limit` no son ejecutables por `authenticated` ni `anon` (prod). `organizations` sólo deja actualizar 7 columnas a `authenticated`; `reel_music_path` y `enabled_add_ons` no están entre ellas.
- **Holding:** `enterBusinessAction`, `regenerateBusinessFounderTempPasswordAction` y el dashboard exigen `canManageHolding` y verifican el vínculo en `holding_businesses`. El header y la cookie siempre se re-verifican contra el portfolio del propio holding: no se puede saltar a una org fuera del portfolio.
- **Bot de Discord:** la org sale del `guild_id` del gateway y todas sus escrituras la llevan. Los endpoints de la app para el bot exigen el secreto compartido en tiempo constante.

### Notas para la capa de base

Estas notas no son hallazgos nuevos: son contexto para la sección anterior.

- Ninguna de las 57 FKs hacia `clients`, `workboard_tasks`, `team_roles` y `profiles` es compuesta con `organization_id`. RLS valida la org de la fila, no la de lo que referencia. Una fila propia puede apuntar a un id ajeno.
- Eso sólo se vuelve cruce real de datos cuando un proceso con service role sigue la FK sin filtrar. Casos encontrados:
  - H-3;
  - `attributeSaleToUTM`, que lee `closing_calls.lead_name` por un `closingCallId` ajeno;
  - `customRoleId`.

  Todo esto entra en `[AUD-SEG-5]`.

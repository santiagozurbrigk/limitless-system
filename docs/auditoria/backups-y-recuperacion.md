# Auditoría: backups, recuperación ante desastres y deploy

| | |
|---|---|
| **Qué cubre** | Backups de la base y de Storage, qué datos se pueden reconstruir y cuáles no, migraciones y cómo se revierten, deploy y rollback de las tres apps (Vercel, Fly, Railway), qué pasa si cae cada dependencia externa, secretos y su rotación, borrado de organizaciones, objetivos RPO/RTO. El runbook de incidentes está aparte: [`../operacion/incidentes.md`](../operacion/incidentes.md). |
| **Fecha** | 2026-09-23 |
| **Código auditado** | `038caca` (`main`) |
| **Método** | Lectura de código (`apps/web`, `apps/reel-worker`, `apps/discord-bot`, `supabase/`), de `CHANGES.md`, `docs/historial/` y `PENDIENTES.md`. MCP de Supabase en sólo lectura: `get_project`, `get_organization`, `list_branches`, y consultas **sólo de catálogo** (`pg_database_size`, `storage.buckets`, tamaño agregado por bucket desde la metadata de `storage.objects`, `pg_extension`, conteo de `pg_policies` de `storage`). MCP de Vercel en sólo lectura: equipo, proyecto, últimos deploys de producción y **nombres/tipo** de variables (sin valores). Documentación oficial de Supabase (backups, pausa, tamaño de base) vía `search_docs`. |
| **Qué no se pudo verificar** | El plan de Vercel (la API no lo devolvió; se infiere Pro porque hay crons cada 5 min). Si la clave `ENCRYPTION_MASTER_KEY` tiene una copia fuera de Vercel. La configuración de Fly (`fly secrets list`, máquinas, logs) y de Railway (sin acceso). Si hay alertas configuradas en Sentry. El cupo exacto de Storage del plan Free en la cuenta (se toma el publicado: 1 GB). Qué hace exactamente cada proveedor ante un 404 de webhook (se usa lo documentado en `docs/arquitectura/jobs-webhooks-y-colas.md`). No se ensayó ninguna restauración. |

## Resumen

- **La base de producción no tiene backups.** El proyecto de Supabase (`OTC`) está en una organización con **plan Free**, y Supabase sólo hace backups diarios en Pro, Team y Enterprise; el Free no tiene backups ni recuperación a un punto en el tiempo (PITR). Tampoco hay evidencia de que alguien haga un `db dump` propio: no aparece en `CHANGES.md`, `docs/historial/` ni en ningún script del repo. **Nunca se probó una restauración.**
- **Los archivos (Storage, ~800 MB) tampoco tienen respaldo**, y varios no se pueden reconstruir (comprobantes de pago, documentos del negocio, videos de SOPs, el cerebro de IA).
- Si mañana se borra o corrompe una tabla por error (una migración, un script, una baja de organización), **no hay de dónde recuperar** lo cargado a mano: clientes, pagos, notas, wins, tareas, SOPs. Lo que viene de proveedores (Fathom, Zernio, Calendly, GHL) se puede volver a sincronizar en parte.
- El plan Free además pone límites que ya están cerca: **Storage usa ~797 MB de 1 GB** y la base pasa a sólo lectura si supera 500 MB (hoy 87 MB).
- **La clave que cifra las API keys de los clientes** (`ENCRYPTION_MASTER_KEY`) está guardada en Vercel como "sensible" (no se puede volver a leer desde el panel) y el código no soporta cambiarla: si se pierde o se cambia, dejan de funcionar todas las integraciones cifradas y los webhooks de pagos empiezan a rechazar cobros.
- No hay procedimiento escrito para rotar ningún secreto, ni ambiente de pruebas separado: los deploys de prueba (previews) usan la base y las claves de producción.
- El deploy de la web se revierte con un clic en Vercel, pero **las migraciones no se revierten** (no hay "down"): se corrige con una migración nueva.
- No hay runbook de incidentes (se escribió uno: `docs/operacion/incidentes.md`), ni monitoreo activo: la página "Infraestructura" del super admin muestra estados fijos, y no hay páginas de error propias.

## 1. Base de datos (Supabase)

### 1.1 Qué hay hoy

| Dato | Valor | Fuente |
|---|---|---|
| Proyecto | `OTC` (`nrzlylzbmsuowzhpdnjl`), región `sa-east-1`, Postgres 17.6, estado `ACTIVE_HEALTHY`, creado 2026-05-26 | `get_project` |
| Organización de Supabase | `optimizatucontrol@gmail.com's Org`, **plan `free`** (`tier_free`) | `get_organization` |
| Branches de Supabase | ninguna | `list_branches` |
| Tamaño de la base | 87 MB (límite Free: 500 MB → modo sólo lectura) | `pg_database_size` |
| Extensiones | `plpgsql`, `pg_stat_statements`, `uuid-ossp`, `pgcrypto`, `supabase_vault`, `vector` (no hay `pg_cron`) | `pg_extension` |

**Qué dice Supabase del plan Free** (docs oficiales, `guides/platform/backups`): *"We automatically back up all Pro, Team, and Enterprise Plan projects on a daily basis … We recommend that free tier plan projects regularly export their data using the Supabase CLI `db dump` command and maintain off-site backups."* PITR es un add-on sólo para planes pagos (y requiere compute Small o mayor). Además, los backups de la base **nunca incluyen los archivos de Storage**: sólo su metadata.

Otras condiciones del plan Free relevantes para recuperación (docs `free-project-pausing` y `database-size`):
- Un proyecto Free con poca actividad durante 7 días se **pausa**; se puede reanudar hasta 90 días después. Con el tráfico actual (crons cada 5–10 min) es improbable, pero no imposible si se cortan los crons.
- Si la base supera 500 MB pasa a **sólo lectura**: los inserts fallan (`cannot execute INSERT in a read-only transaction`).
- Sin SLA de disponibilidad.

### 1.2 ¿Alguien probó restaurar?

No. Búsqueda de `backup|respaldo|PITR|restaur|restore|pg_dump|db dump` en `CHANGES.md`, `docs/historial/`, `PENDIENTES.md`, `docs/operacion/` y `docs/arquitectura/`: la única copia de datos registrada es la del historial de migraciones (`supabase_migrations.schema_migrations_backup_20260922`, 118 filas, `CHANGES.md` entrada del 2026-09-22 "historial de migraciones ordenado"). Ninguna restauración, ningún dump de datos.

Hechos que muestran el riesgo en la práctica:
- `20260922140000_borrar_metric_snapshots.sql` borró una tabla con 36 valores de histórico importado de una org "por decisión del usuario" (`CHANGES.md`, entrada del 2026-09-22 "Restos legacy borrados"). No se registró un dump previo; si la decisión hubiera sido un error, no había vuelta atrás.
- `20260922130000_limpiar_restos_legacy_de_produccion.sql` borró 15 columnas (se midió antes que estuvieran vacías, que es lo correcto, pero tampoco hubo dump).

### 1.3 Storage

13 buckets en producción (catálogo `storage.buckets`); el tamaño es la suma de `metadata->>'size'` de `storage.objects` por bucket (sin leer contenido):

| Bucket | Público | Tamaño | ¿Se puede reconstruir? |
|---|---|---|---|
| `ai-brain-documents` | no | 354 MB | **No** (documentos subidos por el super admin) |
| `trial-reels` | no | 351 MB | Sí/no importa: variaciones generadas; el cron las borra a los 30 días. El original subido por el usuario también vive acá |
| `business-context-documents` | no | 40 MB | **No** (documentos del negocio subidos por el founder; el texto indexado en `rag_chunks` está en la base) |
| `sop-videos` | no | 21 MB | **No** (videos grabados por el equipo; `[OPS-SOP-VIDEO-NO-SE-BORRA]` dice que no se borran nunca) |
| `content-thumbnails` | **sí** | 15 MB | Sí, se regeneran en la próxima sync de Zernio/Drive |
| `import-files` | no | 9 MB | Legacy del import viejo; ver `[SEG-BUCKET-IMPORT-FILES]` |
| `client-payment-receipts` | no | 6,7 MB | **No** (comprobantes de pago cargados a mano) |
| `agent-documents` | no | 94 kB | **No** |
| `client-wins` | no | 56 kB | **No** (capturas de wins) |
| `avatars` | sí | 4 kB | Sí (el usuario lo vuelve a subir) |
| `sop-attachments`, `workboard-task-attachments` | no | 0 | **No** si se usan |
| `discord-bot-avatars` | sí | 0 | Sí |

Total ≈ **797 MB**. El plan Free incluye 1 GB de Storage: **queda ~20 % de margen** y dos buckets (`ai-brain-documents` y `trial-reels`) son el 88 %. Los buckets `trial-reels` (500 MB por archivo) y `sop-videos` (1 GB por archivo) declaran límites por archivo mayores que el máximo de subida del plan Free (50 MB, según la página de precios de Supabase; **a confirmar** en el panel).

Ningún bucket se respalda. Cinco buckets ni siquiera existen en las migraciones (`[AUD-SEG-9]`): en una reconstrucción desde cero habría que crearlos a mano, con sus policies (hoy hay 15 policies en el schema `storage`).

### 1.4 Qué se puede reconstruir y qué no

**Regla práctica:** lo que un usuario tipeó o subió no se recupera sin backup. Lo que vino de un proveedor por API se puede volver a traer (con las limitaciones de cada API). Lo que vino **sólo por webhook** se pierde salvo que el proveedor tenga API de historial.

| Tipo de dato | Tablas / buckets | Reconstruible | Cómo |
|---|---|---|---|
| Cuentas, orgs, roles, holding | `auth.users`, `profiles`, `organizations`, `team_roles`, `holding_*`, `super_admin_*` | **No** | Sólo con backup |
| Clientes y su operación | `clients` (incluye notas), `client_payments`, `client_timeline_entries`, `client_tasks`, `client_problems`, `client_checkpoint*`, `client_wins`, `client_onboarding_*`, `field_definitions`, `plans` | **No** | Carga manual del equipo. `metrics_snapshots` vino de un Excel: se re-importa si alguien guarda el archivo |
| Ventas cargadas a mano | disposición y resultado en `closing_calls`, `sales_leads`, `sales_follow_up_options`, `team_compensation`, `sales_scripts` | **Parcial** | El turno se re-sincroniza de Calendly/GHL (ventana de 120 días en Calendly); **el resultado que cargó el closer no** |
| Operaciones, finanzas, producto | `workboard_*`, `sprints`, `sops`, `sop_versions`, `weekly_inputs`, `fixed_expenses`, `subscriptions`, `payment_platforms`, `products`, `customer_avatars`, `value_*`, `launches` | **No** | Carga manual |
| Conocimiento y agente | `business_context_documents` + bucket, `rag_documents`, `agent_conversations`, `agent_messages` | **Parcial** | `rag_chunks` se re-indexa si están los archivos originales (cuesta embeddings de OpenAI); las conversaciones no |
| Credenciales de integraciones | `*_integrations` | **No** (pero se reconectan) | Cada org vuelve a conectar por OAuth o pegar su API key |
| Grabaciones y análisis | `fathom_calls`, `call_analyses` | **Parcial** | Fathom re-sincroniza por API; los análisis de IA se regeneran pagando tokens |
| Contenido y anuncios | `content_pieces`, `ad_metrics_daily` | **Parcial** | `content_pieces` vuelve con la sync de Zernio; **`ad_metrics_daily` no**: es "el único histórico de Spend" (`docs/arquitectura/jobs-webhooks-y-colas.md`), Zernio sólo da el valor actual |
| Pagos por webhook | `payment_webhook_events`, `payment_orders`, `payment_transactions` | **Parcial** | Whop reintenta ~3 días; Commas no reintenta. Backfill por API no construido (`[EMBUDOS-PAGOS-BACKFILL]`) |
| GHL | `ghl_opportunities`, `ghl_stage_transitions`, `ghl_webhook_events` | **Parcial** | Las oportunidades se pueden volver a pedir; **las transiciones de etapa llegan sólo por webhook** |
| Discord | `discord_messages` y vínculos | **Parcial** | Discord guarda el historial, pero el bot no tiene backfill (ver hallazgo R10) |
| Derivados de IA | `executive_reports`, `intelligence_snapshots`, `weekly_reports`, `founder_communication_tone` | Sí, con costo | Se regeneran (tokens de Anthropic); los viejos no con el mismo contenido |
| Técnicas | `rate_limits`, `holding_active_sessions`, `token_usage` | Irrelevante / no | `token_usage` es el histórico de costos: no se reconstruye |

## 2. Migraciones

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| ¿Hay migraciones "down"? | **No.** 175 archivos, todos hacia adelante. El único "revert" (`20260713100000_revert_workboard_task_assignees.sql`) es una migración nueva que deshace otra | `ls supabase/migrations` |
| ¿Son transaccionales? | Ningún archivo tiene `begin;`/`commit;` propios y ninguno usa `create index concurrently`. El CI aplica cada una con `psql --single-transaction` "como hace `supabase db push`" | `supabase/ci/check-migrations.sh` |
| ¿Qué pasa si una falla a mitad en producción? | Con `supabase db push`: la migración que falla se revierte entera (una transacción por archivo) y las anteriores del mismo push quedan aplicadas. Con el **SQL Editor** o con `apply_migration` del MCP, depende de cómo se ejecute: el SQL Editor corre sentencia por sentencia y **puede dejar la mitad aplicada** | `docs/arquitectura/base-de-datos.md` § Cómo aplicar |
| ¿Cómo se revierte? | Escribiendo una migración nueva que deshaga el cambio. Si la migración borró datos (`drop column`, `drop table`, `delete`), **no hay reversión sin backup** | 7 archivos con `drop table`/`drop column`; 15 con `update`/`delete`/`insert` de datos |
| ¿Se prueban antes? | El CI arma una base desde cero con las 175 (valida sintaxis y orden), pero **no con datos**: no detecta una migración que falle o destruya algo sólo con datos reales. No hay staging ni branch de Supabase | `.github/workflows/ci.yml`, `list_branches` vacío |
| Invariante del historial | Producción tiene exactamente las 175 versiones de los archivos (verificado 2026-09-23). `apply_migration` registra la hora actual: hay que corregir la fila o renombrar el archivo | `docs/arquitectura/base-de-datos.md` § Invariante |
| ¿Arma la base desde cero una copia fiel de producción? | **No del todo.** Producción tiene objetos que el repo no crea (`current_user_is_founder_or_admin()`, policies consolidadas con otros nombres, SELECT de tabla entera sobre `organizations`), 5 buckets que ninguna migración crea (`[AUD-SEG-9]`), y el Auth Hook `custom_access_token_hook` se activa a mano en el panel | `docs/historial/DB_DIFF_PRODUCCION_2026-09-22.md`, `[DB-ORGS-SELECT-COLUMNAS]` |

**Orden con el deploy:** Vercel no aplica migraciones. Primero se aplica la migración y después se mergea el código (o el código tolera que la columna no exista). Consecuencia para un rollback: **si se revierte el deploy, la base queda con la migración nueva**. Funciona sólo si la migración era compatible hacia atrás (agregar columnas/tablas nullable). Una migración que renombra o borra columnas rompe el deploy anterior.

## 3. Deploy y reversión

| App | Dónde | Cómo se despliega | Cómo se revierte | Qué se rompe si cae |
|---|---|---|---|---|
| `apps/web` | Vercel, proyecto `otc-plaform`, team `otcteam`, región `gru1`. Dominios: `otc-plaform.vercel.app`, `optimizatucontrol.com`, `www.optimizatucontrol.com` | Automático en cada merge a `main`. Los 5 últimos deploys de producción son `READY` y "rollback candidate" (el último es `038caca`) | Vercel → Deployments → deploy anterior → **Promote / Instant Rollback**. Revierte código, no la base. Según la doc de Vercel, después de un rollback los merges nuevos no se promueven solos hasta deshacerlo (**a confirmar** en el panel) | Todo: la app, los 19 crons, todos los webhooks entrantes, los workers de QStash. Los proveedores con reintento (Whop ~3 días, QStash, Calendly) reintentan; Commas no |
| `apps/reel-worker` | Fly.io, app `otc-reel-worker`, `gru`, `performance-2x`, arranca en frío (`min_machines_running = 0`) | **Manual**: `fly deploy --config apps/reel-worker/fly.toml`. Sin CI ni deploy automático | `fly releases` + `fly deploy --image <imagen anterior>` (o volver a deployar desde el commit anterior). No documentado en el repo | Trial reels: el job queda en proceso. El worker responde 200 aunque falle para que QStash no reintente (`docs/operacion/entorno-y-deploy.md`), así que un fallo no se reintenta solo. Sin Sentry: errores sólo en logs de Fly |
| `apps/discord-bot` | Railway, servicio `otc-discord-bot`, Dockerfile, reinicio `ON_FAILURE` hasta 10 veces | Auto-deploy en push a `main` si sigue conectado al repo después del renombre (**no verificado**, `[REPO-RENOMBRADO-DEPLOYS]`) | Railway → Deployments → redeploy de uno anterior | Deja de guardar mensajes de Discord. **Los mensajes enviados mientras está caído no se recuperan**: el bot no hace backfill al volver (`apps/discord-bot/src/events/ready.ts` sólo loguea). Sin Sentry |

Previews de Vercel: cada push a una rama genera un deploy de prueba. **Usan las mismas variables que producción** (todas las variables del proyecto tienen `target: ["preview", "production"]`, incluidas `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_MASTER_KEY` y `NEXT_PUBLIC_SUPABASE_URL`), así que un preview lee y escribe la base real (`CHANGES.md` registra pruebas "contra el preview con datos reales"). Están detrás de la protección SSO de Vercel (`ssoProtection: all_except_custom_domains`), así que no son públicos. Los crons de Vercel sólo corren en producción.

## 4. Dependencias externas: qué deja de funcionar

| Si cae… | Qué deja de funcionar | Cómo lo ve el usuario | ¿Se recupera solo? |
|---|---|---|---|
| **Supabase** (base o Auth) | Todo. El middleware llama a `supabase.auth.getUser()` en cada request (`lib/supabase/middleware.ts:89`); sin respuesta el usuario queda sin sesión | Lo manda a `/login` y el login falla; o una página tira error. **No hay `error.tsx` ni `global-error.tsx`** en `app/`: se ve la pantalla genérica de Next ("Application error") | Parcial. Webhooks: Whop recibe 404 (la lectura del secreto falla → "no tiene Whop conectado", `app/api/webhooks/whop/route.ts:44`) y reintenta; **si la base está en sólo lectura** la lectura anda pero el insert falla y el webhook responde 200 → cobro perdido (`[EMBUDOS-WEBHOOK-PERDIDA]`). Crons: los que fallan con 500 se re-ejecutan en la próxima corrida; los reportes del día no |
| **Anthropic** | Agente, análisis de llamadas, reportes, clasificación de Discord, captions del reel-worker | El agente muestra error; los crons de IA fallan y **no se reintentan** (los workers responden 200 con `failed`: `[INTELIGENCIA-SIN-REINTENTO]`). Una clave rechazada (401/403) cae a la global y se marca; una clave **sin créditos** no cae (`[IA-CLAVE-SIN-CREDITOS]`). Si la global no existe, nada (`[ENV-ANTHROPIC-VERCEL]`, `[1A1-CLAVE-ANTHROPIC-ROTA]`) | Los reportes de ese día se pierden salvo que se re-disparen a mano con `?organizationId=` |
| **OpenAI** | Embeddings del RAG, transcripción de audio del agente, video de SOPs | Documentos que quedan en `error` de indexación para siempre (`processRagIngestion` atrapa el error y QStash no reintenta: `[RAG-INGESTA-SIN-REINTENTO]`) | No: hay que re-indexar |
| **Zernio** | Inbox, comentarios, ads, métricas de contenido (se leen en vivo) | Pantallas de marketing vacías o con error; `capture-ad-metrics` no guarda el snapshot del día (**hueco permanente** en el histórico de Spend) | El contenido sí en la próxima sync; el Spend de ese día no. Sin timeout en el cliente (`[AUD-CONF-1]`): una API colgada retiene la lambda hasta `maxDuration` |
| **QStash** | Fan-out de 5 crons de IA, análisis de Fathom, indexación RAG, SOP de video, reels | RAG cae a ingesta inline (`lib/queue/qstash-client.ts:180`); Fathom devuelve `false` y el cron de las 10 min lo reintenta; los crons con fan-out cuentan `failed` | Parcial |
| **Vercel** | Todo `apps/web`, incluidos crons y webhooks | Sitio caído | Los crons que no corrieron no se recuperan (no hay "catch-up"); los webhooks dependen del reintento del proveedor |
| **Resend** | Mails (bienvenida, invitaciones, waitlist) | La invitación no llega; sin reintento | No |
| **Fly / Railway** | Reels / Discord | Ver tabla de deploy | Discord: no recupera mensajes |

**¿La app lo muestra bien?** En general no: no hay páginas de error propias, ni banner de "servicio degradado", ni health check. Lo único con aviso al usuario es la clave de Claude rechazada (barra roja por `claude_api_key_status = invalid`). La página "Infraestructura" del super admin (`components/super-admin/infrastructure-page.tsx`) muestra estados **escritos a mano** (`status: "ok"`, `"Configurado ✓"`, líneas 18–42) salvo Resend: no consulta nada, así que en un incidente dice "ok".

## 5. Secretos

### 5.1 `ENCRYPTION_MASTER_KEY`

- **Cómo funciona** (`apps/web/lib/security/encryption.ts`): AES-256-GCM con **una sola clave**, sin identificador de versión en el texto cifrado (`iv.tag.ciphertext`). No hay forma de tener "clave vieja + clave nueva" a la vez, ni script de re-cifrado en el repo (grep en `apps/web/scripts/` y raíz). `docs/arquitectura/seguridad.md:59` ya lo dice: "Rotar `ENCRYPTION_MASTER_KEY` invalida todo lo cifrado".
- **Dónde está:** Vercel, tipo `sensitive`, Production **y** Preview, creada el 2026-06-18 y nunca modificada. Una variable `sensitive` de Vercel **no se puede volver a leer** desde el panel. `docs/archivo/OPERATIONAL_NOTES.md:328-331` recomendaba guardarla también en un gestor de secretos; no se pudo verificar si se hizo.
- **Qué pasa si cambia o se pierde** (verificado en código):

| Qué está cifrado | Qué pasa con otra clave | Evidencia |
|---|---|---|
| BYOK de Claude | `decryptApiKeyIfValid` atrapa el error y devuelve `null` → la org usa la clave global **en silencio**; la pantalla muestra `****` y el estado sigue "válida" | `lib/ai/credential-resolver.ts:136-141`, `app/settings/actions.ts:412-416` |
| Zernio, GHL, Hyros, VTurb, WebinarJam, Fathom por miembro | `readStoredSecret` → `decrypt` **tira**: syncs y pantallas de esas integraciones fallan | `lib/*/integration.ts`, `app/fathom/member-actions.ts:48` |
| Secreto de webhook de Whop/Commas | `getWebhookSecret` atrapa y devuelve `null` → el webhook responde **404 "no tiene Whop conectado"**. Whop reintenta ~3 días; **Commas no reintenta: el cobro se pierde** | `lib/payments/integration.ts:54-59`, `app/api/webhooks/whop/route.ts:42-46` |
| Tokens de Mercado Pago | `decrypt` tira; el refresh diario falla | `lib/mercadopago/tokens.ts:103-110` |

  La salida de una pérdida es volver a cargar la clave vieja; si no hay copia, **cada org tiene que volver a conectar todo** y los cobros de Commas del período se pierden.
- **Si se filtra:** sola no alcanza (hace falta además el texto cifrado). Pero hoy cualquier miembro de una org puede leer el cifrado de la clave de Claude de su propia org en producción (`[DB-ORGS-SELECT-COLUMNAS]`), y cualquiera con la service role lee todos. Filtración de la master key + de la service role = todas las API keys de todos los clientes.

### 5.2 Resto de secretos

| Secreto | Dónde vive | Si se filtra | Cómo se rota hoy | Qué se rompe al rotar |
|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (prod+preview), Fly, Railway | **Acceso total a la base, sin RLS**: datos de todas las orgs, Storage, Auth admin | Supabase → Settings → API keys (regenerar el secreto / pasar a las claves nuevas `sb_secret_…`) y actualizar los **tres** lugares | Durante el cambio, lo que no se actualizó falla (bot y worker con 401) |
| `CRON_SECRET` | Vercel | Cualquiera dispara los crons (costo de IA, carga) | Cambiar en Vercel + redeploy | Nada si se cambia en un solo paso (Vercel manda el valor nuevo) |
| `WORKER_AUTH_SECRET` | Vercel + Fly | Cualquiera ejecuta workers de cola y el reel-worker. Además viaja en query string y queda en logs de QStash (`[SEG-WORKER-SECRET-QUERY]`, `[TRIAL-SECRET-EN-URL]`) | Cambiar en Vercel y `fly secrets set` | Los jobs ya encolados en QStash con el valor viejo fallan |
| `LIMITLESS_WEBHOOK_SECRET` / `OTC_WEBHOOK_SECRET` | Vercel + Railway | Se pueden inyectar mensajes "del bot" | Cambiar en los dos | El bot recibe 401 hasta que se actualiza |
| `QSTASH_*_SIGNING_KEY` | Vercel + Fly | Se pueden firmar jobs | Upstash tiene rotación current/next incorporada | Nada si se sigue el orden de Upstash |
| Secretos por org (Whop, Commas, GHL, Calendly `webhook_signing_key`, Fathom) | Base | Se pueden falsificar webhooks de esa org | Reconectar la integración en el proveedor y en Limitless | Webhooks en vuelo durante el cambio |
| `MERCADOPAGO_WEBHOOK_SECRET`, `INSTAGRAM_APP_SECRET`, `UNIPILE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, secretos OAuth | Vercel | Según el proveedor | Regenerar en el proveedor + Vercel | OAuth: los tokens ya emitidos siguen; webhooks en vuelo |

No hay un procedimiento escrito para ninguno. Todas las variables de Vercel las creó y edita un solo usuario (`optimizatucontrol-7712`), y la organización de Supabase es de una sola cuenta de Gmail: es también un riesgo de continuidad (quién puede restaurar si esa persona no está).

## 6. Borrado de organizaciones (super admin)

- **Qué hace** (`lib/super-admin/execute-deletion.ts`, `app/super-admin/delete-actions.ts`): pide escribir el nombre exacto (revalidado en el servidor), borra la fila de `organizations` (el cascade se lleva ~130 tablas), borra los archivos de 10 buckets y las cuentas de login. Registra en `super_admin_deletions` (`20260906110000_registro_de_bajas.sql`) quién, cuándo, qué org y el resultado.
- **¿Es recuperable?** **No.** El propio archivo las llama "las únicas acciones irreversibles de la plataforma". No hay exportación previa, ni papelera, ni período de gracia; `super_admin_deletions` guarda el registro, no los datos. Con el plan Free no hay backup del cual restaurar.
- **Alternativa reversible que ya existe:** pausar la org (`organizations.status = 'paused'`, `app/super-admin/actions.ts:294`).
- Nunca se ejecutó entera en producción (`[BAJAS-SIN-PROBAR]`).

## 7. Objetivos de recuperación (RPO / RTO)

No hay objetivos definidos y **no corresponde inventarlos**. Hoy, de hecho: RPO = "todo" (sin backup se pierde todo lo cargado a mano desde mayo 2026) y RTO desconocido (nunca se ensayó).

Preguntas para que el equipo decida:
1. **¿Cuántas horas de datos cargados a mano podemos perder sin daño serio?** (Define el RPO: diario → backup diario de Pro; minutos → PITR, ~US$100/mes adicionales para 7 días según la tabla de Supabase.)
2. **¿Cuánto tiempo puede estar caída la app antes de que un cliente se vaya o se pierda plata?** (RTO. Con el plan Free, una restauración significa armar un proyecto nuevo a mano.)
3. **¿Los cobros por webhook admiten pérdida?** Si no, hace falta el backfill por API (`[EMBUDOS-PAGOS-BACKFILL]`) independientemente del backup.
4. **¿Cuánto tiempo guardamos los backups?** (7/14/30 días según plan; y si queremos una copia mensual fuera de Supabase.)
5. **¿Quién puede restaurar?** Hoy sólo el dueño de la cuenta de Supabase. ¿Se suma a alguien más con permisos de owner?
6. **¿Qué archivos de Storage hay que respaldar?** (Los no reconstruibles: comprobantes, documentos del negocio, videos de SOP, cerebro de IA.)
7. **¿Cada cuánto se ensaya una restauración?** (Propuesta: una vez por trimestre, en un proyecto descartable.)
8. **¿Un borrado de org necesita período de gracia?** (Por ejemplo 30 días en "pausada" antes del borrado real.)

## 8. Hallazgos

### R1 · La base de producción no tiene backups ni se ensayó nunca una restauración — **Crítica**
- **Hecho:** organización de Supabase en plan `free` (`get_organization`); Supabase no hace backups en Free (doc oficial). Ningún dump ni restauración registrados en `CHANGES.md`/`docs/historial/`. Migraciones destructivas aplicadas sin dump previo (`20260922140000`, `20260922130000`).
- **Observación:** todo lo cargado a mano por los clientes depende de que no haya ningún error humano ni de plataforma.
- **Riesgo:** si una migración, un script con service role, una baja de org o un bug borra o pisa datos, no hay de dónde recuperarlos. Si Supabase pierde el proyecto, se pierde todo.
- **Recomendación:** pasar el proyecto a Pro (backup diario, 7 días) o, mientras tanto, `supabase db dump` diario automatizado (roles + schema + data) guardado fuera de Supabase; dump obligatorio antes de cada migración destructiva; ensayar una restauración completa en un proyecto descartable y dejar el procedimiento escrito.
- **PENDIENTES:** `[DR-BACKUPS-SUPABASE]` (nuevo, propuesto P0).

### R2 · Los archivos de Storage no tienen respaldo — **Alta**
- **Hecho:** 13 buckets, ~797 MB (§1.3); los backups de Supabase no incluyen Storage aunque se pase a Pro.
- **Riesgo:** un borrado accidental (baja de org, bug, cron `cleanup-trial-reels` mal configurado) o la pérdida del proyecto se lleva comprobantes, documentos y videos que no están en ningún otro lado.
- **Recomendación:** copia periódica de los buckets no reconstruibles (script con la API de Storage o S3-compatible) a un almacenamiento externo; incluirlos en el ensayo de restauración.
- **PENDIENTES:** incluido en `[DR-BACKUPS-SUPABASE]`.

### R3 · Límites del plan Free cerca: Storage al ~80 %, base en sólo lectura a los 500 MB — **Alta**
- **Hecho:** Storage ≈ 797 MB de 1 GB; base 87 MB de 500 MB; límite de subida del Free (50 MB) menor que el que declaran `sop-videos` y `trial-reels`.
- **Riesgo:** al pasar el cupo de Storage, las subidas fallan (comprobantes, documentos, reels). Si la base llega a sólo lectura, los webhooks de pagos leen bien pero no pueden insertar y responden 200 → cobros perdidos (`[EMBUDOS-WEBHOOK-PERDIDA]`). **Resuelto el 2026-09-30 (SCRUM-6).** Ahora responden 500 y el proveedor reintenta.
- **Recomendación:** decidir el plan (R1 lo resuelve de paso); mientras tanto, limpiar `trial-reels` y revisar `ai-brain-documents`; confirmar el límite de subida real.
- **PENDIENTES:** `[SUPABASE-PLAN-FREE-LIMITES]` (nuevo, propuesto P1).

### R4 · `ENCRYPTION_MASTER_KEY` sin rotación posible ni copia verificada — **Crítica**
- **Hecho:** una sola clave sin versión (`lib/security/encryption.ts`); tipo `sensitive` en Vercel (no se puede releer); sin script de re-cifrado; efectos de una clave distinta en §5.1.
- **Riesgo:** si alguien la cambia (por ejemplo "rotando secretos" tras una filtración) o se pierde, todas las integraciones cifradas se caen, la clave de Claude de las orgs pasa a la global sin aviso, y los webhooks de Commas pierden cobros. Si se filtra, no hay cómo rotarla sin romper todo.
- **Recomendación:** confirmar que existe una copia en un gestor de secretos; agregar versión a la clave (`v2.iv.tag.ct`, con `ENCRYPTION_MASTER_KEY_PREVIOUS` para leer lo viejo) y un script de re-cifrado; hasta entonces, escribir en `docs/operacion/incidentes.md` que **no se rota sin script**.
- **PENDIENTES:** `[SEC-MASTER-KEY-ROTACION]` (nuevo, propuesto P1).

### R5 · No hay procedimiento de rotación de secretos y están repartidos en tres plataformas — **Alta**
- **Hecho:** §5.2. Service role en Vercel, Fly y Railway; secreto del bot en Vercel y Railway; `WORKER_AUTH_SECRET` en Vercel y Fly. Un solo usuario administra Vercel y una sola cuenta es dueña de Supabase.
- **Riesgo:** ante una filtración, la rotación se improvisa y deja partes caídas; si la persona dueña no está, nadie puede rotar ni restaurar.
- **Recomendación:** tabla de "dónde vive cada secreto" y pasos de rotación en `docs/operacion/`; sumar un segundo owner en Supabase y Vercel.
- **PENDIENTES:** `[SEC-ROTACION-PROCEDIMIENTO]` (nuevo, propuesto P2).

### R6 · Los previews y cualquier rama corren contra la base y las claves de producción; no hay staging — **Alta**
- **Hecho:** todas las variables de Vercel tienen `target` Preview y Production con el mismo valor (listado de `filter_project_envs`, sin valores). `list_branches` vacío. Previews protegidos por Vercel SSO.
- **Riesgo:** una rama con un bug escribe en datos reales de clientes; no hay dónde ensayar una migración con datos ni una restauración.
- **Recomendación:** proyecto de Supabase separado para preview/staging (o Supabase Branching en Pro) con variables de Preview propias; nunca `ENCRYPTION_MASTER_KEY` de producción en Preview.
- **PENDIENTES:** `[ENTORNO-STAGING]` (nuevo, propuesto P2).

### R7 · Migraciones sin vuelta atrás y sin ensayo con datos — **Media**
- **Hecho:** §2. Sin down migrations, el CI prueba sólo sobre base vacía, destructivas aplicadas sin dump.
- **Riesgo:** una migración que borra o transforma mal datos no se puede deshacer; un rollback de Vercel no revierte la base.
- **Recomendación:** regla escrita en `docs/arquitectura/base-de-datos.md`: toda migración destructiva lleva dump previo de las tablas afectadas y un plan de reversión en el comentario del archivo; migraciones "expand/contract" (primero agregar, después borrar en otro deploy) para que el rollback de Vercel siga funcionando.
- **PENDIENTES:** dentro de `[DR-BACKUPS-SUPABASE]` (dump previo) y como regla en [`../arquitectura/base-de-datos.md`](../arquitectura/base-de-datos.md) § Cómo aplicar una migración (paso 5).

### R8 · Reconstruir producción desde el repo no da una copia fiel — **Media**
- **Hecho:** objetos sólo en prod, 5 buckets sin migración, Auth Hook y configuración de Auth manuales (§2).
- **Riesgo:** en un desastre sin backup, la base reconstruida con las migraciones tiene otras policies y le faltan buckets; el login de holdings no funciona hasta activar el hook.
- **Recomendación:** checklist de reconstrucción (hook, redirect URLs, SMTP, buckets, publicaciones de realtime, extensiones) como parte del ensayo de R1; cerrar `[AUD-SEG-9]` y `[DB-ORGS-SELECT-COLUMNAS]`.
- **PENDIENTES:** `[AUD-SEG-9]`, `[DB-ORGS-SELECT-COLUMNAS]` (existentes) + criterio dentro de `[DR-BACKUPS-SUPABASE]`.

### R9 · La baja de una organización es irreversible y sin exportación previa — **Alta**
- **Hecho:** §6.
- **Riesgo:** un super admin que da de baja la org equivocada (o una baja pedida por un cliente que después se arrepiente) borra datos y archivos sin posibilidad de recuperarlos.
- **Recomendación:** exportar la org (JSON de sus filas + lista de archivos) a un bucket de respaldo antes de borrar, o un período de gracia en `paused` antes del borrado real.
- **PENDIENTES:** `[BAJA-ORG-SIN-RESPALDO]` (nuevo, propuesto P2); relacionado con `[BAJAS-SIN-PROBAR]`.

### R10 · Si el bot de Discord se cae, los mensajes de ese período se pierden — **Media**
- **Hecho:** `apps/discord-bot/src/events/ready.ts` sólo loguea al conectar; no pide el historial de los canales vinculados.
- **Riesgo:** durante una caída de Railway o un deploy fallido, los mensajes de los canales no llegan a `discord_messages` ni a la clasificación de `daily-signals`.
- **Recomendación:** al conectar, pedir por canal vinculado los mensajes posteriores al último guardado.
- **PENDIENTES:** `[DISCORD-BACKFILL]` (nuevo, propuesto P3).

### R11 · Sin monitoreo activo: nadie se entera de un incidente hasta que un cliente avisa — **Alta**
- **Hecho:** no hay endpoint de salud en `apps/web` (`find app/api -path '*health*'` vacío); la página de Infraestructura del super admin muestra estados fijos (`infrastructure-page.tsx:18-42`); no hay registro de corridas de crons en la base; bot y worker sin Sentry (`docs/arquitectura/jobs-webhooks-y-colas.md:123`); no se pudo verificar que haya alertas en Sentry.
- **Riesgo:** un cron que deja de correr, un webhook que responde 4xx o una clave agotada pasan días sin que nadie lo vea (falla silenciosa).
- **Recomendación:** endpoint `/api/health` (base, Storage, variables críticas presentes) con un monitor externo; alertas de Sentry para errores nuevos y picos; tabla o log estructurado de corridas de cron con alerta si un cron no corre en 2× su intervalo; reemplazar los estados fijos de la página de Infraestructura por chequeos reales.
- **PENDIENTES:** `[MONITOREO-Y-ALERTAS]` (nuevo, propuesto P1); relacionado con `[AUD-SALUD-3]`.

### R12 · No hay páginas de error propias — **Media**
- **Hecho:** no existe ningún `error.tsx` ni `global-error.tsx` en `apps/web/app` (sólo `not-found.tsx`).
- **Riesgo:** ante una caída de Supabase o un error de render, el usuario ve la pantalla genérica en inglés de Next y no sabe si perdió datos; los errores de render del lado del navegador no los captura Sentry por la vía recomendada (`global-error.tsx`).
- **Recomendación:** `app/global-error.tsx` (reporta a Sentry) y `error.tsx` en el layout de plataforma, con copy en español y botón de reintentar.
- **PENDIENTES:** `[UI-PAGINAS-DE-ERROR]` (nuevo, propuesto P2).

### R13 · Webhooks de pagos: dos caminos más a la pérdida de cobros — **Crítica** (ya registrado)
- **Hecho:** además de lo que ya dice `[EMBUDOS-WEBHOOK-PERDIDA]`: (a) si la base está en **sólo lectura** (cupo del Free) el insert falla y la ruta responde 200; (b) si el secreto no se puede descifrar (master key cambiada) la ruta responde **404 "no tiene Whop conectado"**, un mensaje que confunde el diagnóstico y que Commas no reintenta.
- **Recomendación:** sumar ambos casos a los tests del ítem; distinguir "no conectado" (404) de "no se pudo descifrar" (500).
- **PENDIENTES:** `[EMBUDOS-WEBHOOK-PERDIDA]` (existente; ampliación propuesta). **Resuelto el 2026-09-30 (SCRUM-6).** Las dos cosas: sólo lectura y secreto que no se descifra responden 500.

## 9. Lo que está bien

- **Las migraciones están ordenadas y chequeadas:** 175 archivos = 175 versiones en producción, nombres y versiones únicas validados en CI, y el CI arma la base desde cero en cada push (`supabase/ci/check-migrations.sh`).
- **Las migraciones destructivas recientes se midieron antes** (columnas vacías, sin dependencias) y la reparación del historial guardó una copia (`schema_migrations_backup_20260922`).
- **El rollback de la web existe y es inmediato:** los últimos 5 deploys de producción son candidatos a rollback.
- **El cifrado falla cerrado:** sin `ENCRYPTION_MASTER_KEY` no se guarda nada en claro ni se manda el cifrado como API key (`lib/zernio/integration.ts:32`, `readStoredSecret`).
- **Webhooks nuevos guardan el crudo antes de interpretar** y deduplican (`lib/payments/ingest.ts`), lo que permitiría reprocesar si existiera la herramienta.
- **La baja de org** revalida la confirmación en el servidor, bloquea borrar la propia org, reporta bajas parciales y deja registro fuera de la org borrada.
- **Crons protegidos y fail-closed** (`assertCronAuthorized` lanza sin `CRON_SECRET`, comparación en tiempo constante).
- **Sentry instrumentado en el servidor** (`instrumentation.ts` con `onRequestError`), con cookies filtradas.
- **Clave de Claude rechazada** se marca y se avisa al founder con la barra roja, y cae a la global si existe.
- **Previews protegidos** con Vercel SSO (no son públicos).
- Todas las variables de Vercel salvo una (`NEXT_PUBLIC_NAV_STYLE`, que es pública y sobra) están como `sensitive`: no se pueden leer desde el panel ni por API.

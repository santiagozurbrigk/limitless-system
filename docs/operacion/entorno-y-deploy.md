# Entorno y deploy

> Verificado contra el código el 2026-09-23 (commit 038caca) y contra el proyecto de Vercel (`otc-plaform`, team `otcteam`; sólo nombres de variables, sin valores). Backlog: `PENDIENTES.md` § Infraestructura.

## Setup local

Requisitos: Node ≥ 20 (el reel-worker pide ≥ 22), pnpm 9.15.0 (`corepack enable` toma la versión de `packageManager`).

```bash
pnpm install                              # raíz del monorepo
cp .env.example apps/web/.env.local       # completar lo necesario (ver tabla)
pnpm --filter @ai-coo/web dev             # http://localhost:3000 (webpack)
pnpm --filter @ai-coo/web dev:turbo       # alternativa con Turbopack
pnpm --filter @ai-coo/web clean           # borra .next si hay errores ENOENT (Windows)
```

`pnpm dev` en la raíz levanta **todos** los `dev` del workspace vía turbo, incluido el bot de Discord (`tsx watch`), que sin `DISCORD_BOT_TOKEN` corta al arrancar. Preferí el `--filter`.

- **No hay Supabase local** (no hay `supabase/config.toml`). El entorno local apunta a un proyecto remoto: usá uno propio de desarrollo con las 175 migraciones aplicadas (`supabase db push`), no producción.
- **Modo demo:** sin `NEXT_PUBLIC_SUPABASE_URL` + anon key, `isSupabaseConfigured()` es `false`, el middleware deja pasar todo y los providers cargan `apps/web/mocks/`. **Sólo funciona para `/demo`, `/design-system` y lo que no pase por el layout de plataforma**: cualquier página de `(platform)` responde 500 desde `getHoldingSessionState` (`[DEMO-LAYOUT-500]`).
- OAuth desde local: las redirect URIs de `.env.example` apuntan a `localhost:3000`; hay que registrarlas en la consola de cada proveedor. Google en modo "Prueba" exige agregar el email como test user.
- `ffmpeg` se resuelve por `@ffmpeg-installer/ffmpeg` y `ffprobe-static`; no hace falta instalarlo para `apps/web`. Sí para `apps/reel-worker` en local.

## Variables de entorno

Relevadas con grep de `process.env.*` en `apps/` y `packages/` (89 nombres, incluidas las del sistema). Columnas: **Ex** = está en `.env.example`; **Vercel** = existe en el proyecto de Vercel (Production y/o Preview).

### `apps/web` — núcleo

| Variable | Requerida | Ex | Vercel | Quién la usa |
|---|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | sí | sí | sí | URLs absolutas: emails, OAuth, QStash (`lib/queue/qstash-client.ts`, fallback a `VERCEL_URL`), 20 usos |
| `NEXT_PUBLIC_SUPABASE_URL` | sí | sí | sí | `lib/supabase/env.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` o `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sí (una) | sí | ambas | `lib/supabase/env.ts` (lee la primera que haya) |
| `SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_SECRET_KEY` | sí (una) | sí | la primera | `lib/supabase/env.ts` |
| `CRON_SECRET` | sí | sí (dice "opcional": **es obligatoria**, los crons lanzan sin ella) | sí | `lib/integrations/cron-auth.ts`, `fathom/process` |
| `ENCRYPTION_MASTER_KEY` | sí | sí | sí | `lib/security/encryption.ts` (BYOK, Zernio, GHL, Hyros, VTurb, WebinarJam, pagos, MP) |
| `ENCRYPTION_MASTER_KEY_PREVIOUS` | no (sólo durante una rotación) | no | no | `lib/security/encryption.ts`: clave anterior, sólo para leer. Se carga y se saca siguiendo [`rotacion-master-key.md`](./rotacion-master-key.md). Base64 de 32 bytes, igual que la actual |
| `ANTHROPIC_API_KEY` | **no** en `apps/web` | sí | no figura | Ya no la lee la web (SCRUM-7, 2026-10-02): cada org usa su clave (Ajustes → IA) y el super-admin la de la plataforma (Super-admin → Infraestructura, tabla `platform_ai_credentials`). Sí la usa `apps/reel-worker` (captions) |
| `OPENAI_API_KEY` | sí para RAG y transcripción | sí | sí | embeddings (`lib/rag`), `/api/agent/transcribe`, `process-sop-video` |
| `QSTASH_TOKEN` | recomendada | sí | sí | `lib/queue/qstash-client.ts` (sin ella: crons en serie, RAG inline) |
| `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | sí si hay QStash | sí | sí | `lib/queue/qstash-verify.ts`, reel-worker |
| `WORKER_AUTH_SECRET` | recomendada | **no** | sí | `lib/queue/verify-queue-request.ts`, `qstash-client.ts`, `reel-variation-actions.ts`, `lib/sops/enqueue-video-job.ts`, reel-worker |
| `REEL_WORKER_URL` | para trial reels | sí | sí | `app/marketing/content/reel-variation-actions.ts` (sin ella usa `/api/queue/process-reel-variations`) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | para emails | sí | sí | `lib/email.ts`, `lib/email/waitlist-email.ts` |

### `apps/web` — integraciones

| Variable | Ex | Vercel | Quién la usa |
|---|---|---|---|
| `ZERNIO_BASE_URL` | **no** | no | `lib/zernio/constants.ts` (default `https://zernio.com/api/v1`) |
| `ZERNIO_WEBHOOK_SECRET` | **no** | **no** | `app/api/integrations/zernio/webhook/route.ts` — sin ella el webhook responde 503 (`[ENV-ZERNIO-WEBHOOK-SECRET]`) |
| `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET`, `CALENDLY_REDIRECT_URI` | sí | sí | rutas `app/api/integrations/calendly/**` |
| `CALENDLY_CLOSER_REDIRECT_URI` | **no** | no | `calendly/closer/{start,callback}` (fallback a `CALENDLY_REDIRECT_URI`) |
| `CALENDLY_WEBHOOK_URL` | sí | sí | `calendly/oauth/callback` |
| `CALENDLY_AUTH_BASE`, `CALENDLY_AUTH_TOKEN`, `CALENDLY_SCOPES` | sí | no (tienen default) | rutas de Calendly, `lib/calendly/oauth-token.ts` |
| `FATHOM_WEBHOOK_SECRET` | sí | **no** | `fathom/webhook` legacy y `lib/fathom/connect.ts` (lo copia a cada org al conectar) |
| `FATHOM_API_BASE` | comentada | no | `lib/fathom/api.ts` |
| `GHL_API_BASE`, `HYROS_API_BASE`, `VTURB_API_BASE`, `WEBINARJAM_API_BASE` | **no** | no | override de base URL en cada `lib/<proveedor>/client.ts` (opcionales) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | sí | sí | `lib/google/oauth.ts`, `app/super-admin/drive-actions.ts` |
| `GOOGLE_FORMS_REDIRECT_URI`, `YOUTUBE_REDIRECT_URI` | sí | sí | rutas OAuth de Google |
| `SUPER_ADMIN_GOOGLE_REDIRECT_URI` | **no** | sí | Drive del super-admin |
| `TYPEFORM_CLIENT_ID`, `TYPEFORM_CLIENT_SECRET`, `TYPEFORM_REDIRECT_URI` | sí | sí | rutas Typeform, `lib/typeform/sync.ts` |
| `STRIPE_CLIENT_ID`, `STRIPE_SECRET_KEY`, `STRIPE_REDIRECT_URI` | sí | sí | `lib/stripe/config.ts` |
| `MERCADOPAGO_CLIENT_ID`, `_CLIENT_SECRET`, `_REDIRECT_URI`, `_WEBHOOK_SECRET` | sí | sí | `lib/mercadopago/config.ts`, `webhooks/mercadopago` |
| `INSTAGRAM_APP_ID`, `_APP_SECRET`, `_REDIRECT_URI`, `_WEBHOOK_VERIFY_TOKEN` | sí | sí | `lib/instagram/config.ts`, `webhooks/instagram/messages` |
| `UNIPILE_DSN`, `UNIPILE_ACCESS_TOKEN` (alias `UNIPILE_API_KEY`), `UNIPILE_WEBHOOK_SECRET` | sí (`API_KEY` sólo comentado) | sí | `lib/unipile/*` |
| `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `NEXT_PUBLIC_DISCORD_CLIENT_ID` | sí | sí | `lib/discord/*`, `integrations/discord/**` |
| `LIMITLESS_WEBHOOK_SECRET` | sí | **no** — está `OTC_WEBHOOK_SECRET` | `lib/discord/webhook-auth.ts` (lee las dos) |
| `META_CONVERSIONS_API_TOKEN`, `NEXT_PUBLIC_META_PIXEL_ID` | sí | sí | `lib/meta/conversions-api.ts`, `components/landing/meta-pixel.tsx` |
| `NEXT_PUBLIC_UTM_ORGANIZATION_ID` | sí | **no** | `app/api/waitlist/route.ts` |
| `MIRO_ACCESS_TOKEN` | sí | sí | `lib/ai-brain/process-document.ts` |
| `NEXT_PUBLIC_SOP_VIDEO_MAX_MB` | **no** | no | `lib/sops/constants.ts` (tiene default) |

### `apps/web` — observabilidad, tests y sistema

| Variable | Ex | Vercel | Quién la usa |
|---|---|---|---|
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | **no** | sí | `sentry.*.config.ts` |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | **no** | sí | `next.config.ts` (source maps) |
| `SENTRY_FORCE` | **no** | no | habilita Sentry fuera de producción |
| `E2E_BASE_URL`, `E2E_HOLDING_EMAIL`, `E2E_HOLDING_PASSWORD`, `PLAYWRIGHT_*`, `CI` | **no** | — | `playwright.config.ts`, `e2e/` |
| `VERCEL_URL`, `VERCEL_GIT_COMMIT_SHA`, `NODE_ENV`, `NEXT_RUNTIME` | — | automáticas | sistema |

### Sobrantes

- **En `.env.example` y nadie las lee:** `NEXT_PUBLIC_VSL_URL` (el `vsl-player` se borró con la landing).
- **En Vercel y nadie las lee:** `NEXT_PUBLIC_VSL_URL`, `NEXT_PUBLIC_NAV_STYLE` (sólo Preview), `REDIS_URL`, `QSTASH_URL` (el SDK usa su default), `GOOGLE_REDIRECT_URI`, `FATHOM_REDIRECT_URI`.
- **En `turbo.json` (`build.env`) y ya no:** falta declarar la mayoría de las variables nuevas (GHL, pagos, Zernio, Sentry, `WORKER_AUTH_SECRET`…). Afecta la clave de caché de turbo (y el modo estricto de env de turbo si se activara); no rompe el build de Next. `OTC_WEBHOOK_SECRET` sigue listada.
- Limpieza en `[ENV-LIMPIEZA]`.

### `apps/discord-bot` (Railway)

| Variable | Uso |
|---|---|
| `DISCORD_BOT_TOKEN` | Gateway |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | escribe con service role |
| `LIMITLESS_API_URL` (respaldo `OTC_API_URL`) | URL de la app |
| `LIMITLESS_WEBHOOK_SECRET` (respaldo `OTC_WEBHOOK_SECRET`) | mismo valor que en Vercel |

El bot valida al arrancar que estén las cinco (`apps/discord-bot/src/index.ts`) y dice cuál falta. Plantilla: `apps/discord-bot/.env.example`.

Opcional: `SENTRY_DSN` (el mismo de Vercel): con ella cada `logError` va a Sentry (SCRUM-84). Sin ella el bot arranca igual.

### `apps/reel-worker` (Fly.io)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` (captions con Haiku), `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `WORKER_AUTH_SECRET`, `PORT` (8080), `NODE_ENV`, y opcional `SENTRY_DSN` (SCRUM-84: errores del worker a Sentry). `WORKER_AUTH_SECRET` **falta** en la lista de secrets comentada en `fly.toml`, aunque el código lo usa como método principal de auth (el README del worker sí lo lista).

## Deploy de `apps/web` (Vercel)

- Proyecto `otc-plaform` (sic) en el team `otcteam`, región **`gru1`** (São Paulo, `apps/web/vercel.json`).
- **Auto-deploy desde `main`**: cada merge a `main` genera un deploy de producción. Verificado el 2026-09-23: los últimos tres deploys de producción salen de `santiagozurbrigk/limitless-system` (el renombre del repo no cortó la integración).
- Cada push a otra rama genera un preview. Los previews **no sirven para probar OAuth** (las redirect URIs son fijas a producción).
- Build: `next build` (con `withSentryConfig`); `outputFileTracingRoot` en la raíz del monorepo; `serverExternalPackages` para ffmpeg; `serverActions.bodySizeLimit = 16mb` (adjuntos del inbox).
- Límites de duración: la mayoría de las rutas declara `maxDuration` 60; agente y RAG 300; `daily-signals` 600; `process-sop-video` 800.
- Redirects en `next.config.ts`: `/` → `/login` (temporal), los de `lib/navigation/redirects.ts` y el callback viejo de Google Forms.
- Rollback: desde el dashboard de Vercel (promover un deploy anterior). No revierte migraciones: sólo es seguro si la migración del deploy era compatible hacia atrás. Después de un rollback, re-promover el último deploy cuando esté arreglado. Qué hacer ante un incidente: [`incidentes.md`](./incidentes.md).

## Workflow de git

1. Rama desde `main` actualizado: `git fetch origin main && git checkout -B <rama> origin/main`. Nombres `feat/…`, `fix/…`, `chore/…`; las sesiones de Claude Code usan `claude/…`.
2. Commits en español, estilo convencional (`feat(clientes): …`, `fix(zernio): …`).
3. PR a `main` → CI verde → **Squash and merge**. Nunca push directo a `main`.
4. La rama queda consumida; la próxima tarea arranca de `main` otra vez.
5. El CI corre en push a `main`, `claude/**`, `feat/**`, `fix/**`, `chore/**`, `Claude-*` y en todo PR (ver `docs/operacion/testing.md`).

El repo se renombró de `ai-coo-platform` a `limitless-system` el 2026-09-22. No crear nunca un repo nuevo con el nombre viejo: rompe la redirección de GitHub. Copias locales viejas: `git remote set-url origin https://github.com/santiagozurbrigk/limitless-system`.

## Configuración de Supabase Auth

La configuración de Auth (confirmación de email, signups, duración del JWT) no está versionada: no hay
`supabase/config.toml` (`[AUTH-MFA-Y-POLITICA]`). Lo que el código da por sentado:

- **"Confirm email" activo.** Aceptar una invitación de equipo (`aceptar_invitacion_de_equipo`, SCRUM-495) confía
  en `auth.users.email_confirmed_at` para saber que la cuenta es de quien recibe el email. Si la confirmación está
  apagada, Supabase confirma en el acto cualquier email con el que alguien se registre, y esa garantía se cae.
  - **Dónde se ve:** panel de Supabase del proyecto → Authentication → Sign In / Providers, en la configuración del
    proveedor Email: "Confirm email" tiene que estar prendido.
  - **Desde la terminal** (sin secretos: es la misma anon key pública de la app): el endpoint público de
    configuración de Auth responde `"mailer_autoconfirm": false` cuando la confirmación está activa.
    ```bash
    curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/settings" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" | grep -o '"mailer_autoconfirm":[a-z]*'
    ```
  - **Desde SQL** no hay forma confiable: la configuración vive en el servicio de Auth, no en la base. Mirar
    `auth.users` (p. ej. cuentas con `confirmation_sent_at` vacío) sólo da indicios de cómo se crearon las
    cuentas, no de la configuración actual.
  - Propuesta, si se quiere que el código lo controle: que `aceptarInvitacionAction` lea ese endpoint y rechace
    si `mailer_autoconfirm` es `true` (cerrado ante la duda). No se hizo en SCRUM-495: hoy no hay invitaciones
    (nada las crea) y la parte B (SCRUM-499) es la que va a decidir cómo se invita.

### Mails de autenticación: Resend como SMTP de Supabase Auth (SCRUM-16)

Supabase Auth manda los mails de recuperar contraseña, confirmación e invitación. Su servidor por defecto sólo
entrega a miembros del proyecto, así que en producción usa el SMTP de **Resend**. **Remitente:
`noreply@send.limit-less.llc`** (decisión del 2026-10-09: los mails dejan de salir de `optimizatucontrol.com`).
El DNS de `limit-less.llc` está en Google Cloud DNS; `send.limit-less.llc` ya tiene registros de Resend publicados
(`resend._domainkey.send` y `send.send`), así que el dominio está dado de alta en alguna cuenta de Resend: la API
key tiene que salir de esa cuenta. Estado verificado el 2026-10-07 con el
endpoint de arriba: `mailer_autoconfirm: true` y `disable_signup: false`.

1. **Resend → Domains:** `send.limit-less.llc` tiene que figurar *Verified* en la cuenta (o el equipo) de Resend que lo dio de alta.
2. **Resend → API Keys** (en esa misma cuenta): crear una key aparte para Supabase (permiso *Sending access*, limitada a `send.limit-less.llc`).
3. **Supabase → Authentication → Emails → SMTP Settings → Enable custom SMTP:**
   - Sender email: `noreply@send.limit-less.llc`.
   - Sender name: `Limitless`.
   - Host: `smtp.resend.com` · Port: `465` · Username: `resend` · Password: la key del paso 2.
4. **Supabase → Authentication → Rate Limits:** "emails sent" en 30 por hora (el default con SMTP propio).
5. **Supabase → Authentication → URL Configuration:**
   - Site URL: `https://www.optimizatucontrol.com`.
   - Redirect URLs: `https://www.optimizatucontrol.com/auth/callback**`.
6. **Supabase → Authentication → Emails → Templates → Reset Password:**
   - Asunto: `Recuperá tu contraseña de Limitless`.
   - Link: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery`.
   - El link con `token_hash` lo verifica `/auth/callback` (`verifyOtp`) y funciona aunque el mail se abra en otro
     dispositivo. El de `{{ .ConfirmationURL }}` usa PKCE y sólo anda en el mismo navegador que lo pidió.
7. **Probar:**
   - `/auth/forgot-password` con una cuenta real: el mail llega y el link lleva a `/auth/update-password`.
   - Guardar la contraseña nueva y entrar con ella.
8. Para que los mails de la app (bienvenida, waitlist, reels) salgan del mismo remitente, en Vercel
   `RESEND_FROM_EMAIL=noreply@send.limit-less.llc` y `RESEND_API_KEY` de la misma cuenta de Resend. El dominio
   `optimizatucontrol.com` figura *Failed* en Resend (falta el MX de `send`), así que hoy esos mails no salen.
9. **Recién con el paso 7 bien:** Authentication → Sign In / Providers → Email → prender **Confirm email**.
   - El endpoint de arriba tiene que pasar a `mailer_autoconfirm: false`.
   - Mientras siga en `true`, no agregar emails a `super_admin_users` sin crear antes la cuenta (regla de SCRUM-15).

## Migraciones en el deploy

Vercel **no aplica migraciones**. El orden es: aplicar la migración en Supabase (reglas en `docs/arquitectura/base-de-datos.md`) y después mergear el código que la usa, o escribir el código tolerante a que la columna todavía no exista (`isMissingColumnError` en `lib/auth/bootstrap.ts`). El job `migrations` del CI garantiza que el set completo arma una base desde cero, no que esté aplicado en producción.

## `apps/reel-worker` en Fly.io

- App `otc-reel-worker`, región `gru`, VM `performance-2x` (2 vCPU, 4 GB), concurrencia 1 (soft) / 2 (hard), `auto_stop_machines` con `min_machines_running = 0` (arranca en frío con el primer job).
- Deploy manual: `fly deploy --config apps/reel-worker/fly.toml` (o `cd apps/reel-worker && fly deploy`). **No hay deploy automático** ni CI para este worker.
- Secrets con `fly secrets set` (lista arriba).
- Rollback: `fly releases -a otc-reel-worker` y `fly deploy --image <imagen de la release anterior>`.
- Endpoints: `GET /health`, `POST /` (procesa el job **sincrónicamente**, con la conexión abierta para que Fly no apague la máquina: descarga de Storage, 5 variantes con FFmpeg, captions con Haiku, sube a `trial-reels`, marca el job `preview_ready`; responde 200 aunque falle, para que QStash no reintente). `fly.toml` no define health check.
- Assets opcionales en `apps/reel-worker/luts/`: está `warm.cube`; falta `background-music.mp3`. Sin ese archivo la V3 conserva el audio original y se diferencia sólo por crop y metadatos; la música propia de la org no llega porque el schema del worker descarta `reelMusicPath` (`[TRIAL-REELS-MUSICA]`). Ver `[TRIAL-4]` en marketing.

## `apps/discord-bot` en Railway

Resumen de `docs/operacion/discord-bot-deploy.md`:

1. En el portal de Discord, activar **MESSAGE CONTENT INTENT** (privilegiado; gratis hasta 100 servidores, después exige verificación de la app).
2. Copiar el token del bot (se muestra una vez).
3. Railway → servicio `otc-discord-bot` desde el repo, con **`Root Directory = apps/discord-bot`** (sin eso Railway intenta construir el monorepo y falla con un error de Nx). `railway.json` usa el Dockerfile, `node dist/index.js`, reinicio `ON_FAILURE` hasta 10 veces. Cargar las cinco variables.
4. Registrar la redirect URI `https://<dominio>/api/integrations/discord/callback` (sin `/oauth/`) y setear `DISCORD_REDIRECT_URI` igual en Vercel.
5. Conectar desde Integraciones → Discord y elegir canales.

Prueba real: escribir en un canal monitoreado y ver una fila en `discord_messages` con `content` lleno (vacío = falta el intent). Railway hace auto-deploy en cada push a `main` si sigue conectado al repo; que siga conectado después del renombre **no está verificado** (`[REPO-RENOMBRADO-DEPLOYS]`).

## Nombres externos que todavía dicen OTC

Vercel `otc-plaform`, Supabase `OTC`, Fly `otc-reel-worker`, Railway `otc-discord-bot`, verify token de Meta `otc_instagram_webhook_2024`, fallback `https://otc-plaform.vercel.app` en `lib/email/welcome-email.ts` y en `components/super-admin/infrastructure-page.tsx`. Renombrarlos rompe cosas si no se coordina (`[REBRAND-EXTERNO]`).

## Archivos clave

- `.env.example`, `apps/discord-bot/.env.example`
- `apps/web/lib/supabase/env.ts`
- `apps/web/next.config.ts`, `apps/web/vercel.json`, `turbo.json`
- `apps/reel-worker/fly.toml`, `apps/reel-worker/Dockerfile`, `apps/reel-worker/README.md`
- `apps/discord-bot/railway.json`, `apps/discord-bot/Dockerfile`, `docs/operacion/discord-bot-deploy.md`
- `.github/workflows/ci.yml`

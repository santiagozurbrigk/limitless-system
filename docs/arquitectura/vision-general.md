# Visión general de la arquitectura

> Verificado contra el código el 2026-09-23 (commit 038caca). Backlog transversal: `PENDIENTES.md` § Infraestructura.

## Qué es

Limitless es un monorepo pnpm + Turborepo con **una app principal** (`apps/web`, Next.js 15 sobre Supabase, deploy en Vercel) y **dos procesos satélite** que no pueden vivir en una función serverless: el bot de Discord (Railway, conexión permanente al Gateway) y el worker de reels (Fly.io, FFmpeg). Todo el dominio de negocio está en `apps/web`; los `packages/*` son infraestructura compartida o están reservados y vacíos.

Documentos hermanos:
- `docs/arquitectura/base-de-datos.md` — migraciones, RLS, inventario de tablas.
- `docs/arquitectura/jobs-webhooks-y-colas.md` — crons, webhooks, QStash, Sentry.
- `docs/arquitectura/seguridad.md` — modelo de seguridad.
- `docs/arquitectura/auth-organizaciones-y-permisos.md` — sesión, org efectiva, holding y permisos.
- `docs/operacion/entorno-y-deploy.md` — variables de entorno, deploy, workflow git.
- `docs/operacion/testing.md` — tests y CI.
- `docs/integraciones/README.md` — mapa de proveedores externos.

## Stack real

Versiones de los `package.json` (rango declarado; el lockfile manda).

| Pieza | Versión | Dónde |
|---|---|---|
| Node | `>=20` (raíz); `>=22` en `apps/reel-worker` | `package.json`, `apps/reel-worker/package.json` |
| pnpm | `9.15.0` (`packageManager`) | `package.json` |
| Turborepo | `^2.5.4` | `package.json`, `turbo.json` |
| Next.js | `^15.3.2` (App Router) | `apps/web/package.json` |
| React / React DOM | `^19.1.0` | ídem |
| TypeScript | `^5.8.3` | ídem |
| Supabase JS / SSR | `@supabase/supabase-js ^2.106.2`, `@supabase/ssr ^0.10.3` | ídem |
| Anthropic SDK | `^0.39.0` (web), `^0.27.3` (reel-worker) | ídem |
| OpenAI SDK | `^6.42.0` (embeddings RAG y transcripción Whisper) | ídem |
| Upstash QStash | `^2.11.1` | ídem |
| Sentry | `@sentry/nextjs ^10.70.0` | ídem |
| Resend | `^4.5.1` | ídem |
| Zod | `^4.4.3` (web), `^3.23.8` (reel-worker) | ídem |
| Tailwind CSS | `^3.4.17` | ídem |
| UI | `@ai-coo/ui` (Radix + CVA), `lucide-react ^0.511.0`, `framer-motion`/`motion`, `@visx/*` 4.0.1-alpha, `@xyflow/react` | ídem |
| Tests | `vitest ^3.2.4`, `@playwright/test ^1.62.1` | ídem |
| Media | `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`, `ffprobe-static` (en `serverExternalPackages`) | `apps/web/next.config.ts` |
| Documentos | `docx`, `exceljs`, `xlsx`, `pdf-lib`, `unpdf`, `jszip`, `papaparse` | `apps/web/package.json` |

Modelos de Claude: `apps/web/lib/ai/anthropic.ts` define `AI_MODELS.HAIKU = "claude-haiku-4-5-20251001"` y `AI_MODELS.SONNET = "claude-sonnet-4-6"`, con el ruteo por tarea en `TASK_MODEL_MAP`. Detalle en `docs/areas/agente-ia.md`.

## Monorepo

```
limitless-system/
├── apps/
│   ├── web/            @ai-coo/web         Next.js — toda la app (Vercel, gru1)
│   ├── discord-bot/    @ai-coo/discord-bot discord.js + Supabase service role (Railway)
│   └── reel-worker/    @ai-coo/reel-worker Express + FFmpeg (Fly.io, app otc-reel-worker)
├── packages/
│   ├── ui/             design system (Radix, Visx, Framer) — en uso (365 archivos lo importan)
│   ├── types/          tipos compartidos — en uso (12 archivos), mayormente placeholders de Phase 0
│   ├── config/         presets de Tailwind, TS y ESLint — en uso
│   ├── ai/             RESERVADO: exporta sólo AI_PACKAGE_RESERVED
│   ├── database/       RESERVADO: exporta sólo DATABASE_PACKAGE_RESERVED
│   ├── integrations/   RESERVADO: exporta sólo INTEGRATIONS_PACKAGE_RESERVED
│   └── queue/          RESERVADO: exporta sólo QUEUE_PACKAGE_RESERVED ("BullMQ + Redis", nunca se usó)
├── supabase/
│   ├── migrations/     175 migraciones — fuente de verdad del schema
│   ├── ci/             check-migrations.sh + supabase-stubs.sql (job del CI)
│   └── scripts/        SQL manual (legacy_RUN_ALL_PHASE1_NO_EJECUTAR.sql, no correr; mark_fathom_business_context_calls.sql)
├── docs/               documentación (esta carpeta)
└── .github/workflows/ci.yml
```

- Los cuatro paquetes reservados no tienen lógica. El equivalente real vive en `apps/web/lib/` (`lib/ai`, `lib/supabase`, `lib/<proveedor>`, `lib/queue`). No agregues código ahí sin decidir antes mover lo existente.
- `apps/discord-bot` y `apps/reel-worker` son **standalone**: no importan ningún paquete del workspace y tienen su propio Dockerfile.
- Tasks de Turbo (`turbo.json`): `build`, `dev`, `lint`, `typecheck`, `test`. Sólo `apps/web` declara `test`; `lint` lo declaran `apps/web` y `packages/ui`; `apps/reel-worker` no declara `typecheck` ni `lint`, así que **el CI no lo compila**.
- El nombre interno del workspace sigue siendo `ai-coo-platform` y los paquetes `@ai-coo/*`, aunque el repo se llama `limitless-system`.

## Estructura de `apps/web`

| Carpeta | Qué hay | Nota |
|---|---|---|
| `app/` | Rutas (App Router), Route Handlers y Server Actions | ver abajo |
| `app/api/` | 84 Route Handlers (`route.ts`) | webhooks, crons, workers de cola, OAuth, SSE |
| `lib/` | Lógica de negocio y clientes de proveedores, ~70 carpetas por dominio | acá van los tests (`__tests__`) |
| `components/` | UI por dominio (~40 carpetas) | client components sólo si hay estado/efectos |
| `providers/` | Contextos React (datos de plataforma, permisos, toasts, tema, workboard…) | |
| `layouts/` | `PlatformLayout`, `SuperAdminLayout`, `FounderLayout`, `ThreeColumnLayout` | los usan los `layout.tsx` de los route groups |
| `routes/` | `paths.ts` (fuente única de paths), `navigation.ts` | |
| `constants/` | ids de integraciones, roles, módulos de permisos | |
| `types/` | tipos por dominio | |
| `mocks/` | fixtures para modo demo | todavía los importan 10 archivos de producción (ver `[MOCK-DATA-AUDIT]`) |
| `hooks/` | 3 hooks de UI (sidebar, input validado) | además hay `lib/hooks/` |
| `e2e/` | Playwright (`holding.spec.ts`) | |
| `scripts/` | scripts sueltos (`clean.mjs`, verificaciones de RAG, reparación de Unipile) | no corren en CI |
| `api/` | **vacía** (sólo `.gitkeep`) | resto de Phase 0; las rutas de API están en `app/api/` |
| `server/` | **vacía** (sólo `.gitkeep`) | resto de Phase 0; el helper de servidor que existe está en `lib/server/action-result.ts` |
| `workspaces/` | `DEFAULT_WORKSPACE_ID` y un tipo | placeholder "multi-workspace" de Phase 0, sin funcionalidad; lo lee `providers/workspace-provider.tsx` |
| raíz | `middleware.ts`, `instrumentation.ts`, `sentry.{client,server,edge}.config.ts`, `next.config.ts`, `vercel.json`, `vitest.config.ts`, `playwright.config.ts` | |

### `app/`: route groups y carpetas de actions

Route groups (no aparecen en la URL):

| Grupo | Contenido |
|---|---|
| `app/(platform)/` | Toda la UI autenticada del negocio: `dashboard`, `workboard`, `agent`, `clients`, `marketing`, `sales`, `funnels`, `product`, `operations`, `finance`, `business-context`, `integrations`, `team`, `settings`, `holding`, `onboarding`, `lanzamientos`, `intelligence`, `executive-reports`, `sops`, `comentarios`, `redesign-preview`. El `layout.tsx` aplica el bloqueo por módulo. |
| `app/(super-admin)/super-admin/` | Panel del staff de Limitless (orgs, costos, waitlist, holding, trials, ai-brain, client-health, infrastructure, onboarding, users). |
| `app/(founder)/founder/` | Una página. |
| `app/(landing)/` | Sólo `/prueba` (confirmación de prueba gratis) y `/privacidad`. **La landing de `/` se borró**: `/` redirige a `/login` desde `next.config.ts`. |

Fuera de los grupos hay dos tipos de carpeta en `app/`:

- **Rutas públicas o de auth con página:** `login`, `auth/*` (callback, recover, update-password, force-password-change), `invite`, `onboarding-cliente/[token]`, `demo`, `design-system`, `superadmin/{login,dashboard}`.
- **Carpetas de dominio sólo con Server Actions** (sin `page.tsx`): `agent`, `business-context`, `calendly`, `clients` (20 archivos de actions), `closing`, `conversations`, `discord`, `executive-reports`, `fathom`, `finance`, `forms`, `funnels`, `ghl`, `hyros`, `instagram`, `integrations`, `intelligence`, `lanzamientos`, `manychat`, `marketing` (12), `mercadopago`, `metrics`, `onboarding`, `operations`, `payments`, `product`, `profile`, `sales` (6), `settings`, `sops`, `stripe`, `super-admin`, `team`, `unipile`, `vturb`, `webinarjam`, `workboard`, `youtube`.

En total hay 98 archivos `"use server"` en `app/`. La convención es `app/<dominio>/actions.ts` o `app/<dominio>/<sub>-actions.ts`, con sufijo `Action` en cada export.

## Convenciones

| Tema | Regla | Dónde se ve |
|---|---|---|
| Páginas | Server Component en `page.tsx` que resuelve la org y pasa props | `app/(platform)/**/page.tsx` |
| Mutaciones | Server Action con `requireOrganizationId()` + `createClient()` (RLS del usuario) | `app/<dominio>/actions.ts` |
| Service role | `createAdminClient()` sólo para secretos de integraciones, jobs y webhooks | `lib/supabase/admin.ts` |
| Resultado de actions | `lib/server/action-result.ts` | |
| Lectura masiva | `fetchAllRows()` para esquivar el techo de 1000 filas de PostgREST | `lib/supabase/fetch-all-rows.ts` |
| Paths | nunca hardcodeados: `paths` de `routes/paths.ts` | |
| Navegación | notch nav (`components/navigation/notch-nav/`) derivada de `lib/navigation/sidebar-modules.ts` | |
| Integraciones | registro único `lib/integrations/registry.ts` + salud en `health.ts` | ver `docs/integraciones/README.md` |
| Fechas calendario | **Una regla:** el "hoy" y las fechas calendario de un dato de la organización son los de **su zona** (`organizations.timezone`; null = `America/Argentina/Buenos_Aires`), en el servidor y en el navegador, para todos los miembros estén donde estén. Todo sale de `lib/fechas/calendario.ts`; nunca `toISOString().slice(0, 10)`, `.slice(0, 10)` sobre un `timestamptz` ni `new Date("YYYY-MM-DD")` para mostrar. **Servidor:** `fechaDeHoyDeLaOrganizacion()` o `leerZonaHorariaDeLaOrganizacion()` una vez por pedido (nunca por fila). **Cliente:** la zona la lee una vez el layout de la plataforma y la reparte `ZonaDeLaOrganizacionProvider`; `useHoyDeLaOrganizacion()` para valores por defecto, `max` y "vencida", `useZonaDeLaOrganizacion()` para convertir (nunca el hoy del navegador). Una fecha elegida que va a un `timestamptz` se guarda con `fechaAInstanteEnZona` y se lee con `fechaDeValorGuardado`; el día de un instante real (llamada, mensaje, alta) sale de `fechaDeInstanteEnZona`. Los campos de fecha usan `CampoFecha` (`components/shared/campo-fecha.tsx`), que lee en la zona de la org; los existentes se migran al tocar su pantalla (`[CAMPO-FECHA-MIGRAR]`). Los períodos de reporte que siguen afuera están en `[FECHAS-UTC-RESTO]` | `lib/fechas/`, `providers/zona-de-la-organizacion-provider.tsx`, SCRUM-493 |
| Iconos | `lucide-react`; sin emojis en JSX | |
| Idioma | UI, commits y nombres de test en español rioplatense | |
| Naming | action `xxxAction`; componente PascalCase en archivo kebab; helper camelCase; cron en `app/api/cron/<nombre>/route.ts` | |

**Excepción conocida a la regla de org:** varias acciones leen `profile.organization_id` en vez de `requireOrganizationId()` y por eso ignoran el negocio activo de un holding: `app/marketing/content/{actions,sync-actions,drive-actions,reel-variation-actions,reel-music-actions}.ts`, `app/workboard/actions.ts`, `app/sales/closer-actions.ts`, `app/team/actions.ts`, `app/profile/actions.ts`, `app/api/integrations/calendly/closer/start/route.ts`. Ver `[AUD-SALUD-ORG-HOLDING]` en `pendientes-infra`.

## Flujo de una request autenticada

```
Navegador
  │  cookie de sesión Supabase (+ limitless_active_org si es holding)
  ▼
middleware.ts ─► lib/supabase/middleware.ts: updateSession()
  │  · sin Supabase configurado → pasa de largo (modo demo)
  │  · auth.getUser() con la anon key (refresca cookies)
  │  · lee profiles con service role: contraseña temporal vencida → signOut + /login;
  │    must_change_password → /auth/force-password-change; gate de onboarding
  │  · sin usuario y ruta no pública (lib/supabase/public-paths.ts) → 307 /login
  │    (salvo POST de Server Action: se devuelve la respuesta sin redirigir)
  │  · setea x-pathname y x-active-org-id para el render
  ▼
app/(platform)/layout.tsx  (Server Component)
  │  getHoldingSessionState · getCurrentUserPermissions · getCurrentOnboardingContext
  │  módulo sin permiso → <SinAcceso/> (sólo corta el render, no las actions)
  ▼
page.tsx / Server Action
  │  requireOrganizationId()  (lib/auth/bootstrap.ts, memoizado por request con cache())
  │    · auth.getUser() → profiles (service role) → org del perfil
  │    · holding: re-verifica el negocio activo contra holding_businesses
  │  createClient() (lib/supabase/server.ts) — consulta con el JWT del usuario
  ▼
PostgreSQL (Supabase) — RLS: organization_id = get_my_organization_id()
     get_my_organization_id() prioriza el claim JWT active_business_org_id
     (Auth Hook custom_access_token_hook) y si no, profiles.organization_id
```

Puntos no obvios:
- El middleware usa **service role** para leer `profiles` en cada request autenticada.
- El holding tiene **dos mecanismos que tienen que coincidir**: la cookie `limitless_active_org` (la lee `requireOrganizationId`) y el claim JWT `active_business_org_id` que agrega el Auth Hook a partir de `holding_active_sessions` (lo lee RLS). El hook se habilita a mano en el dashboard de Supabase (Authentication → Hooks); la migración `20260620100000_holding_jwt_claim_hook.sql` sola no lo activa. Al entrar/salir de un negocio se llama `auth.refreshSession()` (`lib/holding/refresh-auth-session.ts`).
- Las rutas de API no autenticadas por sesión (webhooks, crons, colas, OAuth callbacks) están listadas en `lib/supabase/public-paths.ts`; **cada handler se autentica solo** (firma, `CRON_SECRET`, token). Ver `docs/arquitectura/seguridad.md`.
- El agente usa SSE en `POST /api/agent/send` (`maxDuration = 300`), no Server Actions.

## Sistemas externos

```
                          ┌──────────────── GitHub (santiagozurbrigk/limitless-system)
                          │  push/PR → GitHub Actions (typecheck, lint, vitest, migraciones)
                          │  merge a main → Vercel
                          ▼
┌──────────────────────── Vercel (proyecto otc-plaform, región gru1) ─────────────────────────┐
│ apps/web  ·  19 crons (vercel.json)  ·  84 route handlers  ·  Sentry (instrumentation.ts)   │
└──┬──────────────┬──────────────┬───────────────┬───────────────┬──────────────┬──────────────┘
   │              │              │               │               │              │
   ▼              ▼              ▼               ▼               ▼              ▼
Supabase       Upstash        Anthropic       OpenAI          Resend         Sentry
(OTC, PG 17,   QStash         (Claude,        (embeddings,    (emails)       (errores)
 Auth, Storage, (fan-out de    BYOK por org)   Whisper)
 RLS, pgvector) crons, RAG,
   ▲            Fathom, SOP,
   │            reels)──────────► Fly.io: apps/reel-worker (otc-reel-worker, gru) ──► Supabase Storage
   │
   └──── Railway: apps/discord-bot (Gateway de Discord) ──► /api/discord/* (Bearer secreto)

Proveedores de negocio (ver docs/integraciones/README.md):
  entrantes por webhook: Calendly, ManyChat, GHL, Fathom, Whop, Commas, Mercado Pago, Zernio,
                         Instagram Graph, Unipile (Stripe no tiene ruta de webhook)
  por cron/manual/en vivo: Zernio, Fathom, Calendly, GHL, Typeform, Google (Drive/Forms/YouTube),
                         VTurb, WebinarJam, Hyros, Instagram Graph, Mercado Pago, Miro (lectura puntual)
```

## Archivos clave

- `apps/web/middleware.ts`, `apps/web/lib/supabase/middleware.ts`, `apps/web/lib/supabase/public-paths.ts`
- `apps/web/lib/auth/bootstrap.ts` (`requireOrganizationId`)
- `apps/web/lib/supabase/{server,admin,client,env}.ts`
- `apps/web/app/(platform)/layout.tsx` (bloqueo por módulo)
- `apps/web/lib/holding/` (negocio activo, refresh de JWT)
- `apps/web/next.config.ts`, `apps/web/vercel.json`, `turbo.json`
- `apps/web/lib/integrations/registry.ts`
- `apps/web/lib/queue/qstash-client.ts`
- `apps/web/routes/paths.ts`, `apps/web/lib/navigation/sidebar-modules.ts`
- `apps/web/instrumentation.ts`
- `.github/workflows/ci.yml`

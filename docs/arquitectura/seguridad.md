# Modelo de seguridad

> Verificado contra el código el 2026-09-23 (commit 038caca). Lo que está **abierto** no se describe acá: está en `PENDIENTES.md` § Infraestructura (IDs `[AUD-SEG-*]`, `[PERMISOS-SERVER-ACTIONS]`, `[SEG-*]`). Este doc describe cómo funciona hoy.

El detalle de sesión, organización efectiva, holding y permisos por módulo está en `docs/arquitectura/auth-organizaciones-y-permisos.md`; acá va el modelo de seguridad completo.

## Resumen

| Capa | Mecanismo | Archivo |
|---|---|---|
| Aislamiento entre orgs | RLS por `organization_id` con `get_my_organization_id()` | migraciones; ver `docs/arquitectura/base-de-datos.md` |
| Sesión | Supabase Auth con cookies (`@supabase/ssr`), refresco en el middleware | `apps/web/lib/supabase/middleware.ts` |
| Rutas | Todo requiere sesión salvo la lista de `isPublicPath` | `apps/web/lib/supabase/public-paths.ts` |
| Permisos por rol | Bloqueo del **render** por módulo en el layout de plataforma | `apps/web/app/(platform)/layout.tsx`, `lib/auth/get-current-permissions.ts` |
| Super-admin | `requireSuperAdmin()` en todas sus acciones | `apps/web/lib/auth/require-super-admin.ts` |
| Secretos de integraciones | Tablas sin lectura para el usuario + service role en servidor + AES-256-GCM | `lib/supabase/admin.ts`, `lib/security/encryption.ts` |
| Jobs | `CRON_SECRET`, `WORKER_AUTH_SECRET`, firma QStash, comparación en tiempo constante | `lib/integrations/cron-auth.ts`, `lib/queue/verify-queue-request.ts`, `lib/security/safe-equal.ts` |
| Webhooks | Firma o secreto por proveedor, fail-closed | ver `docs/arquitectura/jobs-webhooks-y-colas.md` |
| Abuso | Rate limit compartido en Postgres | `lib/rate-limit.ts` |
| IA | Contenido no confiable envuelto antes de ir al prompt | `lib/ai/wrap-untrusted-content.ts` |
| Errores | Sentry sin cookies | `sentry.*.config.ts` |

## Identidad y organización efectiva

- `requireOrganizationId()` (`lib/auth/bootstrap.ts`) resuelve la org de cada Server Action: `auth.getUser()` → `profiles` leído con **service role** (`loadProfileOrganizationContext`) → para holdings, el negocio activo de la cookie `limitless_active_org`, re-verificado contra `holding_businesses`. Memoizado por request con `cache()`.
- En la base, la org sale de `get_my_organization_id()`, que prioriza el claim JWT `active_business_org_id` del Auth Hook. **Las dos fuentes tienen que coincidir**; por eso al cambiar de negocio se escribe `holding_active_sessions` y se llama `auth.refreshSession()`.
- `profiles.organization_id`, `role` e `is_holding_admin` no se pueden editar desde el cliente (trigger `protect_profile_columns`).
- Contraseñas temporales: el middleware desloguea si vencieron y fuerza el cambio si `must_change_password`; la marca se baja en el servidor junto con el cambio real.
- La cookie vieja `otc_active_org` se sigue leyendo como respaldo (`LEGACY_ACTIVE_ORG_COOKIE` en `lib/holding/constants.ts`).

## Permisos por rol

- Roles del sistema en `constants/roles.ts`; roles custom en `team_roles.permissions`, agrupados en 13 módulos (`constants/permission-modules.ts`).
- El layout de `(platform)` calcula el módulo de la URL (`lib/navigation/module-for-path.ts`) y, si el rol lo tiene en `none`, muestra `<SinAcceso/>`. El founder pasa siempre; un usuario sin rol cargado navega todo (a propósito).
- **Es una barrera de navegación, no de datos**: salvo el UPDATE de `profiles` (`Founders update org profiles`, founder/admin), ninguna policy RLS filtra por rol y las Server Actions no chequean permisos. Abierto como `[PERMISOS-SERVER-ACTIONS]`.

## Service role y cliente

- `createAdminClient()` (`lib/supabase/admin.ts`) usa `SUPABASE_SERVICE_ROLE_KEY` (o `SUPABASE_SECRET_KEY`), bypasea RLS y sólo se usa en servidor: webhooks, crons, workers, lectura de secretos, middleware y contexto de perfil.
- Ningún archivo `"use client"` importa el admin client, el cifrado ni módulos de IA (revisado en la auditoría del 2026-09-22).
- Variables `NEXT_PUBLIC_*` en uso: `APP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`/`PUBLISHABLE_KEY`, `DISCORD_CLIENT_ID`, `META_PIXEL_ID`, `SENTRY_DSN`, `UTM_ORGANIZATION_ID`, `SOP_VIDEO_MAX_MB`. Todas son públicas por diseño.
- Un export de un archivo `"use server"` es un endpoint invocable: no exportar helpers internos desde ahí (hay algunos, ver `[AUD-SALUD-6]`).

## Secretos y cifrado

`lib/security/encryption.ts`: AES-256-GCM, IV aleatorio de 12 bytes, auth tag, formato `iv.tag.ciphertext` en base64. La clave es `ENCRYPTION_MASTER_KEY` (32 bytes en base64; `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). Sin la variable, `encrypt`/`decrypt` **lanzan**: ningún proveedor guarda en claro por falta de clave ni manda el ciphertext como API key.

Qué se guarda cifrado y qué no:

| Secreto | Dónde | Cifrado |
|---|---|---|
| Key BYOK de Claude | `organizations.claude_api_key_encrypted` | sí |
| API keys de Zernio, GHL, Hyros, VTurb, WebinarJam | `*_integrations` | sí (`lib/<proveedor>/integration.ts`) |
| Key de Fathom por miembro | `team_member_integrations.encrypted_api_key` | sí |
| Secreto de webhook y API key de Whop/Commas | `payment_integrations.*_encrypted` | sí |
| Tokens de Mercado Pago | `mercadopago_integrations` | sí (`lib/mercadopago/tokens.ts`) |
| Tokens OAuth de Calendly, Stripe, Instagram, Typeform, Google/YouTube, Drive de super-admin; `fathom_integrations.api_key`; token de ManyChat | `*_integrations`, `super_admin_google_tokens` | **no** — protegidos sólo por RLS cerrado (`[AUD-SEG-2]`) |

Rotar `ENCRYPTION_MASTER_KEY` invalida todo lo cifrado: no hay re-cifrado automático. Efecto concreto: la clave de Claude de cada org cae en silencio a la global, las demás integraciones cifradas dejan de funcionar y los webhooks de pagos responden 404 (Commas no reintenta: esos cobros se pierden). Ver `[SEC-MASTER-KEY-ROTACION]`.

## Crons, colas y bot

- `assertCronAuthorized`: `Bearer CRON_SECRET` en tiempo constante (`safeEqual` hashea ambos lados con SHA-256 antes de `timingSafeEqual`, así tampoco filtra el largo). **Lanza si `CRON_SECRET` no está**: un cron sin la variable responde 500, nunca queda abierto.
- `verifyQueueRequest`: `WORKER_AUTH_SECRET` (tiempo constante) o, si no está, firma QStash con las dos signing keys (503 sin ellas).
- Bot de Discord → app: `isDiscordWebhookAuthorized` con `LIMITLESS_WEBHOOK_SECRET` (respaldo `OTC_WEBHOOK_SECRET`), tiempo constante, **fail-closed** (antes una variable vacía aceptaba `"Bearer undefined"`).
- El worker de Fly (`apps/reel-worker/src/index.ts`) compara el secreto con `===` (no constante), loguea los primeros 4 caracteres del secreto esperado cuando falla, y sin secreto ni signing keys acepta requests de `127.0.0.1` o IPs `10.*`/`172.*`, o con `NODE_ENV` que no incluya `prod`. Ver `[SEG-REEL-WORKER-AUTH]`.

## Webhooks

Todos los webhooks verifican antes de tocar la base y son **fail-closed** cuando falta su secreto (Zernio, Unipile, Discord y los de pagos responden 401/503). En Calendly, hasta el 2026-09-29 una integración sin suscripción guardaba una clave fija pública (`NO_WEBHOOK_SIGNING_KEY`) que servía para firmar eventos falsos; desde entonces esa clave nunca vale y la firma tiene que tener menos de 5 minutos (`lib/calendly/webhook-signature.ts`, SCRUM-489). Firmas sobre el **raw body**. Tabla completa por proveedor, con ventanas de replay y dedupe, en `docs/arquitectura/jobs-webhooks-y-colas.md`.

Atribución a la org: siempre desde un dato firmado o desde un token propio de la URL, nunca desde el query string (`?organizationId=` pierde contra el `locationId` firmado en GHL; el `guild_id` de Discord sale del token de OAuth; Fathom legacy rechaza con 409 si la firma valida para más de una org).

## OAuth

Los flujos de OAuth (Calendly org y closer, Discord, Google Forms/Drive, YouTube, Typeform, Instagram, Stripe, Mercado Pago, Unipile hosted auth, Drive del super-admin) generan `state` (PKCE donde el proveedor lo soporta) y guardan `{ organizationId, state, … }` en una cookie httpOnly **como JSON sin firmar**. El callback es una ruta pública: no mira la sesión, sólo compara el `state` de la URL con el de la cookie y toma la org de la cookie. Como quien controla el navegador controla la cookie, alguien que conozca el UUID de otra org puede conectarle su propia cuenta del proveedor (`[OAUTH-ESTADO-SIN-FIRMA]`, P0; detalle en [`../auditoria/aislamiento-entre-organizaciones.md`](../auditoria/aislamiento-entre-organizaciones.md)). Los callbacks sólo redirigen a paths internos (`lib/integrations/oauth-redirect.ts`, `oauth-callback-headers.ts`). `vercel.json` marca los callbacks con `Cache-Control: no-store` para que la CDN no cachee una respuesta con cookies. Las redirect URIs vienen de variables de entorno fijas: **OAuth no se puede probar desde un preview de Vercel** (el proveedor vuelve a producción).

## Entrada del usuario

- Validación con Zod en `lib/validations.ts` y en cada action; no todas las acciones la usan (`updateContentPieceAction` pasa el objeto sin validar, `[AUD-SEG-5]`).
- `lib/sanitize.ts`: `sanitizeText` (trim, quita caracteres de control, corta a 100.000) y `sanitizeHtml` (escapa `< > " ' /`). Se usa en el agente (`app/agent/actions.ts`, `lib/agent/stream-agent-message.ts`).
- `dangerouslySetInnerHTML` sólo aparece con contenido estático.
- Rutas de Storage enviadas por el cliente se validan contra la carpeta de la org (`lib/storage/org-path.ts`) antes de firmarlas o borrarlas con service role.
- Formularios públicos (`/api/waitlist`, `/api/trial-confirm`, `/onboarding-cliente`) tienen rate limit por IP, techo de largo y no pisan datos existentes.

## Prompt injection

`wrapUntrustedContent(label, content)` envuelve texto externo (transcripts, mensajes, documentos) en `<label>…</label>` más una instrucción de tratarlo como dato. No escapa un `</label>` dentro del contenido y hay fuentes que todavía no lo usan (`[AUD-SEG-6]`). El impacto está acotado porque las escrituras del agente van con la sesión del usuario.

## Rate limiting

Contador en Postgres (`consume_rate_limit`), fail-open. Límites y usos en `docs/arquitectura/jobs-webhooks-y-colas.md`.

## Headers HTTP

`apps/web/vercel.json` sólo define `Cache-Control: no-store` para los callbacks de OAuth y `/api/integrations/google/thumbnail`. **No hay headers de seguridad** (CSP, `X-Frame-Options`/`frame-ancestors`, HSTS explícito, `Referrer-Policy`, `Permissions-Policy`) ni en `vercel.json` ni en `next.config.ts` (`[SEG-HEADERS]`). Vercel agrega HSTS en sus dominios por defecto.

## Lo que ya no aplica

- `docs/archivo/security-audit-api-keys.md` (2026-06-06) sigue siendo correcto en lo que dice (ningún secreto en el bundle, rate limit en Postgres, policies SELECT eliminadas en `20260606100000`), pero está incompleto: esta página lo reemplaza.
- `assertCronAuthorized` ya no "permite acceso si `CRON_SECRET` no está set" (lo decían las notas operativas viejas): lanza.

## Archivos clave

- `apps/web/lib/supabase/{middleware,public-paths,admin}.ts`
- `apps/web/lib/auth/{bootstrap,require-auth,require-super-admin,get-current-permissions}.ts`
- `apps/web/lib/security/{encryption,safe-equal}.ts`
- `apps/web/lib/integrations/{cron-auth,oauth-redirect,oauth-callback-headers}.ts`
- `apps/web/lib/queue/verify-queue-request.ts`
- `apps/web/lib/discord/webhook-auth.ts`
- `apps/web/lib/storage/org-path.ts`
- `apps/web/lib/ai/wrap-untrusted-content.ts`, `apps/web/lib/sanitize.ts`
- `apps/web/lib/rate-limit.ts`
- `supabase/migrations/20260922100000_profiles_columnas_protegidas.sql`, `20260922110000_rpcs_y_policies_entre_organizaciones.sql`

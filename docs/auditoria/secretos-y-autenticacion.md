# Auditoría: secretos y autenticación

| | |
|---|---|
| **Cubre** | (A) secretos: historial de git, bundle del cliente, logs y Sentry, cifrado de credenciales. (B) autenticación: login, signup, recuperación y cambio de contraseña, sesiones y cookies, MFA, OAuth de integraciones, alta de cuentas con contraseña temporal, super admin, usuario desactivado |
| **Fecha** | 2026-09-23 |
| **Código auditado** | `038caca` (`main`) |
| **Complementa** | [`../arquitectura/seguridad.md`](../arquitectura/seguridad.md) y [`../arquitectura/auth-organizaciones-y-permisos.md`](../arquitectura/auth-organizaciones-y-permisos.md). Lo que ya dicen esos documentos no se repite: acá va lo que faltaba y la evidencia nueva |
| **Modelo de amenazas** | [`modelo-de-amenazas.md`](./modelo-de-amenazas.md) |

**Método.**

- **Historial de git**: se bajó el historial completo (`git fetch --unshallow`: 895 commits, 41 ramas remotas y tags) y se
  recorrió `git log --all -p` con un escáner propio: JWT (`eyJ…`), `sk-ant-`, `sk-`/`sk-proj-`, `sk_live`/`rk_live`/`pk_live`,
  `sk_test`, `whsec_`, bloques `PRIVATE KEY`, tokens de GitHub, Slack, Google (`AIza`, `GOCSPX-`), AWS (`AKIA`),
  `sb_secret_`/`sb_publishable_`, tokens de bot de Discord, firmas de QStash, URLs de Postgres con contraseña, tokens de
  Mercado Pago (`APP_USR-`), asignaciones `*SECRET*|*TOKEN*|*API_KEY*|*PASSWORD*|*SERVICE_ROLE*` con literales de 16 o
  más caracteres, y strings de alta entropía (más de 4,3 bits por carácter, 32 o más caracteres) en código. Además, los nombres de archivo que
  alguna vez se agregaron o borraron (`--diff-filter=A` / `D`) que coincidan con `.env*`, `*.pem`, `*.key`, `credentials`,
  `secret`, `token`, `.npmrc`. `docs/external-apis/` se escaneó aparte (es documentación de proveedores).
- **Bundle del cliente**: se listaron los 428 archivos con `"use client"` y se recorrió su grafo de imports
  (`@/…` y relativos, sin `import type`, cortando en los archivos `"use server"`) buscando `lib/supabase/admin`,
  `lib/security/encryption`, `server-only` o `process.env` no públicos.
- **Logs**: grep de `console.*` en `apps/web/{app,lib}`, `apps/discord-bot/src`, `apps/reel-worker/src` filtrando por
  token/secret/key/password/header/payload/body/url/email, y lectura de los `sentry.*.config.ts`.
- **Producción (Supabase `nrzlylzbmsuowzhpdnjl`)**: sólo catálogos y advisors (`get_advisors security`,
  `pg_proc`, `information_schema.views`, `role_table_grants`, `pg_constraint`, `pg_class`). Una sola consulta tocó
  una tabla con filas: un conteo agregado sobre `super_admin_users` cruzado con `auth.users` (cuántos emails de la
  allowlist no tienen cuenta), sin leer emails. Nada se escribió.

**Qué no se pudo verificar.**

- **Configuración de Supabase Auth** (no hay `supabase/config.toml` en el repo y el MCP no la expone): duración del
  JWT, rotación de refresh tokens, límite de sesiones, "Confirm email", "Secure email change", largo mínimo de
  contraseña, signups habilitados, proveedores de login social, rate limits propios de Auth, si el Custom Access Token
  Hook está activo. Sólo el advisor confirma una cosa: **la protección contra contraseñas filtradas está apagada**.
- **Variables en Vercel, Railway y Fly** (valores y quién tiene acceso), rotaciones hechas alguna vez y la consola de QStash.
- **Qué manda realmente Sentry** (headers, query string) en un evento: no hay acceso al proyecto de Sentry.
- **Explotación**: los hallazgos sobre la base se deducen del catálogo; no se probó ninguna escritura.
- `node_modules` no está instalado: el comportamiento por defecto de `@supabase/ssr` (cookies) se toma de su
  documentación, no del código instalado.

## Resumen

- **Ningún secreto real quedó en el historial de git.** Nunca se commiteó un `.env` (sólo `.env.example`) y no aparece
  ninguna clave con formato conocido en 895 commits. Hay dos cosas menores: un link compartido de Fathom que puede ser real
  en un test, y un token de verificación de Instagram con valor predecible en `.env.example`.
- **El navegador no recibe secretos**: sólo recibe variables públicas por diseño. Pero 65 pantallas cargan, sin
  necesitarlo, un archivo que también sabe leer la clave maestra de la base (en el navegador queda vacía).
- **Hallazgo grave nuevo**: una vista de la base que muestra el estado de la clave de Claude **acepta borrados** de
  cualquier usuario logueado, y borra saltándose las reglas de acceso. Con una sola llamada, cualquier miembro (aunque
  sea de "sólo lectura") podría **borrar su organización entera**: se borran en cascada 138 tablas.
- **Hallazgo grave latente**: cualquier founder puede crear una cuenta ya confirmada para **cualquier email** y recibir
  su contraseña. Si algún día se autoriza como super admin un email que todavía no tiene cuenta, un tercero podría tomar
  el panel interno. Hoy no pasa: el único email autorizado ya tiene cuenta.
- **No hay segundo factor (MFA)** en ninguna cuenta, tampoco en el super admin, y Supabase no rechaza contraseñas filtradas.
- **Los logs guardan datos personales**: textos de mensajes directos, filas completas de clientes importados y emails.
- La mayoría de lo demás ya estaba en el backlog: open redirect del login, "olvidé mi contraseña" roto, miembro
  desactivado que sigue entrando, rate limit de login, tokens OAuth sin cifrar, secreto del worker en la URL.

---

## A. Secretos

### A.1 Historial de git

| Qué se buscó | Resultado |
|---|---|
| Archivos `.env*` alguna vez commiteados | Sólo `.env.example` y `apps/discord-bot/.env.example`. `.gitignore` excluye `.env`, `.env.local`, `.env.*.local` |
| Archivos `.pem`, `.key`, `id_rsa`, `.p12`, `.npmrc`, `service-account`, `credentials.json` | Ninguno, ni agregado ni borrado |
| `service_role` / JWT de Supabase (`eyJ…`) | Ninguno en código ni en docs propios. El único JWT está en `docs/external-apis/gohighlevel/ghl/oauth/get-location-access-token.md` (commit `cb91b28`): es el ejemplo de la documentación de GHL |
| `sk-ant-`, `sk-`, `sk_live`, `rk_live`, `pk_live` | Ninguno |
| `whsec_`, `sk_test`, URL de Postgres con contraseña | Sólo en `docs/external-apis/` (Fathom `f63564b`, Whop y GHL `cb91b28`): valores de ejemplo de la documentación del proveedor (`whsec_xxx…`, `sk_test_…`, `postgres://user:pass@…`) |
| Private keys, tokens de GitHub/Slack/Google/AWS/Discord/QStash/Mercado Pago, `sb_secret_` | Ninguno |
| Asignaciones `*_SECRET/_TOKEN/_API_KEY/_PASSWORD = "<literal>"` | 115 coincidencias, **todas variables de código** (`access_token: tokenData.access_token`, `tempPassword = generateTempPassword()`, contadores de tokens de IA). Ningún literal |
| Strings de alta entropía en código | El alfabeto de `generate-temp-password.ts` y el link de Fathom de A.1-2 |
| Workflows de CI | `.github/workflows/ci.yml` no usa `secrets.*` ni `pull_request_target` |

Hallazgos del historial (detalle abajo): **A-1** credenciales de demo en el bundle (Baja, intencional) · **A-2** link de
Fathom en un test (Baja/Media según sea real) · **A-3** token de verificación de Instagram con valor predecible en
`.env.example` (Baja).

### A.2 Bundle del cliente

- Variables `NEXT_PUBLIC_*` que usa el código: `APP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`,
  `DISCORD_CLIENT_ID`, `META_PIXEL_ID`, `SENTRY_DSN`, `SOP_VIDEO_MAX_MB`, `UTM_ORGANIZATION_ID`. **Ninguna es secreta**
  (coincide con `seguridad.md`). `NEXT_PUBLIC_UTM_ORGANIZATION_ID` sólo se lee en el servidor (`app/api/waitlist/route.ts:154`);
  que sea pública es innecesario pero inofensivo.
- **Ningún archivo `"use client"` importa `lib/supabase/admin` ni `lib/security/encryption`**, directa ni
  transitivamente (grafo de imports de los 428 archivos cliente).
- Dos módulos con `process.env` no público llegan al bundle por imports transitivos:
  - `lib/supabase/env.ts` (desde 65 archivos cliente vía `lib/supabase/client.ts`): contiene
    `getSupabaseServiceRoleKey()`, que lee `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SECRET_KEY`. Next.js sólo inyecta
    `NEXT_PUBLIC_*` en el navegador, así que ahí vale `undefined`: **no hay fuga**, pero nada impide que un cambio futuro
    lo rompa (A-4).
  - `lib/zernio/constants.ts` (`ZERNIO_BASE_URL`, 4 archivos): no es secreto; en el navegador cae al default.
- `import "server-only"` se usa en 6 archivos (`lib/auth/add-ons.ts`, `lib/onboarding/current.ts`,
  `lib/client-onboarding/public.ts`, `lib/ai-brain/process-document.ts`, `lib/marketing/lead-magnets-internal.ts`,
  `lib/super-admin/onboarding-progress.ts`), pero **no** en `lib/supabase/admin.ts` ni en `lib/security/encryption.ts`,
  que son los dos que más lo necesitan (A-4).
- Server Actions: la BYOK de Claude vuelve al navegador sólo enmascarada (`maskSecret(decrypt(...))`,
  `app/settings/actions.ts:413`). Ninguna action que lee columnas de tokens (`app/stripe/actions.ts:29`,
  `app/integrations/actions.ts:121`, `app/fathom/member-actions.ts:196,252`, `app/super-admin/drive-actions.ts:17`)
  devuelve el token: lo usa en el servidor. El caso del super admin descifrando la clave de un cliente ya está en
  `[IA-CLAVE-DE-CLIENTE-EN-SUPERADMIN]`.

### A.3 Logs y Sentry

Ya registrados: `WORKER_AUTH_SECRET` dentro de la URL logueada (`[TRIAL-SECRET-EN-URL]`, `[SEG-WORKER-SECRET-QUERY]`),
el worker de Fly logueando 4 caracteres del secreto (`[SEG-REEL-WORKER-AUTH]`), `console.log` del mapa de permisos
(`[PERMISOS-LOG]`), errores internos devueltos al cliente (`[AUD-SEG-8]`).

Nuevo (A-5):

| Dónde | Qué queda en los logs de Vercel |
|---|---|
| `lib/unipile/process-message.ts:91-99` | `messageText` (texto completo del DM), `payloadLeadName`, `senderId` de cada mensaje entrante (inbox legacy) |
| `lib/unipile/process-message.ts:51` | Nombre del lead |
| `app/integrations/clickup/import-actions.ts:200` | `JSON.stringify(clientRow)`: la fila entera del cliente (nombre, email, teléfono, montos) cuando falla un insert |
| `app/api/queue/publish-reel-variation/route.ts:146,148` | Email del admin de la org |
| `lib/google/drive-content.ts:36`, `lib/google/drive-forms.ts:29,35` | Cuerpo completo de la respuesta de error de Google |

Lo que está bien: `lib/fathom/api.ts:67` y `apps/reel-worker/src/index.ts:193-195` sólo loguean si una clave está
"configured"/"MISSING"; `lib/ai/credential-resolver.ts` y `lib/payments/integration.ts:57` no loguean la clave;
el log de Zernio (`lib/zernio/client.ts:291,302`) incluye `url`, pero Zernio autentica por header, no por URL.

**Sentry** (`apps/web/sentry.{client,server,edge}.config.ts`, `@sentry/nextjs` ^10.70):
- `client` y `server` borran `event.request.cookies` en `beforeSend`. **`sentry.edge.config.ts` no tiene
  `beforeSend`**: los errores del middleware (que corre en Edge y lee la sesión) no pasan por ese filtro.
- Ningún config filtra **headers** (`Authorization: Bearer CRON_SECRET`, `x-worker-secret`, `Upstash-Signature`,
  `Unipile-Auth`) ni el **query string** (`?workerSecret=`, `?secret=` de Unipile, `?code=`/`?state=` de OAuth,
  `?token=` de invitaciones). `sendDefaultPii` no está seteado (default `false`). Qué headers adjunta el SDK con esos
  defaults no se pudo verificar sin acceso a Sentry; va como paso de verificación en A-5.
- `onRequestError = Sentry.captureRequestError` (`instrumentation.ts`) captura errores de Server Components, route
  handlers y middleware con los datos de la request.
- **Actualización 2026-10-06 (SCRUM-501):** verificado con un evento real (build de producción y un Sentry falso):
  además de lo de arriba, cada evento llevaba el cuerpo del request (`request.data`, los argumentos de la server action)
  y los headers `cookie` (sesión de Supabase) y `authorization`, en eventos y en transacciones. Resuelto en las cinco
  configs con `limpiarEventoDeSentry` y sin captura del cuerpo; detalle en `docs/operacion/alertas.md` § Qué datos no
  llegan a Sentry.

### A.4 Cifrado de credenciales (`ENCRYPTION_MASTER_KEY`)

El mecanismo y la tabla de qué se cifra y qué no están en `seguridad.md` § Secretos y cifrado; lo que quedó en claro
es `[AUD-SEG-2]` / `[TOKENS-TEXTO-PLANO]`. Lo que faltaba (A-6):

- **Sin versión de clave**: el formato es `iv.tag.ciphertext` (`lib/security/encryption.ts:28-32`). Rotar
  `ENCRYPTION_MASTER_KEY` deja ilegibles todas las credenciales a la vez (BYOK de Claude, Zernio, GHL, Hyros, VTurb,
  WebinarJam, Fathom por miembro, pagos, Mercado Pago). No se puede rotar de a poco ni convivir con dos claves.
- **Sin datos asociados (AAD)**: el ciphertext no queda atado a la org ni a la columna. Un ciphertext copiado de una
  fila a otra se descifra igual. Hoy sólo escribe el service role, así que el riesgo es bajo; conviene atarlo a la org
  cuando se toque el formato.
- **Largo de clave sin validar**: `Buffer.from(key, "base64")` no chequea 32 bytes; una clave mal cargada falla recién
  en el primer `createCipheriv` (falla cerrado, está bien, pero con un error poco claro).
- La clave vive sólo en Vercel: el bot de Discord y el worker de Fly **no** la usan (grep de `process.env` en
  `apps/discord-bot/src` y `apps/reel-worker/src`). Pero los dos tienen `SUPABASE_SERVICE_ROLE_KEY`, con acceso a
  **todo** lo que está en claro (ver modelo de amenazas, frontera 7-8).
- `[DB-ORGS-SELECT-COLUMNAS]` (ciphertext de la BYOK legible por miembros de la org en producción) sigue siendo
  inofensivo mientras la clave maestra no se filtre.

---

## B. Autenticación

### B.1 Inventario

| Flujo | Cómo funciona hoy (evidencia) | Estado |
|---|---|---|
| **Login con contraseña** | `signInAction` (`app/auth/actions.ts:104`) → Zod de email → `authRateLimit("signin:<email>")` 5 / 15 min (`:119`) → `signInWithPassword` → corta si la contraseña temporal venció → `ensureCurrentUserBootstrap` | Rate limit sólo por email: `[LOGIN-RATE-LIMIT]` |
| **Login super admin** | `/superadmin/login` → `signInSuperAdminAction` (`:156`): mismo login + `isSuperAdminEmail`; si no está en la allowlist, `signOut` | Contador aparte (`signin-superadmin:<email>`, `:175`): suma otros 5 intentos por email. Sin MFA (B-3) |
| **Mensajes de error** | `mapAuthError` (`:27-44`) distingue "credenciales incorrectas", "confirmá tu email" y "ya existe una cuenta"; el resto devuelve el mensaje crudo de Supabase | Permite saber si un email tiene cuenta (B-5) |
| **Signup público** | Toggle "Crear cuenta" → `signUpAction` (`:227`), rate limit por email (`signup:<email>`, `:243`), `emailRedirectTo` = `NEXT_PUBLIC_APP_URL` + `/auth/callback`; con sesión inmediata crea org founder | `[SIGNUP-PUBLICO]`. El límite por email no frena altas masivas con emails distintos |
| **Largo mínimo de contraseña** | Signup: sólo el mínimo de Supabase (el mensaje dice 6, `:39`). Cambio forzado: 8 (`app/auth/force-password-change/actions.ts:6`). `/auth/update-password`: 8 sólo en el navegador. Ajustes: `PASSWORD_MIN_LENGTH` (`lib/validations.ts:360`) | Inconsistente; protección contra contraseñas filtradas **apagada** (advisor) (B-3) |
| **Recuperación de contraseña** | `/auth/callback` sabe verificar `token_hash` tipo `recovery` y `code` → `/auth/update-password`; nada llama a `resetPasswordForEmail` | `[AUTH-RECUPERAR-PASSWORD]` |
| **Callback de auth** | `app/auth/callback/route.ts`: `verifyOtp` / `exchangeCodeForSession`, redirige a `${origin}${next}` sin validar | `[AUTH-CALLBACK-NEXT]` (P0) |
| **Contraseña temporal** | `generateTempPassword` (`lib/auth/generate-temp-password.ts`): 12 caracteres de un alfabeto de 55 con `crypto.randomBytes` (unos 69 bits; sesgo de módulo mínimo). Vence a las 24 h (`temp-password-expiry.ts`); el middleware desloguea si venció y fuerza el cambio si `must_change_password`; la marca se baja en el servidor junto con el cambio real | Bien. Ver B-2 sobre **a quién** se le crea |
| **Alta de cuentas con contraseña temporal** | `inviteTeamMemberAction` (`app/team/actions.ts:231`), `createFounderAccountAction` y otros dos en `app/super-admin/actions.ts` (`:127,197,724`), `addBusinessToMyHoldingAction` (`app/(platform)/holding/actions.ts:174`): todos `admin.auth.admin.createUser({ email, password, email_confirm: true })` y devuelven la contraseña a la pantalla (`TempCredentialsDialog`) | **Nadie verifica que el email sea de quien lo va a usar** (B-2) |
| **Cambio de contraseña en Ajustes** | `components/settings/change-password-section.tsx`: reautentica con la contraseña actual (`signInWithPassword`, `:60`) antes de `updateUser` | Bien (la reautenticación es del lado del navegador; alcanza porque quien la saltee ya tiene la sesión) |
| **Cambio de email** | `updateProfileAction` (`app/profile/actions.ts:121`): `auth.updateUser({ email })` y en la misma llamada escribe `profiles.email`, aunque Supabase deje el cambio pendiente de confirmación | `profiles.email` puede quedar distinto del email real de Auth (B-6) |
| **Sesión y cookies** | `@supabase/ssr` 0.10.3 con opciones por defecto (`lib/supabase/{server,client,middleware}.ts` no pasan `cookieOptions`): cookies `sb-*` **legibles por JavaScript** (`httpOnly: false`, así lo pide la librería para el cliente de navegador), `sameSite: lax`, `maxAge` de 400 días; el refresco lo hace el middleware en cada request | Sin CSP (`[SEG-HEADERS]`): un XSS se lleva el refresh token (B-4) |
| **Cookies propias** | `limitless_active_org` (holding) y las 10 cookies de `state` OAuth: `httpOnly`, `sameSite: lax`, `secure` en producción, `path: /`, 24 h y 10 min | Bien |
| **Logout** | `signOutAction` (`app/auth/actions.ts:281`): borra `holding_active_sessions`, `signOut({ scope: "global" })` (revoca todas las sesiones del usuario), borra las dos cookies de org activa | Bien |
| **Usuario desactivado** | `profiles.is_active = false` no lo lee nadie que controle acceso | `[EQUIPO-DESACTIVAR-NO-BLOQUEA]` (P0) |
| **MFA** | No existe: ningún uso de `mfa`, `aal2`, TOTP en `apps/web` | B-3 |
| **Super admin** | Allowlist por **email** en `super_admin_users` (RLS sin policies; sólo service role). `isSuperAdminEmail` compara `user.email` (`lib/auth/require-super-admin.ts:6-17`), sin mirar `email_confirmed_at` ni el `id` del usuario. Guard en `app/(super-admin)/super-admin/layout.tsx` y `requireSuperAdmin()` en sus acciones. Producción: 1 email en la allowlist, con cuenta y confirmado | B-2, B-3; `[SUPERADMIN-ONBOARDING-SIN-GUARD]` ya abierto |
| **Invitación legada por token** | `/invite`, `/api/invite/validate`: sin productor | `[EQUIPO-INVITE-LEGADO]`, `[AUD-SEG-8]` |

### B.2 OAuth de integraciones, por proveedor

Todas las rutas `start`/`connect` resuelven la org con la sesión (`requireOrganizationId` / `requireSuperAdmin`),
generan `state` con `crypto.randomBytes` y lo guardan con la org en una cookie `httpOnly`, `sameSite: lax`, `secure`
en producción y 10 min de vida; el callback compara `state` con la cookie, borra la cookie y toma la org **de la
cookie** (nunca del query string).

| Proveedor | Start | Callback | `state` | PKCE |
|---|---|---|---|---|
| Calendly (org) | `calendly/oauth/start` | `calendly/oauth/callback` (`:77`) | sí | sí (`code_verifier`, `:96`) |
| Calendly (closer) | `calendly/closer/start` | `calendly/closer/callback` (`:69`) | sí | sí |
| Google Forms / Drive | `google-forms/oauth/start` | `…/oauth/callback` (`:50`) | sí | sí |
| YouTube | `youtube/oauth/start` | `…/oauth/callback` (`:44`) | sí | sí |
| Drive del super admin | `super-admin-google/oauth/start` (`requireSuperAdmin`) | `…/oauth/callback` (`:46`), cookie con `userId` | sí | sí |
| Mercado Pago | `mercadopago/connect` (`lib/mercadopago/pkce.ts`) | `mercadopago/callback` (`:67`) | sí | sí |
| Discord | `discord/oauth/start` | `discord/callback` (`:48`) + chequeo de que el `guild_id` sea el autorizado (`:99`) | sí | no |
| Stripe Connect | `stripe/connect` | `stripe/callback` (`:62`) | sí | no (Stripe Connect no lo ofrece) |
| Instagram | `instagram/connect` | `instagram/callback` (`:67`) | sí | no |
| Typeform | `typeform/oauth/start` | `…/oauth/callback` (`:44`) | sí | no |
| Unipile (hosted auth) | `unipile/connect` | `unipile/callback` (POST del proveedor): secreto compartido en tiempo constante; la org sale del `name` que Unipile devuelve (`lib/unipile/hosted-auth.ts:38`) | n/a | n/a |

Comparaciones de `state` con `!==` (no en tiempo constante): no es un problema porque el `state` es de un solo uso,
dura 10 minutos y está atado a la cookie del mismo navegador. OAuth de Claude: columnas sin uso
(`[IA-OAUTH-COLUMNAS]`). Lo que falta en OAuth ya está en el backlog (tokens en claro: `[AUD-SEG-2]`).

---

## Hallazgos

Numerados por sección: A-n secretos, B-n autenticación, D-n base de datos. Los que ya están en `PENDIENTES.md` no se
repiten: se listan al final con su ID.

### D-1 · Crítica · La vista `organization_claude_status` deja borrar la organización propia saltándose RLS

- **Hecho.** En producción, `public.organization_claude_status` es una vista simple sobre `organizations`, **sin**
  `security_invoker` (advisor `security_definer_view`, nivel ERROR), dueña `postgres` (con `BYPASSRLS`).
  `information_schema.views` la marca `is_updatable = YES`, `is_insertable_into = YES`; columnas actualizables `id`,
  `claude_api_key_status`, `claude_api_key_last_validated_at`. `authenticated` tiene `INSERT`, `UPDATE` y `DELETE`
  sobre la vista (`role_table_grants`). Las migraciones sólo dan `GRANT SELECT` (`20260922110000:69`) y revocan a
  `anon`, pero no hacen `REVOKE` a `authenticated`: los otros permisos vienen de los privilegios por defecto del
  esquema `public` de Supabase. El filtro de la vista es `id = get_my_organization_id()` para `authenticated`.
  138 foreign keys hacia `organizations` son `ON DELETE CASCADE` (entre ellas `profiles`, `clients`, `team_roles`);
  `organizations` no tiene triggers.
- **Observación.** En una vista que no es `security_invoker`, Postgres chequea permisos y RLS de la tabla base como el
  dueño de la vista. Para `postgres` la RLS de `organizations` no aplica. El `WHERE` de la vista limita la escritura
  a la fila de la org propia, pero no la impide.
- **Riesgo.** Si cualquier usuario logueado (cualquier rol, incluido un member de "sólo lectura", o un miembro de un
  holding con un negocio activo en su JWT) manda `DELETE /rest/v1/organization_claude_status?id=eq.<su org>` con la
  anon key pública y su JWT, se borra la fila de `organizations` y, en cascada, los datos de la org en 138 tablas.
  Hace falta una sola llamada HTTP; no requiere nada fuera de lo que el navegador ya tiene. También puede cambiar
  `claude_api_key_status` (p. ej. marcar como válida una clave rechazada). **Deducido del catálogo; no se ejecutó.**
- **Impacto.** Pérdida total de datos de una organización (clientes, ventas, llamadas, finanzas, equipo), sin
  papelera en la app; recuperar depende de los backups de Supabase. Alcanza a todas las orgs de producción.
- **Recomendación.** Migración: `revoke insert, update, delete on public.organization_claude_status from authenticated, anon;`
  y `alter view … set (security_invoker = true)` (la RLS de `organizations` ya filtra la org propia; comprobar que las
  columnas que lee la vista tienen grant por columna). Agregar al CI una consulta que falle si alguna vista de
  `public` es actualizable y tiene `INSERT/UPDATE/DELETE` para `authenticated`/`anon`. Revisar los backups (PITR)
  por si ya pasó.
- **PENDIENTES:** nuevo `[DB-VISTA-CLAUDE-STATUS-ESCRIBIBLE]` (P0 sugerido).

### B-2 · Crítica (latente) · Cualquier founder crea cuentas confirmadas para emails ajenos, y el super admin se decide por email

- **Hecho.** `inviteTeamMemberAction` (`app/team/actions.ts:263-301`) crea el usuario con
  `admin.auth.admin.createUser({ email, password: tempPassword, email_confirm: true })` y devuelve `tempPassword` al
  founder que invita; el email no se verifica contra nada. Lo mismo hacen `addBusinessToMyHoldingAction` y las altas
  del super admin. `requireManagerProfile` sólo exige ser founder, y con `[SIGNUP-PUBLICO]` cualquiera puede ser
  founder. `isSuperAdminEmail` da acceso total al panel interno a cualquier usuario cuyo `user.email` esté en
  `super_admin_users` (`lib/auth/require-super-admin.ts:6-17`), sin mirar `email_confirmed_at` ni el `id`.
  Producción hoy: 1 email en la allowlist, con cuenta confirmada (0 sin cuenta).
- **Observación.** El email de una cuenta creada así no prueba que la persona controle esa casilla. Si la allowlist
  tiene un email sin cuenta, quien lo "invite" primero se queda con esa identidad.
- **Riesgo.** Si se agrega a `super_admin_users` un email que todavía no tiene cuenta (p. ej. al sumar a alguien del
  staff), entonces cualquier founder que lo adivine (emails del dominio de la empresa) lo invita a su org, recibe la
  contraseña temporal, entra y el middleware lo manda a `/super-admin`. Además, aunque no haya super admin de por
  medio, cualquier founder puede "ocupar" el email de otra persona (cuenta confirmada a su nombre, que esa persona ya
  no puede crear) y hacerse pasar por ella ante el equipo. Hoy no es explotable para super admin (0 emails sin cuenta).
- **Impacto.** Toma del panel interno: todas las orgs, bajas de organizaciones, claves de clientes
  (`[IA-CLAVE-DE-CLIENTE-EN-SUPERADMIN]`), Drive del super admin.
- **Recomendación.** (1) Super admin por `user_id` (FK a `auth.users`) y no por email, o como mínimo exigir
  `email_confirmed_at` y que la cuenta no haya sido creada por una invitación de org. (2) Procedimiento: dar de alta al
  super admin **antes** de agregarlo a la allowlist (documentarlo en `docs/operacion/`). (3) Invitaciones: mandar la
  invitación por mail (`inviteUserByEmail` o link de un solo uso) en vez de crear cuentas confirmadas con contraseña
  visible, o al menos `email_confirm: false`.
- **PENDIENTES:** nuevo `[AUTH-ALTA-EMAIL-AJENO]` (P1 sugerido: Crítica pero hoy necesita una condición que no se da).

### B-3 · Alta · Sin MFA ni protección contra contraseñas filtradas; la configuración de Auth no está en el repo

- **Hecho.** No hay MFA en ningún flujo (grep de `mfa|aal2|totp|two.?factor` vacío en `apps/web`). El advisor de
  Supabase reporta `auth_leaked_password_protection` desactivada. El signup acepta el mínimo de Supabase (6 caracteres
  según `mapAuthError`, `app/auth/actions.ts:39`); el resto de los flujos pide 8. No existe `supabase/config.toml`:
  duración del JWT, rotación de refresh tokens, confirmación de email y de cambio de email, y signups habilitados
  viven sólo en el dashboard.
- **Riesgo.** Si una contraseña del super admin o de un founder se filtra en otro sitio (reuso), entonces se entra
  con ella sola, con 10 intentos cada 15 minutos por email (`signin` + `signin-superadmin`) y sin límite por IP
  (`[LOGIN-RATE-LIMIT]`). Probabilidad media: es el ataque más común contra paneles SaaS.
- **Impacto.** Super admin: todas las orgs. Founder: su org entera, sus integraciones y su BYOK.
- **Recomendación.** Activar la protección contra contraseñas filtradas y un mínimo de 8 caracteres en Supabase →
  Authentication → Policies; **MFA TOTP obligatorio para el super admin** (Supabase MFA + chequeo `aal2` en
  `requireSuperAdmin` y en el layout del panel) y opcional para founders; documentar la configuración de Auth vigente
  (JWT, refresh, confirmaciones) en `docs/operacion/entorno-y-deploy.md` o versionarla en `config.toml`.
- **PENDIENTES:** nuevo `[AUTH-MFA-Y-POLITICA]` (P1 sugerido para la parte de super admin).

### B-4 · Media · La sesión vive 400 días en cookies legibles por JavaScript y no hay CSP

- **Hecho.** `lib/supabase/{server,client,middleware}.ts` usan `@supabase/ssr` sin `cookieOptions`: las cookies
  `sb-<ref>-auth-token` guardan access y refresh token, no son `httpOnly` (el cliente de navegador las lee) y duran
  400 días (default de la librería; no verificado en `node_modules`). No hay CSP ni headers de seguridad
  (`[SEG-HEADERS]`).
- **Riesgo.** Si aparece un XSS (hoy `dangerouslySetInnerHTML` sólo tiene contenido estático, pero la app muestra
  mucho texto de terceros: DMs, transcripts, formularios), entonces el script se lleva el refresh token y el atacante
  mantiene la sesión hasta que el usuario haga logout global.
- **Impacto.** La cuenta y la org de la víctima.
- **Recomendación.** Sumar a `[SEG-HEADERS]` una CSP con `script-src` restringido (primero en modo report-only) y
  revisar en Supabase la duración de sesión (time-box / inactividad). No hace falta mover las cookies a `httpOnly`:
  rompería el cliente de navegador.
- **PENDIENTES:** ampliar `[SEG-HEADERS]`.

### A-5 · Media · Los logs y Sentry guardan datos personales y pueden guardar secretos de headers y URLs

- **Hecho.** Ver la tabla de A.3. `sentry.edge.config.ts` no tiene `beforeSend`; ningún config filtra headers
  ni query string.
- **Riesgo.** Si alguien accede a los logs de Vercel o al proyecto de Sentry (más gente que a la base), entonces lee
  textos de DMs de leads, datos de clientes importados y, en errores de rutas de cola o de cron, posiblemente secretos
  que viajan en headers o en la URL (`CRON_SECRET`, `WORKER_AUTH_SECRET`, `UNIPILE_WEBHOOK_SECRET`).
- **Impacto.** Datos personales de terceros (leads, clientes de los clientes) fuera de la base; retención según el
  plan de Vercel y Sentry.
- **Recomendación.** Sacar `messageText`/nombres del log de Unipile y la fila del log de ClickUp (dejar ids);
  `beforeSend` común a los tres configs que borre `request.headers.authorization`, `cookie`, `x-worker-secret`,
  `upstash-signature`, `unipile-auth` y limpie `request.query_string`/`url` de `workerSecret`, `secret`, `code`, `state`,
  `token`; verificar en un evento real de Sentry qué llega.
- **PENDIENTES:** nuevo `[LOGS-DATOS-SENSIBLES]` (P2). Complementa `[PERMISOS-LOG]` y `[TRIAL-SECRET-EN-URL]`.

### A-6 · Media · El cifrado de credenciales no tiene versión de clave: rotar la clave maestra rompe todas las integraciones

- **Hecho.** Ver A.4.
- **Riesgo.** Si `ENCRYPTION_MASTER_KEY` se filtra (está en Vercel; cualquiera con acceso al proyecto la ve),
  entonces no se puede rotar sin dejar a todas las orgs sin BYOK, Zernio, GHL, pagos, etc. hasta que las reconecten,
  así que en la práctica no se rota.
- **Impacto.** Todas las credenciales cifradas de todas las orgs quedan expuestas mientras la clave vieja siga en uso.
- **Recomendación.** Prefijo de versión (`v1.iv.tag.ct`), `ENCRYPTION_MASTER_KEY_PREVIOUS` para descifrar lo viejo,
  script de re-cifrado con service role, AAD con `organization_id` + nombre de columna, y validar 32 bytes al leer la
  clave. Hacerlo junto con `[AUD-SEG-2]` (que ya obliga a tocar el cifrado).
- **PENDIENTES:** `[SEC-MASTER-KEY-ROTACION]` (propuesto en [`backups-y-recuperacion.md`](./backups-y-recuperacion.md)). Se le sumaron la AAD y la validación de largo de la clave (puntos 7 y 8 de su "Qué hay que hacer").

### A-4 · Baja · `admin.ts` y `encryption.ts` no están marcados como sólo-servidor; `env.ts` mezcla la clave pública con la de service role

- **Hecho.** Ver A.2: 65 archivos cliente importan `lib/supabase/env.ts`, que tiene `getSupabaseServiceRoleKey()`;
  `lib/supabase/admin.ts` y `lib/security/encryption.ts` no tienen `import "server-only"` (sólo un comentario
  "NUNCA importar en componentes cliente").
- **Riesgo.** Si alguien importa el admin client o el cifrado desde un componente cliente, el build no falla. La
  clave no se filtra (Next no inyecta variables no públicas), pero el error aparece recién en runtime y puede empujar a
  "arreglarlo" renombrando la variable a `NEXT_PUBLIC_`.
- **Recomendación.** `import "server-only"` en `admin.ts`, `encryption.ts`, `credential-resolver.ts`; mover
  `getSupabaseServiceRoleKey` a `admin.ts`.
- **PENDIENTES:** nuevo `[SERVER-ONLY-GUARDS]` (P3).

### A-2 · Baja (Media si el link es real) · Un link compartido de Fathom que puede ser real, en un test

- **Hecho.** `apps/web/lib/fathom/__tests__/share-link.test.ts:57-69` (commit `42534ba`, 2026-09-20, sigue en el
  árbol) usa una URL `https://fathom.video/share/<token de 32 caracteres>` con aspecto de token real, a diferencia del
  resto del archivo, que usa `TOKENDEPRUEBA` y aclara que los datos son inventados.
- **Riesgo.** Si el token es de una grabación real, cualquiera con acceso al repo (o a un fork) ve la llamada y su
  transcript. Los links compartidos de Fathom no vencen solos.
- **Recomendación.** Abrir el link una vez: si lleva a una grabación, revocar el link compartido en Fathom y
  reemplazarlo en el test por un token inventado. No hace falta reescribir el historial si el link se revoca.
- **PENDIENTES:** nuevo `[FATHOM-LINK-EN-TEST]` (P3; subir a P2 si resulta real).

### A-3 · Baja · `.env.example` trae un valor predecible para `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`

- **Hecho.** `.env.example:95` tiene un valor literal legible (no un placeholder vacío), en el árbol desde el commit
  `7bd9b68`. `app/api/webhooks/instagram/messages/route.ts:32` lo compara para el handshake `GET` de Meta.
- **Riesgo.** Si se copió tal cual a producción, cualquiera puede completar el handshake de verificación. El `POST` sí
  exige firma con `INSTAGRAM_APP_SECRET`, así que el impacto es mínimo, y la integración es legacy.
- **Recomendación.** Dejar el valor vacío en `.env.example` y, si el legacy sigue vivo, rotar el de producción.
- **PENDIENTES:** ampliar `[ENV-LIMPIEZA]`.

### A-1 · Baja · Credenciales de demo en el bundle

- **Hecho.** `apps/web/lib/auth/mock-credentials.ts` (commit `ebdf503`, en el árbol) define un email y una contraseña
  de demo de cliente y de super admin; `components/auth/login-screen.tsx` los compara **en el navegador** y los muestra
  como pista. Sólo se usa si Supabase no está configurado (`app/login/page.tsx`, `app/superadmin/login/page.tsx`).
- **Riesgo.** Ninguno en producción: el login de demo no crea sesión ni da acceso a datos; con Supabase configurado ni
  se renderiza. Es sólo prolijidad: son credenciales "de super admin" en el bundle.
- **Recomendación.** Nada urgente; borrar junto con `[DEMO-LAYOUT-500]` / `[MOCK-DATA-AUDIT]` si se abandona el modo demo.
- **PENDIENTES:** sin ítem nuevo (entra en `[MOCK-DATA-AUDIT]`).

### B-5 · Baja · El login y el signup dicen si un email tiene cuenta

- **Hecho.** `mapAuthError` (`app/auth/actions.ts:27-44`) devuelve "Ya existe una cuenta con este email" y
  "Confirmá tu email…" (sólo posible con la contraseña correcta), y para errores no mapeados el mensaje crudo de
  Supabase (`:44`).
- **Riesgo.** Si alguien quiere saber si un email es cliente de Limitless, el signup se lo dice (5 intentos por email
  cada 15 min, sin límite por IP). Poco valor para un atacante, pero sirve para phishing dirigido.
- **Recomendación.** Mensaje neutro en el signup ("Si el email es válido, te llega un correo"), no devolver el mensaje
  crudo; se resuelve junto con `[SIGNUP-PUBLICO]` y `[AUTH-RECUPERAR-PASSWORD]` (que ya pide mensaje neutro).
- **PENDIENTES:** ampliar `[SIGNUP-PUBLICO]` (no amerita ítem propio).

### B-6 · Baja · `profiles.email` se cambia antes de que Auth confirme el cambio

- **Hecho.** `app/profile/actions.ts:121-139`: `auth.updateUser({ email })` y a continuación
  `profiles.update({ email })`. Con "Secure email change" activo en Supabase, el email de Auth no cambia hasta
  confirmar, pero el perfil ya muestra el nuevo.
- **Riesgo.** La lista de Equipo, el matching por email (Fathom por miembro, notificaciones) y el super admin ven un
  email que no es el de login. No da acceso a nada: la allowlist de super admin mira `auth.users.email`.
- **Recomendación.** Actualizar `profiles.email` recién cuando `user.email` cambie (en el callback o leyendo
  `new_email`), o mostrar "pendiente de confirmación".
- **PENDIENTES:** sin ítem nuevo; se anota para `[TESTS-AUTH]`/Plataforma P3 si el equipo lo quiere.

---

## Ya estaban en PENDIENTES (confirmados en esta revisión)

| ID | Qué se re-verificó |
|---|---|
| `[AUTH-CALLBACK-NEXT]` | Resuelto el 2026-09-30 (SCRUM-2, `lib/auth/redirect-seguro.ts`) |
| `[AUTH-RECUPERAR-PASSWORD]` | Nada llama a `resetPasswordForEmail` (grep) |
| `[EQUIPO-DESACTIVAR-NO-BLOQUEA]` | El middleware no lee `is_active` (`lib/supabase/middleware.ts:93-99` sólo pide contraseña temporal, rol, org) |
| `[SIGNUP-PUBLICO]` | Sigue; el rate limit del signup es por email (`app/auth/actions.ts:243`) |
| `[LOGIN-RATE-LIMIT]` y `[AUD-SEG-7]` | **Eran el mismo ítem** (Plataforma P1 e Infra P2): `[AUD-SEG-7]` se borró y su detalle pasó a `[LOGIN-RATE-LIMIT]`. `getRequestIp` (`lib/rate-limit.ts:179`) toma el primer `x-forwarded-for`: en Vercel es confiable; fuera de Vercel sería falsificable |
| `[AUD-SEG-2]` / `[TOKENS-TEXTO-PLANO]` | Advisor: las 21 tablas de integraciones y super admin tienen RLS sin policies (cerradas para `authenticated`) |
| `[TRIAL-SECRET-EN-URL]`, `[SEG-WORKER-SECRET-QUERY]`, `[SEG-REEL-WORKER-AUTH]` | Sin cambios (`reel-variation-actions.ts:177,182`) |
| `[SEG-HEADERS]` | Sin cambios; se amplía con B-4 |
| `[HOLDING-PORTFOLIO-ROL]` | El middleware copia los headers de la request (`new Headers(request.headers)`, `lib/supabase/middleware.ts:59`) y sólo pisa `x-active-org-id` si hay cookie: el header también lo puede mandar el navegador. Lo re-verifica `resolveEffectiveOrganizationId` contra `holding_businesses`, así que el alcance es el que ya describe el ítem |
| `[PERMISOS-LOG]`, `[AUD-SEG-8]`, `[IA-CLAVE-DE-CLIENTE-EN-SUPERADMIN]`, `[DB-ORGS-SELECT-COLUMNAS]`, `[SUPERADMIN-ONBOARDING-SIN-GUARD]` | Siguen abiertos |

Otros avisos del advisor de Supabase, sin ítem nuevo: funciones `SECURITY DEFINER` ejecutables por `anon`
(`get_my_organization_id`, `get_my_holding_business_org_ids`, `current_user_is_founder_or_admin`: con `anon`
devuelven null/false; `rls_auto_enable` es una función de event trigger que no se puede invocar por RPC);
`create_default_roles(uuid)` es invocable por `authenticated` pero rechaza una org distinta de la propia; `search_path`
mutable en `get_current_week_start` y `set_updated_at`; extensión `vector` en `public`. Son de prolijidad; conviene
que el frente de base de datos los junte en un `REVOKE EXECUTE … FROM anon`.

## Lo que está bien

- **Historial limpio**: 895 commits y 41 ramas sin claves reales, sin `.env` commiteado y sin archivos de credenciales.
- **Variables públicas**: las 9 `NEXT_PUBLIC_*` son públicas por diseño; ningún componente cliente importa el admin
  client ni el cifrado (grafo completo de 428 archivos).
- **Tokens que no vuelven al navegador**: las actions que leen tokens los usan en el servidor; la BYOK vuelve enmascarada.
- **Contraseñas temporales**: generador criptográfico, 24 h, cambio forzado en el middleware, marca que se baja en el
  servidor sólo junto con el cambio real.
- **Logout global** (`scope: "global"`) y limpieza de las cookies de holding.
- **OAuth**: `state` aleatorio atado a la org en cookie `httpOnly` de 10 min en los 10 flujos; PKCE en los 6
  proveedores que lo soportan; la org nunca sale del query string; `Cache-Control: no-store` en los callbacks.
- **Crons, colas y bot** fail-closed y en tiempo constante (ver `seguridad.md`), salvo el worker de Fly (ya abierto).
- **RLS encendida en las 147 tablas de `public`** en producción; las 21 tablas con secretos, sin ninguna policy para
  usuarios.
- **Cifrado**: AES-256-GCM con IV aleatorio y tag; sin clave, falla cerrado.
- **Next.js 15.5.18** en el lockfile: fuera del rango de la vulnerabilidad de bypass del middleware (CVE-2025-29927, corregida en 15.2.3).

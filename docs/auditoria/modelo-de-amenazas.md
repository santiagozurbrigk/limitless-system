# Modelo de amenazas

| | |
|---|---|
| **Cubre** | Las fronteras de confianza de Limitless y, en cada una, qué se protege, qué amenazas hay (STRIDE), qué controles existen hoy (con evidencia) y qué huecos quedan (con su ID de `PENDIENTES.md`) |
| **Fecha** | 2026-09-23 |
| **Código auditado** | `038caca` (`main`) |
| **Método** | Lectura de código (middleware, auth, rutas públicas, webhooks, colas, bot, worker, agente), catálogos y advisors de producción (sólo estructura) y los documentos [`../arquitectura/seguridad.md`](../arquitectura/seguridad.md), [`../arquitectura/jobs-webhooks-y-colas.md`](../arquitectura/jobs-webhooks-y-colas.md) y [`../arquitectura/auth-organizaciones-y-permisos.md`](../arquitectura/auth-organizaciones-y-permisos.md). Evidencia detallada de secretos y autenticación en [`secretos-y-autenticacion.md`](./secretos-y-autenticacion.md) |
| **No se pudo verificar** | Configuración de Supabase Auth, variables y accesos de Vercel/Railway/Fly/QStash/Sentry, quién tiene acceso a esos paneles, backups (PITR), y nada que requiera escribir en producción. Las amenazas marcadas "deducido" salen del código o del catálogo, no de una prueba |

STRIDE: **S**uplantación · **T**amper (alteración) · **R**epudio · **I**nformación expuesta · **D**enegación de servicio · **E**levación de privilegios.

## Resumen

Limitless es una app multi-organización: el riesgo principal es que alguien **lea o rompa datos de una org que no es
la suya**, o que **dentro de su org haga más de lo que su rol permite**. Entre organizaciones, la barrera (RLS por
`organization_id`) está bien armada y encendida en las 147 tablas. Los huecos grandes están en tres lugares:

1. **Dentro de la org los roles no protegen datos** (`[PERMISOS-SERVER-ACTIONS]`), y una vista de la base deja a
   cualquier miembro **borrar su organización entera** (`[DB-VISTA-CLAUDE-STATUS-ESCRIBIBLE]`, nuevo).
2. **Identidad**: sin MFA, con signup público, con altas de cuentas para emails ajenos y un super admin que se
   decide por email (`[AUTH-MFA-Y-POLITICA]`, `[AUTH-ALTA-EMAIL-AJENO]`, nuevos).
3. **Credenciales de servicio repartidas**: la clave de service role (acceso total a la base) vive en Vercel,
   Railway y Fly; el secreto del worker viaja en URLs y logs.

Los webhooks, crons y colas están bien: fail-closed, firma sobre el cuerpo crudo y comparación en tiempo constante.
Faltan ventanas de replay en algunos proveedores.

## Diagrama de fronteras

```
                    ┌────────────── Vercel (apps/web) ───────────────┐
 Navegador ──(1)──► │ middleware → pages / Server Actions / API      │ ──(4)──► Anthropic, Zernio, Google, GHL,
 (usuario, anon)    │   createClient (RLS)   createAdminClient (SR)  │          Calendly, Stripe, MP, Fathom…
     │              └───────┬───────────────────────┬────────────────┘
     │ (2) PostgREST        │ (2)                   ▲ (3) webhooks firmados      ▲ (5) Vercel Cron / QStash
     │ anon key + JWT       ▼                       │                            │
     └────────────► Supabase (Postgres + Auth + Storage) ◄──(6) bot Discord (Railway, SR) ◄── servidores Discord
                            ▲
                            └──────(7) reel-worker (Fly.io, SR) ◄── QStash
 (8) super admin: usuarios de la allowlist, panel /super-admin, SR
 (9) texto de terceros → prompts de Claude (agente, pipelines de IA, bot)
```

SR = service role (`SUPABASE_SERVICE_ROLE_KEY`, saltea RLS).

---

## 1. Navegador ↔ app (Vercel)

**Activos:** sesión (cookies `sb-*`), cookie de negocio activo del holding, formularios públicos (waitlist, onboarding
de clientes por link, `/prueba`), Server Actions (cada export de un `"use server"` es un endpoint).

| STRIDE | Amenaza | Controles hoy (evidencia) | Huecos |
|---|---|---|---|
| S | Robo o fuerza bruta de credenciales | Rate limit 5/15 min por email (`app/auth/actions.ts:119`); contraseñas temporales de 24 h con cambio forzado (`lib/supabase/middleware.ts`) | `[LOGIN-RATE-LIMIT]` (sin límite por IP ni captcha), `[AUTH-MFA-Y-POLITICA]` (sin MFA, contraseñas filtradas permitidas), `[AUTH-RECUPERAR-PASSWORD]` |
| S | Phishing con redirect desde el dominio propio | Redirects de OAuth de integraciones a paths internos (`lib/integrations/oauth-redirect.ts`) | `[AUTH-CALLBACK-NEXT]` (P0) |
| S | Cuenta creada a nombre de otra persona | — | `[AUTH-ALTA-EMAIL-AJENO]`, `[SIGNUP-PUBLICO]` |
| T | CSRF sobre Server Actions | Next.js exige `Origin` = host en Server Actions; cookies `sameSite: lax` | — |
| T | Mass assignment / ids de otra org en actions | Zod en muchas actions; RLS en la escritura | `[AUD-SEG-5]`, `[INVITE-ROL-SIN-VALIDAR]`, `[FATHOM-CLIENTID-SIN-VALIDAR]` |
| R | Quién hizo qué dentro de la org | Algunas tablas guardan `created_by`/`closed_by` | Sin auditoría de acciones sensibles (cambio de rol, BYOK, desconexiones, bajas). Ver "Huecos sin ítem" |
| I | XSS que roba la sesión | React escapa por defecto; `dangerouslySetInnerHTML` sólo con contenido estático | `[SEG-HEADERS]` (sin CSP; cookies de sesión legibles por JS durante 400 días) |
| I | Clickjacking | — | `[SEG-HEADERS]` (sin `frame-ancestors`) |
| I | Errores internos al cliente | La mayoría de las actions devuelven mensajes propios | `[AUD-SEG-8]` |
| D | Abuso de formularios públicos y de IA | Rate limit por IP en `/api/waitlist`, `/api/utm/*`, onboarding; `aiRateLimit` por usuario (`lib/rate-limit.ts`) | Rate limit fail-open si la base cae (a propósito); signup sin límite por IP (`[SIGNUP-PUBLICO]`) |
| E | Member que opera fuera de su rol | Bloqueo del **render** por módulo en `app/(platform)/layout.tsx` | `[PERMISOS-SERVER-ACTIONS]` (P0), `[PERMISOS-LAYOUT-NAV-SUAVE]`, `[PERMISOS-FOUNDER-AREA]`, `[NAV-PALETA-PERMISOS]` |
| E | Miembro desactivado que sigue entrando | — | `[EQUIPO-DESACTIVAR-NO-BLOQUEA]` (P0) |
| E | Miembro del holding que elige un negocio por cookie o header | `resolveEffectiveOrganizationId` re-verifica contra `holding_businesses` | `[HOLDING-PORTFOLIO-ROL]` (también se puede mandar el header `x-active-org-id` directo) |

## 2. App y navegador ↔ Supabase

El navegador habla **directo** con PostgREST usando la anon key (pública) y el JWT del usuario. Todo lo que la RLS y
los grants permitan, un usuario lo puede hacer por fuera de la app.

**Activos:** datos de todas las orgs; tablas con secretos; Storage; funciones `SECURITY DEFINER`.

| STRIDE | Amenaza | Controles hoy (evidencia) | Huecos |
|---|---|---|---|
| E / I | Leer o escribir datos de otra org | RLS encendida en las 147 tablas de `public` (catálogo); patrón `organization_id = get_my_organization_id()`; RPCs y policies entre orgs corregidas en `20260922110000` | `[AUD-CONF-4]` (índice único global en Typeform), frente de RLS de esta auditoría |
| T / D | **Borrar la org propia por una vista escribible** | — | **`[DB-VISTA-CLAUDE-STATUS-ESCRIBIBLE]` (nuevo, Crítica)**: `organization_claude_status` sin `security_invoker`, con `DELETE` para `authenticated`, 138 FKs en cascada |
| E | Member que se da permisos editando su rol | Trigger `protect_profile_columns` sobre `profiles` (`20260922100000`) | `[PERMISOS-SERVER-ACTIONS]`: `team_roles` editable por cualquier miembro |
| I | Leer secretos de integraciones | 21 tablas con RLS sin policies (advisor), lectura sólo con SR | `[AUD-SEG-2]` (en claro), `[DB-ORGS-SELECT-COLUMNAS]` (ciphertext de BYOK legible por la org) |
| I | Archivos de Storage de otra org | Paths validados contra la carpeta de la org (`lib/storage/org-path.ts`) antes de firmar con SR | `[AUD-SEG-9]`, `[OPS-STORAGE-BUCKETS]` (buckets fuera de migraciones), `content-thumbnails` público con listado |
| S | JWT con negocio activo que no corresponde | `custom_access_token_hook` re-verifica `holding_businesses` activo | Hook que hay que activar a mano (verificación manual Plataforma §6) |
| I | Funciones `SECURITY DEFINER` expuestas | Tienen `search_path` fijo; con `anon` devuelven null | Prolijidad: `REVOKE EXECUTE … FROM anon` (advisor; ver `secretos-y-autenticacion.md`) |

## 3. Terceros → webhooks

**Activos:** cobros (Whop, Commas, Mercado Pago), oportunidades (GHL), turnos (Calendly), grabaciones (Fathom), DMs
(Zernio, Unipile, Instagram, ManyChat), mensajes de Discord.

| STRIDE | Amenaza | Controles hoy (evidencia) | Huecos |
|---|---|---|---|
| S | Webhook falso | Firma o secreto por proveedor sobre el raw body, fail-closed, tiempo constante (tabla de `jobs-webhooks-y-colas.md`) | Zernio responde 503 en prod (`[ENV-ZERNIO-WEBHOOK-SECRET]`) |
| S | Atribuir un evento a otra org | La org sale de un dato firmado o de un token propio de la URL; Fathom legacy da 409 si la firma valida para más de una org | — |
| T | Replay de un webhook firmado viejo | Ventana de 5 min en Whop; dedupe por id de evento | `[AUD-SEG-4]` / `[CALENDLY-WEBHOOK-REPLAY]` / `[FIN-MP-WEBHOOK]` (Calendly, MP y GHL sin ventana) |
| R | Un cobro que el proveedor mandó y no quedó | `payment_webhook_events` guarda el evento | `[EMBUDOS-WEBHOOK-PERDIDA]` (P0, resuelto el 2026-09-30 en SCRUM-6), `[AUD-CONF-5]` (reintento legítimo descartado; los reintentos quedaron en SCRUM-6, falta el índice por org) |
| I | Respuesta que filtra si la org tiene la integración | — | `[AUD-SEG-8]` |
| D | Inundación de webhooks | Rate limit en MP, Calendly, Fathom legacy, ManyChat | Resto sin límite (cuesta una verificación de firma por request: aceptable) |
| I | Secreto en la URL (`?secret=` de Unipile, token de ManyChat y Fathom por miembro) | Tokens largos y por integración | Van a logs de acceso y a Sentry: `[LOGS-DATOS-SENSIBLES]` (nuevo) |

## 4. App → proveedores (Anthropic, Zernio, Google, GHL, Calendly, Stripe, Mercado Pago, Fathom, Hyros, VTurb, WebinarJam, Discord)

**Activos:** API keys y tokens OAuth de cada org; la `ANTHROPIC_API_KEY` global (plata); `ZERNIO_API_KEY` global.

| STRIDE | Amenaza | Controles hoy (evidencia) | Huecos |
|---|---|---|---|
| I | Filtración de credenciales guardadas | AES-256-GCM para BYOK y 9 proveedores (`lib/security/encryption.ts`) | `[AUD-SEG-2]`/`[TOKENS-TEXTO-PLANO]` (7 proveedores en claro), `[SEC-MASTER-KEY-ROTACION]` (propuesto en `backups-y-recuperacion.md`: la clave maestra no se puede rotar) |
| E | Una org usa la credencial global de otra cosa | BYOK con respaldo global explícito (`lib/ai/credential-resolver.ts`) | `[ZERNIO-KEY-GLOBAL]` (P0), `[IA-CLAVES-INVALIDAS]`, `[SIGNUP-PUBLICO]` (cualquier alta gasta la key de Anthropic) |
| E | Scopes OAuth de más | — | `[MKT-SCOPE-YT-UPLOAD]` |
| D | Proveedor colgado retiene la lambda | Timeouts en Discord, agente, Fathom share link | `[AUD-CONF-1]`, `[API-TIMEOUTS]`, `[EMBUDOS-TIMEOUTS]` |
| T | Respuesta del proveedor mal interpretada como dato | Regla de CLAUDE.md §3 (persistir crudo, no inventar) | `[AUDITORIA §3 confiabilidad 11]` (ceros de Zernio) |
| S | SSRF por URLs que controla el usuario | Las URLs base vienen de variables de entorno (`*_API_BASE`) | Calendly valida `https` en prod (`calendly/oauth/callback`); no se revisaron todos los fetch a URLs de usuario (thumbnails, Drive) |

## 5. Crons y colas (Vercel Cron, QStash)

**Activos:** `CRON_SECRET`, `WORKER_AUTH_SECRET`, signing keys de QStash; trabajos que corren con SR sobre todas las orgs.

| STRIDE | Amenaza | Controles hoy (evidencia) | Huecos |
|---|---|---|---|
| S | Disparar un cron o un worker desde afuera | `assertCronAuthorized` (lanza sin `CRON_SECRET`), `verifyQueueRequest` (secreto o firma QStash, 503 sin credenciales), `safeEqual` | `[AUD-SEG-4]` (firma QStash sin `url`: un cuerpo firmado vale para otro worker) |
| I | Secreto del worker expuesto | — | `[TRIAL-SECRET-EN-URL]`, `[SEG-WORKER-SECRET-QUERY]` (en la URL de QStash y en logs) |
| T | Cron que acepta parámetros | `ghl-sync` acepta `?organizationId=` detrás de `CRON_SECRET` | — (sólo quien tiene el secreto) |
| D | Crons pisándose o reprocesando | — | `[AUD-CONF-3]`, `[TRIAL-CLEANUP-LOOP]`, `[CRONS-ORGS-INACTIVAS]` (resuelto el 2026-10-04 en SCRUM-210) |
| R | Trabajo cortado sin registro | — | `[AUD-CONF-6]` (sin `after()`), `[EMBUDOS-CRON-ERRORES]` |

## 6. Bot de Discord (Railway)

**Activos:** `DISCORD_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `LIMITLESS_WEBHOOK_SECRET`;
mensajes de los servidores de los clientes.

| STRIDE | Amenaza | Controles hoy (evidencia) | Huecos |
|---|---|---|---|
| S | Alumno que se vincula como otro cliente | Buzón de vinculaciones pendientes | `[DISCORD-VINCULAR-EMAIL-AJENO]`, `[AUD-SEG-10]` |
| S | Llamadas falsas del bot a la app | `isDiscordWebhookAuthorized`, tiempo constante, fail-closed | `[ENV-LIMPIEZA]` (renombre `OTC_` → `LIMITLESS_`) |
| I | Compromiso de Railway expone toda la base | — | Service role fuera de Vercel: `[SERVICE-ROLE-FUERA-DE-VERCEL]` (nuevo) |
| I | Retención de mensajes de terceros | — | `[E-RETENCION]` |
| E | Cualquier miembro configura el bot | — | `[DISCORD-PERMISOS]` |
| — | Tests | — | `[DISCORD-BOT-SIN-TESTS]` |

## 7. Reel-worker (Fly.io)

**Activos:** `WORKER_AUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `driveAccessToken` de Google
que viaja en el payload.

| STRIDE | Amenaza | Controles hoy (evidencia) | Huecos |
|---|---|---|---|
| S | Encolar trabajos sin credencial | Secreto o firma QStash | `[SEG-REEL-WORKER-AUTH]` (`===`, acepta IPs internas o `NODE_ENV` no productivo sin credenciales, loguea 4 caracteres del secreto) |
| I | Token de Drive y secretos en tránsito y logs | HTTPS | `[TRIAL-SECRET-EN-URL]` |
| I | Compromiso de Fly expone toda la base | — | `[SERVICE-ROLE-FUERA-DE-VERCEL]` (nuevo) |
| D | Videos grandes en memoria | — | `[OPS-SOP-VIDEO-MEMORIA]` |

## 8. Super admin

**Activos:** todas las orgs, bajas, add-ons, claves BYOK de clientes (las descifra), Drive propio.

| STRIDE | Amenaza | Controles hoy (evidencia) | Huecos |
|---|---|---|---|
| S | Toma de la cuenta | Allowlist en `super_admin_users` (RLS cerrada); `requireSuperAdmin()` en actions y layout; login propio | `[AUTH-MFA-Y-POLITICA]` (sin MFA), `[AUTH-ALTA-EMAIL-AJENO]` (identidad por email; un founder puede crear cuentas confirmadas para cualquier email) |
| E | Acción del panel sin guard | Guard en todo `app/super-admin/*` | `[SUPERADMIN-ONBOARDING-SIN-GUARD]` |
| I | Uso de la clave de un cliente | — | `[IA-CLAVE-DE-CLIENTE-EN-SUPERADMIN]` |
| R | Qué hizo el super admin | `super_admin_deletions` registra las bajas | El resto de acciones del panel (add-ons, contraseñas regeneradas, altas) no deja registro ("Huecos sin ítem") |
| T | Baja incompleta | Flujo en `lib/super-admin/execute-deletion.ts` | `[BAJAS-SIN-PROBAR]` |

## 9. Prompt injection hacia el agente y los pipelines de IA

**Activos:** datos de la org que el agente puede leer (8 lectores de datos) y escribir (`create_workboard_tasks`,
`update_workboard_task`, `create_content_variants`, propuestas `propose_*` que el usuario confirma); reportes,
señales y clasificaciones que el negocio usa para decidir; plata de la key de Anthropic.

| STRIDE | Amenaza | Controles hoy (evidencia) | Huecos |
|---|---|---|---|
| T | Texto de terceros (DMs, transcripts, formularios, mensajes de Discord, documentos) que da órdenes al modelo | `wrapUntrustedContent` (`lib/ai/wrap-untrusted-content.ts`); el agente escribe con la sesión del usuario (RLS de su org); las propuestas de grafo se confirman | `[AUD-SEG-6]` / `[AUDITORIA-ABIERTOS §3.6]` (el wrapper no escapa el cierre; fuentes sin envolver) |
| I | Exfiltración a otra org | Lecturas del agente filtradas por `organization_id` (con SR en `jit-context.ts:178` y `graph-proposal-tools.ts:172`, siempre con `.eq("organization_id", …)`); el agente no tiene tools de red | — |
| E | El agente ignora el rol del usuario | — | `[PERMISOS-SERVER-ACTIONS/agente-ia]` (lee todos los módulos) |
| T | Clasificaciones manipuladas (señales, análisis de DMs) | — | `[ZERNIO-ANALISIS-UNTRUSTED]` (el análisis confía en lo que manda el navegador) |
| D | Gasto de tokens | `aiRateLimit` 10/min por usuario | `[IA-COSTOS-INCOMPLETOS]` |

---

## Huecos sin ítem (propuestos en esta auditoría)

| ID propuesto | Frontera | Severidad |
|---|---|---|
| `[DB-VISTA-CLAUDE-STATUS-ESCRIBIBLE]` | 2 | Crítica |
| `[AUTH-ALTA-EMAIL-AJENO]` | 1, 8 | Crítica (latente) |
| `[AUTH-MFA-Y-POLITICA]` | 1, 8 | Alta |
| `[LOGS-DATOS-SENSIBLES]` | 3, 5 | Media |
| `[SERVICE-ROLE-FUERA-DE-VERCEL]` | 6, 7 | Media |
| `[SERVER-ONLY-GUARDS]` | 1 | Baja |
| `[FATHOM-LINK-EN-TEST]` | — | Baja |

**Registro de auditoría (repudio)**: no hay una tabla de eventos para acciones sensibles (cambio de rol, invitaciones,
BYOK, desconexiones, add-ons y contraseñas regeneradas por el super admin). No se propone ítem aparte porque depende
de `[PERMISOS-SERVER-ACTIONS]` (el helper de permisos es el lugar natural para registrar). Se sugiere sumarlo como
criterio opcional cuando se implemente ese ítem.

## Lo que está bien

- **Aislamiento entre organizaciones**: RLS en todas las tablas, con la org tomada del JWT o del perfil, y trigger
  que impide cambiarse de org o de rol.
- **Webhooks**: fail-closed, firma sobre el cuerpo crudo, tiempo constante, org desde datos firmados.
- **Crons y colas**: `CRON_SECRET` obligatorio (lanza si falta), QStash con dos signing keys.
- **OAuth de integraciones**: `state` en cookie `httpOnly` atada a la org, PKCE donde existe.
- **Agente**: escribe con la sesión del usuario (RLS), sin herramientas de red, con propuestas que se confirman.
- **Historial de git y bundle**: sin secretos (ver `secretos-y-autenticacion.md`).

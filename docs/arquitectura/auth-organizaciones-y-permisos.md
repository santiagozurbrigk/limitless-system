# Auth, organizaciones y permisos

> Verificado contra el código el 2026-09-23 (commit 038caca). Backlog del área: `PENDIENTES.md` § Plataforma.

## Qué es

Cómo entra una persona, a qué organización queda atada, qué organización "ve" en cada request
(cuentas holding), y qué puede hacer adentro. Es transversal: cada Server Action y cada pantalla de
`(platform)` depende de esto. Resumen en una línea: **la sesión es de Supabase Auth, el tenant sale de
`profiles.organization_id` (o del negocio activo si es holding), RLS filtra por organización y los
permisos por módulo sólo cortan el render de pantallas**.

## Piezas y dónde viven

| Pieza | Archivo | Qué hace |
|---|---|---|
| Middleware | `apps/web/middleware.ts` → `apps/web/lib/supabase/middleware.ts` | Refresca la sesión, rutas públicas, contraseña temporal, gate de onboarding, redirects post-login, `last_login_at` |
| Rutas públicas | `apps/web/lib/supabase/public-paths.ts` | Lista de lo que pasa sin sesión (test: `lib/supabase/__tests__/public-paths.test.ts`) |
| Org efectiva | `apps/web/lib/auth/bootstrap.ts` → `requireOrganizationId()` | Resuelve la org de la request (memoizada con `cache()` por request) |
| Holding | `apps/web/lib/holding/resolve-org.ts`, `switch-org.ts`, `constants.ts`, `session.ts` | Negocio activo por cookie + header, re-verificado contra `holding_businesses` |
| Contexto para API routes | `apps/web/lib/auth/require-auth.ts` → `requireAuth()` / `requireAuthContext()` | Devuelve `{ user, orgId, role, supabase, isHoldingView }` |
| Permisos por módulo | `apps/web/lib/auth/get-current-permissions.ts`, `apps/web/constants/permission-modules.ts`, `apps/web/lib/team/mapper.ts` | Rol → mapa de 13 módulos con nivel `none/view/full` |
| Gate de pantallas | `apps/web/app/(platform)/layout.tsx` + `apps/web/lib/navigation/module-for-path.ts` | Si el módulo de la ruta está en `none`, renderiza `SinAcceso` |
| Add-ons | `apps/web/lib/auth/add-on-ids.ts`, `apps/web/lib/auth/add-ons.ts` | `organizations.enabled_add_ons`; `requireAddOn()` en server actions |
| Super admin | `apps/web/lib/auth/require-super-admin.ts` | Allowlist por email en `super_admin_users`. Alta y baja: [`operacion/alta-super-admin.md`](../operacion/alta-super-admin.md) (primero la cuenta, después la lista) |
| Rate limit | `apps/web/lib/rate-limit.ts` | RPC `consume_rate_limit` (Postgres), fallback en memoria |
| Clientes Supabase | `apps/web/lib/supabase/{server,client,admin,env}.ts` | `createClient()` respeta RLS; `createAdminClient()` = service role |

## Modelo de datos

| Tabla | Columnas clave | Notas |
|---|---|---|
| `organizations` | `id`, `name`, `status`, `account_type` (`founder`/`holding`), `enabled_add_ons text[]`, `skip_onboarding`, `holding_billing_model`, `currency`, `timezone` | Raíz multi-tenant. `enabled_add_ons` no lo puede editar un usuario (20260922110000) |
| `profiles` | `id` (= `auth.users.id`, FK con `on delete cascade`), `organization_id`, `role`, `custom_role_id`, `is_holding_admin`, `must_change_password`, `temp_password_expires_at`, `is_active`, `last_login_at` | Un usuario → una org. El super admin tiene `organization_id = null` |
| `team_roles` | `organization_id`, `name`, `permissions jsonb` (`{ "<moduleId>": "none"|"view"|"full" }`), `is_default` | Roles custom por org. Claves consolidadas a 13 módulos en `20260906102000_permisos_por_modulo.sql` |
| `team_invitations` | `token`, `email`, `custom_role_id`, `status`, `expires_at`, `invited_by` | Aceptar NO crea cuentas: vincula una cuenta existente con ese email (perfil `role = 'member'`) vía `aceptar_invitacion_de_equipo` (SCRUM-495). Ningún código inserta filas: invitar crea la cuenta directo (ver Alta de cuentas) |
| `holding_businesses` | `holding_org_id`, `business_org_id`, `business_name`, `status`, `revenue_share_pct`, `fixed_fee_*` | Portfolio de un holding |
| `holding_active_sessions` | `profile_id` (PK), `business_org_id` | Negocio activo para el JWT claim. RLS `deny_all`; sólo service role y `supabase_auth_admin` |
| `super_admin_users` | `email` | Allowlist de staff Limitless |
| `rate_limits` | `key`, `count`, `reset_at` | Sólo service role, vía `consume_rate_limit` |
| `onboarding_state` | `organization_id`, `gate_completed_at`, `dismissed_items`, `tours_seen` | Ver `docs/areas/plataforma.md` |

**Valores reales de `profiles.role`:** `founder`, `member` (todo invitado), y los legados `admin`,
`project_manager`, `setter`, `operator`, `viewer` que siguen en el check constraint
(`20260922120000_reconciliar_con_produccion.sql`) y en `constants/roles.ts`. En la práctica el código
distingue **founder / no founder**; lo que diferencia a un no-founder es su `custom_role_id`.

### RLS

- `get_my_organization_id()` (SECURITY DEFINER, última versión en `20260620100000_holding_jwt_claim_hook.sql`):
  devuelve el claim `active_business_org_id` del JWT si existe, si no `profiles.organization_id`.
- Patrón estándar: `USING (organization_id = get_my_organization_id()) WITH CHECK (...)`.
- **Casi ninguna policy mira el rol.** Desde `20260929100000_roles_equipo_y_config_en_la_base` (SCRUM-1,
  parte A) sí lo miran, con `current_user_has_org_role(roles)`: escribir `team_roles`, todo
  `team_invitations` (también leer, por el token) y el UPDATE de `organizations` exigen founder; el DELETE
  de `clients`, founder o admin. La función acepta al founder del holding cuando opera uno de sus negocios
  y deja afuera a un perfil con `is_active = false`. El resto de las tablas sigue sólo por organización: un
  `member` con rol "sólo lectura" puede escribir por PostgREST lo que su org puede escribir
  (ver `[PERMISOS-SERVER-ACTIONS]`, parte B).
- Excepción por rol, a nivel trigger: `protect_profile_columns` (`20260922100000`) impide que un usuario
  cambie `id`, `organization_id`, `role`, `is_holding_admin` y la contraseña temporal de cualquier perfil,
  y que un no founder/admin toque algo más que `full_name`, `email`, `avatar_url` del suyo.
  Desde `20260929100000`, `custom_role_id` e `is_active` sólo los cambia el founder de la org activa
  (`current_user_has_org_role`), y un perfil founder no se puede desactivar desde la API.
- **Perfil desactivado** (`is_active = false`, SCRUM-8): `get_my_organization_id()` devuelve null,
  `get_my_holding_business_org_ids()` vacío, y "Users update own or founders update org profiles" (unificada, igual que en
  producción) y "holding_can_see_businesses" exigen `is_active` (`20260929110000`). Con su JWT sólo lee su propia fila de `profiles`. En la app, el
  middleware cierra la sesión y manda al login con `?error=cuenta_desactivada`, y `requireOrganizationId()`,
  `requireAuthContext()` y `requireHoldingProfile()` cortan. Desactivar banea al usuario en Auth con la marca
  `app_metadata.ban_motivo = 'desactivado_por_founder'`; reactivar sólo levanta un ban con esa marca
  (`lib/auth/cuenta-desactivada.ts`, `app/team/actions.ts`).
- Holding: `get_my_holding_business_org_ids()` + policies de lectura de portfolio sobre `organizations`,
  `clients`, `conversations`, `closing_calls` (`20260630100000_holding_portfolio_rls.sql`). No miran rol.
- Tablas con secretos (integraciones): sin policy de lectura para `authenticated`; sólo `createAdminClient()`.

Todas las migraciones citadas están aplicadas en producción (`list_migrations`, 2026-09-23).

## Cómo fluye una request

```
Browser ──► middleware (updateSession)
   │   sin Supabase configurado → pasa todo (modo demo)
   │   setea headers x-pathname y x-active-org-id (cookie limitless_active_org / otc_active_org)
   │   user = supabase.auth.getUser()
   │   ├─ contraseña temporal vencida → signOut + /login?error=temp_password_expired
   │   ├─ must_change_password → /auth/force-password-change
   │   ├─ founder sin onboarding_state.gate_completed_at → /onboarding (shouldRedirectToGate)
   │   ├─ sin user y ruta no pública → /login   (Server Actions: no redirige)
   │   ├─ user en /login → super admin: /super-admin/organizations; holding sin negocio: /holding
   │   │                    u /onboarding/holding; resto: /dashboard
   │   └─ user en /dashboard, holding sin negocio → /holding u /onboarding/holding
   ▼
(platform)/layout.tsx  [Server Component]
   getHoldingSessionState · getCurrentUserPermissions · getCurrentOnboardingContext
   módulo = permissionModuleForPath(x-pathname)
   no founder + rol cargado + módulo en "none" → <SinAcceso/>
   ▼
page.tsx / Server Actions → requireOrganizationId() → createClient() (RLS) o createAdminClient()
```

### Alta de cuentas

| Camino | Dónde | Resultado |
|---|---|---|
| ~~Signup público~~ | **Cerrado** (SCRUM-23, decisión de Santiago del 2026-10-09): no hay `signUpAction` ni "Crear cuenta" en `/login`, y "Allow new users to sign up" está apagado en Supabase Auth (`disable_signup: true`). Todas las altas de abajo usan `auth.admin.createUser`, que no depende de esa opción | — |
| Super admin crea founder | `createFounderAccountAction` (`app/super-admin/actions.ts`) | Contraseña temporal (24 h, `lib/auth/temp-password-expiry.ts`) + `must_change_password` |
| Holding agrega negocio | `addBusinessToMyHoldingAction` (`app/(platform)/holding/actions.ts`) | Org de negocio con `skip_onboarding = true` y founder con contraseña temporal |
| Invitación de equipo | `inviteTeamMemberAction` (`app/team/actions.ts`, desde `components/team/team-invite-modal.tsx`) | Crea directo `auth.users` + perfil `role = 'member'` con `custom_role_id` y contraseña temporal; el founder ve las credenciales en pantalla (`TempCredentialsDialog`) y se las pasa. **No** manda mail ni crea fila en `team_invitations` |
| Aceptar invitación | `/invite?token=` → `aceptarInvitacionAction` (`app/team/actions.ts`) → función `aceptar_invitacion_de_equipo` | **No crea cuentas** (SCRUM-495). Ver "Aceptar una invitación" abajo. Sólo sirve para filas de `team_invitations` que ya existan: ningún código las crea hoy |
| Login con email y contraseña | `signInAction` (`app/auth/actions.ts`) | `ensureUserBootstrap`, salvo que el `next` del login sea una invitación (`destinoDeInvitacion`): ahí vuelve a `/invite?token=` sin crear org |
| Login con OAuth / magic link | `apps/web/app/auth/callback/route.ts` | `ensureUserBootstrap` salvo que `next` sea `/invite` |

`ensureUserBootstrap` también **repara** usuarios sin perfil: `requireOrganizationId()` lo llama si el
perfil no tiene org. Para un email de `super_admin_users` crea el perfil sin organización.

### Aceptar una invitación

Desde SCRUM-495 (parte A de `[AUTH-ALTA-EMAIL-AJENO]`) el link `/invite?token=` no crea cuentas. Antes, quien
tuviera el link elegía una contraseña y la app creaba en Auth una cuenta **confirmada** con el email de la
invitación, sin que el dueño del email confirmara nada.

- `app/invite/page.tsx` (Server Component, ruta pública) lee la invitación con el service role
  (`lib/team/cargar-invitacion.ts`; el token del link sólo permite **verla**) y elige qué mostrar
  (`lib/team/invitacion.ts`):
  - inexistente, usada, vencida o anulada (`status = 'expired'`: revocada desde Equipo o por la baja de quien
    invitó): el motivo, sin nada para aceptar;
  - sin sesión: org, rol custom si tiene, quién invitó y el email invitado; botón a
    `/login?next=/invite?token=…` y, para quien no tiene cuenta, que le pida el alta al founder desde Equipo;
  - con la sesión de otro email (comparación sin mayúsculas ni espacios): que cierre sesión y entre con la
    cuenta invitada; la invitación no se toca;
  - con la sesión del email invitado: botón "Unirme al equipo".
- `aceptarInvitacionAction(token)` exige sesión (sin sesión rechaza sin llamar a nada) y llama con el service
  role a `aceptar_invitacion_de_equipo(token, user.id)`. No usa `requireOrganizationId()`: quien acepta todavía
  no es de la org y resolverla le crearía una propia. Devuelve los rechazos como valor (`motivo` + mensaje en
  voseo); la pantalla redirige al panel.
- La función (migración `20261005150000`, `security definer`, EXECUTE sólo para `service_role`) hace todo en
  una transacción con la fila de la invitación bloqueada (`for update`): invitación pendiente y sin vencer;
  email de la cuenta (leído de `auth.users`, no de la request) igual al invitado y con `email_confirmed_at`;
  email que no esté en `super_admin_users` (comparado normalizado, como `isSuperAdminEmail`): una cuenta del staff
  nunca se suma a una org, tenga perfil o no, porque un super admin recién dado de alta todavía no tiene perfil
  y como member el founder podría desactivarlo y banearlo; rol custom de la misma org (la regla de
  `assertRolDeLaOrg`); si la cuenta ya tiene perfil, sólo acepta si es de esa misma org (la marca usada y no le
  cambia el rol); si es de otra org (o un perfil sin org), rechaza sin tocar nada, porque un usuario es de una
  sola org. Si no tiene perfil, lo crea con
  `role = 'member'`, el `custom_role_id` y el `invited_by` de la invitación, y la marca `accepted`. Dos
  aceptaciones a la vez se ordenan por el lock: la segunda la ve usada. Los rechazos dejan la invitación y el
  perfil como estaban. Tests: `supabase/ci/tests/80_aceptar_invitacion.sql`.
- **Precondición: "Confirm email" activo en Supabase Auth.** `email_confirmed_at` sólo prueba que la persona es
  dueña del email si Supabase exige confirmarlo. Con la confirmación apagada (`mailer_autoconfirm = true`), Auth
  confirma la cuenta en el acto al registrarse: quien tenga el link podría registrarse con el email invitado por
  la API pública de Auth, entrar por `/login?next=/invite?token=…` y aceptar. Esa configuración vive en el
  servicio de Auth, no en la base ni en el repo: no hay forma confiable de leerla desde SQL. Cómo verla:
  `docs/operacion/entorno-y-deploy.md` § Configuración de Supabase Auth.
- El login vuelve a la invitación: `SupabaseLoginForm` manda el `next` de la URL y `signInAction` lo acepta sólo
  si `destinoDeInvitacion` lo reconoce (path interno exactamente `/invite` con token, rearmado; nunca otro host:
  usa `destinoSeguro`). Con ese `next` no corre `ensureUserBootstrap`, para que una cuenta sin perfil no quede
  en una org propia antes de aceptar.

### Holding: qué org ve cada request

1. `enterBusinessAction` (sólo founder del holding o `is_holding_admin`) verifica el vínculo en
   `holding_businesses`, hace upsert en `holding_active_sessions`, llama `supabase.auth.refreshSession()`
   para que el **Custom Access Token Hook** (`custom_access_token_hook`) meta `active_business_org_id` en el
   JWT, y setea la cookie httpOnly `limitless_active_org` (24 h).
2. En cada request, `resolveEffectiveOrganizationId()` toma header `x-active-org-id` o cookie y los
   **re-verifica** contra `holding_businesses` (activo). Si no pasa, usa la org del holding.
3. RLS usa el claim del JWT; la app usa la cookie. Las dos se escriben juntas y se borran juntas en
   `exitBusinessAction` y `signOutAction`.

⚠️ El hook **no se activa con la migración**: hay que habilitarlo en Supabase → Authentication → Hooks.
Si no está, la app muestra el negocio (cookie) pero RLS filtra por la org del holding.

### Permisos por módulo

- 13 módulos: `dashboard, workboard, agent, clients, knowledge_base, funnels, sales, marketing,
  operations, finance, integrations, team, settings` (`constants/permission-modules.ts`).
- Founder: todo en `full`. Member: `permissionsFromRow(team_roles.permissions)`. Claves viejas de
  submódulo (`sales_inbox`, `marketing_content`, `expenses`…) se traducen al módulo actual quedándose con
  el nivel **más alto** (`LEGACY_PERMISSION_MODULES`, `highestPermissionLevel`).
- `hasRoleConfigured = false` (member sin rol o rol vacío) → **el layout no bloquea nada**. Decisión: sin
  rol, "sin acceso a todo" dejaría la cuenta inutilizable.
- La regla (founder pasa siempre, sin rol no se bloquea, con rol entra si el módulo no está en `none`) vive
  en `lib/auth/acceso-a-modulo.ts`: `moduloBloqueadoParaRuta` la usa el layout de `(platform)` y
  `rechazoPorModulo` la aplica en una Server Action (hoy, `getIntelligenceSnapshotAction`, que exige
  `operations` desde SCRUM-18). El rechazo vuelve como valor (`RechazoPorModulo`: la forma del error de
  `MutationResult` más `motivo: "sin-acceso"` y `moduleId`), no como excepción: así `/founder` e
  `/intelligence` dibujan `SinAcceso` también cuando se llega con una navegación del cliente, donde el layout
  no se vuelve a ejecutar y la página sí.
- El layout decide qué se dibuja, no qué se ejecuta: Next ejecuta la página del segmento aunque el layout
  muestre `SinAcceso`. Por eso una lectura que no tiene que llegarle a alguien sin el módulo chequea el permiso
  por su cuenta.
- Mapeo ruta → módulo: tabla explícita `MODULE_BY_PREFIX` en `lib/navigation/module-for-path.ts`, gana el
  prefijo más largo. `/product`, `/sops`, `/intelligence`, `/executive-reports`, `/founder` → `operations`;
  `/lanzamientos` → `funnels`; `/comentarios` → `marketing`. Libres: `/onboarding`, `/holding`,
  `/redesign-preview`. El test (`lib/navigation/__tests__/module-for-path.test.ts`) recorre `app/` entero en
  disco y falla si una ruta de `(platform)` no tiene módulo ni es libre, o si una ruta con módulo cuelga de un
  layout que no llama `moduloBloqueadoParaRuta` (así quedó afuera `/founder` hasta SCRUM-18).
- Navegación: `canSeeNavItem()` en `providers/permissions-provider.tsx`. Un item **sin** `permissionId`
  (Producto, Inteligencia, Área del fundador) sólo lo ve el founder.
- Nivel `view` vs `full`: no hay enforcement central. Algunas pantallas lo consultan con
  `useModuleAccess()` (p. ej. `components/clients/clients-list.tsx`).

### Chequeos de rol que sí existen en server actions

| Guard | Dónde | Qué protege |
|---|---|---|
| `requireManagerProfile()` (sólo `founder`) | `app/team/actions.ts` | Invitar, cambiar rol, desactivar, roles custom. Tener `team: full` **no** alcanza |
| `requireOrgRole(roles, mensaje)` (`lib/auth/require-org-role.ts`) | `app/settings/actions.ts`, `app/clients/actions.ts`, los `disconnect*Action` de la org (`app/integrations/actions.ts`, `stripe`, `mercadopago`, `payments`, `ghl`, `hyros`, `vturb`, `webinarjam`, `youtube`, `unipile`, `discord`) y las rutas `api/integrations/{stripe,mercadopago,unipile}/disconnect` | Configuración de la org y clave de Claude: sólo founder. Borrar un cliente: founder o admin. Pregunta a la base con la misma función de las policies (`current_user_has_org_role`) |
| `requireFounderRole()` | `app/finance/actions.ts` | 3 acciones de finanzas |
| `requireFounder()` | `app/clients/custom-field-actions.ts`, `checkpoint-actions.ts`, `plan-duration-actions.ts` | Configuración de clientes |
| rol founder (chequeo inline) | `app/clients/signals-actions.ts` | Cambiar el aviso de señales |
| rol founder | `app/executive-reports/report-generation-actions.ts` | Generar reportes |
| `rechazoPorModulo(moduleId)` (`lib/auth/acceso-a-modulo.ts`) | `app/intelligence/actions.ts` (`getIntelligenceSnapshotAction`) | Leer el resumen de Inteligencia que muestran `/intelligence` y `/founder`: módulo Operaciones, con la misma regla que el layout. Devuelve el rechazo como valor y las dos páginas dibujan `SinAcceso` |
| `requireHoldingProfile()` | `app/(platform)/holding/actions.ts` | founder o `is_holding_admin` |
| `requireAddOn()` | `app/clients/sub-client-actions.ts`, `onboarding-link-actions.ts`, `custom-field-actions.ts`, `revenue-actions.ts`, `signals-actions.ts` | Add-on `growth_partners` |
| `requireSuperAdmin()` | todo `app/super-admin/*` y `lib/super-admin/queries.ts` | Panel interno |

Todo lo demás sólo exige estar logueado en la org.

### Add-ons

`ADD_ON_IDS`: `operaciones`, `producto`, `ejecutivo`, `inteligencia`, `embudos` (declarado, ya no se usa:
Embudos va siempre), `growth_partners`. Los activa el super admin (`updateOrgAddOnsAction`). En la nav:
`operaciones` muestra el grupo Operaciones, `producto` muestra Producto. En el servidor sólo
`growth_partners` se exige con `requireAddOn()`; el resto es visibilidad de menú.

## Reglas de negocio y decisiones no obvias

- **`requireOrganizationId()` es la única forma de saber la org.** Leer `profile.organization_id` ignora
  el negocio activo del holding (hoy lo hacen acciones de reels y Drive, ver auditoría §3 salud 7).
- **Esconder no es permitir.** `useHasAddOn` / `canSeeNavItem` deciden qué se dibuja; el servidor tiene
  que chequear aparte.
- **Server Actions nunca reciben redirect a HTML**: el middleware detecta el header `next-action` y deja
  pasar (la action misma falla con "Sesión no válida").
- **El gate de onboarding va después del cambio de contraseña**: si no, loop `ERR_TOO_MANY_REDIRECTS` en
  el primer login de toda cuenta nueva (`lib/onboarding/gate-routing.ts`).
- **Ruta pública ≠ ruta abierta**: `/api/webhooks/*`, `/api/discord/*`, `/api/cron/*`, `/api/queue/*`,
  `/api/rag/*` y los `/api/integrations/*/{webhook,callback,sync,poll,process,reanalyze}` pasan sin
  sesión y cada handler valida firma/secreto (fail-closed).
- **El rate limit de login es por email** (5 intentos / 15 min, `signin:<email>`). Con la DB caída es
  fail-open con contador en memoria.
- **Super admin**: allowlist por email, no por rol. `/superadmin/login` es el login propio; el resto del
  panel vive en `/super-admin/*` con guard en `app/(super-admin)/super-admin/layout.tsx`.

## Limitaciones conocidas y deuda

- `[PERMISOS-SERVER-ACTIONS]` Los permisos por módulo no existen en server actions ni en RLS. Desde la
  parte A (29-sep) el equipo, la configuración de la org, la clave de Claude, desconectar integraciones y
  borrar clientes piden rol; un member "sólo lectura" todavía puede, entre otras,
  `updateCloserCommissionAction`, los `connect*`/`save*` de integraciones y escribir finanzas por PostgREST.
- `[PERMISOS-LAYOUT-NAV-SUAVE]` (nuevo) El chequeo vive en el **layout** de `(platform)`. En App Router los
  layouts no se vuelven a renderizar en navegaciones del lado del cliente entre páginas del mismo grupo:
  un `<Link>` o la paleta de comandos (`routes/navigation.ts`, sin filtro de permisos) llevarían a un módulo
  bloqueado sin pasar por `SinAcceso`. Tipear la URL sí lo bloquea. **Verificar en navegador**.
- `[PERMISOS-FOUNDER-AREA]` resuelto el 2026-10-05 (SCRUM-18): `/founder` vive en `app/(platform)/founder` y
  pasa por el mismo bloqueo que el resto; la action que lee su resumen exige Operaciones.
- `[PERMISOS-SIN-ROL-NAV]` (nuevo) Un member sin rol pasa el gate de pantallas, pero la notch nav le
  esconde todo (`modules` en `none`): navega sólo por URL.
- `[HOLDING-PORTFOLIO-ROL]` Cualquier miembro de la org holding lee clientes, llamadas y conversaciones
  del portfolio (RLS sin rol) y el negocio activo se valida por vínculo, no por rol.
- `[ADDONS-HOLDING]` (nuevo) `getCurrentUserPermissions` lee `enabled_add_ons` de la org del **perfil**;
  `add-ons.ts` lee la org **efectiva**. En un holding mirando un negocio, la UI muestra los add-ons del
  holding y el servidor aplica los del negocio.
- `[LOGIN-RATE-LIMIT]` Desde el 2026-09-30 (SCRUM-24) el login cuenta por IP + email y por IP (`lib/auth/limite-login.ts`); queda pendiente el captcha tras varios fallos.
- `[AUTH-CALLBACK-NEXT]` resuelto el 2026-09-30 (SCRUM-2): `auth/callback` sólo redirige a un path interno (`lib/auth/redirect-seguro.ts`, `destinoSeguro`).
- `[SIGNUP-PUBLICO]` resuelto el 2026-10-09 (SCRUM-23): el alta es **sólo por invitación** (super admin, holding
  o invitación de equipo). Se sacó "Crear cuenta" y `signUpAction`, y se apagó el signup en Supabase Auth.
- `[PERMISOS-LOG]` resuelto el 2026-10-04 (SCRUM-121): `getCurrentUserPermissions` ya no escribe en los
  registros el usuario, el rol ni los módulos de cada member.
- Invitaciones: `customRoleId` no se valida contra la org (sólo lo puede mandar un founder).
- `profiles.role = 'member'` no está en `VALID_ROLES` (`lib/team/mapper.ts`) ni en `constants/roles.ts`.

## Tests

| Archivo | Cubre |
|---|---|
| `apps/web/lib/supabase/__tests__/public-paths.test.ts` | Qué rutas pasan sin sesión |
| `apps/web/lib/navigation/__tests__/module-for-path.test.ts` | Ruta → módulo; toda ruta de `(platform)` decidida |
| `apps/web/constants/__tests__/permission-modules.test.ts`, `permisos-consolidados.test.ts` | Consolidación de claves viejas, nivel más alto |
| `apps/web/lib/onboarding/__tests__/gate-routing.test.ts` | Combinaciones del redirect al gate |
| `apps/web/lib/security/__tests__/*` | Cifrado AES-GCM y comparación en tiempo constante |
| `apps/web/e2e/holding.spec.ts` | Holding: dashboard, switcher, entrar/salir (necesita `E2E_HOLDING_*`) |

Sin tests: `lib/auth/bootstrap.ts`, `get-current-permissions.ts`, `require-auth.ts`, `lib/holding/*`,
`lib/rate-limit.ts`, el middleware entero. No hay e2e de permisos por rol (`[T-19]`).

## Archivos clave

- `apps/web/lib/supabase/middleware.ts`
- `apps/web/lib/supabase/public-paths.ts`
- `apps/web/lib/auth/bootstrap.ts`
- `apps/web/lib/auth/require-auth.ts`
- `apps/web/lib/auth/get-current-permissions.ts`
- `apps/web/lib/auth/add-ons.ts`
- `apps/web/constants/permission-modules.ts`
- `apps/web/lib/navigation/module-for-path.ts`
- `apps/web/app/(platform)/layout.tsx`
- `apps/web/lib/holding/resolve-org.ts` y `apps/web/app/(platform)/holding/actions.ts`
- `apps/web/app/auth/actions.ts` y `apps/web/app/auth/callback/route.ts`
- `apps/web/app/team/actions.ts`
- `supabase/migrations/20260620100000_holding_jwt_claim_hook.sql`, `20260922100000_profiles_columnas_protegidas.sql`, `20260906102000_permisos_por_modulo.sql`

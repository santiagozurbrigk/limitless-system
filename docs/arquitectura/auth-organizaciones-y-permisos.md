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
| Guardia de cada página | `apps/web/lib/auth/acceso-a-modulo.ts` → `exigirModuloDeLaPagina(moduleId)` | Primera línea de toda página con módulo (y de un layout de segmento que lee): sin el módulo devuelve `SinAcceso` antes de cualquier lectura, también en navegación del cliente (SCRUM-540) |
| Lecturas del marco | `apps/web/lib/auth/lecturas-del-marco.ts` (`leerDelMarco`), `acceso-a-modulo.ts` → `rechazoDeLecturaDelMarco(lectura)` | Los providers que se montan en toda pantalla piden cada dato sólo con alguno de los módulos que lo muestran, y la action lo vuelve a chequear; sin Finanzas, sólo totales (SCRUM-540) |
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
   getCurrentUserPermissions (imprescindible: si falla, global-error)
   getHoldingSessionState · getCurrentOnboardingContext · zona (degradables, SCRUM-108)
   módulo = permissionModuleForPath(x-pathname)
   no founder + rol cargado + módulo en "none" → <SinAcceso/>
   (en una navegación del cliente este layout no se vuelve a ejecutar)
   ▼
page.tsx  [corre siempre, en paralelo con los layouts y en cada navegación]
   exigirModuloDeLaPagina("<módulo>")  → sin el módulo: <SinAcceso/> y no lee nada (SCRUM-540)
   ▼
lecturas de la página / Server Actions (rechazoPorModulo si son de lectura de un módulo)
   → requireOrganizationId() → createClient() (RLS) o createAdminClient()
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
- Una lectura de permisos que **falla** no es "sin rol" (SCRUM-108): si Auth devuelve un error que no es de sesión (sin respuesta, 5xx, 429...) o la
  lectura de `profiles`, `organizations.enabled_add_ons` o `team_roles` devuelve error,
  `getCurrentUserPermissions` lanza `FallaDeLaBase`. El layout cae en `global-error` y `rechazoPorModulo` lanza:
  nada abre el acceso. Antes el error se descartaba y un miembro con rol limitado quedaba sin bloqueo durante
  una degradación de la base.
- La regla (founder pasa siempre, sin rol no se bloquea, con rol entra si el módulo no está en `none`) vive
  en `lib/auth/acceso-a-modulo.ts` y tiene tres usos, todos sobre `puedeEntrarAlModulo`:
  - `moduloBloqueadoParaRuta`: el layout de `(platform)`, con `x-pathname`.
  - `exigirModuloDeLaPagina(moduleId)` (SCRUM-540): el guardia de las páginas y de los layouts de segmento
    que leen. Devuelve `SinAcceso` o `null` y va primero:
    `const sinAcceso = await exigirModuloDeLaPagina("operations"); if (sinAcceso) return sinAcceso;`.
  - `rechazoPorModulo(moduleId)`: las Server Actions de lectura. El rechazo vuelve como valor
    (`RechazoPorModulo`: la forma del error de `MutationResult` más `motivo: "sin-acceso"` y `moduleId`), no
    como excepción.
  Una falla al leer los permisos lanza en los tres (nunca abre).
- **El layout decide qué se dibuja, no qué se ejecuta.** En el App Router la página se ejecuta en el
  servidor en paralelo con los layouts, aunque un layout no dibuje `children`: sus lecturas corren y sus
  datos viajan en el HTML y en el payload RSC. Y en una navegación del cliente el layout de `(platform)` no se
  vuelve a ejecutar; la página sí, siempre. Medido en la AR de SCRUM-524: un miembro sin Operaciones recibía
  el título y el contenido de los SOP con «No tenés acceso» en pantalla. Por eso, desde SCRUM-540:
  - **Guardia por página, no por layout.** Lo único que corta las lecturas es que el chequeo corra antes que
    ellas en la misma función. Un layout de segmento con el guardia no frena la página de abajo (que corre
    en paralelo) y además no se vuelve a ejecutar al moverse dentro del segmento. Cada `page.tsx` con módulo
    (68) arranca con el guardia; recibe el módulo escrito en el archivo, no usa `x-pathname`, así que vale
    igual al cargar y al navegar, y no redirige (misma pantalla que el layout, sin riesgo de bucles).
  - **Layouts de segmento, sólo si leen.** Un layout que importa algo más que navegación y banderas (por
    ejemplo `agent/layout.tsx`, que monta un provider de cliente que pide las conversaciones al montarse)
    también lleva el guardia. Por eso `agent/layout.tsx` pasó a ser de servidor y la parte de cliente vive en
    `agent-layout-cliente.tsx`. `/clients` era una página de cliente (`"use client"`): ahora la página es de
    servidor y la pantalla vive en `clients-page-cliente.tsx`.
  - **Server Actions de lectura de un módulo** arrancan con `rechazoPorModulo("<módulo>")`, porque se pueden
    llamar a mano sin abrir la pantalla. Hoy lo hacen 50 (las que ya devolvían `MutationResult`, donde el
    rechazo entra sin cambiar la forma). Las otras 73 devuelven el dato directo: quedan en la lista de deuda
    del test (`[PERMISOS-ACTIONS-LECTURA-SIN-MODULO]`). Sus pantallas ya no se dibujan sin el módulo.
  - El test `lib/navigation/__tests__/lecturas-por-modulo.test.ts` exige todo esto leyendo el código con el
    parser de TypeScript: que cada página con módulo arranque con el guardia y el módulo de su ruta, que cada
    layout con módulo que lee también, y que cada action de lectura de un solo módulo arranque con
    `rechazoPorModulo` de ese módulo (o esté en la lista de deuda, que sólo puede achicarse). Qué cuenta como
    action de lectura de un módulo: un export de un archivo `"use server"` con nombre de lectura (`get`,
    `list`, `fetch`, `load`, `preview`...) que sólo alcanzan, siguiendo los `import` desde `app/`, páginas y
    layouts de ese módulo. **No ve:** una lectura con otro nombre; una action que alcanzan pantallas de dos
    módulos, una ruta libre o una API (las del marco, sí: ver abajo); un `import` dinámico sin literal; funciones
    de servidor que no son actions (`lib/<dominio>/queries.ts`, que sólo llaman componentes de servidor y
    quedan cortadas por el guardia de la página). `app/__tests__/lecturas-rechazan-sin-modulo.test.ts` llama
    de verdad a cada action que el detector da por chequeada.
  - **Las lecturas del marco.** `AppProviders` (en el layout de `(platform)`) monta en toda pantalla
    `PlatformDataProvider` (clientes, llamadas de cierre, conversaciones, cuentas de Unipile y el canal en
    vivo de conversaciones), `FinanceDataProvider` (configuración de Finanzas, cobros, métricas importadas) y
    `MarketingDataProvider` (estado de Instagram); la barra monta el panel de reportes ejecutivos y el menú del
    celular pide el contador de llamadas sin asignar de Clientes. Hasta SCRUM-540 todo eso se pedía para
    cualquier miembro, sin mirar el módulo: alguien sin Clientes ni Finanzas recibía los clientes, los gastos
    y los reportes en cualquier pantalla. Ahora:
    - **Mínimo privilegio** (AR 1 de SCRUM-540): cada módulo recibe sólo lo que sus pantallas muestran.
      `lib/auth/lecturas-del-marco.ts` (sin dependencias de servidor) dice qué módulos abren cada lectura,
      contando sólo las pantallas que muestran ese dato tal cual; un módulo que sólo muestra totales los
      recibe calculados en el servidor:

      | Lectura | La abren | Qué viaja |
      |---|---|---|
      | `clientes` | Clientes, Ventas, Finanzas | Las filas de clientes |
      | `llamadasDeCierre` | Ventas, Finanzas | Las filas de llamadas de cierre |
      | `conversaciones` | Ventas | Las conversaciones, las cuentas de Unipile y el canal en vivo |
      | `detalleDeFinanzas` | Finanzas | Gastos fijos, suscripciones, sueldos y comisiones por persona, y lo cobrado por plataforma con la fecha del último cobro |
      | `plataformasDePago` | Finanzas, Ventas, Ajustes | Sin Finanzas: nombre, clave, moneda y etiqueta de cada plataforma; lo cobrado en 0 y la fecha vacía, sin leer `client_payments` |
      | `resumenFinanciero` | Finanzas, Ventas | `getResumenFinancieroAction`: facturación, cobrado, gastos y margen del período, el total de gastos del mes y, por mes, facturación y cobrado (`resumenParaVentas`); nada del desglose |
      | `cobros` | Finanzas | Cada cobro de la organización |
      | `metricasImportadas` | Finanzas, Ventas | El snapshot de métricas importadas (son totales) |
      | `instagram` | Marketing, Integraciones | El estado de la integración |
      | `reportesEjecutivos` | Operaciones | Los últimos reportes |
      | `llamadasPendientes` | Clientes | Un número |

      El Panel no abre ninguna: su página calcula los totales en el servidor (`leerDatosDelPanel`) y manda
      sólo `DashboardData` y las etapas del embudo (ver `docs/areas/plataforma.md`). "Este mes" sale del
      día de la organización (`diaLocal(hoy)`), no del reloj del servidor: `deriveFinanceSummary`,
      `deriveMonthlySeries` y `enrichTeamCompensationWithCommissions` reciben ese `ahora`, y
      `getResumenFinancieroAction` lee la zona como el Panel (AR 2; en el navegador, para Finanzas, siguen con
      el reloj de quien mira, como en `main`). El Panel sigue en vivo para quien puede leer conversaciones
      (`suscribirPanelEnVivo`: escucha el canal y pide el Panel de nuevo, sin usar la fila). Quien tiene Finanzas
      recibe todo como antes, y la cuenta de los totales es la misma en los tres lugares
      (`lib/finance/resumen-financiero.ts`, funciones puras).
    - En el servidor, cada action arranca con `rechazoDeLecturaDelMarco("<lectura>")` (founder pasa, sin rol
      no se bloquea, una falla de permisos lanza). Las que devolvían el dato directo ahora pueden devolver
      `RechazoPorModulo` en su lugar (`esRechazoPorModulo`, `sinRechazo`). Las lecturas sin chequeo viven en
      `lib/marco/lecturas-de-servidor.ts`, `lib/finance/leer-configuracion.ts` y `lib/dashboard/`, que no son
      `"use server"`: las usan las actions después de chequear y la página del Panel después de su guardia.
    - En el cliente, cada provider pide con `leerDelMarco(permisos, "<lectura>", accion, vacio)`: sin el
      módulo no hay pedido y el componente queda vacío (el botón de reportes no aparece, el contador queda sin
      número), sin error. Para eso los permisos (`PermissionsProvider`) envuelven a `AppProviders` en el
      layout, y los lectores los toman con `usePermisosDeModulo` (`permisosEstables`: el mismo objeto mientras
      no cambien, para no volver a pedir todo en cada `router.refresh()`). El canal en vivo de conversaciones
      no se abre sin la lectura `conversaciones`.
    - `lecturas-por-modulo.test.ts` exige que toda action de lectura que alcanza el marco arranque con
      `rechazoDeLecturaDelMarco` (salvo el id de la org y el perfil propio, listados con su motivo); que en el
      cliente del marco se pida sólo dentro de `leerDelMarco` con la misma lectura (también por
      `import * as` e `import("...")` con literal); que los lectores no usen `usePermissions()`; y que todo
      canal en vivo del marco, y todo canal de una tabla del marco que abra una página con módulo (el del Panel),
      corte antes con la lectura de la tabla que escucha. También exige, para toda ruta con módulo, que ninguna
      página ni layout exporte `generateMetadata` ni `generateViewport` ni ejecute código al importarse
      (corren aunque la página corte), que `template` y `default` lleven el guardia si leen, que
      `loading`, `error` y `not-found` no alcancen ninguna lectura, y que no haya `route` ni archivos de
      metadata con código (`opengraph-image`, `twitter-image`, `icon`, `apple-icon`, `sitemap`, `robots`,
      `manifest`): Next los sirve sin la página ni el guardia. **No ve:** si el provider le pasa a
      `leerDelMarco` los permisos reales (lo prueban los tests de cada provider y el del orden de los
      providers en el layout), una lectura con un nombre que no empieza con un verbo de lectura, ni una
      action del marco importada a través de un archivo que la reexporta.
  - **Con SCRUM-524** (menú por experiencia): ese cambio deja pasar `children` en el layout de `(platform)`
    fuera de la experiencia y pone en cada segmento de primer nivel un `layout.tsx` con
    `await exigirRutaDeLaExperiencia("/<segmento>")`. No chocan: los guardias de esta entrega están en las
    páginas, que corren en paralelo y devuelven `SinAcceso` mientras el layout del segmento redirige (gana la
    redirección), y ninguno redirige. En un layout que tenga los dos, primero va `exigirRutaDeLaExperiencia`
    y después el guardia (el test lo permite antes del guardia y nada más): si el guardia fuera primero, una
    organización webinar vería «No tenés acceso» en vez de ir a su pantalla de inicio.
- Mapeo ruta → módulo: tabla explícita `MODULE_BY_PREFIX` en `lib/navigation/module-for-path.ts`, gana el
  prefijo más largo. `/product`, `/sops`, `/intelligence`, `/executive-reports`, `/founder` → `operations`;
  `/lanzamientos` → `funnels`; `/comentarios` → `marketing`. Libres: `/onboarding`, `/holding`,
  `/redesign-preview`. El test (`lib/navigation/__tests__/module-for-path.test.ts`) recorre `app/` entero en
  disco y falla si una ruta de `(platform)` no tiene módulo ni es libre, o si una ruta con módulo cuelga de un
  layout que no llama `moduloBloqueadoParaRuta` (así quedó afuera `/founder` hasta SCRUM-18). El de
  `lecturas-por-modulo` compara además el módulo que pide cada página con el de esta tabla.
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
| `rechazoPorModulo(moduleId)` (`lib/auth/acceso-a-modulo.ts`) | `app/intelligence/actions.ts` (`getIntelligenceSnapshotAction`, SCRUM-18) y, desde SCRUM-540, 49 lecturas más de Clientes, Ventas, Marketing, Tablero, Operaciones (`getSOPVersionsAction`), Integraciones, Base de conocimiento, Equipo y Ajustes (lista en el test `lecturas-por-modulo`) | Leer los datos de una pantalla de un módulo con la misma regla que el layout. Devuelve el rechazo como valor |
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
- `[PERMISOS-LAYOUT-NAV-SUAVE]` resuelto el 2026-10-19 (SCRUM-540): cada página con módulo chequea el
  permiso antes de leer, así que una navegación del cliente (un `<Link>`, la paleta) muestra «No tenés
  acceso» igual que tipear la URL, y los datos no viajan en la respuesta. Medido con `next start` contra un
  Supabase local, al cargar y al navegar.
- `[PERMISOS-PROVIDERS-GLOBALES]` resuelto el 2026-10-19 (SCRUM-540): los providers del marco piden cada
  dato sólo si la persona tiene alguno de los módulos que lo muestran, y las actions lo chequean en el
  servidor; Ventas recibe los totales de Finanzas ya calculados y el Panel calcula los suyos en su página
  (mínimo privilegio, AR 1).
- `[PERMISOS-ACTIONS-LECTURA-SIN-MODULO]` (nuevo, SCRUM-541) 73 Server Actions de lectura de un solo módulo devuelven
  el dato directo y no chequean el módulo; se alcanzan llamándolas a mano.
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
| `apps/web/lib/navigation/__tests__/lecturas-por-modulo.test.ts` | Toda página y layout que lee con el guardia del módulo de su ruta; toda action de lectura de un solo módulo con `rechazoPorModulo` (o en la deuda) |
| `apps/web/lib/auth/__tests__/acceso-a-modulo.test.ts` | La regla y el guardia: founder, sin rol, con y sin módulo, falla de permisos que se relanza |
| `apps/web/app/__tests__/paginas-cortan-antes-de-leer.test.ts`, `lecturas-rechazan-sin-modulo.test.ts` | Las páginas de SOP y el layout del Agente no leen sin el módulo; cada action chequeada (también las del marco) rechaza sin leer |
| `apps/web/lib/auth/__tests__/lecturas-del-marco.test.ts`, `apps/web/providers/__tests__/lecturas-del-marco-de-los-providers.test.ts` | Qué módulos abren cada lectura del marco; los providers de la plataforma, Finanzas y Marketing no piden sin el módulo y piden igual que antes con él |
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

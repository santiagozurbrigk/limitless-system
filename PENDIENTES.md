# PENDIENTES.md — Backlog abierto de Limitless, por área

> Reescrito el 2026-09-23. Cada ítem se verificó contra el código del commit `038caca` (y, donde hacía
> falta, contra el esquema de producción en modo sólo lectura). Los ítems de los backlogs viejos que ya
> estaban resueltos o eran obsoletos se sacaron: la lista con la evidencia de cada uno está en
> [`docs/historial/auditoria-docs-2026-09-23.md`](./docs/historial/auditoria-docs-2026-09-23.md).

**Cómo se usa**

- Este archivo tiene **sólo lo abierto**. Cuando cerrás un ítem, **borralo** y nombrá su ID en la entrada
  de `CHANGES.md`. No hay sección de "completados".
- Un ítem nuevo va en la sección de su área, en su prioridad, con el formato de hallazgo de abajo. Los P0 y
  P1 llevan todos los campos; los P2/P3, como mínimo Tipo, Estado verificado, Qué hay que hacer y Dónde.
- Después de tocar este archivo: `python3 docs/backlog/pendientes_a_jira.py --actualizar-indices` (recalcula la
  tabla de P0 y el índice por área, valida y regenera el CSV de Jira)
  (ver [`docs/backlog/`](./docs/backlog/README.md)). Falla si a un P0/P1 le falta un campo obligatorio, si hay
  un ID repetido o si el índice por área no coincide con los ítems.
- Las funcionalidades a las que afecta cada ítem están en [`docs/FUNCIONAL.md`](./docs/FUNCIONAL.md).
- Lo que requiere probar con cuentas reales se lista acá como `verificación manual` y los pasos están en
  [`docs/operacion/verificacion-manual.md`](./docs/operacion/verificacion-manual.md).

**Prioridades**

| | Significa |
|---|---|
| **P0** | Rompe algo, pierde o expone plata, datos o accesos. Antes que cualquier feature. |
| **P1** | Hacer pronto: bug visible, verificación bloqueante, deuda que ya muerde. |
| **P2** | Mejora, deuda o limpieza con costo acotado. |
| **P3** | Idea, feature futura o decisión de negocio sin urgencia. |

**Severidad** (independiente de la prioridad: la severidad mide cuánto daño hace si ocurre; la prioridad, qué
tan rápido hay que resolverlo)

| | Significa |
|---|---|
| **Crítica** | Puede dar acceso a datos de otra organización, exponer secretos o credenciales, perder o corromper datos, perder plata registrada o tirar el sistema |
| **Alta** | Escalamiento de permisos dentro de una organización, datos incorrectos que se usan para decidir, una funcionalidad central inutilizable o una falla silenciosa de un proceso importante |
| **Media** | Problema real pero acotado: tiene workaround o afecta a pocos o a una parte secundaria |
| **Baja** | Calidad, mantenimiento, prolijidad, cosmético |

**Tipos:** bug · seguridad · verificación manual · deuda técnica · feature · decisión de negocio · tests · investigación.

**Formato de hallazgo.** Cada ítem separa el hecho de la opinión:

```
#### [ID] Título corto que describe el problema
- **Tipo:** …
- **Severidad:** Crítica | Alta | Media | Baja          (obligatorio en P0/P1)
- **Estado verificado:** el HECHO, con evidencia (archivo:línea, migración, policy). Sin opinión.
- **Riesgo:** qué puede pasar y en qué condiciones ("si …, entonces …").   (obligatorio en P0/P1)
- **Impacto:** a quién y a qué afecta, y cuánto.                           (obligatorio en P0/P1)
- **Qué hay que hacer:** la RECOMENDACIÓN.
- **Criterio de aceptación:** qué se prueba y qué tiene que pasar.         (obligatorio en P0/P1)
- **Dónde:** archivos y tablas.
```

Los informes de auditoría con el mismo criterio (hecho · observación · riesgo · recomendación) están en
[`docs/auditoria/`](./docs/auditoria/README.md).


## P0 — lo que rompe o arriesga plata, datos o seguridad

| ID | Área | Severidad | Qué |
|---|---|---|---|
| `[PERMISOS-SERVER-ACTIONS]` | Plataforma | Alta | Los permisos por módulo no protegen datos, sólo pantallas |
| `[FATHOM-SYNC-CURSOR]` | Ventas | Alta | La sync de Fathom saltea para siempre una llamada que no se pudo guardar |
| `[CLOSER-AMOUNT-CLOSED]` | Ventas | Media | La pestaña Equipo de Closing siempre sale vacía |
| `[CALENDLY-CLOSER-SIN-LEAD]` | Ventas | Alta | Los turnos del Calendly de cada closer no entran al seguimiento |
| `[CALENDLY-CRONS-SUPERPUESTOS]` | Ventas | Media | `calendly-sync` y `calendly-sync-closers` corren a la misma hora |
| `[FATHOM-DEEP-ANALISIS-ALCANCE]` | Ventas | Alta | El análisis de venta corre sobre las llamadas equivocadas |
| `[CLOSING-CIERRE-ATOMICO]` | Ventas | Crítica | Cerrar una venta son cinco escrituras encadenadas desde el navegador |
| `[CLOSING-HOLDING-MEZCLA]` | Ventas | Alta | En modo holding, Closing mezcla turnos de varios negocios |
| `[PERMISOS-SERVER-ACTIONS/ventas]` | Ventas | Alta | (parte Ventas) Las actions del área no miran el rol |
| `[B-SEMBRAR-IDENTIDADES]` | Ventas | Alta | / [1-1-SEMBRAR-Y-MEDIR] `client_identities` sigue vacía |
| `[LLAMADAS-VERIFICAR-FATHOM]` | Ventas | Media | Cruce grabación ↔ turno con datos reales |
| `[COBROS-PROBAR]` | Ventas | Media | Cobros nunca se dibujó con una sesión real |
| `[COBROS-AVISAR-PERMISOS]` | Ventas | Baja | Quien no tiene Ventas deja de ver montos en Clientes |
| `[DR-BACKUPS-SUPABASE]` | Infraestructura, seguridad y tests (transversal) | Crítica | La base y los archivos de producción no tienen backups ni se ensayó nunca una restauración |
| `[PERMISOS-SERVER-ACTIONS/infra]` | Infraestructura, seguridad y tests (transversal) | Alta | Los roles no se hacen cumplir en la base ni en las actions (incluye AUD-SEG-1) |

## Índice por área

| Área | Doc | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| [Plataforma: auth, permisos, holding, super admin, panel, onboarding, UI y Discord](#plataforma-auth-permisos-holding-super-admin-panel-onboarding-ui-y-discord) | [`docs/areas/plataforma.md`](./docs/areas/plataforma.md) | 1 | 14 | 31 | 17 |
| [Clientes](#clientes) | [`docs/areas/clientes.md`](./docs/areas/clientes.md) | 0 | 8 | 15 | 11 |
| [Ventas](#ventas) | [`docs/areas/ventas.md`](./docs/areas/ventas.md) | 12 | 0 | 17 | 8 |
| [Marketing](#marketing) | [`docs/areas/marketing.md`](./docs/areas/marketing.md) | 0 | 7 | 19 | 5 |
| [Embudos y Lanzamientos](#embudos-y-lanzamientos) | [`docs/areas/embudos.md`](./docs/areas/embudos.md) | 0 | 6 | 15 | 7 |
| [Agente de negocio e IA](#agente-de-negocio-e-ia) | [`docs/areas/agente-ia.md`](./docs/areas/agente-ia.md) | 0 | 4 | 17 | 7 |
| [Operaciones, Finanzas y Producto](#operaciones-finanzas-y-producto) | [`docs/areas/operaciones.md`](./docs/areas/operaciones.md) | 0 | 7 | 15 | 9 |
| [Infraestructura, seguridad y tests (transversal)](#infraestructura-seguridad-y-tests-transversal) | [`docs/arquitectura/vision-general.md`](./docs/arquitectura/vision-general.md) | 2 | 19 | 44 | 13 |

---

## Plataforma: auth, permisos, holding, super admin, panel, onboarding, UI y Discord

Doc del área: [`docs/areas/plataforma.md`](./docs/areas/plataforma.md)

### Plataforma · P0

#### [PERMISOS-SERVER-ACTIONS] Los permisos por módulo no protegen datos, sólo pantallas
- **Tipo:** seguridad
- **Severidad:** Alta
- **Estado verificado:** **Parte A resuelta el 2026-09-29 (SCRUM-1):** `20260929100000_roles_equipo_y_config_en_la_base` agrega `current_user_has_org_role(roles)` y exige founder para escribir `team_roles`, para todo `team_invitations` (incluido leer el token) y para el UPDATE de `organizations`; founder o admin para el DELETE de `clients`. `lib/auth/require-org-role.ts` aplica lo mismo en las actions de configuración de la org, clave de Claude, `deleteClientAction` y los `disconnect*Action` de la org. Lo que sigue abierto es la parte B, descrita en el resto del ítem (permiso por módulo y nivel). Estado anterior: `getCurrentUserPermissions` sólo se usa en `app/(platform)/layout.tsx` y en componentes de navegación. Ninguna server action consulta `modules`. Ninguna policy RLS de datos de negocio mira `role` (todas `organization_id = get_my_organization_id()`); la excepción es `profiles`, cuyo UPDATE exige founder/admin para editar a otros y cuyo trigger `protect_profile_columns` impide cambiar el propio `role`/`organization_id`. Confirmado sin guard: `saveClaudeApiKeyAction` (`app/settings/actions.ts:438`), `saveGeneralOrganizationSettingsAction` (nombre, web, moneda y zona horaria de la org), `updateCloserCommissionAction` (`app/sales/closer-actions.ts:275`; sin guard en el código, pero usa `createClient()` y la policy de UPDATE de `profiles` + el trigger la frenan), los `disconnect*Action`, todas las de `app/discord/actions.ts`. `team_roles` tiene policies de insert/update/delete para cualquier miembro (`20260616400000_team_roles_permissions.sql`): un member puede editar los permisos de su propio rol por PostgREST.
- **Riesgo:** Si un member con un rol limitado quiere más acceso, entonces le alcanza con su JWT para hacer un PATCH a team_roles y darse todos los módulos, o para cambiar la clave de Claude, el nombre/moneda de la org o las comisiones de closers llamando la action. Es fácil para alguien con nociones técnicas y no deja rastro en la UI.
- **Impacto:** Toda organización con miembros que no son founder/admin: el esquema de roles no protege datos ni configuración. Confirmado en producción: team_roles, team_invitations y organizations tienen policies de escritura sólo por organization_id; profiles sí está protegido (trigger protect_profile_columns), así que no puede cambiarse su propio role ni su organización.
- **Qué hay que hacer:** (parte B) helper `requireModuleAccess(moduleId, level)` sobre `requireOrganizationId()` y aplicarlo en plata (finanzas, `updateCloserCommissionAction`), `app/discord/actions.ts` y los `connect*`/`save*` de integraciones, que todavía no piden rol; policies de escritura por rol en finanzas y en las tablas de integraciones editables por el usuario (`discord_integrations`, `unipile_integrations`). Equipo, configuración de la org, clave de Claude, desconectar integraciones y borrar clientes ya quedaron (parte A).
- **Criterio de aceptación:** Con un member cuyo rol tiene Finanzas, Integraciones y Ajustes en "sin acceso", invocar desde la consola saveClaudeApiKeyAction, un disconnect*Action, updateCloserCommissionAction y una acción de app/discord/actions.ts devuelve error de permiso y no cambia nada en la base; con su JWT, un PATCH a /rest/v1/team_roles sobre su propio rol es rechazado (y lo mismo para escrituras en team_invitations, organizations, finanzas y tablas de integraciones), mientras el founder sigue pudiendo hacerlo; hay un test unitario de requireModuleAccess con los niveles none/view/full
- **Dónde:** `apps/web/lib/auth/get-current-permissions.ts`, `apps/web/app/**/actions.ts`, `supabase/migrations/`.

### Plataforma · P1

#### [AUTH-MFA-Y-POLITICA] Sin MFA (ni para el super admin), sin protección contra contraseñas filtradas y con la configuración de Auth fuera del repo
- **Tipo:** seguridad
- **Severidad:** Alta
- **Estado verificado:** ningún uso de MFA en `apps/web` (grep `mfa|aal2|totp|two.?factor` vacío). Advisor de Supabase en prod: `auth_leaked_password_protection` desactivada. El signup acepta el mínimo de Supabase (el mensaje de `mapAuthError` dice 6, `apps/web/app/auth/actions.ts:39`); el cambio forzado pide 8 (`app/auth/force-password-change/actions.ts:6`) y `/auth/update-password` pide 8 sólo en el navegador. No existe `supabase/config.toml`: duración del JWT, rotación de refresh tokens, confirmación de email y de cambio de email, y signups habilitados no están versionados ni documentados. El login del super admin tiene su propio contador (`signin-superadmin:<email>`, `app/auth/actions.ts:175`), así que un email admite 10 intentos cada 15 min entre los dos formularios.
- **Riesgo:** Si la contraseña del super admin o de un founder se filtra en otro sitio (reuso de contraseñas), entonces alcanza con ella para entrar; el rate limit por email (`[LOGIN-RATE-LIMIT]`) no frena probar una lista de contraseñas filtradas contra muchos emails. Probabilidad media: es el ataque más común contra paneles SaaS.
- **Impacto:** Super admin: todas las orgs. Founder: su org, sus integraciones y su BYOK.
- **Qué hay que hacer:** en Supabase → Authentication, activar la protección contra contraseñas filtradas y un mínimo de 8 caracteres; MFA TOTP obligatorio para el super admin (enrolamiento + chequeo de `aal2` en `requireSuperAdmin` y en el layout del panel) y ofrecido a founders; documentar la configuración de Auth vigente en `docs/operacion/entorno-y-deploy.md` (o versionarla en `supabase/config.toml`).
- **Criterio de aceptación:** Un signup o cambio de contraseña con una contraseña conocida como filtrada o de menos de 8 caracteres es rechazado; el super admin no puede abrir ninguna pantalla de `/super-admin` ni ejecutar sus actions sin haber pasado el segundo factor en esa sesión (`aal2`); el advisor ya no reporta `auth_leaked_password_protection`; la duración del JWT, la rotación de refresh tokens y las confirmaciones de email quedaron anotadas en `docs/operacion/entorno-y-deploy.md`
- **Dónde:** Supabase Auth (dashboard), `apps/web/lib/auth/require-super-admin.ts`, `apps/web/app/(super-admin)/super-admin/layout.tsx`, `apps/web/app/auth/actions.ts`, `docs/operacion/entorno-y-deploy.md`.

Prioridad sugerida P1: el super admin con contraseña sola es la llave de todas las orgs; activar la protección y el mínimo es un cambio de configuración.

#### [AUTH-ALTA-EMAIL-AJENO] Un founder puede crear cuentas confirmadas para cualquier email, y el super admin se decide por email
- **Tipo:** seguridad
- **Severidad:** Crítica
- **Estado verificado:** `inviteTeamMemberAction` (`apps/web/app/team/actions.ts:263-301`) llama `admin.auth.admin.createUser({ email, password: tempPassword, email_confirm: true })` y devuelve `tempPassword` al founder que invita, sin verificar que el email sea de la persona. Lo mismo hacen `addBusinessToMyHoldingAction` (`app/(platform)/holding/actions.ts:174-204`) y las altas del super admin (`app/super-admin/actions.ts:127,197,724`). Para invitar alcanza con ser founder (`requireManagerProfile`), y con `[SIGNUP-PUBLICO]` cualquiera puede serlo. `isSuperAdminEmail` (`apps/web/lib/auth/require-super-admin.ts:6-17`) da acceso al panel interno a todo usuario cuyo `user.email` esté en `super_admin_users`, sin mirar `email_confirmed_at` ni el id. Prod (conteo agregado, 2026-09-23): 1 email en la allowlist, con cuenta confirmada; 0 sin cuenta.
- **Riesgo:** Si se agrega a `super_admin_users` un email que todavía no tiene cuenta (p. ej. al sumar a alguien del staff antes de que entre), entonces cualquier founder que lo conozca o lo adivine lo invita a su org, recibe la contraseña temporal, entra y el middleware lo manda a `/super-admin`. Aun sin super admin de por medio, cualquier founder puede ocupar el email de otra persona (cuenta confirmada que esa persona ya no puede crear) y hacerse pasar por ella. Hoy la parte de super admin no es explotable (0 emails sin cuenta).
- **Impacto:** Toma del panel interno: todas las orgs, bajas, add-ons, claves BYOK de clientes (`[IA-CLAVE-DE-CLIENTE-EN-SUPERADMIN]`). Suplantación de identidad entre equipos.
- **Qué hay que hacer:** (1) identificar al super admin por `user_id` (FK a `auth.users`) en vez de por email, o como mínimo exigir `email_confirmed_at` y que la cuenta no venga de una invitación de org; (2) hecho: desde el 2026-10-02 (SCRUM-494) el alta sigue `docs/operacion/alta-super-admin.md`, primero la cuenta y después la allowlist; (3) invitaciones por mail (`auth.admin.inviteUserByEmail` o link de un solo uso) en vez de cuentas confirmadas con contraseña visible, o `email_confirm: false` hasta que la persona confirme.
- **Criterio de aceptación:** Con un email agregado a `super_admin_users` que no tiene cuenta, un founder que lo invita a su org no obtiene acceso a `/super-admin` (la invitación falla o la cuenta queda sin acceso hasta que el dueño del email confirme); `requireSuperAdmin` rechaza a un usuario con email en la allowlist pero sin `email_confirmed_at` (o con otro `user_id`); invitar a un miembro no entrega una cuenta usable sin que la persona confirme su email; hay un test de `requireSuperAdmin`/`isSuperAdmin` con esos casos
- **Dónde:** `apps/web/lib/auth/require-super-admin.ts`, `apps/web/app/team/actions.ts`, `apps/web/app/(platform)/holding/actions.ts`, `apps/web/app/super-admin/actions.ts`, `super_admin_users` (migración).

Prioridad sugerida P1: la severidad es Crítica, pero la toma del super admin exige una condición que hoy no se da; la suplantación entre equipos sí se puede hoy.

#### [AUTH-RECUPERAR-PASSWORD] (nuevo) "¿Olvidaste tu contraseña?" no hace nada
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** el link de `components/auth/supabase-login-form.tsx` (y `login-screen.tsx`) es `href="#"` con `preventDefault`. `resetPasswordForEmail` no aparece en el código: existen `/auth/recover` y `/auth/update-password`, pero nada manda el mail de recuperación. **Escondido para el release de octubre (SCRUM-490, 2026-10-02)**: la pieza no se muestra; volver a mostrarla es una bandera en `apps/web/lib/release/escondido.ts`. El pendiente sigue abierto.
- **Riesgo:** Si un usuario olvida su contraseña, entonces no tiene forma de recuperarla solo y queda afuera hasta que alguien le resetee el acceso a mano. Pasa seguro cada vez que alguien la olvida.
- **Impacto:** Cualquier usuario de cualquier org; hay workaround (el founder o el super admin le asignan una contraseña temporal) pero genera soporte manual y bloquea al founder si es él quien la olvida.
- **Qué hay que hacer:** pantalla o modal que pida el mail y llame a `supabase.auth.resetPasswordForEmail` con `redirectTo` a `/auth/callback?next=/auth/update-password`; mensaje neutro (no revelar si el mail existe).
- **Criterio de aceptación:** Desde /login, "¿Olvidaste tu contraseña?" pide un mail y muestra un mensaje neutro exista o no la cuenta; el mail llega y su link lleva a /auth/update-password, donde la nueva contraseña queda guardada y permite entrar; un mail inexistente no revela que no existe.
- **Dónde:** `apps/web/components/auth/supabase-login-form.tsx`, `apps/web/app/auth/`.

#### [PERMISOS-LAYOUT-NAV-SUAVE] El bloqueo por módulo vive en un layout que no se re-renderiza al navegar (nuevo)
- **Tipo:** seguridad / verificación manual
- **Severidad:** Alta
- **Estado verificado:** el chequeo `sinAcceso` está en `app/(platform)/layout.tsx` leyendo `x-pathname`. En App Router los layouts compartidos no se re-renderizan en navegaciones cliente; la paleta ⌘K (`routes/navigation.ts` → `buildPlatformNavigation()`) lista todos los módulos sin filtrar permisos ni add-ons. Muy probable que `Cmd+K → Finanzas` muestre la pantalla a un rol sin acceso.
- **Riesgo:** Si un member sin acceso a un módulo usa ⌘K o un link interno, entonces muy probablemente ve la pantalla completa (por ejemplo Finanzas) sin ningún conocimiento técnico. Es el camino más fácil de todos los de permisos.
- **Impacto:** Todas las orgs que usan roles con módulos en «sin acceso»: la restricción se saltea desde la propia interfaz; no cruza organizaciones.
- **Qué hay que hacer:** verificar en navegador; si se confirma, mover el chequeo a cada `page.tsx` (o a un layout por módulo) y filtrar la paleta con `canSeeNavItem`.
- **Criterio de aceptación:** Se ejecutó el paso 5 del bloque «Permisos por módulo» de verificacion-manual.md con un member sin acceso a Finanzas y el resultado quedó anotado; si falló, abrir Finanzas desde ⌘K o desde un link interno estando en /dashboard muestra «No tenés acceso» igual que tipeando la URL; la paleta ⌘K de ese member no lista Finanzas
- **Dónde:** `apps/web/app/(platform)/layout.tsx`, `apps/web/components/navigation/command-palette.tsx`, `apps/web/routes/navigation.ts`.

#### [PERMISOS-FOUNDER-AREA] `/founder` no pasa por el bloqueo de permisos (nuevo)
- **Tipo:** seguridad
- **Severidad:** Media
- **Estado verificado:** `module-for-path.ts` mapea `/founder` → `operations`, pero la ruta vive en `app/(founder)/`, cuyo layout (`layouts/founder-layout.tsx`) no chequea nada. El test de `module-for-path` sólo recorre `app/(platform)`.
- **Riesgo:** Si un member sin acceso a Operaciones abre /founder, entonces ve el resumen de inteligencia del negocio (snapshot de métricas) pensado para el founder. Basta tipear la URL.
- **Impacto:** Miembros de cualquier org con roles limitados; es una sola pantalla de lectura y esos datos ya son legibles por RLS, por eso el daño adicional es acotado.
- **Qué hay que hacer:** mover `/founder` bajo `(platform)` o replicar el chequeo en `app/(founder)/layout.tsx`; extender el test a `(founder)`.
- **Criterio de aceptación:** Un member sin acceso a Operaciones que abre /founder ve la pantalla de «No tenés acceso»; el founder sigue viendo /founder; el test de module-for-path recorre también las rutas de app/(founder) y pasa
- **Dónde:** `apps/web/app/(founder)/`, `apps/web/lib/navigation/module-for-path.ts`.

#### [HOLDING-PORTFOLIO-ROL] El portfolio del holding no mira el rol
- **Tipo:** seguridad
- **Severidad:** Crítica
- **Estado verificado:** policies `holding_reads_portfolio_*` (`20260630100000`) sin rol; `resolveEffectiveOrganizationId` valida la cookie/header contra `holding_businesses` pero no contra `canManageHolding`, así que cualquier miembro del holding que setee la cookie a mano ve pantallas del negocio (las lecturas de `clients`, `closing_calls`, `conversations` y `organizations` pasan por las policies de portfolio; las escrituras con `createClient()` las rechaza RLS porque el claim `active_business_org_id` sólo lo setea `enterBusinessAction`, que sí exige `canManageHolding`). **Pero** toda action que usa `requireOrganizationId()` + `createAdminClient()` sí escribe en el negocio, y también lee más allá de las 4 tablas de portfolio. Ejemplos:
- `saveClaudeApiKeyAction` y `removeClaudeApiKeyAction` (`app/settings/actions.ts:446-498`);
- los `disconnect*Action` (`app/integrations/actions.ts`);
- `connectPaymentProviderAction`;
- `createDocumentFromFileAction` y `deleteDocumentAction` (`app/business-context/actions.ts`);
- `recordClientPaymentAction` y `getClientPaymentReceiptUrlAction`;
- `getClientOneOnOnesAction`, que devuelve transcripts, porque su chequeo de `clients` pasa por la policy de portfolio.

Y no hace falta la cookie: `lib/supabase/middleware.ts:61-65` sólo sobrescribe `x-active-org-id` cuando hay cookie, así que el header que manda el navegador llega intacto a `resolveEffectiveOrganizationId`, que lo prioriza. Esas mismas lecturas se pueden hacer por PostgREST sólo con el JWT, sin cookie.
- **Riesgo:** Si un holding tiene cualquier miembro que no es founder ni is_holding_admin, entonces ese miembro puede leer por PostgREST, sólo con su JWT y sin tocar cookies, los clientes, llamadas de cierre, conversaciones y datos de organización de todos los negocios activos del portfolio (policies de producción con get_my_holding_business_org_ids(), que no mira rol). Con la cookie seteada a mano además ve esas pantallas de los negocios.
- **Impacto:** Datos personales de clientes y conversaciones de las organizaciones de negocio expuestos a personas que esas organizaciones no autorizaron; alcance: cada holding con miembros no administradores (no se contó en producción por la regla de no leer filas).
- **Qué hay que hacer:** exigir `canManageHolding` en `resolveEffectiveOrganizationId` y en `get_my_holding_business_org_ids()`. Además, que el middleware borre siempre el `x-active-org-id` entrante antes de setearlo desde la cookie. En prod las policies se llaman `Users read own or portfolio clients`, `Users read own or portfolio closing calls`, `Users read own or portfolio conversations` y `Users read own or linked business orgs` (consolidadas; en el repo son las `holding_reads_portfolio_*`): si el arreglo cambia policies, tiene que tocar esos nombres. Ver también `[DB-CLAIM-HOLDING-SIN-REVALIDAR]` (el hook tampoco mira el rol).
- **Criterio de aceptación:** Un miembro del holding que no es founder ni is_holding_admin, con la cookie limitless_active_org seteada a mano a un negocio, sigue viendo los datos del holding y no los del negocio; con su JWT no puede leer por PostgREST clientes, llamadas ni conversaciones de los negocios del portfolio; el founder del holding sigue entrando y leyendo el portfolio como antes
- **Dónde:** `apps/web/lib/holding/resolve-org.ts`, migración nueva.

#### [DISCORD-VINCULAR-EMAIL-AJENO] `!vincular` acepta el email de otro alumno (nuevo, amplía auditoría §3.10)
- **Tipo:** seguridad
- **Severidad:** Media
- **Estado verificado:** `apps/discord-bot/src/handlers/link-handler.ts` vincula con cualquier email exacto de un cliente de la org, sin confirmar que la persona sea dueña. Con el bot hablando, además auto-vincula por nombre visible >0.85 (dato que controla el usuario).
- **Riesgo:** Si un alumno escribe !vincular con el email de otro alumno de la misma org (o con el bot hablando pone un nombre visible parecido), entonces sus mensajes y testimonios se atribuyen a ese otro cliente, y con el bot hablando le responde con el nombre del cliente. Requiere conocer el email exacto o imitar el nombre.
- **Impacto:** Clientes de las orgs con el bot de Discord instalado: actividad, testimonios y señales de salud atribuidos a la persona equivocada; el bot no devuelve datos del cliente más allá del nombre y no cruza organizaciones.
- **Qué hay que hacer:** mandar el match por email también al buzón (o confirmar por mail); quitar el auto-vínculo por nombre.
- **Criterio de aceptación:** Escribir !vincular <email de otro cliente> desde una cuenta de Discord cualquiera no crea el vínculo: queda en el buzón de vinculaciones pendientes (o pendiente de confirmación por mail); un nombre visible parecido al de un cliente ya no vincula automáticamente con el bot hablando; hay un test del árbol de decisión de !vincular con esos casos
- **Dónde:** `apps/discord-bot/src/handlers/link-handler.ts`.

#### [DISCORD-VINCULO-SIN-REATRIBUIR] Resolver el buzón no reasigna los mensajes viejos (nuevo)
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** `linkDiscordClientManuallyAction` (`app/discord/actions.ts:1227`) hace upsert en `discord_client_links` sin llamar `recalcularAtribucion`; `linkDiscordPersonAction` sí (línea 908). El `!vincular` del bot tampoco reatribuye. La actividad de la ficha filtra por `discord_messages.client_id`, así que los mensajes previos no aparecen.
- **Riesgo:** Si una vinculación se resuelve desde el buzón o con !vincular, entonces los mensajes previos de esa persona siguen sin cliente y no aparecen en su ficha. Pasa en cada vinculación posterior a la primera actividad.
- **Impacto:** Historial de Discord incompleto en la ficha del cliente (y en lo que se calcule sobre él) en las orgs con el bot; hay workaround: vincular desde la pantalla de personas, que sí reatribuye.
- **Qué hay que hacer:** llamar `recalcularAtribucion(supabase, org, { discordUserId })` en `linkDiscordClientManuallyAction`; para el bot, reatribuir en `saveClientLink` o en un paso del cron.
- **Criterio de aceptación:** Resolver una vinculación desde el buzón hace que en la ficha del cliente aparezcan los mensajes que esa persona escribió antes del vínculo; lo mismo después de un !vincular exitoso en el bot (en el momento o tras el cron); se ejecutó el paso 6 del bloque «Discord — canales y personas» de verificacion-manual.md y quedó anotado
- **Dónde:** `apps/web/app/discord/actions.ts`, `apps/discord-bot/src/lib/supabase.ts`.

#### [E-RETENCION] Retención de mensajes de terceros en Discord
- **Tipo:** decisión de negocio
- **Severidad:** Media
- **Estado verificado:** no hay borrado ni TTL sobre `discord_messages`; no hay aviso en el servidor.
- **Riesgo:** Si el bot se instala en el servidor de un cliente sin plazo de retención ni aviso, entonces se guardan indefinidamente mensajes de terceros que no saben que se almacenan, con exposición legal (Ley 25.326 / GDPR si hay miembros en la UE) y más volumen expuesto ante cualquier fuga.
- **Impacto:** Miembros de los servidores de Discord donde esté el bot y la org cliente como responsable del dato; alcance actual depende de en cuántos servidores está instalado (no verificado).
- **Qué hay que hacer:** decidir plazo y aviso antes de instalar el bot en el servidor de un cliente; implementar un cron de purga.
- **Criterio de aceptación:** Agustín decidió el plazo de retención de los mensajes de Discord y el aviso a mostrar en el servidor, y la decisión quedó registrada en docs/areas/discord.md; existe un cron que borra de discord_messages los mensajes más viejos que ese plazo y, corrido en una org de prueba, deja sólo los mensajes dentro del plazo
- **Dónde:** `discord_messages`, `apps/web/app/api/cron/`.

#### [SIGNUP-PUBLICO] Cualquiera puede crearse una org founder (nuevo)
- **Tipo:** decisión de negocio / seguridad
- **Severidad:** Alta
- **Estado verificado:** `/login` tiene toggle "Crear cuenta" → `signUpAction` → `ensureUserBootstrap` crea org + founder. Esa org usa la `ANTHROPIC_API_KEY` global.
- **Riesgo:** Si alguien descubre el toggle «Crear cuenta», entonces puede crear organizaciones founder sin límite (rate limit sólo por email) y usar el agente de IA con la ANTHROPIC_API_KEY global, que no tiene cupo por organización. Es trivial de hacer.
- **Impacto:** Costo de IA de Limitless sin techo ni cobro asociado, y orgs basura en la base; no expone datos de otras orgs.
- **Qué hay que hacer:** decidir si el alta es sólo por super admin/trial. Si sí: sacar el toggle y el action, y desactivar signups en Supabase Auth. Si sigue abierta: rate limit por IP además de por email, mensaje neutro ("si el email es válido te llega un correo") en vez de "Ya existe una cuenta", no devolver el mensaje crudo de Supabase, y resolver antes `[AUTH-ALTA-EMAIL-AJENO]`.
- **Criterio de aceptación:** Agustín decidió si el alta de cuentas founder es pública o sólo por super admin/prueba y la decisión quedó registrada en docs/arquitectura/auth-organizaciones-y-permisos.md; si es cerrada: /login ya no muestra «Crear cuenta», llamar signUpAction falla y el signup está desactivado en Supabase Auth
- **Dónde:** `apps/web/components/auth/supabase-login-form.tsx`, `apps/web/app/auth/actions.ts`.

#### [LOGIN-RATE-LIMIT] Login sin captcha tras varios fallos
- **Tipo:** seguridad
- **Severidad:** Baja
- **Estado verificado:** desde el 2026-09-30 (SCRUM-24) el login cuenta por IP + email (5 cada 15 min) y por IP (30 cada 15 min, entre todos los emails y los dos logins), en `lib/auth/limite-login.ts`: un tercero ya no bloquea a otro desde su IP y probar contra muchos emails desde la misma IP queda frenado. Falta la otra mitad del ítem original: no hay captcha después de N fallos. Agregarlo suma un proveedor externo y un paso nuevo en el login (funcionalidad nueva), así que se separó.
- **Riesgo:** Si un atacante reparte los intentos entre muchas IPs, entonces el límite por IP no lo frena y sólo queda el límite propio de Supabase Auth. Además, quien comparte IP con un atacante (NAT, CGNAT) puede quedar bloqueado 15 minutos después de 30 intentos desde esa IP, y los logins exitosos también cuentan; un captcha permitiría bajar la dependencia del límite por IP.
- **Impacto:** Adivinar contraseñas desde muchas IPs queda acotado por Supabase Auth, no por la app.
- **Qué hay que hacer:** decidir con el PO si se agrega captcha (proveedor, desde cuántos fallos) y hacerlo.
- **Criterio de aceptación:** Después de N fallos desde una IP o contra un email, el login pide captcha y sin resolverlo no deja intentar; un login normal no lo pide.
- **Dónde:** `apps/web/app/auth/actions.ts`, `apps/web/lib/auth/limite-login.ts`, pantalla de login.
#### [BAJAS-SIN-PROBAR] La baja del super admin nunca se ejecutó entera
- **Tipo:** verificación manual
- **Severidad:** Media
- **Estado verificado:** código completo en `app/super-admin/delete-actions.ts` y `lib/super-admin/execute-deletion.ts`; CHANGES no registra una ejecución real.
- **Riesgo:** Si se ejecuta la baja por primera vez en una org real y algún paso falla (una FK sin cascade, un bucket no listado, deleteUser que falla), entonces quedan archivos o cuentas de login activas del cliente dado de baja; el proceso es irreversible y reporta los problemas, pero nadie lo vio correr.
- **Impacto:** Cada org que se dé de baja: posibles datos o accesos residuales de un ex cliente. El borrado está acotado por id de la organización, así que no se ve riesgo de borrar otra org.
- **Qué hay que hacer:** bloque "Bajas" de `docs/operacion/verificacion-manual.md` § Plataforma.
- **Criterio de aceptación:** Se ejecutó el bloque «Bajas del super admin» de verificacion-manual.md con una org descartable y el resultado de cada paso quedó anotado (en particular: el founder dado de baja no puede entrar, no quedan archivos en Storage y super_admin_deletions tiene la fila con problemas vacío); si algo falló, se abrió un ítem nuevo
- **Dónde:** super admin → organizaciones → baja.

#### [DISCORD-SIN-PROBAR] Canales, equipo, sugerencias y atribución sin probar
- **Tipo:** verificación manual
- **Severidad:** Media
- **Estado verificado:** migraciones aplicadas; ningún registro de prueba en CHANGES.
- **Riesgo:** Si canales, equipo, sugerencias o atribución fallan en un servidor real, entonces los mensajes se atribuyen mal o no se guardan sin que nadie lo note hasta mirar una ficha.
- **Impacto:** Orgs que usen la integración de Discord: actividad de clientes incompleta o mal atribuida; módulo secundario frente a ventas y clientes.
- **Qué hay que hacer:** bloque "Discord — canales y personas" de `docs/operacion/verificacion-manual.md` § Plataforma.
- **Criterio de aceptación:** Se ejecutó el bloque «Discord — canales y personas» de verificacion-manual.md con el bot desplegado y un servidor real, y el resultado de cada paso quedó anotado; si algo falló, se abrió un ítem nuevo
- **Dónde:** `/integrations/discord`.

#### [PERMISOS-VERIFICAR-SESION] Probar el bloqueo con un rol limitado (ex bloque de PLAN_VERIFICACION)
- **Tipo:** verificación manual
- **Severidad:** Alta
- **Estado verificado:** nunca se probó con una segunda cuenta.
- **Riesgo:** Si el bloqueo por módulo no funciona como se espera (hay indicios fuertes en PERMISOS-LAYOUT-NAV-SUAVE y PERMISOS-FOUNDER-AREA), entonces un member ve módulos que su rol tiene en «sin acceso» sin que el equipo lo sepa.
- **Impacto:** Todas las orgs que confían en roles limitados; lo que protege es la única barrera real entre roles hoy, porque RLS no mira el rol.
- **Qué hay que hacer:** bloque "Permisos por módulo" de `docs/operacion/verificacion-manual.md` § Plataforma.
- **Criterio de aceptación:** Se ejecutó el bloque «Permisos por módulo con un rol limitado» de verificacion-manual.md con una segunda cuenta member y el resultado de cada paso quedó anotado; si algo falló, se abrió un ítem nuevo
- **Dónde:** `/team/roles`, sesión de member.

### Plataforma · P2

#### [DB-CLAIM-HOLDING-SIN-REVALIDAR] Quien pierde el permiso de holding sigue operando dentro del negocio
- **Tipo:** seguridad
- **Severidad:** Crítica
- **Estado verificado:** `custom_access_token_hook` (prod; `supabase/migrations/20260620100000_holding_jwt_claim_hook.sql`) agrega `active_business_org_id` al JWT si existe fila en `holding_active_sessions` para el perfil y el vínculo de `holding_businesses` está `active`; no mira `role` ni `is_holding_admin`. `get_my_organization_id()` devuelve ese claim sin revalidar nada, y todas las policies de escritura lo usan. `enterBusinessAction` exige `canManageHolding` sólo al entrar; la fila de `holding_active_sessions` se borra sólo en `exitBusinessAction` y `signOutAction` (`docs/arquitectura/auth-organizaciones-y-permisos.md`, "Holding: qué org ve cada request"). La duración del JWT no se pudo leer (config de Auth, no SQL).
- **Riesgo:** Si a un admin del holding le sacan `is_holding_admin` (o deja de ser founder) mientras está dentro de un negocio, entonces cada refresh del token le vuelve a poner el claim y sigue leyendo y escribiendo todo el negocio por PostgREST (y por la app mientras dure la cookie). Si se desactiva el vínculo holding–negocio, el claim sigue valiendo hasta que vence el JWT (default de Supabase: 1 h). Requiere que la persona haya sido admin y haya entrado al negocio antes.
- **Impacto:** Una persona que el holding ya no autoriza conserva acceso completo de org (clientes, ventas, finanzas) a un negocio que es otra organización. Alcance: holdings con más de un admin; hoy pocos.
- **Qué hay que hacer:** que el hook exija que el perfil sea founder o `is_holding_admin` del holding; borrar `holding_active_sessions` del perfil al cambiarle rol o `is_holding_admin` y al desactivar un vínculo; opcional: que `get_my_organization_id()` revalide el vínculo activo.
- **Dónde:** `custom_access_token_hook`, `get_my_organization_id()` (migración nueva), `apps/web/app/(platform)/holding/actions.ts`, `apps/web/app/team/actions.ts`.

Prioridad sugerida P2: daño Crítico pero la condición es rara (degradar a un admin que está dentro de un negocio) y la población de holdings es chica.

#### [DISCORD-BOT-SIN-RECUPERACION] Si el bot de Discord se cae, los mensajes de ese rato se pierden
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** el bot sólo escucha `messageCreate` (`apps/discord-bot/src/index.ts`); al arrancar no recupera historial (`src/events/ready.ts` hace un diagnóstico); un error al guardar sólo va a `console.error` (`src/lib/supabase.ts:168-172`); no tiene Sentry. `touchIntegrationEvent` guarda la última actividad por servidor pero nada la compara.
- **Riesgo:** Si Railway reinicia el servicio, un deploy falla o el token se invalida, entonces todos los mensajes de ese período se pierden (Discord no reenvía eventos del gateway) y nadie se entera.
- **Impacto:** Wins, señales de `daily-signals` y atribución de mensajes a clientes con huecos, en todas las orgs con Discord conectado.
- **Qué hay que hacer:** al arrancar (y periódicamente), pedir a la API de Discord los mensajes posteriores al último `discord_message_id` guardado por canal monitoreado (el upsert por `discord_message_id` ya deduplica); alerta si un servidor conectado pasa N horas sin eventos (ver `[OBS-SIN-ALERTAS]`).
- **Dónde:** `apps/discord-bot/src/events/ready.ts`, `apps/discord-bot/src/lib/supabase.ts`.

#### [UI-PAGINAS-DE-ERROR] No hay páginas de error propias: ante una falla se ve la pantalla genérica de Next
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** en `apps/web/app` no existe ningún `error.tsx` ni `global-error.tsx` (sólo `not-found.tsx`). `instrumentation.ts` captura errores del servidor con `onRequestError`, pero los errores de render del navegador no pasan por `global-error.tsx`, que es la vía que recomienda `@sentry/nextjs`.
- **Riesgo:** Si Supabase o una API cae, o un Server Component tira, entonces el usuario ve "Application error: a server-side exception has occurred" en inglés, sin forma de reintentar ni saber si perdió lo que estaba cargando; algunos errores del navegador no llegan a Sentry.
- **Impacto:** Todos los usuarios durante cualquier incidente.
- **Qué hay que hacer:** `app/global-error.tsx` (con `Sentry.captureException`) y `error.tsx` en el layout de plataforma, copy en español, botón de reintentar y sin mostrar el error interno.
- **Dónde:** `apps/web/app/global-error.tsx`, `apps/web/app/(platform)/error.tsx`.

Prioridad sugerida P2: no pierde datos; mejora mucho la experiencia en un incidente y es chico.

#### [BAJA-ORG-SIN-RESPALDO] La baja de una organización borra todo sin exportación previa ni período de gracia
- **Tipo:** feature
- **Severidad:** Alta
- **Estado verificado:** `lib/super-admin/execute-deletion.ts` borra la fila de `organizations` (cascade sobre ~130 tablas), los archivos de 10 buckets y las cuentas de login; `super_admin_deletions` guarda quién, cuándo y el resultado, no los datos. No hay exportación ni papelera. Con el plan Free no hay backup (`[DR-BACKUPS-SUPABASE]`). Existe la alternativa reversible de pausar (`app/super-admin/actions.ts:294`).
- **Riesgo:** Si un super admin da de baja la org equivocada, o un cliente dado de baja pide volver, entonces sus datos y archivos no se pueden recuperar. La confirmación por nombre exacto reduce, pero no elimina, el error humano.
- **Impacto:** La org dada de baja: todo su historial.
- **Qué hay que hacer:** antes de borrar, exportar la org (JSON de sus filas por tabla + copia de sus archivos) a un bucket privado de respaldo con retención definida; o bien baja en dos pasos: "pausada para baja" durante N días y borrado real después.
- **Dónde:** `apps/web/lib/super-admin/execute-deletion.ts`, `apps/web/app/super-admin/delete-actions.ts`.

Prioridad sugerida P2: hoy hay pocas bajas y está la pausa como alternativa; relacionado con `[BAJAS-SIN-PROBAR]`.

#### [ONBOARDING-GATE-DEFAULTS-PRESELECCIONADOS] El gate muestra moneda y zona horaria ya elegidas (nuevo)
- **Tipo:** bug
- **Estado verificado:** la migración `20260831130000_organizations_drop_unit_defaults.sql` sacó los defaults de `organizations.currency/timezone/language` para que un null signifique "nadie lo eligió" y el gate lo pregunte. Pero `getOnboardingGateDefaultsAction` (`apps/web/app/onboarding/actions.ts:42-72`) rellena el null con `USD` / `America/Argentina/Buenos_Aires` / `es`, y los `<select>` de `components/onboarding/onboarding-gate.tsx:237-266` no tienen opción vacía: el founder ve USD y Buenos Aires preseleccionados y puede avanzar sin elegir (la validación de la línea 91 sólo mira que haya valor). Es el mismo problema que la migración quiso cerrar, movido a la UI.
- **Qué hay que hacer:** que el default del gate sea vacío cuando la columna está en null (opción "Elegí…" sin valor) y que el botón no avance hasta elegir.
- **Dónde:** `apps/web/app/onboarding/actions.ts`, `apps/web/components/onboarding/onboarding-gate.tsx`. Paso 2 del bloque 2 de `docs/operacion/verificacion-manual.md` § Plataforma.

#### [NOTIFICACIONES-EMAIL-SIN-ENVIO] (nuevo) Las preferencias de notificación no mandan nada
- **Tipo:** bug
- **Estado verificado:** Ajustes guarda 9 switches (5 de mail y 4 en la app) en `notification_preferences`, pero sólo `app/settings/actions.ts` lee esa tabla; ningún proceso manda mails según ellos. `sendWelcomeEmail` (Resend) no tiene llamador, aunque `docs/areas/plataforma.md` lista mails de bienvenida. **Escondido para el release de octubre (SCRUM-490, 2026-10-02)**: la pieza no se muestra; volver a mostrarla es una bandera en `apps/web/lib/release/escondido.ts`. El pendiente sigue abierto.
- **Qué hay que hacer:** decidir qué notificaciones existen; implementarlas o sacar los switches de Ajustes. Llamar o borrar `sendWelcomeEmail`.
- **Dónde:** `apps/web/app/settings/actions.ts`, `apps/web/components/settings/`, `apps/web/lib/email.ts`.

#### [DISCORD-DESCONECTAR-SIN-UI] (nuevo) Discord no se puede desconectar desde la pantalla
- **Tipo:** bug
- **Estado verificado:** `disconnectDiscordIntegrationAction` (`app/discord/actions.ts:1288`) no tiene llamador ni está en el mapa `DISCONNECT` de `components/integrations/integration-connect-actions.tsx`.
- **Qué hay que hacer:** sumar Discord al mapa `DISCONNECT` (con el guard de rol del ítem de permisos) y corregir `docs/areas/discord.md`.
- **Dónde:** `apps/web/components/integrations/integration-connect-actions.tsx`, `apps/web/app/discord/actions.ts`.

#### [DEMO-LAYOUT-500] El layout de plataforma rompe sin Supabase
- **Tipo:** bug
- **Estado verificado:** `getHoldingSessionState()` (`lib/holding/session.ts:26`) llama `createClient()` sin chequear `isSupabaseConfigured()`; `createClient` tira por `getSupabaseUrl()`.
- **Qué hay que hacer:** devolver valores neutros en `getHoldingSessionState`, `getCurrentUserPermissions`, `getCurrentOnboardingContext` sin Supabase.
- **Dónde:** `apps/web/lib/holding/session.ts`, `apps/web/lib/auth/get-current-permissions.ts`.

#### [ADDONS-HOLDING] Add-ons de UI y de servidor salen de orgs distintas en un holding (nuevo)
- **Tipo:** bug
- **Estado verificado:** `getCurrentUserPermissions` lee `enabled_add_ons` de `profile.organization_id`; `lib/auth/add-ons.ts` usa la org efectiva. Un holding mirando un negocio ve la nav del holding y el servidor aplica los add-ons del negocio.
- **Qué hay que hacer:** leer los add-ons de `requireOrganizationId()` en `getCurrentUserPermissions`.
- **Dónde:** `apps/web/lib/auth/get-current-permissions.ts`.

#### [PERMISOS-SIN-ROL-NAV] Un member sin rol pasa el gate pero no ve ningún ítem (nuevo)
- **Tipo:** bug
- **Estado verificado:** layout: sin `hasRoleConfigured` no bloquea. Notch nav: `checkAccess` mira `modules` (todo `none`) → no muestra nada.
- **Qué hay que hacer:** decidir una política única (sin rol = acceso de lectura a todo, o forzar rol al invitar) y aplicarla en nav y layout.
- **Dónde:** `components/navigation/notch-nav/platform-notch-nav.tsx`, `app/(platform)/layout.tsx`, `app/team/actions.ts`.

#### [ONBOARDING-SKIP-SIN-UI] La salida del gate no tiene botón (nuevo)
- **Tipo:** feature
- **Estado verificado:** `skip_onboarding` sólo se setea al crear negocios de holding (`app/(platform)/holding/actions.ts:146`, `onboarding/holding/actions.ts:183`). Ninguna acción de `app/super-admin` lo escribe, aunque la spec dice que "el super-admin la marca".
- **Qué hay que hacer:** toggle en el detalle de org del super admin (`updateOrgSkipOnboardingAction` con `requireSuperAdmin`).
- **Dónde:** `apps/web/app/super-admin/actions.ts`, `components/super-admin/organization-detail.tsx`.

#### [DASHBOARD-CODIGO-MUERTO] Métricas custom que se piden y no se dibujan + 10 componentes sin uso (nuevo)
- **Tipo:** deuda técnica
- **Estado verificado:** `app/(platform)/dashboard/page.tsx` llama `getCustomMetricsAction("dashboard")`; `DashboardPageContent` recibe `customMetrics` y no lo usa. Sin importadores: `ai-recommendations`, `alerts-intelligence`, `custom-metrics-section` (+ `custom-metric-builder`), `next-actions-strip`, `operational-metrics-section`; `executive-summary`, `opportunities-list`, `risks-list`, `weekly-changes` sólo se re-exportan.
- **Qué hay que hacer:** decidir si vuelve `CustomMetricsSection` al panel; si no, sacar la consulta y borrar los componentes.
- **Dónde:** `apps/web/components/dashboard/`.

#### [EMBUDO-PANEL-DMS] El embudo del panel no mide DMs
- **Tipo:** feature
- **Estado verificado:** `lib/metrics/build-sales-funnel-stages.ts` arranca en llamadas; `conversations` (inbox viejo) vacía.
- **Qué hay que hacer:** decidir qué se persiste del inbox de Zernio para contar DMs y respuestas.
- **Dónde:** `apps/web/lib/metrics/build-sales-funnel-stages.ts`, `components/dashboard/sales-funnel-strip.tsx`.

#### [CLIENT-HEALTH-LEGACY] El health score del super admin usa la tabla del inbox viejo (nuevo)
- **Tipo:** bug
- **Estado verificado:** `lib/super-admin/org-health.ts` suma 25 pts si hay filas en `conversations`, vacía desde Zernio. Tampoco pagina (techo de 1000 filas, auditoría §3 confiabilidad 2).
- **Qué hay que hacer:** redefinir las cuatro señales con fuentes vivas y contar en SQL.
- **Dónde:** `apps/web/lib/super-admin/org-health.ts`, `client-health.ts`.

#### [GLASS-TOKENS-PISADOS] `globals.css` pisa los tokens glass de `tokens.css` (nuevo)
- **Tipo:** bug (visual) / verificación manual
- **Estado verificado:** `globals.css` redefine `--glass-bg: rgba(255,255,255,0.03)`, `--glass-border`, `--glass-blur` en `:root` dentro de `@layer base`, emitido después de `tokens.css` y con igual especificidad que `.dark`. `.glass` usa `var(--glass-bg)`.
- **Qué hay que hacer:** confirmar en DevTools; decidir qué valor es el buscado y dejar una sola declaración.
- **Dónde:** `apps/web/app/globals.css:114`, `packages/ui/src/styles/tokens.css`.

#### [UI-EMOJIS] Emojis en la UI contra la regla de Lucide (nuevo)
- **Tipo:** deuda técnica
- **Estado verificado:** 20 archivos en `components/` con emojis/símbolos en JSX o strings de UI (p. ej. `sales/zernio-inbox-panel.tsx` y `zernio-side-panel.tsx` "🔥 Caliente", `sales/team-call-ranking.tsx` medallas, `settings/theme-selector.tsx`, `integrations/zernio-connect-modal.tsx`, `lanzamientos/launch-post-mortem-panel.tsx`, varios "✓").
- **Qué hay que hacer:** reemplazar por íconos Lucide; agregar regla de lint.
- **Dónde:** `apps/web/components/**`.

#### [NAV-PALETA-PERMISOS] La paleta ⌘K no filtra por permisos ni add-ons (nuevo)
- **Tipo:** bug
- **Estado verificado:** `components/navigation/command-palette.tsx` usa `platformNavigation` estático. Desde SCRUM-490 (2026-10-02) al menos no lista los hijos `hidden` del menú (`lib/navigation/build-platform-navigation.ts`); permisos y add-ons siguen sin filtrarse.
- **Qué hay que hacer:** construirla con `buildPlatformSidebarNav(enabledAddOns)` + `canSeeNavItem`.
- **Dónde:** `apps/web/components/navigation/command-palette.tsx`, `apps/web/routes/navigation.ts`.

#### [DIALOG-DOBLE-PADDING] Padding duplicado en los modales
- **Tipo:** deuda técnica
- **Estado verificado:** `packages/ui/src/primitives/dialog.tsx` con `p-6` en content y `px-6` en header/footer.
- **Qué hay que hacer:** decidir dónde vive el padding y recorrer los diálogos más usados.
- **Dónde:** `packages/ui/src/primitives/dialog.tsx`.

#### [UI-SIN-TESTS] `packages/ui` sin tests
- **Tipo:** tests
- **Estado verificado:** `packages/ui/package.json` sin script `test`.
- **Qué hay que hacer:** Vitest con `parse-metric-value` y `metric-trend`; fijar el caso "+77%" que pierde el signo.
- **Dónde:** `packages/ui/src/lib/`.

#### [DISCORD-PERMISOS] Configuración de Discord abierta a cualquier miembro
- **Tipo:** seguridad
- **Estado verificado:** `app/discord/actions.ts` sólo exige `requireOrganizationId()`; RLS `org_access` sin rol.
- **Qué hay que hacer:** cubrir con `[PERMISOS-SERVER-ACTIONS]` (módulo `integrations`, nivel `full`).
- **Dónde:** `apps/web/app/discord/actions.ts`.

#### [DISCORD-PERFIL-SIN-PROBAR] Nombre y foto del bot por servidor, nunca contra Discord
- **Tipo:** verificación manual
- **Estado verificado:** sólo tests con fetch mockeado (`lib/discord/__tests__/profile.test.ts`).
- **Qué hay que hacer:** bloque "Perfil del bot" de `docs/operacion/verificacion-manual.md` § Plataforma.
- **Dónde:** `/integrations/discord`.

#### [ONBOARDING-VERIFICAR] Gate, checklist, tours y panel de onboarding sin sesión real
- **Tipo:** verificación manual
- **Estado verificado:** construido y con tests puros (`lib/onboarding/__tests__/`, `lib/super-admin/__tests__/onboarding-progress.test.ts`); nunca se recorrió en un navegador con sesión real.
- **Qué hay que hacer:** bloques de onboarding de `docs/operacion/verificacion-manual.md` § Plataforma.
- **Dónde:** `/onboarding`, `/dashboard`, `/super-admin/onboarding`.

#### [NAV-1] Validar la notch nav con sesión real
- **Tipo:** verificación manual
- **Estado verificado:** sólo verificada con providers mockeados.
- **Qué hay que hacer:** recorrer en preview: pill activo, dropdowns, switcher holding, badge de clientes, perfil, drawer mobile; medir islas a 1280px con Operaciones y Producto activos.
- **Dónde:** `components/navigation/notch-nav/`.

#### [SETTINGS-CLOSER-POR-NOMBRE] "Mi Calendly" depende del nombre del rol (nuevo)
- **Tipo:** deuda técnica
- **Estado verificado:** `lib/settings/initial-data.ts:120` detecta closer si `team_roles.name` contiene "closer" (`toLowerCase().includes`), sin importar mayúsculas.
- **Qué hay que hacer:** usar `profiles.is_closer`/flag de multi-closer si existe, o un permiso explícito.
- **Dónde:** `apps/web/lib/settings/initial-data.ts`.

#### [INVITE-ROL-SIN-VALIDAR] `customRoleId` de invitación no se valida contra la org
- **Tipo:** seguridad
- **Estado verificado:** `inviteTeamMemberAction` guarda `custom_role_id: customRoleId` sin chequear `team_roles.organization_id` (sólo founder puede llamarla).
- **Qué hay que hacer:** validar pertenencia antes de insertar.
- **Dónde:** `apps/web/app/team/actions.ts:231`.

#### [ROL-MEMBER-SIN-CATALOGO] `member` no figura en el catálogo de roles (nuevo)
- **Tipo:** deuda técnica
- **Estado verificado:** invitados se crean con `role = 'member'`; no está en `VALID_ROLES` (`lib/team/mapper.ts`) ni en `constants/roles.ts`, que siguen listando `operator`/`viewer`/`setter` que ningún flujo crea.
- **Qué hay que hacer:** reducir el catálogo a `founder`/`member` (+ `admin` si se usa) y documentar.
- **Dónde:** `apps/web/constants/roles.ts`, `apps/web/lib/team/mapper.ts`, `packages/types`.

#### [TESTS-AUTH] Auth, holding y middleware sin tests (auditoría §3 salud 4)
- **Tipo:** tests
- **Estado verificado:** sin `__tests__` para `lib/auth/*`, `lib/holding/*`, `lib/rate-limit.ts`, `lib/supabase/middleware.ts`.
- **Qué hay que hacer:** extraer lo puro (decisiones de redirect, resolución de org efectiva) y testearlo.
- **Dónde:** `apps/web/lib/auth/`, `apps/web/lib/holding/`.

#### [DISCORD-BOT-SIN-TESTS] El bot no tiene tests (nuevo)
- **Tipo:** tests
- **Estado verificado:** `apps/discord-bot/package.json` sin script `test`; `attribution.ts`, `testimonial-handler.ts`, `link-handler.ts` sin cubrir.
- **Qué hay que hacer:** Vitest para atribución, pre-filtro de testimonios y árbol de `!vincular`.
- **Dónde:** `apps/discord-bot/src/`.

#### [INTEGRACIONES-PLAYWRIGHT] E2E del tablero de Integraciones
- **Tipo:** tests
- **Estado verificado:** sin spec en `e2e/`.
- **Qué hay que hacer:** filtrar por "requieren atención", abrir detalle, volver.
- **Dónde:** `apps/web/e2e/`.

#### [INTEGRACIONES-VERIFICAR] Incidencias del tablero con datos reales
- **Tipo:** verificación manual
- **Estado verificado:** incidencias derivan de columnas mayormente vacías.
- **Qué hay que hacer:** conectar VTurb/Hyros/WebinarJam con key inválida y ver que la tarjeta pase a "Con error" con texto accionable.
- **Dónde:** `/integrations`.

#### [LAYOUT-CAJONES] Revisar cuatro cajones laterales tras el arreglo de `transform`
- **Tipo:** verificación manual
- **Estado verificado:** sin registro de verificación.
- **Qué hay que hacer:** abrir retrospectiva de sprint, versiones de SOP, leads de UTM y llamadas del cliente.
- **Dónde:** workboard, SOPs, UTMs, ficha de cliente.

### Plataforma · P3

#### [DISCORD-BACKFILL] Los mensajes enviados mientras el bot está caído no se recuperan
- **Tipo:** feature
- **Severidad:** Media
- **Estado verificado:** `apps/discord-bot/src/events/ready.ts` sólo loguea al conectar (servidores, clave, acceso a datos); no pide el historial de los canales vinculados. Railway reinicia el bot `ON_FAILURE` hasta 10 veces (`apps/discord-bot/railway.json`).
- **Riesgo:** Si el bot se cae (Railway, deploy fallido, token revocado), entonces los mensajes de ese período nunca llegan a `discord_messages` ni a la clasificación de `daily-signals`.
- **Impacto:** Orgs con Discord conectado: huecos en el historial y en los hitos propuestos.
- **Qué hay que hacer:** al conectar, por cada canal vinculado, pedir los mensajes posteriores al último guardado (`channel.messages.fetch({ after })`) y procesarlos con el mismo handler, con dedupe por id de mensaje.
- **Dónde:** `apps/discord-bot/src/events/ready.ts`, `apps/discord-bot/src/handlers/message-handler.ts`.

#### [WAITLIST-HUERFANO] `/api/waitlist` sin llamador (nuevo)
- **Tipo:** deuda técnica
- **Estado verificado:** ningún componente llama `/api/waitlist` (la landing se borró); sigue pública en `public-paths.ts`.
- **Qué hay que hacer:** borrar la ruta o documentar quién la usa (¿formularios externos?).
- **Dónde:** `apps/web/app/api/waitlist/route.ts`.

#### [DISCORD-STUB-MESSAGE] `/api/discord/message` es un stub sin uso (nuevo)
- **Tipo:** deuda técnica
- **Estado verificado:** devuelve `{ ok: true }` tras autenticar; el bot no lo llama.
- **Qué hay que hacer:** borrarlo.
- **Dónde:** `apps/web/app/api/discord/message/route.ts`.

#### [UI-CODIGO-MUERTO] Componentes sin uso (nuevo)
- **Tipo:** deuda técnica
- **Estado verificado:** `components/marketing/marketing-subnav.tsx` sin importadores; `SidebarShell` sólo en el showcase; selector `button[class*="bg-violet"]` en `globals.css`.
- **Qué hay que hacer:** borrar.
- **Dónde:** archivos citados.

#### [DELETION-COMENTARIO-FK] Comentario falso sobre la FK de `profiles` (nuevo)
- **Tipo:** deuda técnica
- **Estado verificado:** `lib/super-admin/execute-deletion.ts` dice "`profiles` no tiene ninguna clave foránea a `auth.users`"; la tiene (`20260521000000`, `on delete cascade`) y la auditoría lo confirmó en prod. La lógica (borrar el login aparte) sigue siendo correcta.
- **Qué hay que hacer:** corregir el comentario.
- **Dónde:** `apps/web/lib/super-admin/execute-deletion.ts`.

#### [NAV-2] Renombrar `sidebar-modules.ts`

#### [NAV-3] Etiqueta "Fase 1 · Beta"

#### [FOUNDER-AREA] El Área del fundador es sólo el snapshot de Inteligencia

#### [BRAND-B] Licenciar Neue Haas Grotesk

#### [BRAND-C] Validar texto negro sobre naranja

#### [BRAND-D] Borrar la rama `brand-source`

#### [BRAND-E] Dominio

#### [CHART-A] Vista de tabla accesible para gráficos

#### [CHART-B] Embudo con etapas muy dispares

#### [UI-21ST] Componentes de 21st.dev sin decidir

#### [TECH-5] Primitivas con `HTMLAttributes` sin `children` explícito

#### [DISCORD-100-SERVIDORES] Verificación de la app de Discord al pasar 100 servidores

---

## Clientes

Doc del área: [`docs/areas/clientes.md`](./docs/areas/clientes.md)

### Clientes · P1

#### [PERMISOS-SERVER-ACTIONS/clientes] Los permisos del módulo Clientes no se hacen cumplir en el servidor
- **Parte de:** `[PERMISOS-SERVER-ACTIONS]` (ítem transversal en Plataforma). Acá, lo específico del área.
- **Tipo:** seguridad
- **Severidad:** Alta
- **Estado verificado:** `app/(platform)/layout.tsx` corta el render por módulo y `clients-list.tsx` esconde botones con `useModuleAccess("clients") === "full"`, pero ninguna action de `app/clients/*.ts` mira el rol ni el permiso de módulo: sólo `requireOrganizationId()`. Un usuario con Clientes en «Solo lectura» o «Sin acceso» puede invocar `deleteClientAction`, `updateClientAction`, `recordCheckpointAction`, `deleteWinAction`, `saveClientRevenueAction`, etc. Las policies de RLS de todas las tablas del área filtran sólo por org. Sólo el catálogo (campos, recorrido, duración de planes, umbral de silencio) exige founder (`requireFounder()`; el umbral, con un chequeo de `profile.role` en `setClientSilenceDaysAction`).
- **Riesgo:** Si un miembro con Clientes en «Solo lectura» o «Sin acceso» invoca una action desde las herramientas del navegador (el id de la action viaja en el bundle del cliente), entonces puede borrar o editar clientes, hitos, wins y facturación; requiere intención, no pasa por accidente.
- **Impacto:** Todas las orgs que usan roles personalizados con Clientes restringido: el permiso por módulo es sólo visual. Un borrado de cliente arrastra su historia (timeline, pagos, tareas) y no hay papelera.
- **Qué hay que hacer:** helper `requireModuleAccess("clients", "full")` en las actions de escritura del área (es transversal: coordinar con el ítem general de la auditoría §3.1).
- **Criterio de aceptación:** Con un miembro que tiene Clientes en «Solo lectura» o «Sin acceso», invocar directamente una action de escritura del área (borrar cliente, editar cliente, registrar hito, borrar win, guardar facturación, subir 1-1) devuelve error de permiso y no cambia ninguna fila; con Clientes en «full» las mismas acciones siguen funcionando; hay un test que cubre el rechazo por permiso de módulo
- **Dónde:** `apps/web/app/clients/*.ts`, `apps/web/app/fathom/manual-upload-actions.ts`, `apps/web/lib/auth/`.

#### [CLIENTES-ETAPA-TABLA-VS-FICHA] La tabla ignora la fase manual cuando hay una derivada *(nuevo)*
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** la ficha usa `resolveEffectiveStage` (gana la más avanzada entre manual y derivada: `components/clients/checkpoints/client-journey-section.tsx:139`). La tabla hace `status?.currentStageName ?? manualStageName` (`components/clients/clients-list.tsx:793`): si el cliente tiene cualquier hito registrado, muestra la fase derivada aunque la manual sea más avanzada, y el color y el «n de m» salen siempre de la derivada. El comentario de `getManualStagesAction` dice «para resolver la efectiva en la tabla», pero nadie la resuelve.
- **Riesgo:** Si un cliente tiene un hito registrado y la fase fijada a mano en una más avanzada, entonces la tabla de /clients muestra una fase atrasada (nombre, color y «n de m»); pasa cada vez que alguien usa la fase manual para adelantar a un cliente.
- **Impacto:** Quien revisa la cartera desde la tabla ve el avance de esos clientes subestimado; la ficha muestra el dato correcto, así que hay workaround abriendo cada cliente.
- **Qué hay que hacer:** resolver la fase efectiva en el servidor (`getClientsBoardAction` o `getClientsJourneyStatusAction`) con `resolveEffectiveStage` y que la tabla lea eso (hoy no hay filtro por fase y la revisión semanal no muestra fase). Agregar un test.
- **Criterio de aceptación:** Un cliente con un hito registrado en una fase temprana y la fase fijada a mano en una más avanzada muestra en la tabla de /clients la misma fase (nombre, color y «n de m») que en su ficha; hay un test que cubre la resolución de la fase efectiva que usa la tabla
- **Dónde:** `apps/web/components/clients/clients-list.tsx`, `apps/web/app/clients/clients-board-actions.ts`, `apps/web/lib/checkpoints/effective-stage.ts`.

#### [CLIENTES-IMPORT-EXCEL-MONTOS] El import de Excel inventa montos y fechas *(nuevo; viene de la auditoría §3 «Dinero y datos»)*
- **Tipo:** bug
- **Severidad:** Alta
- **Estado verificado:** `lib/clients/excel-parser.ts:69-73`: `resolveAmount` hace `replace(",", ".")` sobre el texto con puntos, así que `"1.500"` → 1,5 y `"1.500,00"` → `NaN` → **0**; cualquier monto ilegible queda en 0. `resolveDate` (líneas 75-95) devuelve **hoy** si la fecha falta o no se entiende. Viola la regla del repo «un cobro cuyo monto no se lee no es un cobro de cero». Además, el dedupe por nombre (`import-actions.ts:182`) lee `clients` sin paginar.
- **Riesgo:** Si el Excel trae montos como texto con separadores («1.500», «USD 1.500,00») o fechas ilegibles o vacías, entonces el cliente se crea con 1,5 o 0 de monto y con la fecha de hoy, sin error; la vista previa lee las celdas formateadas y no deja ver el valor que se va a guardar. Las celdas numéricas puras se leen bien (el import usa raw: true).
- **Impacto:** Facturación (clients.total_amount) y fecha de alta falsas en los clientes importados, que alimentan métricas de ingresos, vencimiento de planes y renovaciones; un cobro ilegible queda como cobro de cero. Alcance: cada import de Excel con esas columnas en texto.
- **Qué hay que hacer:** parser de montos con separadores es-AR/en-US y error por fila cuando no se entiende; fecha ilegible → error por fila, no hoy. Tests (`[T-3]`).
- **Criterio de aceptación:** Importar un Excel con montos «1.500», «1.500,00» y «1,500.00» guarda 1500 en los tres casos; una fila con monto o fecha ilegible (o fecha vacía) se informa como error de esa fila y no se guarda con monto 0 ni con la fecha de hoy; hay tests del parser con esos casos
- **Dónde:** `apps/web/lib/clients/excel-parser.ts`, `apps/web/app/clients/import-actions.ts`.

#### [CLIENTES-PENDING-CALLS-HUERFANA] «Llamadas sin asociar» no tiene link en la navegación *(nuevo)*
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** `paths.platform.clients.pendingCalls` no se usa en ningún componente; la notch nav y `clients-list.tsx` no linkean a `/clients/pending-calls`. Sólo `components/layout/mobile-nav.tsx` pinta un badge con el conteo sobre «Clientes». El tooltip de «Última 1-1» dice «Confirmalo en Llamadas sin asociar» sin link. Es la pantalla del botón «Cargar identidades desde el CRM», del que depende `[B-SEMBRAR-IDENTIDADES]`.
- **Riesgo:** Si nadie llega a «Llamadas sin asociar» (sólo es alcanzable escribiendo la URL o por el badge del menú móvil), entonces las grabaciones que el resolvedor no asoció se acumulan sin confirmar y no se aprieta «Cargar identidades desde el CRM».
- **Impacto:** Todas las orgs con Fathom: 1-1 que no llegan a la ficha del cliente y «Última 1-1» desactualizada; bloquea en la práctica [B-SEMBRAR-IDENTIDADES]. Hay workaround (URL directa).
- **Qué hay que hacer:** agregar el acceso desde la barra de `/clients` (con el conteo) y linkear el tooltip.
- **Criterio de aceptación:** Desde la barra de /clients en escritorio hay un acceso a «Llamadas sin asociar» que muestra la cantidad pendiente y lleva a /clients/pending-calls; el tooltip de «Última 1-1» que dice «Confirmalo en Llamadas sin asociar» es un link a esa pantalla
- **Dónde:** `apps/web/components/clients/clients-list.tsx`, `apps/web/routes/paths.ts`.

#### [CLIENTES-SIN-MAIL] Los clientes viejos no tienen mail
- **Tipo:** bug + decisión de negocio
- **Severidad:** Media
- **Estado verificado:** `clients.email` existe y se hereda del lead al cerrar (`providers/platform-data-provider.tsx:175`). No hay pantalla para completarlo en masa. El CSV (`parse-client-import.ts`) no tiene columna de mail. ⚠️ El Excel **sí la lee** (`excel-parser.ts:172,200`) pero `importClientsFromExcelAction` **no la inserta** (`import-actions.ts`, el `insertPayload` no tiene `email`): el dato sólo queda como texto «Email: …» en `ai_insights` (`buildClientInsights`, `import-actions.ts:263`), no en `clients.email`. El conteo «334 de 335» es de CHANGES; no se re-midió (sería leer datos).
- **Riesgo:** Si se importan clientes desde Excel con columna Email, entonces el mail se descarta de clients.email (queda sólo como texto en ai_insights) y el cliente queda sin mail aunque el dato estaba; pasa en cada import.
- **Impacto:** El resolvedor de grabaciones y el cruce con pagos/leads no pueden usar el peldaño determinista por mail para casi toda la base vieja (334 de 335 según CHANGES, no re-medido); el dato se puede recuperar de ai_insights.
- **Qué hay que hacer:** agregar `email: row.email ?? null` al insert del Excel (una línea); decidir de dónde se completan los viejos (import, `sales_leads`, pagos). Es la palanca del peldaño determinista del resolvedor.
- **Criterio de aceptación:** Importar desde Excel una fila con columna Email deja ese mail guardado en el cliente creado; Agustín decidió de dónde se completan los mails de los clientes viejos (import, leads de ventas o pagos) y la decisión quedó registrada en PENDIENTES.md o CHANGES.md
- **Dónde:** `apps/web/app/clients/import-actions.ts`, `apps/web/lib/clients/parse-client-import.ts`.

#### [ONBOARDING-CLIENTES-PROBAR] Probar el onboarding de clientes en producción
- **Tipo:** verificación manual
- **Severidad:** Media
- **Estado verificado:** migración aplicada; `client_onboarding_links` y `client_onboarding_submissions` con 0 filas y `field_definitions` con 48 filas en toda la base (las 86 preguntas no se cargaron en ninguna org).
- **Riesgo:** Si el formulario por link tiene un error que sólo aparece con la org real (las 86 preguntas no están cargadas en ninguna org), entonces el primer cliente que lo complete puede perder respuestas o no poder enviarlo.
- **Impacto:** La org que tiene el add-on de onboarding y sus clientes nuevos; hoy 0 links y 0 envíos, así que nadie está afectado todavía, pero el formulario viejo deja de ser la fuente.
- **Qué hay que hacer:** bloque 14 «Onboarding por link» de `docs/operacion/verificacion-manual.md` § Clientes. Avisar al equipo que el formulario viejo (`client-onboarding-nine-chi.vercel.app`) queda reemplazado; sus respuestas no se importan.
- **Criterio de aceptación:** Se ejecutó el bloque 14 «Onboarding por link» de docs/operacion/verificacion-manual.md § Clientes con la organización real que tiene el add-on y el resultado quedó anotado; si algo falló, se abrió un ítem nuevo; el equipo fue avisado de que el formulario viejo queda reemplazado y sus respuestas no se importan
- **Dónde:** `/clients/campos`, ficha de un growth partner, `/onboarding-cliente/[token]`.

#### [CLIENTES-DE-CLIENTES-PROBAR] Probar la tarjeta «Clientes» y pasar los datos viejos
- **Tipo:** verificación manual
- **Severidad:** Media
- **Estado verificado:** 10 filas en `client_sub_clients` (alguien ya cargó creadores). El aviso de valores de sección en el growth partner existe (`legacySectionValues`); no hay evidencia de que se hayan movido.
- **Riesgo:** Si los valores de sección siguen cargados en el growth partner y no se pasan a sus creadores, entonces Optimiza tu Control deja de ver apartados que antes veía en la ficha.
- **Impacto:** Una org (Optimiza tu Control) y los datos cargados antes del cambio; los datos no se pierden (el aviso los muestra y «Pasarlos a…» los mueve), así que hay workaround.
- **Qué hay que hacer:** bloque «Clientes de clientes» de `docs/operacion/verificacion-manual.md` § Clientes; mover los datos viejos con «Pasarlos a…»; avisar a Optimiza tu Control si deja de ver apartados.
- **Criterio de aceptación:** Se ejecutó el bloque «Clientes de clientes» de docs/operacion/verificacion-manual.md con cuenta real y el resultado quedó anotado; si falló, se abrió un ítem nuevo; los valores de sección que quedaron cargados en los growth partners se pasaron a sus creadores con «Pasarlos a…» (el aviso ya no aparece) y se avisó a Optimiza tu Control
- **Dónde:** ficha del growth partner.

#### [1A1-MANUALES-SIN-PROBAR] Terminar de probar las 1-1 subidas con un link
- **Tipo:** verificación manual
- **Severidad:** Media
- **Estado verificado:** la subida y la extracción ya corrieron en producción (CHANGES 2026-09-21; 288 filas en `client_tasks`). Falta: pegar el mismo link dos veces (no duplica), subir una llamada ya sincronizada (reusa la fila si `props.call.id` = `recording_id`), y ⭐ el link de una grabación de **otra cuenta** de Fathom (supuesto central).
- **Riesgo:** Si el supuesto de que se puede subir una grabación de otra cuenta de Fathom es falso, o el mismo link duplica filas, entonces las 1-1 que graba el cliente (u otro miembro sin key) no entran o se cuentan dos veces.
- **Impacto:** Seguimiento de 1-1 y tareas extraídas (288 filas en client_tasks) de las orgs que suben por link; la subida base ya funciona en producción, lo abierto son los casos borde.
- **Qué hay que hacer:** los tres pasos del bloque «Sesiones 1-1» de `docs/operacion/verificacion-manual.md` § Clientes.
- **Criterio de aceptación:** Se ejecutaron los tres pasos del bloque «Sesiones 1-1» de docs/operacion/verificacion-manual.md con cuenta real (mismo link dos veces no duplica; una llamada ya sincronizada reusa su fila; el link de una grabación de otra cuenta de Fathom se sube) y el resultado quedó anotado; si alguno falló, se abrió un ítem nuevo
- **Dónde:** ficha → Sesiones 1-1; `apps/web/lib/fathom/share-link.ts`.

### Clientes · P2

#### [FICHA-LENTA] La ficha dispara ~15 server actions
- **Tipo:** deuda técnica
- **Estado verificado:** `client-detail.tsx` monta ~15 tarjetas que piden sus datos por separado (overview, recorrido, propuestas, 1-1, tareas, timeline, wins, Discord, campos, sub-clientes, facturación…). No hay action agregada como `getClientsBoardAction`.
- **Qué hay que hacer:** esqueletos en las tarjetas que devuelven `null` mientras cargan; después una action única para la ficha.
- **Dónde:** `apps/web/components/clients/client-detail.tsx` y sus tarjetas.

#### [FASE-REFRESCO-CARO] Fijar la fase recarga la lista entera
- **Tipo:** deuda técnica
- **Estado verificado:** `client-journey-section.tsx:207` llama `refreshClients()` después de `setClientManualStageAction`.
- **Qué hay que hacer:** update optimista del cliente en el provider o estado local, con el refresh por detrás.
- **Dónde:** `apps/web/components/clients/checkpoints/client-journey-section.tsx`, `apps/web/providers/platform-data-provider.tsx`.

#### [FICHA-CUSTOM-EN-LA-LISTA] La lista trae `custom` entero de cada cliente
- **Tipo:** deuda técnica
- **Estado verificado:** `listClientsAction` hace `select("*, satisfaction_author:…")` (`app/clients/actions.ts:63`). Viaja al navegador en cada carga de la plataforma. Techo de texto 20.000 por campo.
- **Qué hay que hacer:** seleccionar columnas explícitas y sólo las claves de `custom` con `show_in_table`; `custom` completo, en la ficha.
- **Dónde:** `apps/web/app/clients/actions.ts`.

#### [CLIENTES-TECHO-1000] Lecturas del área sin paginar *(nuevo; instancia de la auditoría §3 Confiabilidad 2)*
- **Tipo:** deuda técnica
- **Estado verificado:** sin `fetchAllRows`: `listClientsAction` (y con ella la ficha, que da 404 si el cliente no vino en la lista), `getClientsJourneyStatusAction` (clientes y **todos** los eventos de la org), `loadNextTaskByClient`, `lastCheckpointEventByClient`, `listWinsAction`, dedupe del import. Hoy: 337 clientes, 30 eventos, 288 tareas: no rompe todavía; `client_tasks` es la más cercana.
- **Qué hay que hacer:** `fetchAllRows` o agregación en SQL.
- **Dónde:** `apps/web/app/clients/*.ts`.

#### [CUSTOM-ERRORES-PRIMERO] Wins y checkpoints informan sólo el primer campo inválido
- **Tipo:** bug
- **Estado verificado:** `app/clients/checkpoint-event-actions.ts:159` y `app/clients/win-actions.ts:626` usan `Object.values(validation.errors)[0]`. Ficha y sub-clientes ya juntan todos.
- **Qué hay que hacer:** `Object.values(validation.errors).join(" · ")` en los dos.
- **Dónde:** los dos archivos citados.

#### [FACTURACION-MONEDAS] La facturación compara USD con ARS
- **Tipo:** bug
- **Estado verificado:** `summarizeRevenue` (`lib/clients/revenue.ts:81-97`) calcula `changePct` y `best` sin mirar `currency`. 21 filas en producción.
- **Qué hay que hacer:** mínimo, `changePct = null` y `best` por moneda cuando difieren; lo correcto requiere cotizaciones (no existen en el repo).
- **Dónde:** `apps/web/lib/clients/revenue.ts`.

#### [FASE-MANUAL-SIN-PLAZOS] + [C3-TRABADO-SIN-PRIMER-HITO] Sin hito anterior no hay «trabado»
- **Tipo:** decisión de negocio
- **Estado verificado:** `deriveClientJourneyStatus` (caso 3, `lib/checkpoints/stalled.ts`) devuelve sin vencimiento si el hito anterior no está registrado. `manual_stage_set_at` se escribe (`stage-actions.ts:54`) y nadie lo lee. Un cliente que nunca arrancó o con fase fijada a mano nunca figura trabado.
- **Qué hay que hacer:** decidir el ancla (alta del cliente / `manual_stage_set_at`) y aplicarla en el caso 3, con tests.
- **Dónde:** `apps/web/lib/checkpoints/stalled.ts`.

#### [C3-ORIGEN-PROPUESTA] Un hito aceptado desde una propuesta queda como `manual` *(nuevo)*
- **Tipo:** bug
- **Estado verificado:** `acceptCheckpointProposalAction` llama `recordCheckpointAction`, que escribe `source: "manual"` fijo (`checkpoint-event-actions.ts:174`). La columna `source` admite `discord`/`fathom` para esto, y la propuesta queda `accepted`, pero el evento pierde el origen (y `recorded_by` es quien aceptó).
- **Qué hay que hacer:** que `recordCheckpointAction` acepte un `source` interno (no expuesto al cliente) y pasarlo desde la aceptación.
- **Dónde:** `apps/web/app/clients/checkpoint-event-actions.ts`, `checkpoint-derived-actions.ts`.

#### [PROPUESTAS-CALIDAD-SIN-VER] Medir aceptadas vs descartadas del matcher de hitos
- **Tipo:** verificación manual
- **Estado verificado:** el cron `/api/cron/daily-signals` (07:20 UTC) corre y hay 9 filas en `client_checkpoint_proposals` → el matcher ya produjo propuestas. Nadie midió la tasa. `MIN_MATCH_CONFIDENCE = 0.7`.
- **Qué hay que hacer:** contar `status` de las propuestas tras dos semanas; >50% rechazadas → subir el piso o ajustar el prompt.
- **Dónde:** `apps/web/lib/checkpoints/match-proposal.ts`.

#### [1A1-EDITAR-DETALLE] El detalle de una tarea no se puede editar
- **Tipo:** feature
- **Estado verificado:** `updateClientTaskAction` existe (`app/clients/task-actions.ts:118`) y ningún componente la importa.
- **Qué hay que hacer:** fila editable en `client-tasks-section.tsx`.
- **Dónde:** `apps/web/components/clients/client-tasks-section.tsx`.

#### [OBJETIVO-DOS-LUGARES] Dos «objetivos» con el mismo nombre
- **Tipo:** decisión de negocio
- **Estado verificado:** campo configurable «Objetivo general» (`clients.custom`) y `goal_text` + `goal_metric_*` (diálogo de baseline, usado por el dashboard de wins).
- **Qué hay que hacer:** renombrar el de baseline a «Meta medible» o retirarlo (revisar `deriveClientCase` y la tarjeta de objetivo).
- **Dónde:** `apps/web/components/clients/wins/client-baseline-dialog.tsx`, `apps/web/lib/wins/derive-case.ts`.

#### [TRACKERS-PERMISOS-VACIOS] Los wins viejos quedaron «sin preguntar»
- **Tipo:** decisión de negocio
- **Estado verificado:** default `consent_status = 'not_asked'`; hay 4 wins en producción y 3 usos registrados, así que al menos uno se usó en material sin permiso cargado.
- **Qué hay que hacer:** cargar el permiso real de los wins ya usados.
- **Dónde:** `/clients/wins`.

#### [ALTA-CLIENTES-PROBAR] Confirmar el alta con una cuenta de equipo
- **Tipo:** verificación manual
- **Estado verificado:** `clients-list.tsx:216` muestra la barra con `useModuleAccess("clients") === "full"`. Los botones hoy son: Nuevo cliente, Cargar clientes (CSV o Excel), Revisión semanal, Wins, Cobros (sólo con acceso a Ventas) y el menú «Configurar» (Recorrido del cliente, Campos personalizados). «Crear planes» se fue a Cobros.
- **Qué hay que hacer:** entrar con un miembro con Clientes en «full», confirmar los botones y guardar un cliente de prueba; con «read», que no aparezcan.
- **Dónde:** `/clients`.

#### [AVISO-Y-SATISFACCION-SIN-PROBAR], [C0-PROBAR-PANTALLA], [C1-PROBAR-PANTALLA], [C2-PROBAR-FICHA], [TRACKERS-PROBAR-CON-SESION], [CLIENTES-VER-CON-DATOS], [FICHA-VER-CON-DATOS] Pasadas por pantalla con sesión real
- **Tipo:** verificación manual
- **Estado verificado:** hay uso real en producción (11 fases, 18 checkpoints, 30 eventos, 48 definiciones de campo, 4 wins, 21 meses de facturación) y la ficha se probó contra el preview con datos reales el 2026-09-21 (CHANGES). Nadie documentó la pasada de los pasos de seguridad (operator sin botones), el «n de m» contra la ficha, archivar opción en uso, ni el aviso por fecha.
- **Qué hay que hacer:** los bloques C0–C3, Wins, Revisión y Ficha de `docs/operacion/verificacion-manual.md` § Clientes.
- **Dónde:** `/clients/*`.

#### [A-PROBAR-CAPTURAS] Terminar la vuelta de las capturas de wins
- **Tipo:** verificación manual
- **Estado verificado:** 1 fila en `win_attachments` → subir funcionó al menos una vez. No verificado: que borrar el win borre el archivo del bucket (`deleteWinAction` borra con admin antes de borrar la fila; si el `remove` falla, lo ignora).
- **Qué hay que hacer:** borrar un win con captura y confirmar que el objeto desaparece de `client-wins`.
- **Dónde:** `apps/web/app/clients/win-actions.ts:351`.

### Clientes · P3

#### [CLIENTES-PLAN-DURATIONS-DIALOG-MUERTO] `plan-durations-dialog.tsx` no lo usa nadie *(nuevo)*
- **Tipo:** deuda técnica
- **Estado verificado:** `apps/web/components/clients/plan-durations-dialog.tsx` exporta `PlanDurationsDialog` y ningún archivo lo importa (grep en `apps/web`, 2026-09-23). CHANGES de agosto dice que `PlanManagerDialog` lo reemplazó; el archivo quedó.
- **Qué hay que hacer:** borrarlo (y confirmar que `plan-duration-actions.ts` sigue teniendo usos: `getClientsTableEnrichmentAction` lo usa `components/sales/cobros-page.tsx`).
- **Dónde:** `apps/web/components/clients/plan-durations-dialog.tsx`.

#### [INVESTIGAR-LIBRERIAS-CRM] (nuevo) Investigar librerías tipo HubSpot / Pipedrive / Salesforce
- **Tipo:** investigación
- **Estado verificado:** pedido de Agustín en la reunión del 2026-09-23: varias pantallas buscan parecerse a esos CRM. No hay nada evaluado. Fernando se ofreció a tomarlo.
- **Qué hay que hacer:** relevar librerías open source confiables para pipeline/ficha de contacto, compararlas contra construirlo propio (costo de depender de un tercero) y traer una recomendación. Prioridad a definir por Agustín.
- **Dónde:** `docs/areas/clientes.md`, `docs/areas/ventas.md`.

#### [C0-JOURNEY-STAGES-UI] `options_source = 'journey_stages'` no se puede elegir (de `[C0-PENDIENTES]`)
- **Tipo:** feature
- **Estado verificado:** `resolve.ts` lo soporta y la lista lo muestra como insignia, pero toda creación escribe `options_source: "inline"` (`custom-field-actions.ts:220`).
- **Qué hay que hacer:** opción en `field-definition-dialog.tsx` para campos de lista.
- **Dónde:** `apps/web/components/clients/custom-fields/field-definition-dialog.tsx`, `apps/web/app/clients/custom-field-actions.ts`.

#### [A-ENGANCHES-W3] Wins propuestos desde llamadas de Fathom
- **Tipo:** feature
- **Estado verificado:** la mitad de Discord está hecha (`createWinFromTestimonialAction`, solapa Candidatos). Nada crea wins ni candidatos con `source='fathom'`.
- **Qué hay que hacer:** candidato a win desde el resumen de llamadas de entrega, mismo criterio (propone, alguien acepta).
- **Dónde:** `apps/web/lib/fathom/`, `apps/web/components/clients/wins/win-candidates.tsx`.

#### [WINS-BORRADORES-HUERFANOS] Capturas de wins que nunca se guardaron *(nuevo)*
- **Tipo:** deuda técnica
- **Estado verificado:** `prepareWinAttachmentUploadAction` + `finalizeWinAttachmentAction` con `draftId` crean objeto y fila antes del win; si el formulario se abandona, nada los limpia (sólo `lib/super-admin/execute-deletion.ts` borra `drafts/` al dar de baja la org).
- **Qué hay que hacer:** cron que borre `win_attachments` con `draft_id` y `created_at` > 24 h, y su objeto.
- **Dónde:** `apps/web/app/clients/win-actions.ts`.

#### [PROPUESTAS-FATHOM-SIN-RESUMEN] Una llamada sin resumen se marca evaluada igual *(nuevo, a confirmar)*
- **Tipo:** bug
- **Estado verificado:** `proposeCheckpointsFromCallsForOrg` marca `checkpoint_checked_at` en **todas** las filas leídas, incluidas las que no tenían `summary` ni `ai_situation_summary` (`lib/fathom/propose-checkpoints.ts:82-88`). El comentario asume que el resumen nunca llega después; si una llamada queda `purpose='delivery'` con cliente antes de procesarse, se pierde para siempre.
- **Qué hay que hacer:** confirmar el orden clasificación/procesamiento; si puede pasar, marcar sólo las evaluadas.
- **Dónde:** `apps/web/lib/fathom/propose-checkpoints.ts`.

#### [CLIENTES-SEÑALES-DOS-SILENCIOS] Dos definiciones de «sin novedades» *(nuevo)*
- **Tipo:** decisión de negocio
- **Estado verificado:** revisión semanal: 30 días fijos desde el último win o hito (`lib/clients/weekly-review.ts`, `SILENCE_DAYS`). Lista (add-on): `organizations.client_silence_days` sobre 8 fuentes (RPC `client_last_activity`).
- **Qué hay que hacer:** unificar criterio o nombrarlos distinto.
- **Dónde:** los dos archivos + `apps/web/app/clients/signals-actions.ts`.

#### [ONBOARDING-CLIENTES-RESTO] Lo que quedó afuera del onboarding
- **Tipo:** feature
- **Estado verificado:** no hay aviso al completar (sólo bandeja y timeline); `onb_team_members` es texto; `showIf`/audio no editables en `field-definition-dialog.tsx`; la ficha no muestra «sin novedades».
- **Qué hay que hacer:** decidir canal de aviso (Discord/Resend/nada) y el resto a demanda.
- **Dónde:** `apps/web/app/onboarding-cliente/actions.ts`, `apps/web/lib/client-onboarding/`.

#### [TRACKERS-EGRESO-MANUAL] La fecha de egreso no se calcula del plan
- **Tipo:** feature
- **Estado verificado:** `exit_date` sólo se escribe en `updateClientTrackingAction`; nada lo deriva de `plan_durations` (1 fila en prod; `plans` con 0).
- **Qué hay que hacer:** proponer la fecha desde la duración del plan, editable.
- **Dónde:** `apps/web/app/clients/tracking-actions.ts`.

#### [TRACKERS-RIESGO-PAGOS] «Pago atrasado» sólo mira `clients.installments`
- **Tipo:** deuda técnica
- **Estado verificado:** `hasOverduePayment` (`tracking-actions.ts:313`) no mira `client_payments` ni Cobros.
- **Qué hay que hacer:** leer el adeudado de la misma fuente que Cobros (coordinar con Ventas).
- **Dónde:** `apps/web/app/clients/tracking-actions.ts`.

#### [TRACKERS-RECOMENDACIONES-6-10] Recomendaciones 6–10 de `docs/specs/TRACKERS_EXCEL_VS_LIMITLESS.md`
- **Tipo:** feature
- **Estado verificado:** no existen ficha de caso (creencias, restricciones, proceso), checklist de contenido por caso, revisión mensual, caso de éxito curado ni responsable por cliente (no hay columna de responsable en `clients`).
- **Qué hay que hacer:** producto nuevo; priorizar con Santiago.
- **Dónde:** —

---

## Ventas

Doc del área: [`docs/areas/ventas.md`](./docs/areas/ventas.md)

### Ventas · P0

#### [FATHOM-SYNC-CURSOR] La sync de Fathom saltea para siempre una llamada que no se pudo guardar
- **Tipo:** bug
- **Severidad:** Alta
- **Estado verificado:** `syncFathomMeetingsForOrganization` cuenta las reuniones guardadas (`lib/fathom/sync.ts:268`) y, si guardó al menos una, pone `last_sync_at = now()` (`:274-277`) aunque otras hayan fallado (`upsertFathomCallFromMeeting` devuelve `false`). La corrida siguiente pide `created_after = last_sync_at` (`lib/fathom/sync-window.ts:50-58`). El cursor es la hora del servidor, no el `created_at` más nuevo recibido. Para la key de la org esta sync es la única vía automática de entrada (el webhook por miembro sólo cubre las keys de miembros).
- **Riesgo:** Si en una misma corrida una llamada falla al guardarse y otra entra bien, entonces la que falló no se vuelve a pedir nunca. Si Fathom asigna `created_at` antes de que la reunión aparezca en el listado (no verificado), también se pierden las reuniones creadas durante la corrida.
- **Impacto:** Llamadas de venta y de entrega que no llegan a Limitless: sin clasificación, sin análisis, sin hitos propuestos, sin cruce con el turno. Se nota sólo si alguien compara contra Fathom.
- **Qué hay que hacer:** avanzar el cursor al `created_at` máximo de las guardadas bien, sin pasar del `created_at` de la más vieja que falló; restar un solape de unos minutos (el upsert deduplica).
- **Criterio de aceptación:** Con una corrida simulada donde una reunión falla al guardarse y otra entra, la corrida siguiente vuelve a pedir la que falló y la guarda; el cursor nunca pasa del created_at de una reunión no guardada; hay tests de la función que calcula el nuevo cursor
- **Dónde:** `apps/web/lib/fathom/sync.ts`, `apps/web/lib/fathom/sync-window.ts`.

Prioridad sugerida P1: pérdida permanente y silenciosa de datos que el negocio usa.

#### [CLOSER-AMOUNT-CLOSED] La pestaña Equipo de Closing siempre sale vacía
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** `[AUDITORIA-ABIERTOS]` punto 8 / auditoría §3 "Dinero y datos". `getCloserMetricsAction` (`app/sales/closer-actions.ts:151`) selecciona `closing_calls.amount_closed`, que no existe en ninguna migración ni en producción; el error devuelve `[]`. Lo consume `components/closing/closers-ranking.tsx`. **Escondido para el release de octubre (SCRUM-490, 2026-10-02)**: la pieza no se muestra; volver a mostrarla es una bandera en `apps/web/lib/release/escondido.ts`. El pendiente sigue abierto.
- **Riesgo:** Siempre: la consulta pide closing_calls.amount_closed, que no existe, y la pestaña Equipo de Closing sale vacía en cada carga.
- **Impacto:** Todas las orgs con closers: no ven ranking, conversión, facturación ni comisión por closer. El error es visible (lista vacía), no un número falso, y la facturación se puede reconstruir desde Cobros o Clientes.
- **Qué hay que hacer:** decidir de dónde sale la facturación por closer (`outcome.revenue`, `clients.total_amount` vía `clients.closing_call_id`, o `client_payments`) y reescribir la agregación.
- **Criterio de aceptación:** Con al menos una venta cerrada en el período, la pestaña Equipo de Closing muestra a su closer con cierres y facturación distintos de cero; la fuente de la facturación elegida quedó escrita en docs/areas/ventas.md; getCloserMetricsAction no referencia ninguna columna inexistente y no devuelve error
- **Dónde:** `apps/web/app/sales/closer-actions.ts`.

#### [CALENDLY-CLOSER-SIN-LEAD] Los turnos del Calendly de cada closer no entran al seguimiento
- **Tipo:** bug
- **Severidad:** Alta
- **Estado verificado:** auditoría §3 "Salud del código" 2. `lib/calendly/closer-sync.ts:217-229` inserta sin `lead_id` y el update tampoco lo completa; no llama `resolveLeadId` (sí lo hacen `sync-events.ts:90` y `ghl/sync-appointments.ts:204`). `listLeadsTableAction` sólo ve turnos colgados de un `sales_leads`.
- **Riesgo:** Si un lead agenda en el Calendly propio de un closer, entonces el turno entra sin lead_id y no aparece en Closing → Seguimiento; pasa con cada turno de esa vía, sin error.
- **Impacto:** Orgs con closers que conectaron su Calendly personal: esos leads quedan fuera del seguimiento y de las métricas por lead (falla silenciosa del embudo comercial). Cantidad de closers conectados no medida.
- **Qué hay que hacer:** resolver el lead en `closer-sync` igual que `sync-events`; idealmente unificar las dos syncs en una con `closer_id` opcional. Backfill de `lead_id` para turnos con `lead_email`.
- **Criterio de aceptación:** Un turno nuevo agendado en el Calendly propio de un closer con un mail nuevo queda, tras el cron, con closer_id y lead_id completos y el lead aparece en Closing → Seguimiento → Todos; después del backfill no quedan closing_calls con lead_email y sin lead_id
- **Dónde:** `apps/web/lib/calendly/closer-sync.ts`, `apps/web/lib/calendly/sync-events.ts`.

#### [CALENDLY-CRONS-SUPERPUESTOS] `calendly-sync` y `calendly-sync-closers` corren a la misma hora
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** auditoría §3 "Confiabilidad" 3. `vercel.json`: los dos con `0 * * * *`. Ambos insertan por `calendly_event_id`; si compiten, el índice único rechaza el batch entero. Además N+1 por evento (`resolveLeadId` en loop) y `.in()` con URIs largas.
- **Riesgo:** Si el Calendly de la org y el de un closer devuelven el mismo evento nuevo en la misma corrida, entonces el índice único (organization_id, calendly_event_id) rechaza el insert en lote y se pierden todos los turnos nuevos de ese lote hasta la corrida siguiente.
- **Impacto:** Orgs que usan las dos syncs de Calendly: turnos que aparecen con una hora de atraso; se autocorrige en la corrida siguiente (el evento ya existe y se actualiza), por eso no hay pérdida permanente.
- **Qué hay que hacer:** unificar (ver ítem anterior) o desfasar el schedule; insertar con upsert `onConflict` en vez de insert en batch.
- **Criterio de aceptación:** Los dos syncs de Calendly ya no se disparan en el mismo minuto (o quedaron unificados en uno) en vercel.json; correr el sync con un evento que ya existe actualiza la fila sin rechazar el resto del lote (upsert por calendly_event_id); una hora de logs de cron no muestra errores de clave duplicada
- **Dónde:** `apps/web/vercel.json`, `apps/web/lib/calendly/*`.

#### [FATHOM-DEEP-ANALISIS-ALCANCE] El análisis de venta corre sobre las llamadas equivocadas
- **Tipo:** bug
- **Severidad:** Alta
- **Estado verificado:** ítem nuevo. El análisis profundo (`generateDeepCallAnalysis` → `call_analyses`) sólo se dispara desde `finalizeAssociatedCall` (`lib/fathom/process-call.ts:470-512`), que corre cuando la grabación quedó vinculada a un **cliente**, sin mirar `purpose`: una 1-1 de entrega de ≥10 min se analiza como venta (costo de Sonnet y ruido en ranking/objeciones), y una venta con un lead nunca se analiza. Además no se pasa `closerName` ni `closer_id`: `call_analyses.closer_name` queda null y `getTeamRankingAction` agrupa todo en "Sin nombre". Busca `form_answers` por `ilike lead_name` en vez de usar `closing_call_id`. En producción (2026-09-28) las 19 filas de `call_analyses` son de una org sin llamadas de venta y tienen `fathom_call_id` null (todas creadas el 2026-07-05, no por este flujo): ninguna se puede atribuir a una llamada, así que Ventas → Llamadas lista las 18 llamadas de venta sin análisis.
- **Riesgo:** Siempre que una 1-1 de entrega de 10 min o más se asocia a un cliente, se analiza como venta; y ninguna llamada de venta con un lead (sin cliente) se analiza.
- **Impacto:** El ranking del equipo y las objeciones en Métricas mezclan entregas con ventas y agrupan todo en «Sin nombre»: datos que el negocio usa para evaluar closers salen incorrectos, más costo de Sonnet en llamadas que no corresponden.
- **Qué hay que hacer:** disparar el análisis cuando `purpose = 'sales'` (con o sin cliente), usar `closing_call_id` para `form_answers` y `closing_calls.closer_id` para el closer.
- **Criterio de aceptación:** Una 1-1 de entrega de 10 min o más vinculada a un cliente no genera fila en call_analyses; una llamada con purpose = 'sales' cruzada a un turno de un lead sí la genera, con closer_id y closer_name del turno; el ranking del equipo en Métricas muestra el nombre del closer en vez de «Sin nombre»
- **Dónde:** `apps/web/lib/fathom/process-call.ts`, `apps/web/lib/fathom/deep-call-analysis.ts`.

#### [CLOSING-CIERRE-ATOMICO] Cerrar una venta son cinco escrituras encadenadas desde el navegador
- **Tipo:** bug
- **Severidad:** Crítica
- **Estado verificado:** ítem nuevo. `markCallClosed` (`providers/platform-data-provider.tsx:595-680`) hace desde el cliente: update del turno → tag en `conversations` → `createClientAction` → `linkLeadToClientAction` → `recordClientPaymentAction`. Si falla a mitad (red, validación del pago), queda un turno `closed` sin cliente o un cliente sin pago, y el guard "ya tiene cliente vinculado" impide reintentar limpio.
- **Riesgo:** Si falla cualquier paso después de marcar el turno como cerrado (red, validación del cliente o del pago), entonces el turno queda closed sin cliente o el cliente sin pago, y reintentar está bloqueado («Esta llamada ya está marcada como cerrada»); probabilidad baja por cierre, pero se repite con cada venta.
- **Impacto:** Cualquier org que cierra ventas desde Closing: una venta que no queda como cliente ni como cobro (pérdida de plata registrada), sin aviso posterior; se arregla a mano sólo si alguien lo detecta.
- **Qué hay que hacer:** una server action única (o RPC) que haga el cierre completo y sea idempotente por `callId`.
- **Criterio de aceptación:** Marcar un turno como cerrado con pago deja en una sola operación del servidor el turno closed, el cliente creado, el lead vinculado y el pago registrado; si se corta la red a mitad, no queda un estado parcial o reintentar completa lo que faltaba sin duplicar cliente ni pago; hay un test de la idempotencia por callId
- **Dónde:** `apps/web/providers/platform-data-provider.tsx`, `apps/web/app/closing/actions.ts`.

#### [CLOSING-HOLDING-MEZCLA] En modo holding, Closing mezcla turnos de varios negocios
- **Tipo:** seguridad
- **Severidad:** Alta
- **Estado verificado:** ítem nuevo, a confirmar con una sesión holding. `listClosingCallsAction` no filtra por `organization_id`; la policy `holding_reads_portfolio_closing_calls` (`20260630100000_holding_portfolio_rls.sql:42`) deja leer los turnos de todos los negocios del portfolio, y `get_my_organization_id()` devuelve la org del perfil, no el negocio activo. Las escrituras (`updateClosingCallAction`, `lead-actions`) filtran por el negocio activo pero pasan por RLS de la org del perfil, así que probablemente fallan para el holding. **Avance 2026-10-04 (SCRUM-4):** `listClosingCallsAction` ya filtra por la organización activa; faltan `lead-actions` (Seguimiento) y las escrituras con la RLS de la org del perfil.
- **Riesgo:** Si un usuario holding abre Closing con un negocio activo, entonces ve mezclados los turnos de todos los negocios del portfolio (la policy lo permite y la lectura no filtra por org) y probablemente no puede guardar resultados, porque la policy de update usa la org del perfil.
- **Impacto:** Sólo usuarios holding: no es acceso indebido (el holding puede leer su portfolio) pero sí datos de Closing y Seguimiento atribuidos al negocio equivocado y escrituras que fallan. Cantidad de holdings en uso no medida.
- **Qué hay que hacer:** filtrar explícitamente por `requireOrganizationId()` en todas las lecturas del área; probar Closing y Seguimiento con un holding.
- **Criterio de aceptación:** Con un usuario holding y el negocio A activo, Closing (calendario, lista) y Seguimiento muestran sólo turnos y leads de A; marcar un resultado y editar una fila de Seguimiento en A se guardan sin error
- **Dónde:** `apps/web/app/closing/actions.ts`, `apps/web/app/sales/lead-actions.ts`.

#### [PERMISOS-SERVER-ACTIONS/ventas] (parte Ventas) Las actions del área no miran el rol
- **Parte de:** `[PERMISOS-SERVER-ACTIONS]` (ítem transversal en Plataforma). Acá, lo específico del área.
- **Tipo:** seguridad
- **Severidad:** Alta
- **Estado verificado:** sigue abierto; ninguna action de `app/sales`, `app/closing`, `app/fathom` verifica permiso de módulo. `updateCloserCommissionAction` (`app/sales/closer-actions.ts:275`) no tiene llamador (código muerto). No es una escalada: usa `createClient()` y en producción la policy de update de `profiles` más el trigger `protect_profile_columns` (`20260922100000_profiles_columnas_protegidas.sql`) sólo dejan a founder/admin cambiar la comisión (verificado en `pg_policies`/`pg_trigger` 2026-09-23).
- **Riesgo:** Si un miembro con Ventas en «Sin acceso» invoca directamente una action de app/sales, app/closing o app/fathom, entonces lee y escribe turnos, leads, cobros y llamadas igual que alguien con acceso total. updateCloserCommissionAction no agrega riesgo: la policy de update de profiles y el trigger protect_profile_columns (ambos en producción) sólo dejan a founder/admin cambiar la comisión de otro.
- **Impacto:** Todas las orgs con roles restringidos: el permiso de Ventas es sólo visual, incluidos montos y cobros que [COBROS-AVISAR-PERMISOS] pretende ocultar.
- **Qué hay que hacer:** borrar `updateCloserCommissionAction` (sin uso) y aplicar el guard por módulo que se diseñe en el ítem general.
- **Criterio de aceptación:** updateCloserCommissionAction ya no existe en el código; un miembro con Ventas en «Sin acceso» que invoca una action de app/sales, app/closing o app/fathom recibe error de permiso y no lee ni escribe datos; typecheck y tests pasan
- **Dónde:** `apps/web/app/sales/*.ts`, `apps/web/app/closing/actions.ts`, `apps/web/app/fathom/*.ts`.

#### [B-SEMBRAR-IDENTIDADES] / [1-1-SEMBRAR-Y-MEDIR] `client_identities` sigue vacía
- **Tipo:** verificación manual
- **Severidad:** Alta
- **Estado verificado:** `client_identities` tiene **0 filas** en producción (2026-09-23). El botón existe (`components/clients/pending-fathom-calls.tsx` → `seedClientIdentitiesAction`). Sin siembra el resolvedor sólo resuelve por mail de invitado.
- **Riesgo:** Mientras client_identities siga vacía (0 filas), cada grabación sin mail de invitado reconocible cae al último peldaño y queda pendiente de confirmación manual, sin aviso de que el resolvedor está funcionando a medias.
- **Impacto:** Todas las orgs con Fathom: 1-1 y ventas que no se asocian solas, fichas con «Última 1-1» desactualizada y clasificación purpose incompleta; se resuelve con un botón, pero está en una pantalla sin link ([CLIENTES-PENDING-CALLS-HUERFANA]).
- **Qué hay que hacer:** apretar "Cargar identidades desde el CRM" en `/clients/pending-calls`, dejar correr el cron y medir `purpose`/`resolution_method`. Medir falsos positivos del peldaño de nombre.
- **Criterio de aceptación:** Se ejecutó el paso de verificacion-manual.md § Ventas 7 («Cruce grabación ↔ turno y clasificación», siembra de identidades) con la cuenta real: client_identities tiene filas y quedaron anotadas la distribución de purpose/resolution_method y la tasa de falsos positivos por nombre; si falló, se abrió un ítem nuevo
- **Dónde:** `apps/web/lib/fathom/identities.ts`, `apps/web/lib/fathom/seed-identities.ts`.

#### [LLAMADAS-VERIFICAR-FATHOM] Cruce grabación ↔ turno con datos reales
- **Tipo:** verificación manual
- **Severidad:** Media
- **Estado verificado:** `lib/fathom/match-appointment.ts` (ventanas de 12 h por mail y 45 min sólo horario) sin medición real.
- **Riesgo:** Si las ventanas de 12 h (por mail) o 45 min (sólo horario) son demasiado amplias o estrechas, entonces grabaciones se cruzan con el turno equivocado o no se cruzan, y quedan mal clasificadas como venta o entrega.
- **Impacto:** Métricas de ventas, análisis y ranking de closers de las orgs con Fathom y turnos; el efecto real es desconocido hasta medirlo con datos.
- **Qué hay que hacer:** ver `docs/operacion/verificacion-manual.md` § Ventas 7 ("Cruce grabación ↔ turno y clasificación").
- **Criterio de aceptación:** Se ejecutó el paso de verificacion-manual.md § Ventas 7 («Cruce grabación ↔ turno y clasificación») con datos reales y quedó anotado cuántas grabaciones de venta cruzaron un turno y si las ventanas de 12 h / 45 min son correctas; si falló, se abrió un ítem nuevo
- **Dónde:** `apps/web/lib/fathom/match-appointment.ts`, `resolve-sales-call.ts`.

#### [COBROS-PROBAR] Cobros nunca se dibujó con una sesión real
- **Tipo:** verificación manual
- **Severidad:** Media
- **Estado verificado:** `client_payments` tiene 7 filas en prod pero no hay registro de prueba de la pantalla nueva en CHANGES.md.
- **Riesgo:** Si la pantalla de Cobros tiene un error que sólo aparece con datos y sesión reales, entonces el equipo no puede registrar o ver cobros desde Ventas.
- **Impacto:** Registro de cobros de todas las orgs; client_payments ya tiene 7 filas, así que el flujo base al menos escribió, y la sección de cobros de la ficha es alternativa.
- **Qué hay que hacer:** ver `docs/operacion/verificacion-manual.md` § Ventas ("Cobros").
- **Criterio de aceptación:** Se ejecutó el paso de verificacion-manual.md § Ventas 5 («Cobros en Ventas») con una sesión real y el resultado quedó anotado; si falló, se abrió un ítem nuevo
- **Dónde:** `apps/web/components/sales/cobros-page.tsx`, `client-payments-section.tsx`, `app/sales/payment-actions.ts`.

#### [COBROS-AVISAR-PERMISOS] Quien no tiene Ventas deja de ver montos en Clientes
- **Tipo:** decisión de negocio
- **Severidad:** Baja
- **Estado verificado:** `useModuleAccess("sales") !== "none"` gatea los cobros en `components/clients/clients-list.tsx:218` y `client-detail.tsx:56`.
- **Riesgo:** Si un rol que necesita ver montos (p. ej. account manager) no tiene el permiso de Ventas, entonces deja de ver cobros y montos en Clientes sin entender por qué.
- **Impacto:** Usuarios con roles personalizados sin Ventas; es comportamiento buscado y se ajusta configurando el rol, no hay pérdida de datos.
- **Qué hay que hacer:** repasar roles configurados y decidir quién necesita `sales`.
- **Criterio de aceptación:** Agustín decidió qué roles necesitan el permiso de Ventas para ver montos en Clientes y la decisión quedó registrada en docs/areas/ventas.md; los roles configurados en team_roles.permissions quedaron ajustados a esa decisión
- **Dónde:** `team_roles.permissions`.

### Ventas · P2

#### [MANYCHAT-CTA-DUPLICADOS] Un CTA de ManyChat puede guardarse dos veces el mismo día
- **Tipo:** bug
- **Estado verificado:** `app/manychat/cta-actions.ts:125-133` busca si el CTA ya se registró con
  `.gte("triggered_at", inicio del día)` **sin tope** y `.maybeSingle()`. Si desde ese corte hay dos o más filas
  (por ejemplo, el mismo tag registrado en días posteriores, o un duplicado viejo), `maybeSingle` devuelve error,
  `existing` queda en `null` y el insert de `:137-143` agrega otra fila. Pasaba igual antes de SCRUM-493 (que sólo
  movió el corte del día a la zona de la org).
- **Qué hay que hacer:** acotar la búsqueda al día del evento (`.lt("triggered_at", inicio del día siguiente)` con
  `inicioDelDiaEnZona`) y no depender de `maybeSingle` para saber si existe (`.limit(1)` y mirar la lista, o un índice
  único por organización, suscriptor, tag y día con `upsert`). Limpiar los duplicados que ya existan.
- **Dónde:** `apps/web/app/manychat/cta-actions.ts`, tabla `manychat_events`.

#### [PAGO-SIN-IDEMPOTENCIA] Registrar un pago puede duplicarlo y la cuota puede quedar impaga
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** `recordClientPaymentAction` hace `insert` en `client_payments` sin clave de idempotencia (`app/sales/payment-actions.ts:221-237`); la tabla sólo tiene índices no únicos (`20260715100000_client_payments.sql:17-21`). La cuota se marca leyendo y reescribiendo `clients.installments` sin mirar el `error` del update (`:249-263`). La UI deshabilita el botón mientras corre (`components/sales/client-payments-section.tsx:405`), así que el doble click está cubierto, pero no un reintento tras perder la respuesta.
- **Riesgo:** Si la respuesta se pierde (red, timeout) y el usuario vuelve a registrar, entonces queda el cobro duplicado. Si falla el update de cuotas, el pago existe y la cuota figura impaga. Dos pagos simultáneos del mismo cliente pueden pisarse la lista de cuotas.
- **Impacto:** Cash collected inflado o cuotas "atrasadas" que no lo están, en Clientes y Finanzas; se corrige a mano borrando el duplicado.
- **Qué hay que hacer:** clave de idempotencia generada en el cliente (columna con índice único por org) y marca de cuota en SQL (RPC o `jsonb_set`) mirando el error. Coordinar con `[CLOSING-CIERRE-ATOMICO]`, que usa la misma action.
- **Dónde:** `apps/web/app/sales/payment-actions.ts`, `apps/web/components/sales/client-payments-section.tsx`, migración nueva.

#### [FATHOM-REINTENTOS-SIN-TOPE] Una llamada de Fathom que falla se reintenta una semana y después queda colgada
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** si `processSingleFathomCall` lanza, la llamada queda `processing` (`lib/fathom/process-call.ts:112-114`); `reclaimStuckFathomCalls` la devuelve a `pending` a los 15 min y la reintenta hasta 7 días (`lib/fathom/reclaim-stuck.ts:28,36`); después queda `processing` para siempre. No hay contador de intentos ni estado `failed`. En prod, ~10 llamadas fallaron ~296 veces cada una con `401 authentication_error` de Anthropic entre 2026-09-02 y 2026-09-21.
- **Riesgo:** Si el error es permanente (clave inválida, contenido que rompe el prompt), entonces la llamada consume cola y cuota cada 20-30 min durante una semana y al final queda invisible, sin análisis ni aviso.
- **Impacto:** Llamadas sin clasificar ni analizar en la org afectada; ruido en los logs que tapa otros errores; costo de IA si el error no es de autenticación.
- **Qué hay que hacer:** columna `attempts` y `last_error`; tras N intentos (p. ej. 5) pasar a `failed`, mostrarlo en Llamadas y permitir reintentar a mano; no reintentar errores permanentes (400/401/403) en bucle.
- **Dónde:** `apps/web/lib/fathom/process-call.ts`, `apps/web/lib/fathom/reclaim-stuck.ts`, migración nueva.

#### [FATHOM-CRUCE-AGENDA-DESCONECTADO] El peldaño "cruce con agenda" del resolvedor nunca se activa
- **Tipo:** bug
- **Estado verificado:** ítem nuevo. `processSingleFathomCall` llama `classifyRecording({ hasCalendarCrossing, calendarLeadId: null })` (`lib/fathom/process-call.ts:188-193`) y no pasa `calendarClientId`; el peldaño 4 de `resolveCounterparty` (`resolve-counterparty.ts:210`) exige uno de los dos. Además el peldaño 5 (nada resolvió) devuelve `purpose: "sales"`, así que cualquier externo desconocido cuenta como venta aunque no haya cruzado turno — contradice la regla "sólo es venta si cruza un turno".
- **Qué hay que hacer:** pasar el `lead_id`/cliente del turno cruzado (`salesCall.appointmentId` → `closing_calls.lead_id`) y decidir si el peldaño 5 debe dejar `purpose` en null.
- **Dónde:** `apps/web/lib/fathom/process-call.ts`, `apps/web/lib/fathom/resolve-counterparty.ts`.

#### [METRICAS-SHOW-RATE] El show rate cuenta turnos cancelados en el denominador
- **Tipo:** bug
- **Estado verificado:** ítem nuevo. `showRate = asistencias / totalAgendas` y `totalAgendas = callRows.length` (`app/sales/metrics-actions.ts:95-140`), incluye `cancelled`, que según `call-status.ts` son llamadas que nunca ocurrieron.
- **Qué hay que hacer:** excluir `cancelled` del denominador (p. ej. con `callHappened` de `lib/closing/call-status.ts`, que también excluye `scheduled`; definir con el negocio).
- **Dónde:** `apps/web/app/sales/metrics-actions.ts`.

#### [METRICAS-SNAPSHOT-FALLBACK] Con datos en cero, Métricas muestra el último Excel sin importar el rango
- **Tipo:** bug
- **Estado verificado:** ítem nuevo. `sales-metrics-redesign.tsx:74-110` usa `importedSnapshots[0]` cuando todo el período da 0, sin cruzar el `period_start` con el rango elegido ni avisar de qué mes es.
- **Qué hay que hacer:** elegir el snapshot del período o mostrar vacío con aviso explícito de la fuente.
- **Dónde:** `apps/web/components/sales/sales-metrics-redesign.tsx`.

#### [LEGACY-INBOX-BORRAR] Inbox legacy (ManyChat / Unipile / Instagram DMs) todavía vivo
- **Tipo:** deuda técnica
- **Estado verificado:** auditoría §3 "Salud del código" 1. `conversations` 0 filas, `instagram_*` 0, `manychat_events` 0. Sin embargo: ManyChat sigue `listed: true` (`lib/integrations/registry.ts:173`), crons `instagram/poll` (`*/5`) e `instagram/sync` en `vercel.json`, `PlatformDataProvider` carga `listConversationsAction` + canal Realtime en cada pantalla, `listClosingCallsAction` corre `repairClosingConversationLinks` (escribe) en cada lectura. ~7.600 líneas (detalle en `docs/areas/ventas.md` § Legacy). Incluye la race del array `conversations.messages` (auditoría §3 Confiabilidad 7) y "Instagram legacy queda afuera ante un error" (9). **Escondido para el release de octubre (SCRUM-490, 2026-10-02)**: la pieza no se muestra; volver a mostrarla es una bandera en `apps/web/lib/release/escondido.ts`. El pendiente sigue abierto.
- **Qué hay que hacer:** decidir el borrado; orden: provider/métricas → deslistar ManyChat → crons → código → migración que suelte `closing_calls.conversation_id` y las tablas.
- **Dónde:** ver doc de área.

#### [LLAMADAS-FASE-2-PULIR] Calificación previa sin UI
- **Tipo:** feature
- **Estado verificado:** `setLeadQualificationAction` acepta `moment: "pre"` (`app/sales/lead-actions.ts:530-556`) pero ningún componente la llama con `pre`; el drawer sólo la muestra. El resto del ítem (responsable) está resuelto.
- **Qué hay que hacer:** exponer la calificación previa en el drawer del turno.
- **Dónde:** `apps/web/components/closing/lead-detail-drawer.tsx`.

#### [SEGUIMIENTO-ESCALA] El estado del lead se deriva en memoria con techo de 2.000
- **Tipo:** deuda técnica
- **Estado verificado:** `MAX_LEADS = 2000` y `fetchAllRows` en `app/sales/lead-actions.ts:136-200`. Producción: 1.252 `sales_leads` (era 964 el 09-03).
- **Qué hay que hacer:** antes de ~1.800 leads, derivar el estado en SQL (vista/función), sin persistirlo.
- **Dónde:** `apps/web/app/sales/lead-actions.ts`, `apps/web/lib/sales/lead-thread.ts`.

#### [LLAMADAS-CANCELED-BY] `cancelled_by` siempre `unknown`
- **Tipo:** feature
- **Estado verificado:** `lib/calendly/sync-events.ts:108` y `closer-sync.ts:227` escriben `unknown`; `cancellation.canceled_by` no se lee.
- **Qué hay que hacer:** leer `cancellation.canceled_by` del evento/invitee de Calendly y mapear a `lead`/`closer`.
- **Dónde:** `apps/web/lib/calendly/fetch-scheduled-events.ts`, `sync-events.ts`, `closer-sync.ts`.

#### [ZERNIO-ANALISIS-UNTRUSTED] El análisis de DMs confía en lo que manda el navegador
- **Tipo:** seguridad
- **Estado verificado:** auditoría §3 "Seguridad" 6. `analyzeZernioConversationAction` (`app/integrations/zernio/actions.ts:493-628`) recibe los mensajes desde el cliente (no los relee de Zernio), los mete en el prompt sin `wrapUntrustedContent`, hace spread del JSON del modelo en el upsert y registra lead magnets a partir de ese texto.
- **Qué hay que hacer:** releer los mensajes server-side con `getMessages`, envolverlos con `wrapUntrustedContent`, whitelistear los campos del resultado.
- **Dónde:** `apps/web/app/integrations/zernio/actions.ts`.

#### [TOKENS-TEXTO-PLANO] (parte Ventas) Tokens de Calendly, Fathom org y ManyChat sin cifrar
- **Tipo:** seguridad
- **Estado verificado:** auditoría §3 "Seguridad" 2. `calendly_integrations.access_token/refresh_token` (`lib/calendly/oauth-token.ts`), `fathom_integrations.api_key` (`lib/fathom/process-call.ts:145-147`) en claro; RLS cerrado. La key por miembro sí se cifra.
- **Qué hay que hacer:** cifrar al escribir con `lib/security/encryption` y migrar lo guardado.
- **Dónde:** `apps/web/lib/calendly/*`, `apps/web/lib/fathom/connect.ts`.

#### [CALENDLY-RECONEXION-SUSCRIPCIONES] (nuevo) Reconectar Calendly deja suscripciones viejas y puede pisar la clave real
- **Tipo:** confiabilidad
- **Estado verificado:** el callback de OAuth (`app/api/integrations/calendly/oauth/callback/route.ts`, creación de la suscripción y upsert) crea una suscripción nueva en cada conexión y pisa `webhook_subscription_uri` y `webhook_signing_key`; la vieja sólo se borra en `disconnectCalendlyAction`, así que reconectar sin desconectar la deja activa en Calendly (sus eventos se rechazan con 401). Si la creación falla al reconectar, la clave real se reemplaza por `NO_WEBHOOK_SIGNING_KEY` y el webhook deja de llegar (queda el cron `calendly-sync`). Desde SCRUM-489 esa clave nunca vale como firma.
- **Qué hay que hacer:** antes de crear la suscripción, borrar la existente; si la creación falla y ya había una clave real, no pisarla.
- **Dónde:** `apps/web/app/api/integrations/calendly/oauth/callback/route.ts`.

#### [CALENDLY-SYNC-SIN-CANCELADOS] (nuevo) El cron de Calendly no recupera cancelaciones
- **Tipo:** confiabilidad
- **Estado verificado:** `lib/calendly/fetch-scheduled-events.ts` pide sólo eventos con `status: "active"`. Si el webhook `invitee.canceled` de un evento cancelado no llega o se rechaza (fuera de la ventana de 5 minutos de SCRUM-489, caída, 5xx), el turno queda como `scheduled` en Closing y el cron `calendly-sync` no lo corrige.
- **Qué hay que hacer:** que el cron también pida los eventos cancelados del período y actualice su estado en `closing_calls`.
- **Dónde:** `apps/web/lib/calendly/fetch-scheduled-events.ts`, `apps/web/lib/calendly/sync-events.ts`.

#### [API-TIMEOUTS] (parte Ventas) Sin timeout en Calendly, Fathom y Zernio
- **Tipo:** deuda técnica
- **Estado verificado:** auditoría §3 "Confiabilidad" 1. Ningún `AbortSignal.timeout` en `lib/calendly` ni `lib/fathom`. En `lib/zernio`, `zernioFetchJson` corta a los 15 s con `ZernioTimeoutError` desde SCRUM-172 (cubre analytics de posts, comentarios, anuncios, posts, historias y presign); los `fetch` directos de `lib/zernio/client.ts` siguen sin timeout (ver `[AUDITORIA §3 confiabilidad 1]`).
- **Qué hay que hacer:** agregar timeout en cada fetch.
- **Dónde:** esos directorios.

#### [SALES-ACTIONS-SIN-USO] Server actions exportadas sin llamador
- **Tipo:** deuda técnica
- **Estado verificado:** ítem nuevo. Sin llamadores: `getCallAnalysesAction`, `getMockCallAnalysisKeysAction` (`app/sales/actions.ts`), `getCloserCallsAction`, `updateCloserCommissionAction`, `getClosersWithCalendlyStatusAction` (`closer-actions.ts`), `getLeadThreadAction` (`lead-actions.ts`), `getConversationIdByExternalRef` (`app/conversations/actions.ts`), todo `app/unipile/actions.ts` y `app/instagram/actions.ts`. Cada export `"use server"` es un endpoint.
- **Qué hay que hacer:** borrarlas.
- **Dónde:** esos archivos.

#### [CALENDLY-TESTS] `lib/calendly` sin tests
- **Tipo:** tests
- **Estado verificado:** auditoría §3 "Salud del código" 4; no hay `lib/calendly/__tests__`. Tampoco `lib/sales/resolve-lead.ts` ni `lib/fathom/process-call.ts`.
- **Qué hay que hacer:** tests del mapeo de estados y de `syncMayOverwriteStatus` aplicado en las dos syncs; de `resolveLeadId` con mocks.
- **Dónde:** `apps/web/lib/calendly/`, `apps/web/lib/sales/`.

### Ventas · P3

#### [FATHOM-WEBHOOK-LEGACY] El webhook Fathom legacy usa un único secreto para todas las orgs
- **Tipo:** deuda técnica
- **Severidad:** Baja
- **Estado verificado:**
  - `connectFathom` guarda `webhook_secret: process.env.FATHOM_WEBHOOK_SECRET` en todas las filas de `fathom_integrations` (`lib/fathom/connect.ts:52`).
  - `/api/integrations/fathom/webhook` elige la única org cuyo secreto valida, o responde 409 si hay varias (`route.ts:58-86`).
  - `FATHOM_WEBHOOK_SECRET` no está en Vercel (listado del 2026-09-23), así que hoy responde 401 siempre. La UI sólo ofrece `/webhook/[token]`.
- **Qué hay que hacer:** borrar la ruta legacy (y `fathom_integrations.webhook_secret`), o generar un secreto por org.
- **Dónde:** `apps/web/app/api/integrations/fathom/webhook/route.ts`, `apps/web/lib/fathom/connect.ts`.

#### [WEBHOOK-FECHAS-INVENTADAS] Webhooks de Fathom y Calendly inventan la fecha, y la reentrega de Fathom pisa el análisis
- **Tipo:** bug
- **Severidad:** Baja
- **Estado verificado:** `ingestFathomWebhookCall` guarda `call_date = now()` si no viene `recorded_at` y hace `upsert` con `status: "pending"`, `processed_after`, `association_candidates: []` y `ai_next_steps: []` (`lib/fathom/process-call.ts:544-575`): una reentrega del mismo evento vuelve a encolar la llamada y borra esos campos. El webhook de Calendly usa `new Date()` si no encuentra `start_time` (`app/api/integrations/calendly/webhook/route.ts:162`) y su `catch` no loguea nada (`:187-191`).
- **Riesgo:** Si el proveedor manda un payload sin fecha o reentrega un evento, entonces queda un turno o llamada con fecha falsa y un reproceso de IA pagado otra vez. Va contra CLAUDE.md §3 ("nunca inventes un valor").
- **Impacto:** Métricas por período corridas; costo de IA duplicado. Poco frecuente (el webhook org de Fathom es legacy).
- **Qué hay que hacer:** dejar la fecha en `null` o rechazar con 4xx y que la sync lo traiga; en Fathom, si la fila existe, actualizar sólo los campos del proveedor sin tocar estado ni análisis; loguear el error de Calendly.
- **Dónde:** `apps/web/lib/fathom/process-call.ts`, `apps/web/app/api/integrations/calendly/webhook/route.ts`.

#### [VENTAS-E2E] Ninguna pantalla de Ventas tiene Playwright
- **Tipo:** tests
- **Estado verificado:** `apps/web/e2e/` sólo tiene `auth.setup.ts`, `constants.ts` y `holding.spec.ts` (único spec). Incluye la tabla de seguimiento de `[LLAMADAS-FASE-2-PULIR]`.
- **Qué hay que hacer:** smoke de Closing (seguimiento, editar celda) y Cobros (registrar cuota).
- **Dónde:** `apps/web/e2e/`.

#### [ZERNIO-EMOJIS-JSX] Emojis como íconos en la bandeja
- **Tipo:** deuda técnica
- **Estado verificado:** `TAG_CONFIG` en `components/sales/zernio-inbox-panel.tsx:39-48` y su copia en `components/sales/zernio-side-panel.tsx:16-25` usan emojis en las etiquetas, contra la regla de UI.
- **Qué hay que hacer:** reemplazar por íconos Lucide.
- **Dónde:** idem.

#### [CLOSING-FATHOM-PREVIEW] "Vista previa" de Fathom es un placeholder
- **Tipo:** feature
- **Estado verificado:** `components/closing/closing-overview.tsx:604-606` muestra un recuadro gris con el texto "Vista previa". Tampoco muestra el análisis de la llamada vinculada (`fathom_calls.closing_call_id` existe).
- **Qué hay que hacer:** sacar el placeholder o mostrar el resumen/score de la grabación cruzada.
- **Dónde:** idem.

#### [RANKING-TREND-FIJO] El ranking de closers siempre dice tendencia estable
- **Tipo:** feature
- **Estado verificado:** `app/sales/actions.ts:152` → `trend: "stable" as const`.
- **Qué hay que hacer:** calcular contra el período anterior o quitar el indicador.
- **Dónde:** `apps/web/app/sales/actions.ts`.

#### [METRICAS-SENA] No se distingue la seña
- **Tipo:** feature
- **Estado verificado:** TODO en `app/sales/metrics-actions.ts:112`; se aproxima con `outcome.paymentType === "upfront_fee"`.
- **Qué hay que hacer:** decidir si "seña" es un estado propio.
- **Dónde:** idem.

#### [ERRORES-INTERNOS-AL-CLIENTE] (parte Ventas) Webhooks devuelven el error interno
- **Tipo:** seguridad
- **Estado verificado:** auditoría §3 "Seguridad" 8. `app/api/integrations/manychat/webhook/[token]/route.ts:52-56` devuelve `e.message`; lo mismo en el webhook de Calendly.
- **Qué hay que hacer:** responder un mensaje genérico y loguear el detalle.
- **Dónde:** esas rutas.

---

## Marketing

Doc del área: [`docs/areas/marketing.md`](./docs/areas/marketing.md)

### Marketing · P1

#### [TRIAL-SECRET-EN-URL] `WORKER_AUTH_SECRET` en la URL de QStash y en logs
- **Tipo:** seguridad
- **Severidad:** Crítica
- **Estado verificado:** `createTrialReelsJobAction` arma `workerUrl = …?workerSecret=<secret>` y loguea `workerUrl` completo en `"[TrialReels] QStash published OK"` (`reel-variation-actions.ts`). Lo mismo en `publishVariationsAction`/`retryVariationAction` (`urlWithSecret`). QStash guarda la URL en su consola. El worker (`apps/reel-worker/src/index.ts`) compara con `===` (no tiempo constante), acepta el query param, y al fallar loguea los 4 primeros caracteres del secret esperado y 20 del header recibido. El payload lleva además el `driveAccessToken` de Google. Con el secreto, cualquiera puede encolar trabajos: el worker usa service role (`processor.ts:26-30`) y toma `organizationId` y `sourceStoragePath` del payload sin validarlos contra `reel_variation_jobs` (`index.ts:42-54`, `processor.ts:40-54`), así que puede leer archivos de otra org del bucket y escribir en su carpeta.
- **Riesgo:** Si alguien con acceso a los logs de Vercel/Fly o a la consola de QStash copia el secreto, entonces puede mandarle al worker trabajos arbitrarios: el worker usa service role y acepta cualquier organizationId y sourceStoragePath. Requiere acceso de lectura a logs o a QStash (personas del equipo o una integración de logs comprometida).
- **Impacto:** Con el secreto se leen videos de cualquier org del bucket de Trial Reels y se escriben archivos y filas de reel_variation_jobs a nombre de otra org; el driveAccessToken de Google del usuario también viaja en el payload. Afecta a todas las orgs que usan Trial Reels.
- **Qué hay que hacer:** sacar el secret del query (dejar sólo header o firma QStash con `url`), no loguear URLs con secret, rotar `WORKER_AUTH_SECRET`, usar comparación en tiempo constante en el worker y borrar el log del prefijo.
- **Criterio de aceptación:** Al generar y publicar Trial Reels, ni la URL destino en la consola de QStash ni los logs de Vercel o Fly contienen WORKER_AUTH_SECRET (el worker ya no acepta ?workerSecret=); el worker compara el secreto en tiempo constante y un pedido con secreto inválido responde 401 sin loguear ningún fragmento del secreto; WORKER_AUTH_SECRET fue rotado en Vercel y Fly
- **Dónde:** `apps/web/app/marketing/content/reel-variation-actions.ts`, `apps/reel-worker/src/index.ts`, `apps/web/lib/queue/verify-queue-request.ts`

#### [MKT-HOLDING-ORG] Contenido, Drive y Trial Reels ignoran el negocio activo del holding
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** `content/actions.ts` (`requireProfileOrganizationId`), `sync-actions.ts` (función local `requireOrganizationId` sobre `getCurrentProfile`), `drive-actions.ts`, `reel-variation-actions.ts`, `reel-music-actions.ts` usan `profile.organization_id`. Con el JWT del holding, RLS devuelve el negocio activo y el `.eq("organization_id", holding)` no matchea → biblioteca vacía o sync contra la org equivocada. Es el punto 7 de "Salud del código" de la auditoría.
- **Riesgo:** Si un usuario de un holding cambia al negocio activo y entra a Marketing → Contenido, entonces ve la biblioteca vacía, la sync falla con 'Zernio no está conectado' y Drive/Trial Reels operan contra la org del holding. Pasa siempre, sin condición rara.
- **Impacto:** Sólo cuentas holding (no se contó cuántas; está prohibido leer filas). No hay fuga ni corrupción: el filtro por la org del holding no matchea nada; el workaround es entrar con el usuario founder del negocio.
- **Qué hay que hacer:** reemplazar por `requireOrganizationId()` de `lib/auth/bootstrap.ts` en los cinco archivos.
- **Criterio de aceptación:** Con una cuenta holding que cambia al negocio activo con Zernio, /marketing/content muestra las piezas de ese negocio y la sync corre contra él; desde ese negocio, el detalle de pieza, vincular Drive y generar Trial Reels operan sobre el negocio activo; no quedan usos de profile.organization_id en app/marketing/content/*.ts y typecheck pasa
- **Dónde:** `apps/web/app/marketing/content/*.ts`

#### [TRIAL-REELS-MUSICA] La música propia de Trial Reels no se usa ni se puede subir
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** (a) `jobPayloadSchema` del worker (`apps/reel-worker/src/index.ts`) no declara `reelMusicPath`; `safeParse` de zod descarta la clave, así que `processor.ts` nunca la recibe y V3 cae a `luts/background-music.mp3`, que no existe → sale sin música (conserva el audio original con `-c:a copy`; sólo cambian crop y metadatos, `ffmpeg-variants.ts:110-145`). (b) `ReelMusicUpload` no se monta en ninguna pantalla (sólo lo exporta su archivo; ni siquiera `trial-reels/index.ts`).
- **Riesgo:** Si una org genera Trial Reels, entonces la variante V3 sale siempre sin la música propia, porque el worker descarta la ruta de la música y el uploader no está en ninguna pantalla. Pasa en el 100% de los trabajos.
- **Impacto:** Todas las orgs que usan Trial Reels: una de las variantes no cumple lo prometido (se parece más al original, sólo cambia crop y metadatos). El resto de las variantes y la publicación funcionan.
- **Qué hay que hacer:** agregar `reelMusicPath: z.string().nullable().optional()` al schema y redeployar Fly; montar `ReelMusicUpload` en Marketing → Contenido.
- **Criterio de aceptación:** Con una org que subió su música desde Marketing → Contenido, la variante V3 de un Trial Reel nuevo suena con esa música de fondo (hoy sale con el audio original y sin música); hay un test del schema del worker que confirma que reelMusicPath llega a processor
- **Dónde:** `apps/reel-worker/src/index.ts`, `apps/web/components/marketing/trial-reels/reel-music-upload.tsx`, `apps/web/app/(platform)/marketing/content/page.tsx`

#### [MKT-OVERVIEW-LEGACY] El Overview sale de `content_assets` (legacy)
- **Tipo:** bug
- **Severidad:** Alta
- **Estado verificado:** `getMarketingOverviewContextAction` y `buildOverviewMetricsFromAssets` usan `listContentAssetsAction` (`content_assets`, 6 filas en prod, sólo las escribe Instagram Graph). Las 150 `content_pieces` de Zernio sólo entran en el gráfico de distribución. Además cada carga ejecuta `recomputeContentAssetAttribution` (escrituras) y, sin caché caliente, una llamada a Haiku. **Escondido para el release de octubre (SCRUM-490, 2026-10-02)**: la pieza no se muestra; volver a mostrarla es una bandera en `apps/web/lib/release/escondido.ts`. El pendiente sigue abierto.
- **Riesgo:** Si una org mira el Overview de Marketing para decidir, entonces ve KPIs, embudo y mapa de calor calculados sobre content_assets (6 filas en prod, sólo Instagram Graph) en vez de su contenido de Zernio. Pasa en cada carga, y cada carga además escribe atribución y puede llamar a Haiku.
- **Impacto:** Todas las orgs con contenido sólo en Zernio ven números vacíos o de un subconjunto viejo en la pantalla principal del módulo; costo de IA y escrituras innecesarias por cada visita.
- **Qué hay que hacer:** decidir si el Overview pasa a `content_pieces` (métricas) y cortar el recompute en cada render (moverlo a cron o a la atribución).
- **Criterio de aceptación:** Agustín decidió si el Overview pasa a leer content_pieces y la decisión quedó registrada en PENDIENTES.md o CHANGES.md; si pasa, una org sólo con Zernio ve KPIs, embudo y mapa de calor con datos de su contenido; abrir /marketing ya no ejecuta recomputeContentAssetAttribution en cada carga
- **Dónde:** `apps/web/app/marketing/actions.ts`, `apps/web/lib/marketing/overview-metrics.ts`, `apps/web/components/marketing/marketing-overview.tsx`

#### [MKT-SALES-CONN-VACIA] Conexión con Ventas depende del inbox legacy
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** `lib/marketing/content-sales-rank.ts` lee `conversations` (0 filas en prod) y resuelve contra `content_assets`; `closed-buyer-journeys.ts` también. La atribución basada en Zernio (`lib/marketing/content-sales-attribution.ts` → `content_pieces.sales_attributed`) existe pero `updateSalesAttributionAction` no tiene callers, así que `sales_attributed` nunca se escribe y `getTopPerformingContentAction` por ventas (herramienta del agente) devuelve ceros. Pantalla oculta del menú.
- **Riesgo:** Si el agente de negocio usa getTopPerformingContentAction por ventas, entonces recibe ceros (sales_attributed nunca se escribe) y puede responder que ningún contenido vendió. La pantalla /marketing/sales-connection lee conversations (0 filas) pero está oculta del menú.
- **Impacto:** Todas las orgs: el ranking de contenido por ventas no existe en la práctica y el agente puede dar una respuesta equivocada; la pantalla sólo la ve quien tenga la URL.
- **Qué hay que hacer:** conectar el ranking a `content-sales-attribution` (cron o botón) o sacar la pantalla. Relacionado con `[EMBUDO-PANEL-DMS]`.
- **Criterio de aceptación:** Se decidió conectar o sacar la pantalla y quedó registrado en CHANGES.md; si se conecta, para una org con ventas atribuidas vía Zernio, /marketing/sales-connection muestra el ranking con revenue distinto de cero y content_pieces.sales_attributed se escribe; si se saca, /marketing/sales-connection redirige y no queda link a la pantalla
- **Dónde:** `apps/web/lib/marketing/content-sales-rank.ts`, `closed-buyer-journeys.ts`, `content-sales-attribution.ts`, `app/marketing/content/actions.ts`

#### [MKT-FORMS-SIN-RESPUESTAS] 38 formularios y 0 respuestas en producción
- **Tipo:** verificación manual
- **Severidad:** Alta
- **Estado verificado:** `list_tables` en prod: `forms` 38 filas, `form_responses` 0, `google_forms_integrations` 3, `typeform_integrations` 0. Google Forms devuelve `permissionDenied` con 401/403 y corta; con otro error hace `continue` sin registrar nada. Puede ser que los forms no tengan respuestas o que la sync falle en silencio.
- **Riesgo:** Si la sync de Google Forms falla por algo distinto de 401/403, entonces hace continue sin registrar nada y nadie se entera. Con 38 formularios y 0 respuestas en prod, es probable que ya esté pasando (o que los forms no tengan respuestas: no está confirmado).
- **Impacto:** form_responses alimenta pasos de los embudos (lib/funnels/resolve.ts) y el scoring de leads (lib/forms/sync-scoring.ts): si la sync falla, esos pasos y puntajes quedan en cero para las 3 orgs con Google Forms conectado.
- **Qué hay que hacer:** correr `/api/integrations/google-forms/sync?organizationId=` a mano y mirar el resultado; registrar errores por form.
- **Criterio de aceptación:** Se ejecutó el paso V10 de verificacion-manual.md (sync manual de Google Forms con organizationId) con cuenta real y el resultado quedó anotado; los errores de la sync quedan registrados por form en vez de ignorarse; si falló, se abrió un ítem nuevo
- **Dónde:** `apps/web/lib/google-forms/sync.ts`

#### [ZERNIO-WEBHOOK-SIN-EVENTOS] El webhook de Zernio no registró nada
- **Tipo:** verificación manual
- **Severidad:** Baja
- **Estado verificado:** `zernio_comments` y `zernio_messages` 0 filas en prod con 9 integraciones. El handler exige `ZERNIO_WEBHOOK_SECRET` (503 sin él). El formato de firma (`x-zernio-signature`, hex con o sin `sha256=`) es supuesto, sin doc local de Zernio. Ninguna pantalla ni cálculo lee `zernio_comments`/`zernio_messages` (sólo el webhook las escribe y responder/ocultar actualizan flags en `app/integrations/zernio/actions.ts:369,390`): hoy es una copia sin consumidores.
- **Riesgo:** Si el webhook no está registrado o falta ZERNIO_WEBHOOK_SECRET, entonces zernio_comments y zernio_messages siguen vacías. No hay nada que falle a la vista: las pantallas y el paso de comentarios de los embudos leen de Zernio en vivo.
- **Impacto:** Ninguna pantalla ni cálculo lee esas tablas (sólo se escriben los flags is_replied/is_hidden, que caen sobre cero filas). Se pierde sólo una copia histórica que hoy nadie consume.
- **Qué hay que hacer:** confirmar que el webhook está registrado en Zernio y la variable seteada; mandar un evento de prueba.
- **Criterio de aceptación:** Se ejecutó el paso V8 de verificacion-manual.md con cuenta real (ZERNIO_WEBHOOK_SECRET confirmado en Vercel, webhook registrado en Zernio, evento de prueba enviado) y el resultado quedó anotado; aparece una fila en zernio_comments o zernio_messages; si falló, se abrió un ítem nuevo
- **Dónde:** `apps/web/app/api/integrations/zernio/webhook/route.ts`

### Marketing · P2

#### [UTM-PUBLICO-ORG-EN-CUERPO] El tracking UTM público acepta cualquier org y campaña del navegador
- **Tipo:** seguridad
- **Severidad:** Media
- **Estado verificado:**
  - `/api/utm/track` y `/api/utm/click` son públicos y toman `organization_id` y `utm_campaign` del JSON (`app/api/utm/track/route.ts:27-50`, `app/api/utm/click/route.ts:21-31`).
  - `track` inserta en `utm_lead_captures` y suma `increment_utm_leads` si la campaña existe en esa org (`lib/utm/track-lead.ts:36-68`). `click` suma con `increment_utm_clicks`.
  - Hay rate limit sólo por IP. La respuesta `{ok}` revela si la campaña existe en esa org.
- **Riesgo:** si alguien copia el UUID y el nombre de campaña del snippet de una landing, puede inflar clics y meter leads inventados en esa org rotando IPs. Es fácil, sin cuenta.
- **Impacto:** clics, leads y conversión por UTM de la org afectada dejan de ser confiables. No expone datos.
- **Qué hay que hacer:**
  - Identificador público por link (no el UUID de la org) que el servidor resuelve a org y campaña.
  - Respuesta uniforme.
  - Límite por campaña además de por IP.
- **Dónde:** `apps/web/app/api/utm/{track,click}/route.ts`, `apps/web/lib/utm/track-lead.ts`.

#### [ZERNIO-METRICAS-429] El cron de métricas choca con el límite de pedidos de Zernio todos los días
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** `syncContentMetricsForOrg` lanza hasta 50 `getPostAnalytics` en paralelo (`lib/marketing/sync-content-metrics.ts:190-215`); `zernioFetchJson` (`lib/zernio/client.ts:303-354`) no reintenta ante un 429 (desde SCRUM-172 tiene timeout de 15 s). Zernio responde 429 con `limit: 6` y `retryAfterSeconds: 1`: 849 rechazos en `/api/queue/process-cron-sync-metrics` en 7 días (agregado de Vercel, 2026-09-23).
- **Riesgo:** Si una org tiene más de ~6 piezas, entonces la mayoría de cada lote falla con 429 y no se actualiza. El intento queda anotado en `metrics_checked_at` y la pieza pasa al final de su grupo (sin sumar espera), así que no se traba, pero no se reintenta hasta que le vuelve a tocar.
- **Impacto:** Métricas de contenido desactualizadas en Marketing para las orgs con más publicaciones (3 afectadas en la ventana).
- **Qué hay que hacer:** limitar la concurrencia (p. ej. 4 pedidos a la vez) y, ante 429, esperar `retryAfterSeconds` y reintentar una o dos veces dentro de `zernioFetchJson`.
- **Dónde:** `apps/web/lib/marketing/sync-content-metrics.ts`, `apps/web/lib/zernio/client.ts`.

#### [TRIAL-CLEANUP-LOOP] `cleanup-trial-reels` reprocesa los mismos jobs siempre
- **Tipo:** deuda técnica
- **Estado verificado:** el cron selecciona `done|failed` con `updated_at < 30 días` y nunca marca el job ni vacía `variations`. Auditoría §3 confiabilidad 8.
- **Qué hay que hacer:** tras borrar, limpiar `storage_path`/`preview_url` o marcar `cleaned_at`.
- **Dónde:** `apps/web/app/api/cron/cleanup-trial-reels/route.ts`

#### [TRIAL-4] Música por defecto del worker
- **Tipo:** decisión de negocio
- **Estado verificado:** `apps/reel-worker/luts/warm.cube` ya está en el repo (LUT "Presetpro - Movie Film", con copyright de Presetpro: confirmar licencia) y el Dockerfile copia `luts/`. Falta `background-music.mp3`. No sé si Fly tiene el deploy con el LUT.
- **Qué hay que hacer:** conseguir un mp3 libre de derechos (o depender de `[TRIAL-REELS-MUSICA]`), confirmar licencia del LUT y `fly deploy`.
- **Dónde:** `apps/reel-worker/luts/`

#### [TRIAL-FALLBACK-ROTO] El fallback en la lambda no acepta jobs de Drive
- **Tipo:** bug
- **Estado verificado:** sin `REEL_WORKER_URL`, QStash apunta a `/api/queue/process-reel-variations`, cuyo zod exige `sourceStoragePath`; la acción sólo manda `driveFileId`. El job queda `pending`. Además ffmpeg no está en Vercel.
- **Qué hay que hacer:** borrar el fallback o hacerlo fallar explícito marcando el job `failed`.
- **Dónde:** `apps/web/app/api/queue/process-reel-variations/route.ts`, `reel-variation-actions.ts` (`getReelWorkerUrl`)

#### [TRIAL-RETRY-GENERACION] Reintentar sólo sirve para fallas de publicación
- **Tipo:** bug
- **Estado verificado:** `retryVariationAction` pone la variación en `scheduled` y encola la publicación; si falló en FFmpeg no hay `storage_path` y la publicación vuelve a fallar.
- **Qué hay que hacer:** deshabilitar el botón cuando no hay `storage_path`, o re-encolar al worker.
- **Dónde:** `apps/web/app/marketing/content/reel-variation-actions.ts`, `components/marketing/trial-reels/variation-card.tsx`

#### [YT-SIN-CRON] YouTube se sincroniza sólo al conectar
- **Tipo:** deuda técnica
- **Estado verificado:** `syncYoutubeChannelAndVideos` sólo se llama desde los callbacks OAuth y `connectYoutubeApiKeyAction` (sin `await`: Vercel puede cortarlo, auditoría §3 confiabilidad 6). El cron de métricas filtra `source='zernio'`. Trae 25 videos. El upsert no revisa `error`. `docs/archivo/INTEGRACIONES_MAPA.md` dice "cron" y `content_assets`: ambos falsos.
- **Qué hay que hacer:** cron diario de YouTube (o incluir `source='google'` en el cron de métricas), `after()` en la sync inicial, corregir el mapa.
- **Dónde:** `apps/web/lib/google/sync-youtube.ts`, `apps/web/app/youtube/actions.ts`, `apps/web/vercel.json`

#### [MKT-DRIVE-CARPETA] "Nueva carpeta" en Administrar siempre falla
- **Tipo:** bug
- **Estado verificado:** `createDriveFolderAction` tira error siempre (scope `drive.readonly`), y `drive-admin-view.tsx` expone el botón. **Escondido para el release de octubre (SCRUM-490, 2026-10-02)**: la pieza no se muestra; volver a mostrarla es una bandera en `apps/web/lib/release/escondido.ts`. El pendiente sigue abierto.
- **Qué hay que hacer:** ocultar el botón o pedir `drive.file`.
- **Dónde:** `apps/web/app/marketing/content/drive-actions.ts`, `components/marketing/drive-admin-view.tsx`

#### [MKT-SCOPE-YT-UPLOAD] Se pide `youtube.upload` sin usarlo
- **Tipo:** seguridad
- **Estado verificado:** `GOOGLE_UNIFIED_SCOPES` incluye `youtube.upload` (y `yt-analytics-monetary.readonly`); ningún código sube videos. Sólo lo menciona `/privacidad`.
- **Qué hay que hacer:** sacarlo (y de la página de privacidad) salvo que haya un plan de uso; facilita la verificación de la app de Google.
- **Dónde:** `apps/web/lib/google/scopes.ts`

#### [AUDITORIA §3 seguridad 5] `updateContentPieceAction` sin validación
- **Tipo:** seguridad
- **Estado verificado:** pasa `updates` directo a `.update()`; el tipo TS no protege en runtime.
- **Qué hay que hacer:** zod con whitelist de campos.
- **Dónde:** `apps/web/app/marketing/content/actions.ts`

#### [AUDITORIA §3 seguridad 9] `content-thumbnails` público con policy de listado
- **Tipo:** seguridad
- **Severidad:** Baja
- **Estado verificado:** `20260805200000_content_thumbnails_bucket.sql`: bucket `public=true` y policy `SELECT` para `public` sobre `storage.objects` → se pueden listar las carpetas (org ids) de todas las orgs. Lo mismo con `avatars` en prod: bucket público y policy `Avatar read público` (SELECT para `public`, `bucket_id = 'avatars'`), que no está en ninguna migración (ver `[DB-DRIFT-STORAGE-REALTIME]`). `discord-bot-avatars` es público sin policy de SELECT, que es lo correcto.
- **Qué hay que hacer:** borrar la policy de SELECT (las URLs públicas funcionan sin ella).
- **Dónde:** migración nueva

#### [AUDITORIA §3 confiabilidad 1] Zernio sin timeouts ni defensas uniformes
- **Tipo:** deuda técnica
- **Estado verificado:** `zernioFetchJson` ya tiene timeout de 15 s (`AbortSignal.timeout`, `ZernioTimeoutError`; SCRUM-172). Falta el resto: `listAccounts`, inbox, `replyToComment`, `hideComment`, `createPost` y los analytics de cuenta hacen `fetch` directo, sin timeout ni `ZernioHttpError`.
- **Qué hay que hacer:** pasar esos métodos por `zernioFetchJson`.
- **Dónde:** `apps/web/lib/zernio/client.ts`

#### [ZERNIO-DOCS] Zernio no tiene documentación local y sus supuestos casi no están registrados
- **Tipo:** deuda técnica (documentación)
- **Estado verificado:** `docs/external-apis/` no tiene Zernio; `/accounts/{id}/instagram/stories`, `/posts/sync-stories`, `/media/presign`, formato de firma del webhook y forma de `/analytics` están implementados por prueba y error.
- **Qué hay que hacer:** bajar la doc (docs.zernio.com) con `docs/external-apis/tools/regenerar.sh` o registrar los supuestos en `docs/integraciones/apis-sin-documentacion.md`.
- **Dónde:** `docs/external-apis/`

#### [MKT-LEAD-MAGNETS-CAPTURA] Los lead magnets sólo capturan leads desde el análisis de DMs
- **Tipo:** feature
- **Estado verificado:** el único insert en `lead_magnet_leads` es `registerLeadMagnetFromDm`, disparado por `analyzeZernioConversationAction` si un mensaje saliente contiene la URL. Los canales `typeform`, `google_forms`, `landing`, `manychat` no tienen captura. `redirect_url` ("redirección para tracking de clicks") y la tabla `lead_magnet_clicks` no tienen código. **Escondido para el release de octubre (SCRUM-490, 2026-10-02)**: la pieza no se muestra; volver a mostrarla es una bandera en `apps/web/lib/release/escondido.ts`. El pendiente sigue abierto.
- **Qué hay que hacer:** decidir qué canales se miden y construir la captura (o sacar los canales del form).
- **Dónde:** `apps/web/lib/marketing/lead-magnets-internal.ts`, `app/marketing/lead-magnets-actions.ts`

#### [MKT-CODIGO-MUERTO] Componentes y acciones huérfanos
- **Tipo:** deuda técnica
- **Estado verificado:** sin imports: `components/marketing/{marketing-subnav,marketing-content-library,marketing-content-detail,youtube-video-performance,marketing-charts,instagram-empty-state}.tsx`, `overview/{conversion-strip,marketing-stat-card,metrics-sections,rate-bar,index}.ts(x)` (metrics-sections todavía cae a `mockMarketingOverview`); por arrastre quedan inalcanzables `cta-minute-input`, `content-label-badge`, `content-platform-metrics` (minuto de CTA + retención real de YouTube y etiqueta manual). Acciones sin caller: `publishVariantAsZernioDraftAction`, `generateVariantCaptionAction`, `deleteContentPieceAction`, `updateSalesAttributionAction`, `getContentPatternsAnalysisAction`, `getContentLabelDistributionAction`, `getInstagramIntegrationStatusAction`, `getContentAssetByIdAction`, `syncInstagramContentAction`, `syncInstagramMessagesAction`, `searchDriveFilesAction`, `getDriveFolderPathAction`, `getDriveFileAction`, `getUtmBaseUrlAction`, `getUTMLeadsAction`, `getReelMusicPathAction`, `getReelVariationJobAction`; en `lib/zernio/client.ts` `validateApiKey`, `listPostAnalytics`, `getAccountAnalytics`, `getPostsAnalytics` y todos los `zernio*` exportados. Cada export de un `"use server"` es un endpoint.
- **Qué hay que hacer:** decidir si se recupera algo (retención/CTA de YouTube, publicar variante a Zernio) y borrar el resto.
- **Dónde:** los listados

#### [AUDITORIA §3 salud 1] Legacy de Instagram Graph y `content_assets` todavía agendado
- **Tipo:** decisión de negocio
- **Estado verificado:** `vercel.json` corre `/api/integrations/instagram/sync` cada hora y `/instagram/poll` cada 5 min; 1 `instagram_integrations` en prod; `content_assets` 6 filas. El Overview y los UTMs (selector de videos) todavía leen `content_assets`.
- **Qué hay que hacer:** migrar Overview/UTMs a `content_pieces` y después borrar crons, tabla y `lib/instagram`.
- **Dónde:** `apps/web/vercel.json`, `lib/instagram/*`, `app/marketing/actions.ts`, `app/(platform)/marketing/utms/page.tsx`

#### [MKT-UTM-SELECTOR-VIDEOS] El generador de UTMs lista videos de `content_assets`
- **Tipo:** bug
- **Estado verificado:** `utms/page.tsx` filtra `listContentAssetsAction()` por `platform === "youtube"`, pero YouTube ahora escribe `content_pieces` (`source='google'`). Con una conexión nueva el selector queda vacío.
- **Qué hay que hacer:** leer videos de `content_pieces` `type='youtube'`.
- **Dónde:** `apps/web/app/(platform)/marketing/utms/page.tsx`, `utm-actions.ts` (`resolveYoutubeVideoExternalId`)

#### [MKT-CONTENT-LIMITE-50] La biblioteca muestra sólo 50 piezas
- **Tipo:** bug
- **Estado verificado:** `content/page.tsx` pide `limit: 50` sin paginación (prod: 150 piezas). El promedio de la org del detalle también usa 50.
- **Qué hay que hacer:** paginar o filtro por tipo/fecha server-side.
- **Dónde:** `apps/web/app/(platform)/marketing/content/page.tsx`

#### [PERMISOS-SERVER-ACTIONS/marketing] (compartido) Drive del founder y desconexiones abiertas a cualquier miembro
- **Parte de:** `[PERMISOS-SERVER-ACTIONS]` (ítem transversal en Plataforma). Acá, lo específico del área.
- **Tipo:** seguridad
- **Estado verificado:** `drive-actions.ts` y `disconnectFormAction` no chequean rol.
- **Qué hay que hacer:** ver ítem general.
- **Dónde:** `apps/web/app/marketing/content/drive-actions.ts`, `app/forms/actions.ts`

### Marketing · P3

#### [ZERNIO-WEBHOOK-DISCONNECTED] El webhook de Zernio ignora `account.disconnected`
- **Tipo:** bug
- **Estado verificado:** `app/api/integrations/zernio/webhook/route.ts` sólo maneja `message.received`/`message.sent`, `comment.received` y `account.connected` (líneas 94, 136, 168). `account.disconnected` figura en el comentario de eventos a suscribir (línea 3) pero no tiene rama: una cuenta desconectada en Zernio sigue en `zernio_integrations.connected_accounts` hasta que alguien corre `refreshZernioAccountsAction`, y la sync de contenido y `/comentarios` la siguen consultando.
- **Qué hay que hacer:** manejar `account.disconnected` sacando la cuenta de `connected_accounts` (o llamar al refresh de cuentas).
- **Dónde:** `apps/web/app/api/integrations/zernio/webhook/route.ts`

#### [BUG-1] Historias de Instagram — verificar en producción
- **Tipo:** verificación manual
- **Estado verificado:** la estrategia sigue igual (`listInstagramStories` primero). Sin evidencia en CHANGES de prueba con historia real.
- **Qué hay que hacer:** ver `docs/operacion/verificacion-manual.md` § Marketing.
- **Dónde:** `apps/web/app/marketing/content/sync-actions.ts`

#### [FEAT-1] Secuencias de historias
- **Tipo:** feature
- **Estado verificado:** tablas `story_sequences`/`story_frames` en prod (0 filas), sin código.
- **Qué hay que hacer:** definir con Santiago.
- **Dónde:** —

#### [FEAT-2] Análisis de competidores
- **Tipo:** feature
- **Estado verificado:** tablas `competitors`/`competitor_posts` en prod (0 filas), sin código.
- **Qué hay que hacer:** definir con Santiago.
- **Dónde:** —

#### [MKT-TESTS-SYNC-WORKER] Tests del mapeo de sync y del worker
- **Tipo:** tests
- **Estado verificado:** `externalPlatformPostId`, `mapZernioType`, `dedupeExternalPosts` (sync-actions, no exportadas) y `apps/reel-worker` sin tests. El bug de `reelMusicPath` lo hubiera atrapado un test del schema.
- **Dónde:** `apps/web/app/marketing/content/sync-actions.ts`, `apps/reel-worker/src/`

---

## Embudos y Lanzamientos

Doc del área: [`docs/areas/embudos.md`](./docs/areas/embudos.md)

### Embudos y Lanzamientos · P0

### Embudos y Lanzamientos · P1

#### [EMBUDOS-MEDIDAS-POR-EMBUDO] Dinero y anuncios son de la org entera en todos los embudos
- **Tipo:** bug / decisión de negocio
- **Severidad:** Alta
- **Estado verificado:** `resolveOrgMeasures` (`lib/funnels/resolve.ts`) lee `payment_orders`, `payment_transactions`, `ad_metrics_daily` y Hyros filtrando sólo por `organization_id`. `funnel_instances.product_id`, `price_point` y `currency` no se usan para filtrar. Dos embudos de la misma org muestran el mismo spend, revenue, CAC, ROAS, EPL, CPL, AOV y LTV. Contradice la decisión 1 de la spec (varias instancias por oferta). `PLAN_VERIFICACION §12` lo reconoce en una línea ("el spend es de la org entera").
- **Riesgo:** Si una org tiene dos o más embudos, o gasta en anuncios que no son del embudo, entonces cada embudo muestra el gasto y la facturación de toda la org. Pasa siempre, sin rótulo que lo avise.
- **Impacto:** CAC, ROAS, EPL, CPL, AOV y LTV por embudo son incorrectos para cualquier org con más de una oferta, y son justamente los números con los que se decide dónde poner plata.
- **Qué hay que hacer:** decidir cómo se asigna dinero y spend a un embudo (producto de Whop/Commas, campaña/cuenta de Meta, cuenta de Hyros) y agregar esos filtros como config de la instancia; mientras tanto, rotular en la UI que esas cifras son de toda la org.
- **Criterio de aceptación:** Agustín decidió cómo se asignan cobros y gasto a cada embudo (producto de Whop/Commas, campaña o cuenta de Meta, cuenta de Hyros) y la decisión quedó registrada en docs/areas/embudos.md; mientras no esté implementado, el detalle del embudo rotula el gasto, la facturación y los KPIs de dinero como 'de toda la organización'; una vez implementado, dos embudos de la misma org con filtros distintos muestran gasto y revenue distintos
- **Dónde:** `apps/web/lib/funnels/resolve.ts`, `apps/web/app/(platform)/funnels/[funnelId]/page.tsx`, `components/funnels/funnel-kpi-panel.tsx`.

#### [EMBUDOS-CUENTAS-REALES] Conectar las cuentas y correr la verificación 🔴
- **Tipo:** verificación manual
- **Severidad:** Alta
- **Estado verificado:** ninguna de las 10 unidades (I-1 a I-10) tiene evidencia en CHANGES.md de haberse probado con una cuenta real. Todas las migraciones están aplicadas en producción.
- **Riesgo:** Si alguno de los 10 mapeos (WebinarJam, Hyros, GHL, Whop, Commas, VTurb) no coincide con lo que mandan las APIs reales, entonces los pasos del embudo muestran cero, 'no sabemos' o números mal leídos sin que nada avise. Probabilidad alta: nada se probó con cuenta real y varios payloads son supuestos.
- **Impacto:** Todo el módulo de Embudos: cualquier org que lo use hoy ve números sin validar. Bloquea confiar en el resto de los ítems del área.
- **Qué hay que hacer:** conseguir API key de WebinarJam, cuenta de Hyros con API, sub-cuenta GHL de prueba, cuentas Whop/Commas, VTurb; correr `docs/operacion/verificacion-manual.md` § Embudos y Lanzamientos.
- **Criterio de aceptación:** Se ejecutaron los bloques V1 a V11 de verificacion-manual.md § Embudos y Lanzamientos con cuentas reales de WebinarJam, Hyros, GHL, Whop, Commas y VTurb, y el resultado de cada bloque quedó anotado; por cada falla se abrió un ítem nuevo en PENDIENTES.md
- **Dónde:** `docs/archivo/PLAN_VERIFICACION.md` §1–12 (condensado en `docs/operacion/verificacion-manual.md` § Embudos).

#### [EMBUDOS-GHL-ENTREGA] Cerrar cómo llegan los webhooks de oportunidades de GHL
- **Tipo:** verificación manual
- **Severidad:** Alta
- **Estado verificado:** `app/api/webhooks/ghl/route.ts` acepta firma Ed25519/RSA o secreto por org; el payload del Workflow no está documentado (se buscó en `docs/external-apis/gohighlevel/`). Si el Workflow no manda `type` (o `event`/`eventType`) con valor `Opportunity*`, la ruta descarta todo con 200 `ignored` sin guardar nada. El id de oportunidad se busca capa por capa empezando por la raíz (`lib/ghl/opportunity-event.ts`): un `id` en la raíz del payload del Workflow (que puede ser el del contacto) gana sobre un `opportunityId` anidado.
- **Riesgo:** Si el Workflow de GHL no manda type/event con valor Opportunity*, entonces la ruta responde 200 'ignored' y no guarda ni el crudo; si manda un id de contacto en la raíz, se lo toma como id de oportunidad. Probabilidad alta: el payload del Workflow no está documentado.
- **Impacto:** Los pasos de embudo basados en oportunidades de GHL (creadas, etapa alcanzada, ganadas) quedan en cero o mal asignados para cualquier org con GHL, y sin crudo no se puede reprocesar después.
- **Qué hay que hacer:** armar el Workflow en una sub-cuenta, mirar el crudo, confirmar `type`, id de oportunidad, `pipelineStageId` y `webhookId`. Si no hay `pipelineStageId`, priorizar `[FEAT-GHL-OAUTH]`.
- **Criterio de aceptación:** Se armó el Workflow de GHL en una sub-cuenta, se movió una oportunidad y quedó anotado el payload crudo recibido (type, id de oportunidad, pipelineStageId, webhookId); el evento quedó guardado en ghl_webhook_events en vez de descartarse como 'ignored'; si no llega pipelineStageId, se abrió o se priorizó FEAT-GHL-OAUTH
- **Dónde:** `apps/web/lib/ghl/opportunity-event.ts`, `apps/web/app/api/webhooks/ghl/route.ts`.

#### [WEBINARJAM-API-KEY] Pedir la API key de WebinarJam 🔴
- **Tipo:** decisión de negocio (trámite externo)
- **Severidad:** Media
- **Estado verificado:** integración construida (`lib/webinarjam/*`); sin key no hay datos para 3 pasos del embudo Webinar.
- **Riesgo:** Si no se consigue la key, entonces los 3 pasos de WebinarJam del embudo Webinar quedan sin datos. Es un trámite externo, no un defecto del código.
- **Impacto:** Sólo orgs que usan el embudo Webinar; el resto del embudo y de los tipos de embudo funciona. Workaround: cargar los números a mano fuera del sistema.
- **Qué hay que hacer:** pedir la key con `docs/external-apis/webinarjam/15370143-apply-for-an-api-key-for-webinarjam-or-everwebinar.md`; después cargar `pitch_second` por webinar.
- **Criterio de aceptación:** Agustín decidió pedir la API key de WebinarJam, la pidió, y la decisión quedó registrada en PENDIENTES.md; la key está cargada en /integrations → WebinarJam y la conexión trae los webinars; cada webinar a usar tiene cargado su segundo del pitch
- **Dónde:** `/integrations` → WebinarJam.

#### [EMBUDOS-PAGOS-VERIFICAR] Verificar el mapeo de Whop y Commas contra eventos reales
- **Tipo:** verificación manual
- **Severidad:** Alta
- **Estado verificado:** mapeo corregido contra la doc (`lib/payments/normalize.ts`), nunca probado con un evento real.
- **Riesgo:** Si el mapeo de Whop/Commas no coincide con los eventos reales (montos en centavos vs unidades, tipos de evento, reembolsos), entonces los cobros quedan como 'unmapped' o con monto equivocado. Probabilidad media: se corrigió contra la doc pero nunca se vio un evento real.
- **Impacto:** Revenue, AOV, LTV y ROAS de los embudos (única pantalla que lee payment_orders/payment_transactions); un cobro 'unmapped' no se pierde (queda el crudo) pero no hay reproceso (ver EMBUDOS-WEBHOOK-PERDIDA).
- **Qué hay que hacer:** compra de prueba, suscripción con y sin `auto_expire_after_x_periods`, reembolso; confirmar `processed` y montos.
- **Criterio de aceptación:** Se hizo una compra de prueba, una suscripción con y otra sin auto_expire_after_x_periods, y un reembolso, siguiendo el bloque V3 de verificacion-manual.md, y el resultado quedó anotado: los eventos quedan en 'processed' (la suscripción indefinida de Commas, en 'unmapped') y los montos coinciden con el panel del proveedor; si algo falló, se abrió un ítem nuevo
- **Dónde:** `apps/web/lib/payments/normalize.ts`, `docs/archivo/PLAN_VERIFICACION.md` §3.

#### [EMBUDOS-SYNC-PROGRAMADO] Registrantes de WebinarJam y catálogos sólo se actualizan a mano
- **Tipo:** feature / deuda técnica
- **Severidad:** Media
- **Estado verificado:** `syncWebinarJamRegistrantsForOrg` sólo se llama desde `app/webinarjam/actions.ts`; no hay cron en `apps/web/vercel.json` para WebinarJam, VTurb (players), Hyros (cuentas) ni pipelines de GHL. Los conteos de webinar del embudo quedan congelados en el último click de "sincronizar". El cron `ghl-sync` sólo trae citas.
- **Riesgo:** Si nadie aprieta 'sincronizar', entonces los registrantes de WebinarJam y los catálogos de VTurb, Hyros y pipelines de GHL quedan congelados. Pasa siempre que no haya intervención manual.
- **Impacto:** Orgs con embudos Webinar o con estos catálogos: los conteos se ven viejos sin aviso de antigüedad. Workaround: sincronizar a mano antes de mirar.
- **Qué hay que hacer:** agregar un cron (p. ej. cada 6 h) que sincronice registrantes de WebinarJam y, diario, los catálogos; respetar las cuotas (WebinarJam 20 req/s).
- **Criterio de aceptación:** Hay un cron en vercel.json que sincroniza los registrantes de WebinarJam varias veces por día (por ejemplo, cada 6 horas) y otro diario que sincroniza los catálogos de WebinarJam, VTurb, Hyros y los pipelines de GHL; sin tocar ningún botón, el conteo de registrantes de un embudo Webinar se actualiza después de la corrida del cron; el cron exige CRON_SECRET y responde 401 sin él
- **Dónde:** `apps/web/vercel.json`, nuevo `app/api/cron/*`, `lib/webinarjam/sync.ts`.

### Embudos y Lanzamientos · P2

#### [EMBUDOS-SALUD] Habilitar el estado de salud (bandas de la §04) ⏸️
- **Tipo:** decisión de negocio / feature
- **Estado verificado:** `applyHealthBand`, `resolveBenchmark`, `CROSS_FUNNEL_BANDS` sólo se usan en tests; la tabla de pasos muestra `benchmarkLabel` como texto. `funnel_benchmarks` sin uso. `diagnoseFunnel()` no existe.
- **Qué hay que hacer:** cuando Santiago lo habilite, capa de presentación (semáforo en pasos y KPIs), lectura de `funnel_benchmarks` para overrides y `diagnoseFunnel()`.
- **Dónde:** `apps/web/lib/funnels/health-bands.ts`, `components/funnels/funnel-steps-table.tsx`.

#### [EMBUDOS-GHL-BACKFILL] Poblar la última etapa conocida de las oportunidades preexistentes
- **Tipo:** feature
- **Estado verificado:** `searchGHLOpportunities` (`lib/ghl/client.ts`) sigue sin usarse; `deriveTransition` registra como `created` cualquier oportunidad que Limitless ve por primera vez, lo que infla `ghl_opportunities_created` en las primeras semanas.
- **Qué hay que hacer:** acción que traiga el estado actual y escriba sólo `ghl_opportunities` (nunca transiciones), antes de habilitar el webhook.
- **Dónde:** `apps/web/lib/ghl/client.ts`, `apps/web/app/ghl/opportunity-actions.ts`.

#### [EMBUDOS-GHL-WON] `ghl_opportunities_won` cuenta cualquier transición con status won
- **Tipo:** bug
- **Estado verificado:** `resolve.ts` filtra `ghl_stage_transitions.status = 'won'` sin mirar `kind`. `status` se copia en toda transición, así que una oportunidad ya ganada que cambia de etapa, o que Limitless ve por primera vez ya ganada (`created`), cuenta como ganada en ese período.
- **Qué hay que hacer:** contar sólo transiciones cuyo estado previo no era `won` (agregar `from_status` o filtrar `kind = 'status_change'` + `created` con status won sólo si es alta real).
- **Dónde:** `apps/web/lib/funnels/resolve.ts`, `apps/web/lib/ghl/stage-transition.ts`.

#### [EMBUDOS-WJ-SCHEDULE-NULL] Registrantes duplicados si `schedule` viene vacío
- **Tipo:** bug (condicional)
- **Estado verificado:** `UNIQUE (organization_id, product, webinar_external_id, schedule_external_id, email)` sin `NULLS NOT DISTINCT`; `normalizeRegistrant` deja `scheduleId` en `null` si falta. Con `null`, el upsert inserta una fila nueva en cada sync y `countWebinarRegistrants` (count de filas) se infla. Además `listWebinarJamRegistrants` corta en 5.000 filas sin avisar.
- **Qué hay que hacer:** `NULLS NOT DISTINCT` en el índice (Postgres 15+) o coalesce a `''`; registrar en el resultado del sync cuando se toca el tope.
- **Dónde:** `supabase/migrations/20260830190000_webinarjam.sql` (nueva migración), `lib/webinarjam/{normalize-registrant,client,sync}.ts`.

#### [EMBUDOS-SIGNAL-INCONSISTENTE] Fuentes que devuelven 0 en una org que nunca tuvo datos
- **Tipo:** bug
- **Estado verificado:** `countConversationsReplied`, `countConversationsBooked` y `countClientPayments` no pasan por `resolveWithSignal`; en una org sin `conversations` ni `client_payments` devuelven `0`, que el spine muestra como medido. Rompe la regla central §9.1. (El inbox legacy `conversations` quedó vacío al pasar a Zernio, así que el embudo DM por defecto hoy da ceros o `null` mezclados.)
- **Qué hay que hacer:** envolver las tres con `resolveWithSignal` + `countAllTimeRows`; test en `[T-6]`.
- **Dónde:** `apps/web/lib/funnels/resolve.ts`.

#### [EMBUDOS-DM-DEFAULTS] Los bindings por defecto del DM apuntan al inbox legacy vacío
- **Tipo:** decisión de negocio / deuda técnica
- **Estado verificado:** `DEFAULT_DM_BINDINGS` usa `conversations_*` (tabla del inbox ManyChat/Unipile). El inbox actual es Zernio live y no persiste (mismo problema que `[EMBUDO-PANEL-DMS]` del área Dashboard).
- **Qué hay que hacer:** decidir la fuente del DM (GHL `ghl_*`, o persistir conteos del inbox Zernio) y cambiar los defaults.
- **Dónde:** `apps/web/lib/funnels/sources.ts`.

#### [EMBUDOS-TIMEZONE] `reporting_timezone` se guarda pero no se usa
- **Tipo:** deuda técnica
- **Estado verificado:** `period.ts` corta en UTC; `reporting_timezone` (default `America/New_York`) sólo se muestra en el header del detalle. VTurb usa su propia `timezone` (default Buenos Aires). La spec §3.7 pide reportar en EST.
- **Qué hay que hacer:** calcular `periodBounds` en la zona de la instancia y pasar esa zona a VTurb/Hyros, o sacar el dato de la UI.
- **Dónde:** `apps/web/lib/funnels/period.ts`, `resolve.ts`, `lib/vturb/stats.ts`.

#### [EMBUDOS-MONEDAS] Montos de distintas monedas se suman
- **Tipo:** bug
- **Estado verificado:** `aggregatePayments` (`lib/payments/aggregate.ts`) ignora `currency`; `funnel_instances.currency` sólo formatea.
- **Qué hay que hacer:** filtrar por la moneda del embudo o convertir, y avisar cuando hay montos en otra moneda.
- **Dónde:** `apps/web/lib/payments/aggregate.ts`, `lib/funnels/resolve.ts`.

#### [EMBUDOS-SNAPSHOTS] Snapshots periódicos y pulso diario (Fase 5)
- **Tipo:** feature
- **Estado verificado:** `funnel_period_snapshots` existe en producción sin uso. El pulso diario ya existe como reporte ejecutivo de la org (cron `executive-report-daily`, `lib/executive-reports/generate-daily.ts`, ver `[REPORTES-PULSO-DIARIO]`) pero no lee los embudos; `REPORTING_CADENCE.daily` igual sigue diciendo "Falta el cron de pulso diario". Sin snapshots, los números de fuentes live (Zernio triggers) no tienen historia.
- **Qué hay que hacer:** cron que resuelva cada instancia activa y guarde el snapshot; decidir si el pulso diario existente (`executive-report-daily`) suma los números de los embudos (spend, leads, CPL, bookings, roturas) y corregir `REPORTING_CADENCE.daily`.
- **Dónde:** `apps/web/lib/funnels/resolve.ts`, nuevo cron.

#### [EMBUDOS-PERMISOS-ACCIONES] Server actions de embudos e integraciones sin chequeo de permiso
- **Tipo:** seguridad
- **Estado verificado:** `app/funnels/actions.ts`, `app/ghl/*`, `app/vturb/actions.ts`, `app/hyros/actions.ts`, `app/webinarjam/actions.ts`, `app/payments/actions.ts` sólo usan `requireOrganizationId()`; la página se bloquea por permiso `funnels` en el layout, pero la acción no. Un miembro con acceso "ver" puede crear embudos, cambiar bindings o regenerar el secreto del webhook de GHL (lo que corta la entrega). RLS de `funnel_*` es `FOR ALL` para cualquier miembro. Parte de `[PERMISOS-SERVER-ACTIONS]` (área Permisos).
- **Qué hay que hacer:** `requireRole()`/permiso de escritura en mutaciones y en conectar/regenerar secretos de integraciones.
- **Dónde:** archivos citados.

#### [EMBUDOS-GHL-WEBHOOK-HARDENING] Replay y dedupe global del webhook de GHL
- **Tipo:** seguridad
- **Estado verificado:** sin validación de timestamp (AUDITORIA §3 Seguridad 4, sigue abierto); el secreto viaja en query string (queda en logs); el índice único de `ghl_webhook_events.external_event_id` no incluye `organization_id`; se sigue aceptando la firma RSA legacy, deprecada por GHL el 2026-09-01.
- **Qué hay que hacer:** aceptar el secreto por header (`x-otc-webhook-secret` ya se lee) y documentarlo como preferido; índice único `(organization_id, external_event_id)`; quitar la vía RSA.
- **Dónde:** `apps/web/app/api/webhooks/ghl/route.ts`, `lib/ghl/verify-webhook.ts`, migración nueva.

#### [EMBUDOS-CRON-ERRORES] `ghl-sync` sigue devolviendo ok con ceros cuando falla una org
- **Tipo:** bug
- **Estado verificado:** el route devuelve 500 sólo ante excepción no controlada, pero `syncGHLOrganizationSafe` atrapa todo y devuelve ceros; el cron responde `ok: true`. Igual en `capture-ad-metrics` las orgs en error van a `errors` con 200. Lo mismo en otros crons (auditoría de confiabilidad 2026-09-23): `calendly-sync-closers` responde `200 { ok: true, orgs: 0 }` ante una excepción (`app/api/cron/calendly-sync-closers/route.ts:35-37`); `daily-signals` devuelve los errores de cada paso sólo en el cuerpo y no los loguea (`app/api/cron/daily-signals/route.ts:70-77`); `fathom/sync` y `typeform/sync` responden 200 con los errores por org adentro.
- **Qué hay que hacer:** devolver el error por org y 500/207 si alguna falló, para que el monitor de Vercel lo vea.
- **Dónde:** `apps/web/lib/ghl/sync-pipeline.ts`, `app/api/cron/{ghl-sync,capture-ad-metrics,calendly-sync-closers,daily-signals}/route.ts`, `app/api/integrations/{fathom,typeform}/sync/route.ts`.

#### [EMBUDOS-TIMEOUTS] Clientes HTTP sin timeout
- **Tipo:** deuda técnica
- **Estado verificado:** ningún `AbortSignal.timeout` en `lib/{ghl,vturb,hyros,webinarjam}/client.ts` (AUDITORIA §3 Confiabilidad 1). La página del embudo espera las respuestas de VTurb y Hyros sin límite de tiempo.
- **Qué hay que hacer:** timeout en cada `*Fetch`; que un timeout resuelva `null`.
- **Dónde:** archivos citados.

#### [T-6] [T-6b] [T-6c] [T-6d] [T-6e] [T-7] Tests del IO del módulo
- **Tipo:** tests
- **Estado verificado:** no existe ningún test que importe `resolveFunnel`, `ingestGHLOpportunityEvent`, `getVTurbPeriodMeasures`, `syncWebinarJamRegistrantsForOrg`, `getHyrosPeriodMeasures`, `ingestPaymentWebhook` ni las acciones de `app/funnels/actions.ts`. Corrección al backlog viejo: `[T-6]` pedía que `spend/reach/impressions` quedaran en `null` "porque no hay fuente": hoy salen de `ad_metrics_daily` y son `null` sólo sin filas.
- **Qué hay que hacer:** lo que lista `docs/archivo/TESTING_BACKLOG.md` §2, sumando los casos de `[EMBUDOS-SIGNAL-INCONSISTENTE]` y `[EMBUDOS-GHL-WON]`.
- **Dónde:** `apps/web/lib/funnels/__tests__/`, `lib/ghl/__tests__/`, etc.

#### [T-8] [T-17] E2E del módulo de embudos
- **Tipo:** tests
- **Estado verificado:** `apps/web/e2e/` sólo tiene `holding.spec.ts`.
- **Qué hay que hacer:** flujo crear → detalle → período → fuentes; snapshot de org sin datos sin ningún `0`.
- **Dónde:** `apps/web/e2e/`.

### Embudos y Lanzamientos · P3

#### [FEAT-GHL-OAUTH] App del Marketplace de GHL
- **Tipo:** feature
- **Estado verificado:** sólo PIT + `location_id` (`ghl-connect-dialog.tsx`); no hay rutas OAuth de GHL.
- **Qué hay que hacer:** registrar la app, OAuth start/callback, tokens en `ghl_integrations`, webhooks de plataforma.
- **Dónde:** `apps/web/lib/ghl/`, `components/integrations/ghl-connect-dialog.tsx`.

#### [EMBUDOS-VTURB-PITCH] Configurar el pitch time de los VSL en VTurb
- **Tipo:** verificación manual (operativa del cliente)
- **Estado verificado:** `pitch_time = 0` → `vturb_reached_cta` en `null`. El respaldo `configuredPitchTime` de `lib/vturb/stats.ts` nunca recibe valor (el loader de `resolve.ts` no lo pasa y no hay UI).
- **Qué hay que hacer:** configurar el pitch en VTurb; decidir si se agrega el respaldo en Limitless (como `pitch_second` de WebinarJam) o se borra el parámetro.
- **Dónde:** `apps/web/lib/vturb/stats.ts`.

#### [EMBUDOS-COMPARAR] Vista comparativa `/funnels/comparar`
- **Tipo:** feature
- **Estado verificado:** `paths.platform.funnels.comparar` existe; no hay página (cae en `[funnelId]` → 404).
- **Qué hay que hacer:** construirla cuando haya varias instancias con datos, o borrar el path.
- **Dónde:** `apps/web/routes/paths.ts`.

#### [EMBUDOS-GESTION-INSTANCIAS] No se puede renombrar, archivar ni borrar un embudo
- **Tipo:** feature
- **Estado verificado:** `app/funnels/actions.ts` no tiene update/delete; `is_active` sólo se lee.
- **Qué hay que hacer:** acciones de renombrar y archivar (`is_active = false`).
- **Dónde:** `apps/web/app/funnels/actions.ts`, `app/(platform)/funnels/page.tsx`.

#### [EMBUDOS-CODIGO-MUERTO] Código y tablas sin uso
- **Tipo:** deuda técnica
- **Estado verificado:** sin llamadas: `searchGHLOpportunities` (ver backfill), `getVTurbQuotaUsage` (además lee `data.usage` y el spec devuelve `{ quotas: [...] }`), `countHyrosLeadsInPeriod` y el cliente de `/leads/journey` (`getHyrosLeadJourneys`; sólo lo llama `getHyrosLeadJourneyAction`, que ninguna pantalla usa — M07 sin fuente), `REPORTING_CADENCE`, `ATTRIBUTION_STACK`; tablas `funnel_benchmarks`, `funnel_period_snapshots`; `payment_integrations.api_key_encrypted` se guarda y no se usa (backfill de pagos no construido).
- **Qué hay que hacer:** usar o borrar; corregir `getVTurbQuotaUsage` si se va a usar.
- **Dónde:** `lib/ghl/client.ts`, `lib/vturb/client.ts`, `lib/hyros/client.ts`, `lib/funnels/instrumentation.ts`.

#### [EMBUDOS-PAGOS-BACKFILL] Backfill de pagos por API
- **Tipo:** feature
- **Estado verificado:** la API key de Whop/Commas se guarda pero no hay cliente REST; retención (365 días) necesita historia que los webhooks no traen.
- **Qué hay que hacer:** backfill con `GET /payments`/`/refunds` (Whop) y `/checkout-sessions/transactions` (Commas).
- **Dónde:** `apps/web/lib/payments/`.

#### [LANZAMIENTOS-DORMIDO] Decidir qué hacer con Lanzamientos
- **Tipo:** decisión de negocio
- **Estado verificado:** páginas "Próximamente", nav `disabled`, `components/lanzamientos/*` sin importar, acciones vivas sólo para el picker del Workboard. OPERATIONAL_NOTES lo describe como CRUD funcionando. **Escondido para el release de octubre (SCRUM-490, 2026-10-02)**: la pieza no se muestra; volver a mostrarla es una bandera en `apps/web/lib/release/escondido.ts`. El pendiente sigue abierto.
- **Qué hay que hacer:** reactivarlo (montar los componentes existentes en las páginas) o borrar componentes y acciones sin uso, conservando `launches` para el Workboard. Si se reactiva: el prompt del post-mortem mete `name`/`description` sin `wrapUntrustedContent`.
- **Dónde:** `apps/web/app/(platform)/lanzamientos/*`, `components/lanzamientos/*`, `app/lanzamientos/actions.ts`.

---

## Agente de negocio e IA

Doc del área: [`docs/areas/agente-ia.md`](./docs/areas/agente-ia.md)

### Agente de negocio e IA · P0

### Agente de negocio e IA · P1

#### [PERMISOS-SERVER-ACTIONS/agente-ia] (parte IA) El agente lee todos los módulos sin mirar permisos
- **Parte de:** `[PERMISOS-SERVER-ACTIONS]` (ítem transversal en Plataforma). Acá, lo específico del área.
- **Tipo:** seguridad
- **Severidad:** Alta
- **Estado verificado:** `lib/agent/data-reader-handlers.ts` y `agent-tool-handler.ts` no consultan `getCurrentUserPermissions`; sólo RLS por org. Un miembro con permiso `agent` y sin `finance` obtiene finanzas con `get_finance_summary`, clientes con `get_clients_data`, etc. `saveClaudeApiKeyAction` (`app/settings/actions.ts:438`) tampoco exige founder. Además `getRecentOrgMessages` mete en el prompt 20 mensajes de conversaciones de **otros** usuarios de la org.
- **Riesgo:** Si un miembro con acceso a /agent pero sin Finanzas o Clientes le pregunta al agente por facturación, compensaciones o clientes, entonces obtiene esos datos: basta con escribir la pregunta. Además cualquier miembro puede reemplazar o borrar la clave de Claude de la org (saveClaudeApiKeyAction sólo pide sesión), y las respuestas pueden citar conversaciones de otros usuarios porque la RLS de agent_messages es por org.
- **Impacto:** Todas las orgs con roles personalizados: el bloqueo por módulo queda anulado por el agente, y un miembro puede cambiar la clave para que la IA de toda la org corra (y se facture) en otra cuenta o caiga a la global de Limitless. No expone datos de otras orgs.
- **Qué hay que hacer:** filtrar `AGENT_CHAT_TOOLS` según los módulos del rol antes de mandarlas a Claude (y rechazar en el handler); limitar `getRecentOrgMessages` al usuario actual; exigir founder en `saveClaudeApiKeyAction`/`removeClaudeApiKeyAction`.
- **Criterio de aceptación:** Un miembro con permiso 'agent' y sin 'finance' ni 'clients' pregunta en /agent por facturación y por clientes: el agente no devuelve esos datos (las tools de esos módulos no se le ofrecen y el handler las rechaza); el mismo miembro no ve en las respuestas fragmentos de conversaciones de otros usuarios de la org; un no-founder que invoca saveClaudeApiKeyAction o removeClaudeApiKeyAction recibe un error y la clave no cambia
- **Dónde:** `apps/web/lib/agent/stream-agent-message.ts`, `lib/agent/agent-tool-handler.ts`, `app/settings/actions.ts`.

#### [INTELIGENCIA-FUENTES-LEGACY] (nuevo) Inteligencia y reportes leen tablas legacy
- **Tipo:** bug
- **Severidad:** Alta
- **Estado verificado:** `lib/intelligence/collect-context.ts` lee `conversations` (líneas 128 y 186; 0 filas en prod al 2026-09-23) y `content_assets` (línea 209; 6 filas) en vez de `sales_leads` (1252) y `content_pieces` (150). `lib/intelligence/memory-chunks.ts` también usa `content_assets`, y el tono del founder (`lib/founder-tone/collect-sources.ts`) también. Los reportes y el snapshot ven marketing y DMs vacíos.
- **Riesgo:** Si una org opera con sales_leads y content_pieces (todas las actuales), entonces el snapshot de inteligencia, los reportes ejecutivos, la memoria del agente y el tono del founder se arman como si no hubiera DMs ni marketing. Pasa en cada generación, sin error visible.
- **Impacto:** Todas las orgs: los reportes que el founder usa para decidir omiten leads (1252 filas en prod) y contenido (150 piezas) y pueden recomendar sobre una foto incompleta del negocio.
- **Qué hay que hacer:** pasar a `sales_leads` y `content_pieces` (métricas vía `content_pieces.metrics`), revisar `hasMeaningfulData`.
- **Criterio de aceptación:** Para una org con leads en sales_leads y piezas en content_pieces, el snapshot de inteligencia y un reporte ejecutivo generados muestran datos de DMs/leads y de marketing (no vacíos); collect-context y memory-chunks ya no leen conversations ni content_assets
- **Dónde:** `apps/web/lib/intelligence/collect-context.ts`, `lib/intelligence/memory-chunks.ts:34`, `lib/founder-tone/collect-sources.ts:65`.

#### [AUDITORIA-ABIERTOS §3.6] Prompt injection: huecos restantes del área
- **Tipo:** seguridad
- **Severidad:** Alta
- **Estado verificado:** `wrapUntrustedContent` (`lib/ai/wrap-untrusted-content.ts`) no escapa `</label>`. Sin envolver: resultados de tools del agente (`agent-tool-handler.ts` devuelve JSON crudo con nombres, notas, transcripciones), `pageContext` (`lib/agent/page-context.ts`) y el bloque `org:tone` del JIT (`jit-context.ts:160`), que es texto generado por Claude a partir de transcripts. El texto del modelo puede disparar `[ACTION:CREATE_SOP]`.
- **Riesgo:** Si un tercero (un lead en un DM, un prospecto en una llamada transcripta, un documento subido) mete instrucciones en el texto, entonces al consultarlo desde el agente ese texto llega sin envolver en los resultados de tools y puede hacer que el modelo cree/edite tareas del tablero, emita [ACTION:CREATE_SOP] o sesgue la respuesta. Requiere algo de intención pero el atacante es externo y no necesita cuenta.
- **Impacto:** Todas las orgs que usan el agente: escrituras no pedidas dentro de la propia org (tareas, SOPs) y respuestas manipuladas sobre datos del negocio. No alcanza datos de otras orgs (RLS) y las escrituras son visibles y reversibles.
- **Qué hay que hacer:** escapar el tag de cierre en el wrapper; envolver `tool_result` y `pageContext`; envolver el tono.
- **Criterio de aceptación:** Un documento o dato que contiene el tag de cierre del wrapper no puede salirse del bloque envuelto (hay un test de wrapUntrustedContent con ese caso); los resultados de tools, el pageContext y el bloque de tono llegan a Claude envueltos como contenido no confiable; un documento en la base de conocimiento con el texto '[ACTION:CREATE_SOP:{...}]' no crea un SOP al consultarlo desde el agente
- **Dónde:** `apps/web/lib/ai/wrap-untrusted-content.ts`, `lib/agent/*`.

#### [REPORTES-PULSO-DIARIO] Revisar la salida real del pulso diario
- **Tipo:** verificación manual
- **Severidad:** Media
- **Estado verificado:** cron `0 11 * * *` y generador existen (`lib/executive-reports/generate-daily.ts`). Nada en CHANGES dice que se revisó una salida real. Agravante: el pulso recibe los datos de 14 días (`PERIOD_DAYS = 14` en `collect-context.ts`); sólo los estados por departamento usan 1 día.
- **Riesgo:** Si el pulso diario resume 14 días como si fueran 'hoy', entonces repite riesgos viejos o los infla todos los días. Pasa en cada corrida mientras no se ajuste la ventana.
- **Impacto:** Todas las orgs con reportes: el founder recibe una alerta diaria poco confiable y puede reaccionar a problemas ya resueltos o dejar de leerla. Hay workaround (los semanales y las pantallas en vivo) y no hay pérdida de datos.
- **Qué hay que hacer:** leer 3–5 pulsos reales; si inflan riesgos, ajustar el prompt y la ventana (ver `[REPORTES-VENTANA-FIJA]`).
- **Criterio de aceptación:** Se ejecutó el paso 5 de verificacion-manual.md § Agente de negocio e IA leyendo 3–5 pulsos diarios reales contra lo que pasó ese día y el resultado quedó anotado; si inflan riesgos o hablan de la última quincena, se ajustó el prompt/ventana o se abrió un ítem nuevo
- **Dónde:** `executive_reports where period='daily'`, `lib/executive-reports/generate-daily.ts`.

### Agente de negocio e IA · P2

#### [RAG-INGESTA-SIN-REINTENTO] (nuevo) La cola de indexado no reintenta cuando falla la ingesta
- **Tipo:** bug
- **Estado verificado:** `publishRagIngestionJob` publica con `retries: 3` (`apps/web/lib/queue/qstash-client.ts:169`), pero `processRagIngestion` (`lib/queue/processors/rag-ingestion.ts:104-127`) devuelve `{ chunkCount: 0, error }` cuando falla la ingesta (texto vacío, OpenAI caído, verificación de chunks), porque `indexBusinessContextInRag` (`lib/business-context/rag-indexing.ts:176-192`) atrapa el error. El worker (`app/api/queue/process-rag-ingestion/route.ts:58`) responde 200 y QStash no reintenta; sólo un throw inesperado da 500. Un corte transitorio de OpenAI deja el documento en `error` para siempre.
- **Qué hay que hacer:** en el worker, responder 500 cuando `result.error` viene de una falla transitoria (no para "sin texto"), para que QStash reintente.
- **Dónde:** `apps/web/app/api/queue/process-rag-ingestion/route.ts`, `lib/queue/processors/rag-ingestion.ts`.

#### [REPORTES-VENTANA-FIJA] (nuevo) El pulso diario y el semanal usan la misma ventana de 14 días
- **Tipo:** bug
- **Estado verificado:** `collectIntelligenceData` no recibe ventana; `PERIOD_DAYS = 14` fijo. El pulso "de hoy" (`generate-daily.ts:57`), el semanal (`generate-weekly.ts:30`) y el snapshot de inteligencia ven lo mismo. El mensual no lo usa (resume los semanales del mes).
- **Qué hay que hacer:** parametrizar `sinceDays` en `collectIntelligenceData` (1 / 7).
- **Dónde:** `apps/web/lib/intelligence/collect-context.ts`, `lib/executive-reports/generate-*.ts`.

#### [REPORTES-SEMANA-ETIQUETA] (nuevo) El semanal se etiqueta con la semana que empieza
- **Tipo:** bug
- **Estado verificado:** el cron corre los lunes; `generate-weekly.ts:106` usa `getCurrentWeekStart()` = ese lunes, y el título dice "lunes – domingo" de la semana que empieza, cuando el contenido es de los días previos.
- **Qué hay que hacer:** usar la semana anterior para `period_start`/label; ojo con el mensual, que agrupa semanales por `period_start`.
- **Dónde:** `apps/web/lib/executive-reports/generate-weekly.ts`, `lib/operations/weekly-utils.ts`.

#### [REPORTES-DUPLICADOS] (nuevo) Reintentos duplican reportes y snapshots
- **Tipo:** deuda técnica
- **Estado verificado:** `executive_reports` e `intelligence_snapshots` sólo tienen índice no único; `saveExecutiveReport` hace `insert`. QStash reintenta (retries 2) y el botón del pipeline también inserta.
- **Qué hay que hacer:** índice único `(organization_id, period, period_start)` + upsert en reportes; decidir retención de snapshots (hoy 2 por día por org, para siempre).
- **Dónde:** `apps/web/lib/executive-reports/shared.ts`, `lib/intelligence/generate-snapshot.ts`, nueva migración.

#### [INTELIGENCIA-SIN-REINTENTO] (nuevo) Snapshot y tono no reintentan
- **Tipo:** bug
- **Estado verificado:** `generateAndSaveIntelligenceSnapshot` y `generateAndSaveFounderTone` atrapan el error y devuelven `"failed"`; los workers `process-cron-intelligence-snapshot` y `process-cron-founder-tone` responden 200 → QStash no reintenta. El de reportes ejecutivos ya lo resolvió. En prod el snapshot falla con "Respuesta de IA con formato inválido" (10 casos en el agregado de errores de Vercel al 2026-09-23), que es justo el tipo de error que un reintento resuelve.
- **Qué hay que hacer:** replicar el `if (result === "failed") → 500` en esos dos workers.
- **Dónde:** `apps/web/app/api/queue/process-cron-intelligence-snapshot/route.ts`, `process-cron-founder-tone/route.ts`.

#### [CRONS-IA-ORGS-PAUSADAS-RESTO] (nuevo) Otros procesos con IA siguen corriendo para orgs pausadas
- **Tipo:** decisión de negocio
- **Estado verificado:** desde SCRUM-210, inteligencia, reportes ejecutivos y tono del founder sólo corren para orgs `status = 'active'` (`lib/intelligence/organizaciones-activas.ts`). Pero otros procesos con IA no miran `organizations.status`: `/api/integrations/fathom/process` (cada 10 min; analiza las llamadas que trae `fathom/sync` con Claude e indexa en RAG), `/api/cron/daily-signals` (Haiku para clasificar Discord y proponer hitos; elige orgs en `route.ts:86-104`) y el inbox de Instagram (`instagram/poll` + `process-message`, `lib/manychat/score-conversation.ts`). A pedido tampoco miran el estado (revisado el 2026-10-04; el botón de reportes e inteligencia y el reporte de Operaciones sí cortan): el agente (`app/agent/actions.ts`), la generación de SOPs (`app/sops/actions.ts`, `/api/queue/process-sop-video`), análisis, variantes y captions de contenido (`app/marketing/content/actions.ts`), el reporte de patrones de contenido (`app/marketing/content/pattern-report-actions.ts`), el post-mortem de lanzamientos (`app/lanzamientos/actions.ts`), el análisis de conversaciones de Zernio (`app/integrations/zernio/actions.ts`) y los captions de Trial Reels (`app/marketing/content/reel-variation-actions.ts`). Desde SCRUM-7 el costo va a la clave de Claude de cada org, no a la de Limitless. La pausa tampoco corta el acceso a la app (`lib/auth/bootstrap.ts` no mira `status`).
- **Qué hay que hacer:** decidir si pausar una org detiene todos sus procesos automáticos. Si sí, filtrar `status = 'active'` en esos caminos (reusar `listActiveOrganizationIds` al listar y `organizacionSigueActiva` al procesar cada org, los dos en `lib/intelligence/organizaciones-activas.ts`).
- **Dónde:** `apps/web/app/api/integrations/fathom/process/route.ts`, `apps/web/app/api/cron/daily-signals/route.ts`, `apps/web/app/api/instagram/` y, a pedido, las actions listadas arriba.

#### [IA-COSTOS-INCOMPLETOS] (nuevo) Costos de IA subestimados
- **Tipo:** deuda técnica
- **Estado verificado:** `MODEL_PRICING` (`lib/track-token-usage.ts`) pone Haiku 4.5 a 0,80/4 USD por MTok, que es el precio de Haiku 3.5 (Haiku 4.5 lista 1/5 — confirmar en la página de precios). Embeddings de OpenAI no se registran (el Batch API del cerebro sí, desde SCRUM-7). El modelo guardado es el lógico `claude-sonnet-4-6` aunque la API recibe 4.5 (mismo precio).
- **Qué hay que hacer:** corregir precios, registrar embeddings (`lib/rag/embeddings.ts`) y batch.
- **Dónde:** `apps/web/lib/track-token-usage.ts`, `lib/rag/embeddings.ts`, `app/super-admin/actions.ts`.

#### [IA-SONNET-ALIAS] (nuevo) Sonnet sigue apuntando a 4.5
- **Tipo:** decisión de negocio
- **Estado verificado:** `API_MODEL_ALIASES` reescribe `claude-sonnet-4-6` → `claude-sonnet-4-5-20250929` en `lib/ai/anthropic.ts` y, duplicado, en `lib/agent/stream-claude-agent.ts`. El comentario dice "hasta disponibilidad GA".
- **Qué hay que hacer:** confirmar si el ID real ya está disponible y, si se cambia, hacerlo en los dos archivos (o unificar el resolver).
- **Dónde:** esos dos archivos.

#### [RAG-SOP-HUERFANO] (nuevo) Un SOP que deja de estar activo sigue en RAG
- **Tipo:** bug
- **Estado verificado:** `app/sops/actions.ts` sólo llama `ingestDocument` si el status es `active`; nunca borra el `rag_documents` al pasar a draft/archivado. Mismo caso para productos/frameworks desactivados (el doc `product_context` se regenera, eso sí).
- **Qué hay que hacer:** borrar `rag_documents`/`rag_chunks` de `source_type = 'sop'` al desactivar.
- **Dónde:** `apps/web/app/sops/actions.ts`.

#### [RAG-CANVAS-INVISIBLE] (nuevo) Canvas guardado en la base de conocimiento no se ve ni se borra
- **Tipo:** bug
- **Estado verificado:** `saveCanvasToKnowledgeBaseAction` (`app/agent/canvas-actions.ts:82`) escribe en `rag_documents` (`source_type = 'canvas'`) sin crear `business_context_documents`. Tampoco usa el pipeline común (`ingestDocument`), sino embeddings uno por uno.
- **Qué hay que hacer:** crear la nota en `business_context_documents` y pasar por `scheduleBusinessContextRagIndexing`.
- **Dónde:** `apps/web/app/agent/canvas-actions.ts`.

#### [AGENTE-LINKS-VENCIDOS] (nuevo) Los archivos generados por el agente vencen a la hora
- **Tipo:** bug
- **Estado verificado:** `lib/agent/document-storage.ts` firma por 3600 s y la URL se guarda en `agent_messages.attachments`; nada la re-firma al reabrir la conversación.
- **Qué hay que hacer:** guardar el `storagePath` y firmar al leer.
- **Dónde:** `apps/web/lib/agent/document-storage.ts`, `lib/agent/stream-agent-message.ts`, `app/agent/actions.ts` (`listAgentMessagesAction`).

#### [AGENTE-CAMINO-LEGACY] (nuevo) Segundo agente sin uso
- **Tipo:** deuda técnica
- **Estado verificado:** `sendAgentMessageAction` (`app/agent/actions.ts:681`) sólo lo usa `providers/floating-chat-provider.tsx`, cuyo `FloatingChat` no se renderiza desde 2026-08-26. Duplica tools y prompt, sin compaction ni JIT. Sigue siendo un endpoint de server action invocable.
- **Qué hay que hacer:** borrar `sendAgentMessageAction`, `FloatingChatProvider` y `components/agent/floating-chat.tsx`, o migrarlos a `/api/agent/send`.
- **Dónde:** `apps/web/app/agent/actions.ts`, `providers/floating-chat-provider.tsx`, `providers/index.tsx`.

#### [AUDITORIA-ABIERTOS §3.4] `verifyQStashRequest` no valida la URL
- **Tipo:** seguridad
- **Estado verificado:** `lib/queue/qstash-verify.ts` llama `receiver.verify({ signature, body })` sin `url`. En los workers de crons sólo aplica cuando no hay `WORKER_AUTH_SECRET` (`verify-queue-request.ts`); `process-rag-ingestion` y `process-reel-variations` lo llaman directo, así que ahí aplica siempre.
- **Qué hay que hacer:** pasar `url: request.url` (o la URL pública esperada).
- **Dónde:** `apps/web/lib/queue/qstash-verify.ts`.

#### [AUDITORIA-ABIERTOS §3.8] `/api/rag/ingest` devuelve el error interno
- **Tipo:** seguridad
- **Estado verificado:** `app/api/rag/ingest/route.ts` responde `details: String(err)`. Protegido por `CRON_SECRET`, impacto bajo.
- **Qué hay que hacer:** sacar `details` de la respuesta.
- **Dónde:** `apps/web/app/api/rag/ingest/route.ts`.

#### [AUDITORIA-ABIERTOS §🟠2] `collect-context` sin paginar ni mirar errores
- **Tipo:** deuda técnica
- **Estado verificado:** `lib/intelligence/collect-context.ts:220` hace `clients.select("*")` sin `fetchAllRows` (337 filas al 2026-09-23; se corta en 1000) y varias lecturas no miran `error`.
- **Qué hay que hacer:** `fetchAllRows` o agregado en SQL; manejar `error`.
- **Dónde:** `apps/web/lib/intelligence/collect-context.ts`.

#### [REPORTES-GENERACION-MANUAL] Qué hace el botón del pipeline semanal
- **Tipo:** decisión de negocio
- **Estado verificado:** `GenerateWeeklyPipelineButton` sigue en `components/intelligence/intelligence-empty-state.tsx` y `components/operations/operations-report-empty-state.tsx`; `triggerWeeklyPipelineAction` genera el ejecutivo semanal. Corre 3 llamadas a Sonnet en serie dentro de una server action, sin rate limit.
- **Qué hay que hacer:** decidir si el botón genera el ejecutivo; si sigue, rate limit y moverlo a cola.
- **Dónde:** `apps/web/app/executive-reports/report-generation-actions.ts`.

#### [AGENTE-COMPACTION-FRAGIL] (nuevo) Si falla la compaction, falla el mensaje
- **Tipo:** bug
- **Estado verificado:** `compactConversationMessages` no está en try/catch en `stream-agent-message.ts`; `callClaudeText` lanza ante errores distintos de "sin credencial". El título de la conversación es fire-and-forget después del `done` (Vercel puede cortarlo).
- **Qué hay que hacer:** try/catch con fallback a los últimos N mensajes; `after()` para el título.
- **Dónde:** `apps/web/lib/agent/stream-agent-message.ts`, `lib/agent/compact-conversation.ts`.

### Agente de negocio e IA · P3

#### [KB-GOOGLE-SIN-RESYNC] (nuevo) Los Google Docs/Sheets importados no se pueden volver a sincronizar
- **Tipo:** feature
- **Estado verificado:** re-importar un archivo ya importado falla con "Este archivo de Google ya está en tu base de conocimiento." (`assertGoogleSourceNotImported`, `apps/web/app/business-context/actions.ts:328-343`). `resyncDocumentMarkdownAction` (`actions.ts:672`) sólo regenera `content_markdown` de un Google Doc para el visor, y el botón sólo aparece si el doc no tiene Markdown (`components/business-context/context-viewer.tsx:132`); no actualiza `content_text` ni re-indexa en RAG. Si el Doc cambia en Google, el agente sigue viendo la versión vieja.
- **Qué hay que hacer:** acción "Sincronizar" que re-exporte el archivo, actualice `content_text`/`content_markdown` y llame `scheduleBusinessContextRagIndexing`.
- **Dónde:** `apps/web/app/business-context/actions.ts`, `components/business-context/context-viewer.tsx`.

#### [T-14] Tests de `lib/agent/compact-conversation.ts`
- **Tipo:** tests
- **Estado verificado:** no existe `lib/agent/__tests__`.
- **Qué hay que hacer:** test de umbrales (20 mensajes / 40K tokens / mantener 6) y de que no toca la DB.
- **Dónde:** `apps/web/lib/agent/compact-conversation.ts`.

#### [IA-TESTS] (nuevo, amplía AUDITORIA ⚪4) Sin tests de la capa IA
- **Tipo:** tests
- **Estado verificado:** el único test del área es `lib/executive-reports/__tests__/cadences.test.ts`. Sin tests: `detectAgentComplexity`, `resolveAgentFlags`, `parseAgentActions`, `parseSseBuffer`, `credential-resolver` + fallback, `computeTokenCostUsd`, `chunkText`, `mapAnthropicCallError`, `monthBounds`.
- **Qué hay que hacer:** tests unitarios con mocks del SDK para el fallback; puros para el resto.
- **Dónde:** `apps/web/lib/{agent,ai,rag,queue,intelligence}`.

#### [IA-OAUTH-COLUMNAS] (nuevo) Columnas OAuth de Claude sin uso
- **Tipo:** deuda técnica
- **Estado verificado:** `claude_oauth_*` y `claude_credential_mode` en `organizations` y en la vista `organization_claude_status`; el código no las lee (`loadOrgCredentialRow` pide sólo las dos columnas BYOK).
- **Qué hay que hacer:** migración que las borre y rehaga la vista.
- **Dónde:** `supabase/migrations/20260711180000_org_ai_credentials.sql`, `20260922110000_*`.

#### [RAG-IVFFLAT-FILTRO] (nuevo) Búsqueda vectorial filtra por org después del índice
- **Tipo:** deuda técnica
- **Estado verificado:** `search_rag_chunks` ordena por distancia con índice `ivfflat (lists=100)` y filtra `organization_id` en el WHERE; con `probes` por defecto puede devolver menos de `match_count` resultados de la org cuando haya muchas orgs. Con 2010 chunks (al 2026-09-23) el planner probablemente hace seq scan; no se midió.
- **Qué hay que hacer:** medir con `EXPLAIN`; evaluar HNSW o subir `ivfflat.probes` dentro de la función.
- **Dónde:** `supabase/migrations/20260617100000_rag_infrastructure.sql`.

#### [AGENTE-CACHE-INEFECTIVO] (nuevo) El prompt caching del agente casi no pega
- **Tipo:** deuda técnica
- **Estado verificado:** el bloque cacheado es el contexto elegido por Haiku para cada mensaje (`buildJitOrgContextText`), distinto en cada turno; los turnos post-tool van con `usePromptCaching: false`.
- **Qué hay que hacer:** cachear un prefijo estable (system prompt fijo + tools) y dejar lo dinámico después.
- **Dónde:** `apps/web/lib/agent/stream-agent-message.ts`, `stream-claude-agent.ts`.

#### [PENDING-FEATURES: ruta intelligence sub-páginas] Sub-rutas de inteligencia son redirects
- **Tipo:** feature
- **Estado verificado:** `app/(platform)/intelligence/*/page.tsx` redirigen a anchors. Funciona; sólo es deuda de rutas en `routes/paths.ts`.
- **Qué hay que hacer:** borrar las sub-rutas y sus paths si nadie linkea.
- **Dónde:** `apps/web/app/(platform)/intelligence/*`, `routes/paths.ts`.

---

## Operaciones, Finanzas y Producto

Doc del área: [`docs/areas/operaciones.md`](./docs/areas/operaciones.md)

### Operaciones, Finanzas y Producto · P0

### Operaciones, Finanzas y Producto · P1

#### [FACTURACION-CLIENTES-SIN-PAGOS] Con el primer pago registrado, la facturación deja de contar a los clientes sin pagos
- **Tipo:** decisión de negocio
- **Severidad:** Alta
- **Estado verificado:** `collectRevenueEvents` (`apps/web/lib/metrics/revenue-events.ts:143-151`) usa sólo `client_payments` en cuanto la organización tiene al menos un pago registrado, y si no tiene ninguno arma los ingresos desde los clientes (pago único en la fecha de alta, cuotas pagadas en su fecha de cobro). No mezcla las dos fuentes. Los clientes importados (Excel, ClickUp) o cargados antes de `client_payments` no tienen filas de pago. Lo deja escrito el test "hoy: con un solo pago registrado, los clientes sin pagos dejan de contar" de `lib/metrics/__tests__/revenue-events.test.ts` (SCRUM-102). Además, no todas las llamadas pasan los pagos: el número de Finanzas y el MRR del Panel los reciben (`derive-finance-summary.ts:105`, `derive-monthly-series.ts:32`, `components/finance/finance-metrics.tsx:85`), pero el gráfico del MRR del Panel (`lib/metrics/derive-dashboard-data.ts:32,133`), la vista del super admin (`lib/super-admin/org-metrics.ts:32`) y el contexto de la IA (`lib/intelligence/collect-context.ts:297`) siguen contando desde los clientes.
- **Riesgo:** Si una organización con clientes importados registra su primer pago por la ficha o al cerrar una venta, entonces la facturación de Finanzas y del Panel cae de golpe: sólo cuenta lo registrado como pago.
- **Impacto:** Revenue, cash collected y lo que de ellos depende, subestimados en las organizaciones que mezclan clientes importados con pagos registrados; y pantallas que se contradicen: después del primer pago, el número del MRR baja pero su gráfico, la vista del super admin y lo que lee la IA no.
- **Qué hay que hacer:** decidir (Agustín) si la fuente única de facturación es `client_payments`. Si sí, migrar los cobros de los clientes viejos a `client_payments` y avisar; si no, combinar las dos fuentes sin contar dos veces (por cliente: sus pagos si tiene, y si no, lo que dice el cliente).
- **Criterio de aceptación:** Hay una decisión escrita sobre la fuente de facturación; todas las llamadas (Finanzas, Panel y su gráfico, super admin, IA) usan la misma fuente; una organización con un cliente importado sin pagos y otro con un pago registrado ve en Finanzas la suma de los dos (o, si se decide la fuente única, los cobros del importado ya están en client_payments); el test de revenue-events refleja la regla elegida.
- **Dónde:** `apps/web/lib/metrics/revenue-events.ts`, `client_payments`.

#### [PERMISOS-SERVER-ACTIONS/ops-fin-prod] Las actions y la RLS de estas áreas no miran el rol [transversal]
- **Parte de:** `[PERMISOS-SERVER-ACTIONS]` (ítem transversal en Plataforma). Acá, lo específico del área.
- **Tipo:** seguridad
- **Severidad:** Alta
- **Estado verificado:** sigue abierto como dice PENDIENTES. Específico de estas áreas: `app/finance/actions.ts`
  (gastos, suscripciones, compensación, liquidación: sólo `requireOrganizationId`; plataformas sí piden founder),
  `app/product/actions.ts` (ningún chequeo; `canEdit` siempre `true`), `app/workboard/*`, `app/sops/*`,
  `app/operations/actions.ts` (`generateWeeklyReportAction` gasta IA con cualquier miembro). Además el nivel
  `view` **no se aplica en ningún lado**: `app/(platform)/layout.tsx` sólo compara contra `none`, y no hay otro
  uso de `"view"` en componentes ni actions.
- **Riesgo:** Si un miembro con Finanzas o Producto en 'Sin acceso' o 'Ver' llama la Server Action desde la consola del navegador (o si el nivel 'Ver' se configura esperando sólo lectura), entonces puede leer y modificar gastos, suscripciones, compensaciones, liquidaciones, productos, SOPs y tablero, y gastar IA con el reporte semanal. Requiere conocimiento técnico básico para 'Sin acceso'; para 'Ver' no requiere nada, porque la pantalla deja editar.
- **Impacto:** Todas las orgs con roles personalizados: escalamiento de permisos dentro de la org, incluida la compensación del equipo (dato sensible). No cruza organizaciones.
- **Qué hay que hacer:** helper `requireModuleAccess(moduleId, "full")` sobre `requireOrganizationId()` y
  aplicarlo primero a Finanzas y Equipo; decidir si `view` significa "no puede editar" y ocultar controles.
- **Criterio de aceptación:** Con un rol que tiene Finanzas o Equipo en "Sin acceso", invocar una Server Action de gastos, compensación, liquidación o equipo desde la consola devuelve error y no escribe nada; con Finanzas en "Ver", intentar editar un gasto falla y los controles de edición no se muestran; hay un test del helper de acceso por módulo con los niveles none, view y full
- **Dónde:** `apps/web/lib/auth/get-current-permissions.ts`, las actions citadas.

#### [WORKBOARD-ASIGNACION-AGENTE] El agente, Fathom y "mandar al tablero" no mantienen `assignee_ids` [Operaciones y equipo]
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** `app/agent/workboard-actions.ts` (`createWorkboardTasksAction`, `updateWorkboardTaskAction`)
  escribe sólo `assignee_id`. El mapper (`lib/workboard/mapper.ts`) prefiere `assignee_ids` cuando no está vacío:
  si el agente reasigna una tarea que ya tenía lista, el cambio no se ve. Tampoco setea `completed_by/at` al
  pasar a `done`.
- **Riesgo:** Si el agente, Fathom o 'mandar al tablero' reasigna una tarea que ya tenía responsables o la pasa a Hecho, entonces la tarjeta sigue mostrando a los responsables viejos y la tarea cerrada no registra quién ni cuándo. Pasa cada vez que se usa ese camino sobre tareas ya asignadas.
- **Impacto:** Orgs que usan el agente o Fathom sobre el tablero: responsables equivocados a la vista y métricas de cierre incompletas. Workaround: editar la tarea a mano desde el tablero.
- **Qué hay que hacer:** que los dos caminos compartan la normalización (`normalizarResponsables`) y la lógica de
  cierre; idealmente una sola función de escritura.
- **Criterio de aceptación:** Pedirle al agente que reasigne una tarea que ya tenía dos responsables hace que la tarjeta muestre al nuevo responsable; una tarea que el agente, Fathom o "mandar al tablero" pasa a Hecho queda con completed_by y completed_at cargados; hay un test de la función de escritura compartida
- **Dónde:** `apps/web/app/agent/workboard-actions.ts`, `apps/web/app/workboard/actions.ts`.

#### [D-SOPS-VIDEO-NUNCA-CORRIO] Probar el flujo entero de SOP desde video [Operaciones y equipo]
- **Tipo:** verificación manual
- **Severidad:** Media
- **Estado verificado:** CHANGES no registra ninguna corrida. En producción hay **1 fila** en
  `sop_generation_jobs` (no se leyó su estado): alguien lo intentó al menos una vez. Riesgos del código:
  ffmpeg en la lambda, `maxDuration = 800`, `ESTIMATED_BYTES_PER_SECOND` estimado, calidad del prompt.
- **Riesgo:** Si el flujo de SOP desde video falla en producción (ffmpeg en la lambda, timeouts, prompt), entonces el usuario sube el video, espera y no obtiene el SOP. Probable: hay 1 job en prod y no consta que haya terminado bien.
- **Impacto:** Orgs que intenten usar la función (hoy al menos una); pueden perder tiempo y costo de Whisper. Workaround: escribir el SOP a mano o con el agente.
- **Qué hay que hacer:** correr el bloque de verificación (ver `docs/operacion/verificacion-manual.md` § Operaciones, Finanzas y Producto (1)) y mirar el
  estado/`error` de ese job.
- **Criterio de aceptación:** Se ejecutó el bloque 1 (SOP desde un video) de verificacion-manual.md con cuenta real, incluido el estado y error de la fila existente en sop_generation_jobs, y el resultado quedó anotado; si falló, se abrió un ítem nuevo
- **Dónde:** `apps/web/app/api/queue/process-sop-video/route.ts`, `apps/web/lib/sops/*`.

#### [OPS-SOP-VIDEO-MEMORIA] El worker mete el video entero en memoria y en `/tmp` [Operaciones y equipo]
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** `process-sop-video/route.ts` hace `Buffer.from(await file.arrayBuffer())` y
  `writeFile` en `tmpdir()`; el bucket acepta hasta 1 GB (`20260903110000`) y el límite de subida es
  `SOP_VIDEO_MAX_BYTES` (`NEXT_PUBLIC_SOP_VIDEO_MAX_MB`, 50 MB por defecto). `/tmp` de Vercel es de 512 MB y la memoria de la lambda es finita: un Loom grande
  falla antes de ffmpeg (hoy latente: el límite global de Supabase del plan gratis corta en 50 MB, ver
  `lib/sops/constants.ts`; pasa a ser real si se sube ese techo). `probeDurationSeconds` decodifica el video completo (`-f null -`) sólo para leer la
  duración. Si la duración sale 0, `computeAudioChunks(0)` manda todo el audio en un pedido (límite de 25 MB de Whisper).
- **Riesgo:** Si la duración del video no se puede leer, entonces se manda todo el audio en un solo pedido y Whisper lo rechaza por pasar 25 MB; si se sube el techo de 50 MB, un video grande agota memoria o /tmp. Con el techo actual (50 MB por el plan de Supabase) sólo el primer caso es alcanzable.
- **Impacto:** Orgs que suban videos para SOP: el job termina en error después de consumir tiempo; no se pierden datos. Hoy acotado por el límite de 50 MB.
- **Qué hay que hacer:** bajar por stream a disco (o pasar a ffmpeg una URL firmada como input), leer la
  duración con `-i` sin decodificar, y alinear `SOP_VIDEO_MAX_BYTES` con lo que la lambda aguanta. Si la duración
  no se puede leer, fallar con mensaje en vez de mandar un solo pedido.
- **Criterio de aceptación:** Un video del tamaño máximo permitido por SOP_VIDEO_MAX_BYTES (y uno de ~1 h) termina en ready sin error de memoria ni de espacio en /tmp; un video cuya duración no se puede leer termina en failed con un mensaje claro en vez de mandar todo el audio en un solo pedido a Whisper
- **Dónde:** `apps/web/app/api/queue/process-sop-video/route.ts`, `apps/web/lib/sops/constants.ts`.

#### [CLICKUP-MONTOS] El import de ClickUp lee mal los montos [Clientes / Integraciones]
- **Tipo:** bug
- **Severidad:** Alta
- **Estado verificado:** `coerceFieldValue` en `app/integrations/clickup/import-actions.ts:218`:
  `parseFloat(s.replace(/[^0-9.,]/g, "").replace(",", "."))` → `"1.500"` da 1,5 y `"$2,500.00"` da 2,5.
  Listado en `AUDITORIA_BACKEND` §3 "Dinero y datos". El importador crea `clients`, no tareas.
- **Riesgo:** Si una org importa clientes desde ClickUp con montos con separador de miles ('1.500', '$2,500.00'), entonces se guardan 1,5 o 2,5 sin avisar. Pasa en cada import con montos de 4 cifras o más, que es lo normal.
- **Impacto:** Orgs que usen el import de ClickUp: valores de clientes 1000 veces más chicos que cargan los totales y métricas con las que el founder decide. Workaround: corregir a mano cada cliente, si alguien lo nota.
- **Qué hay que hacer:** reusar el parser de montos que se arregle para el Excel (o uno común con tests para
  formatos es-AR y en-US) y no importar un monto ambiguo.
- **Criterio de aceptación:** Importar desde ClickUp montos "1.500" (es-AR) y "$2,500.00" (en-US) guarda 1500 y 2500; un monto ambiguo no se importa y queda informado en el resultado del import; hay un test unitario del parser con esos formatos
- **Dónde:** `apps/web/app/integrations/clickup/import-actions.ts`.

#### [OPS-STORAGE-BUCKETS] Confirmar que `sop-attachments` y `workboard-task-attachments` son privados [Operaciones y equipo]
- **Tipo:** verificación manual
- **Severidad:** Baja
- **Estado verificado:** ninguna migración los crea (`grep storage.buckets`); el código los usa con URLs
  firmadas. En prod (catálogo `storage.buckets`, 2026-09-23) **los dos existen y son privados**, pero sin
  límite de tamaño (`file_size_limit = null`) ni de tipos (`allowed_mime_types = null`), y no hay policies de
  `storage.objects` para ellos (sólo accede el servidor con admin client). Lo que queda es pasarlos a una
  migración con límites. Parte de `AUDITORIA_BACKEND` §3.9.
- **Riesgo:** Si alguien sube un archivo enorme o de tipo no esperado a sop-attachments o workboard-task-attachments, entonces el bucket lo acepta (no tiene límite de tamaño ni de MIME en prod); y si se recrea el proyecto, los buckets no existen porque ninguna migración los crea. La exposición pública ya no es un riesgo: ambos son privados en prod.
- **Impacto:** Mantenimiento y consumo de storage; no hay datos de otra org alcanzables (privados, sin policies para authenticated, acceso sólo por URL firmada del servidor).
- **Qué hay que hacer:** mirar en el dashboard que existan y sean privados; pasarlos a una migración
  (`insert into storage.buckets ... on conflict do nothing`) con límite de tamaño y MIME.
- **Criterio de aceptación:** Se verificó en el dashboard de Supabase que sop-attachments y workboard-task-attachments existen y son privados, y el resultado quedó anotado (si alguno era público, se abrió un ítem nuevo); existe una migración que los crea con límite de tamaño y tipos de archivo permitidos
- **Dónde:** `supabase/migrations/` (nueva), `apps/web/lib/{sops,workboard}/constants.ts`.

### Operaciones, Finanzas y Producto · P2

#### [WORKBOARD-CIERRE-ARRASTRANDO] Cerrar una tarea arrastrándola no registra quién la cerró [Operaciones y equipo]
- **Tipo:** bug
- **Estado verificado:** en el Kanban, arrastrar una tarjeta a "Hecho" termina en `performMove` →
  `moveWorkboardTaskAction` (`providers/workboard-provider.tsx:216`), que sólo actualiza `status` y `position`
  (`app/workboard/actions.ts:187-232`). `completed_by`/`completed_at` sólo los escribe `updateWorkboardTaskAction`
  (`app/workboard/actions.ts:274-282`), que se usa al cerrar desde el detalle. Igual al reabrir arrastrando: no se limpian.
- **Qué hay que hacer:** que `moveWorkboardTaskAction` aplique la misma regla de cierre (setear al pasar a `done`,
  limpiar al salir), idealmente compartiendo la función con `updateWorkboardTaskAction` y con `[WORKBOARD-ASIGNACION-AGENTE]`.
- **Dónde:** `apps/web/app/workboard/actions.ts`, `apps/web/providers/workboard-provider.tsx`.

#### [EQUIPO-TARIFA-SIN-UI] (nuevo) No hay pantalla para cargar la tarifa por hora
- **Tipo:** bug
- **Estado verificado:** `setMemberHourlyRateAction` escribe `profiles.hourly_rate` pero no tiene llamador; `/team` recibe `canEditRates` y no lo usa. El reporte de costo por persona depende de esa tarifa y el paso 5.8 de `verificacion-manual.md` asume que se puede cargar.
- **Qué hay que hacer:** agregar la edición de tarifa en la lista de miembros de `/team` (sólo founder/admin, según `canEditRates`) o sacar el reporte de costo hasta que exista.
- **Dónde:** `apps/web/components/team/team-overview.tsx`, `apps/web/app/(platform)/team/page.tsx`.

#### [OPS-SOP-VIDEO-NO-SE-BORRA] Los videos de SOP quedan para siempre en el bucket [Operaciones y equipo]
- **Tipo:** deuda técnica
- **Estado verificado:** la migración `20260903110000` dice "El worker lo lee con el admin client y lo borra al
  terminar"; el worker no llama `remove` en ningún camino. Son grabaciones internas del negocio.
- **Qué hay que hacer:** borrar `video_path` al pasar a `ready` (el transcript ya queda guardado) o con un cron de
  limpieza; decidir si en `failed` se conserva para reintentar.
- **Dónde:** `apps/web/app/api/queue/process-sop-video/route.ts`.

#### [SOPS-EDITAR] Un SOP guardado no se puede editar ni borrar [Operaciones y equipo]
- **Tipo:** feature
- **Estado verificado:** `updateSOPAction` (con versionado) no tiene ningún llamador; no existe action de borrado.
  `/sops/[id]` es solo lectura. En prod: 3 SOPs y **0** `sop_versions`, aunque `saveSOPAction` inserta la v1 sin
  mirar el error: o los 3 son anteriores al versionado o ese insert falla en silencio.
- **Qué hay que hacer:** editor en el detalle (reusar el creador) + borrar/archivar (`outdated`); chequear el
  error del insert de `sop_versions`.
- **Dónde:** `apps/web/app/sops/actions.ts`, `apps/web/app/(platform)/sops/[id]/page.tsx`.

#### [OPS-INPUT-RAPIDO-PISA] El input rápido pisa el input semanal del mismo departamento [Operaciones y equipo]
- **Tipo:** bug
- **Estado verificado:** los dos tabs de `/operations/inputs` llaman `saveWeeklyInputAction`, que hace upsert por
  `(organization_id, week_start, department, submitted_by)`. Un input rápido en "Ventas" reemplaza el contenido y
  el rating que la misma persona cargó para Ventas esa semana.
- **Qué hay que hacer:** decidir si el input rápido es otra cosa (tipo distinto, varias filas) o si concatena.
- **Dónde:** `apps/web/components/operations/team-input-form.tsx`, `apps/web/app/operations/actions.ts`.

#### [FIN-PAYROLL-BASES] La liquidación y "Gastos de equipo" calculan distinto [Finanzas]
- **Tipo:** bug
- **Estado verificado:** `computeTeamPayrollAction` (`app/finance/actions.ts`) cubre cinco bases; 
  `enrichTeamCompensationWithCommissions` sólo `per_deal`/`custom`. `per_booking` multiplica **todas** las
  `conversations` `booked` de la org (no las del setter; y `conversations` tiene 0 filas: el inbox legacy no se
  usa; al 2026-09-23). `monthly_revenue` usa `clients.total_amount` de activos como "MRR". `custom` en la
  liquidación es `max(0, estimated_this_month − fijo)` leyendo la columna de la base, que se crea en 0 y ninguna
  pantalla actualiza (el enrich calcula sólo en el navegador): hoy la comisión `custom` de la liquidación da 0.
- **Qué hay que hacer:** una sola función pura por base (con tests), atribución por miembro para bookings (de
  dónde sale: Calendly/GHL), y definir qué es MRR.
- **Dónde:** `apps/web/app/finance/actions.ts`, `apps/web/lib/metrics/enrich-team-compensation.ts`.

#### [FINANZAS-BASELINE-CASH-ESTIMADO] Cash collected inventado cuando se usa el Excel importado [Finanzas]
- **Tipo:** decisión de negocio
- **Estado verificado:** `providers/finance-data-provider.tsx`: sin facturación en vivo y con `metrics_snapshots`,
  si el snapshot no trae `cash_collected` se muestra `max(0, facturación − gastos)` como "Cash collected", y la serie
  mensual pinta el último mes con `max(0, facturación − gastos)` **siempre**, aunque el snapshot traiga `cash_collected`. Va contra la regla de CLAUDE.md de no inventar valores.
- **Qué hay que hacer:** mostrar "sin dato" y rotular que la facturación viene del import.
- **Dónde:** `apps/web/providers/finance-data-provider.tsx`.

#### [FIN-MONEDAS] Finanzas suma montos de monedas distintas [Finanzas]
- **Tipo:** bug
- **Estado verificado:** `fixed_expenses`, `subscriptions` y `payment_platforms` guardan `currency`, y los totales
  (`compute-expenses-summary`, `derive-finance-summary`) suman sin convertir. Misma familia que `[FACTURACION-MONEDAS]`
  (que es de Clientes).
- **Qué hay que hacer:** como mínimo agrupar por moneda o avisar cuando hay más de una; la conversión requiere
  decidir fuente de cotización.
- **Dónde:** `apps/web/lib/metrics/compute-expenses-summary.ts`, `derive-finance-summary.ts`.

#### [FIN-MESES-UTC] La liquidación arma el mes en UTC [Finanzas]
- **Tipo:** bug
- **Estado verificado:** `computeTeamPayrollAction` usa `new Date(y, m, 1)` en el servidor. Un cierre del 31 a
  las 22 h ART cae en el mes siguiente. `AUDITORIA_BACKEND` §3 Confiabilidad.10.
- **Qué hay que hacer:** límites de mes en `America/Argentina/Buenos_Aires` (o la zona de la org).
- **Dónde:** `apps/web/app/finance/actions.ts`.

#### [FIN-MP-WEBHOOK] El webhook de Mercado Pago toca todas las orgs y acepta replays [Finanzas]
- **Tipo:** bug / seguridad
- **Estado verificado:** con `topic = payment` hace `update mercadopago_integrations set last_sync_at` filtrando
  sólo `status = 'active'`, sin org ni `mp_user_id`. No valida la antigüedad de `ts` (`AUDITORIA_BACKEND` §3.4).
  No persiste el pago.
- **Qué hay que hacer:** si MP sigue, filtrar por `user_id` del payload y validar `ts`; si no, ver
  `[FIN-STRIPE-MP-DECIDIR]`.
- **Dónde:** `apps/web/app/api/webhooks/mercadopago/route.ts`, `apps/web/lib/mercadopago/webhook-verify.ts`.

#### [FIN-STRIPE-MP-DECIDIR] Stripe y Mercado Pago: conectables, sin uso, con código muerto [Finanzas]
- **Tipo:** decisión de negocio
- **Estado verificado:** `listed: false` en `lib/integrations/registry.ts`, 0 filas en ambas tablas.
  `app/stripe/actions.ts` y `app/mercadopago/actions.ts` no tienen consumidores. El registro declara que
  alimentan `payments` por webhook, lo que no es cierto. `stripe_integrations.access_token` está en **texto
  plano** (`AUDITORIA_BACKEND` §3.2). El "balance" de MP es la suma de los últimos 100 pagos (§3 Dinero). Sigue
  corriendo el cron diario de refresh de MP (sin filas, no hace nada).
- **Qué hay que hacer:** decidir: (a) borrar las dos integraciones, sus rutas, el cron y las actions; o (b)
  terminarlas (cifrar Stripe, persistir cobros, corregir el registro). Mientras tanto, corregir `dataFlows`.
- **Dónde:** `apps/web/lib/{stripe,mercadopago}/`, `apps/web/app/{stripe,mercadopago}/`,
  `apps/web/app/api/integrations/{stripe,mercadopago}/`, `apps/web/vercel.json`.

#### [PRODUCTO-METRICAS] Las stats de oferta dicen cosas que no son [Producto]
- **Tipo:** bug
- **Estado verificado:** `lib/product/offer-metrics.ts` + `lib/product/queries.ts`: `closeRate` es el global de
  la org; `topObjection` / `aiInsight` dependen de `topOrgObjection`, que `loadProductMetricsInput` nunca carga
  (salen "Sin datos"); `mainObjection`/`objectionHandler` se fuerzan a `""`; el match cliente↔oferta es por nombre;
  las lecturas no paginan (`closing_calls` ~1.450 filas en prod, techo de 1000).
- **Qué hay que hacer:** o calcular por oferta de verdad (llamadas con oferta asociada, objeciones de
  `call_analyses`) o sacar los campos que no se pueden calcular. Paginar con `fetchAllRows`.
- **Dónde:** `apps/web/lib/product/{offer-metrics,queries}.ts`.

#### [PRODUCTO-GATE-OFERTA-DUP] Reintentar el paso de oferta del onboarding duplica el producto [Producto]
- **Tipo:** bug
- **Estado verificado:** `saveGateOfferAction` (`app/onboarding/actions.ts`) llama `saveProductAction` sin id; el
  avatar tiene `replacePrimary` para este caso, la oferta no.
- **Qué hay que hacer:** un `replaceCoreOffer` análogo (pisar el producto `is_core_offer`).
- **Dónde:** `apps/web/app/onboarding/actions.ts`, `apps/web/app/product/actions.ts`.

#### [WORKBOARD-CARGA-DUPLICADA] El tablero lee las tareas dos veces por carga [Operaciones y equipo]
- **Tipo:** deuda técnica
- **Estado verificado:** `loadWorkboardPageDataAction` corre en paralelo `listWorkboardTasksAction`,
  `listWorkboardMembersAction` y `getSprintsAction`; esta última vuelve a llamar `listWorkboardTasksAction`
  (que a su vez lee miembros y links). `createWorkboardTaskAction` también lee todas las tareas para calcular
  `position`. Sin paginar (126 tareas hoy).
- **Qué hay que hacer:** pasar las tareas ya cargadas a `rowToSprint`; `position` con `max()` en SQL.
- **Dónde:** `apps/web/app/workboard/actions.ts`.

#### [TESTS-OPS-FIN-PROD] Lógica pura sin tests en las tres áreas [transversal]
- **Tipo:** tests
- **Estado verificado:** sin `__tests__` en `lib/{operations,team,expenses,mercadopago,stripe,product}` (de
  `lib/team/mapper.ts` sólo `permissionsFromRow` se prueba, desde `constants/__tests__/permisos-consolidados.test.ts`);
  `parseVideoSopResponse` y `lib/workboard/{mapper,sprint,time-report}` sin cubrir. Incluye `[T-22]`.
- **Qué hay que hacer:** prioridad: verificación de firma de MP (si MP sigue), bases de comisión, mapper de
  responsables del tablero, `parseVideoSopResponse`, `lib/product/mapper.ts`.
- **Dónde:** carpetas citadas.

### Operaciones, Finanzas y Producto · P3

#### [OPS-SOP-VIDEO-CAPTURAS] Las capturas del SOP desde video no están conectadas [Operaciones y equipo]
- **Tipo:** bug
- **Estado verificado:** el worker busca capturas en `sop_attachments` con `draft_id = id del job`
  (`app/api/queue/process-sop-video/route.ts:129` y `:210`) y el prompt las usa como marcadores, pero
  `components/sops/sop-video-creator.tsx` sólo sube el video: ninguna pantalla sube capturas contra un job. Al guardar,
  `sop-creator-form.tsx:180` manda como `draftId` el UUID propio del formulario (sólo si hubo adjuntos en modo texto),
  no el id del job. Resultado: un SOP desde video nunca tiene capturas.
- **Qué hay que hacer:** decidir si el modo video acepta capturas; si sí, subirlas con `draftId = job.id` antes de
  encolar y pasar ese id a `saveSOPAction`; si no, sacar del worker y del prompt la carga de capturas.
- **Dónde:** `apps/web/components/sops/sop-video-creator.tsx`, `apps/web/components/sops/sop-creator-form.tsx`,
  `apps/web/app/api/queue/process-sop-video/route.ts`.

#### [EQUIPO-INVITE-LEGADO] Invitaciones por token sin productor [Operaciones y equipo]
- **Tipo:** deuda técnica
- **Estado verificado:** nada inserta en `team_invitations` (0 filas en prod). Siguen vivos `/invite`,
  `/api/invite/validate` (que además devuelve `error.message` interno, `AUDITORIA_BACKEND` §3.8),
  `acceptInvitationAction`, `completeInvitationForCurrentUserAction`, `revokeInvitationAction` y la lista de
  pendientes en Equipo.
- **Qué hay que hacer:** borrarlos (y la tabla) o volver a ofrecer invitación por link.
- **Dónde:** `apps/web/app/invite/`, `apps/web/app/api/invite/validate/route.ts`, `apps/web/app/team/actions.ts`.

#### [PRODUCTO-VALUE-LADDER-TABLA] `value_ladder` es una tabla sin productor [Producto]
- **Tipo:** deuda técnica
- **Estado verificado:** 0 filas; ningún insert en el código. `buildProductData` la prefiere si tuviera filas.
- **Qué hay que hacer:** borrar la tabla y las lecturas/updates, o documentar quién la llena.
- **Dónde:** `apps/web/lib/product/{mapper,queries}.ts`, `apps/web/app/product/actions.ts`.

#### [PRODUCTO-GRAFO-NOMBRE] El nodo raíz del grafo lee una columna inexistente [Producto]
- **Tipo:** bug
- **Estado verificado:** `lib/product/queries.ts` hace `profiles.select("org_name")`; la columna no existe en
  ninguna migración. El nodo se llama siempre "Mi negocio".
- **Qué hay que hacer:** leer `organizations.name`.
- **Dónde:** `apps/web/lib/product/queries.ts`.

#### [PRODUCTO-UNICIDAD] Avatar principal y core offer sin garantía en la base [Producto]
- **Tipo:** deuda técnica
- **Estado verificado:** se desmarcan todos y se marca uno en dos updates sin transacción ni índice parcial.
- **Qué hay que hacer:** `create unique index ... where is_primary` / `where is_core_offer`, o una RPC.
- **Dónde:** `apps/web/app/product/actions.ts`, migración nueva.

#### [OPS-ADDONS-SOLO-MENU] Los add-ons `operaciones` y `producto` esconden el menú, no la ruta [Operaciones y equipo]
- **Tipo:** decisión de negocio
- **Estado verificado:** `buildPlatformRootItems` filtra el menú; ni el layout ni las páginas miran el add-on.
- **Qué hay que hacer:** decidir si el add-on es de venta (entonces bloquear la ruta) o sólo de orden visual.
- **Dónde:** `apps/web/lib/navigation/sidebar-modules.ts`, `apps/web/app/(platform)/layout.tsx`.

#### [WORKBOARD-TIEMPO-PRIMER-RESPONSABLE] El tiempo de una tarea compartida se le carga al primero [Operaciones y equipo]
- **Tipo:** decisión de negocio
- **Estado verificado:** la vista `workboard_time_by_member` agrupa por `assignee_id`; `time_entries.logged_by`
  existe pero no se usa en el reporte.
- **Qué hay que hacer:** decidir si el tiempo se atribuye a quien lo cargó.
- **Dónde:** `supabase/migrations/20260616100000_workboard_time_tracking.sql`, `apps/web/lib/workboard/time-report.ts`.

#### [OPS-LIMPIEZA] Rutas y componentes sobrantes [Operaciones y equipo · Finanzas]
- **Tipo:** deuda técnica
- **Estado verificado:** `/sops` ya redirige a `/operations/sops` (`lib/navigation/redirects.ts`, vía `next.config.ts`),
  así que `app/(platform)/sops/page.tsx` es código muerto; `components/finance/payment-platforms-section.tsx` no se
  importa en ningún lado; `timer_started_at`/`timer_running` en `workboard_tasks` sin uso (sólo
  `logTaskTimeAction` los pone en false/null).
- **Qué hay que hacer:** borrar `app/(platform)/sops/page.tsx` y el componente huérfano.
- **Dónde:** rutas citadas.

#### [EQUIPO-ADMIN] El rol `admin` no puede gestionar el equipo [Operaciones y equipo]
- **Tipo:** decisión de negocio
- **Estado verificado:** `canManageTeam` = `role === 'founder'`; en cambio `setMemberHourlyRateAction` y la
  policy/trigger de `profiles` sí habilitan a `admin`.
- **Qué hay que hacer:** decidir y alinear.
- **Dónde:** `apps/web/app/team/actions.ts`.

---

## Infraestructura, seguridad y tests (transversal)

Doc del área: [`docs/arquitectura/vision-general.md`](./docs/arquitectura/vision-general.md)

### Infraestructura, seguridad y tests (transversal) · P0

#### [DR-BACKUPS-SUPABASE] La base y los archivos de producción no tienen backups ni se ensayó nunca una restauración
- **Tipo:** decisión de negocio
- **Severidad:** Crítica
- **Estado verificado:** la organización de Supabase dueña del proyecto `OTC` (`nrzlylzbmsuowzhpdnjl`) está en plan `free` (`get_organization`, 2026-09-23). Según la doc oficial de Supabase (`guides/platform/backups`), sólo Pro/Team/Enterprise tienen backup diario y PITR es un add-on pago; los backups nunca incluyen los archivos de Storage. El único respaldo propio es un backup manual del 2026-09-28 (base y archivos de Storage), guardado fuera de Supabase en un Google Drive del equipo protegido con clave: es una foto de ese día, no un proceso automático, y nunca se probó restaurarlo. No hay ningún script ni workflow de dump en el repo. Storage: 13 buckets, ~797 MB, varios no reconstruibles (`client-payment-receipts`, `business-context-documents`, `sop-videos`, `ai-brain-documents`, `client-wins`). Migraciones destructivas aplicadas sin dump previo (`20260922140000_borrar_metric_snapshots`, `20260922130000_limpiar_restos_legacy_de_produccion`).
- **Riesgo:** Si una migración, un script con service role, una baja de organización o un bug borra o pisa datos, entonces no hay de dónde recuperarlos; si Supabase pierde el proyecto, se pierde todo. La probabilidad por evento es baja, pero el sistema se modifica a diario (175 migraciones en 4 meses) y sin red.
- **Impacto:** Todas las organizaciones: clientes, pagos cargados a mano, notas, wins, tareas, SOPs, documentos y comprobantes desde mayo 2026. Lo de proveedores se re-sincroniza sólo en parte (ver tabla §1.4 de la auditoría).
- **Qué hay que hacer:** (1) decidir el plan: Pro (backup diario 7 días) o Pro + PITR según el RPO que defina el equipo (preguntas en §7 de la auditoría); (2) mientras tanto, reemplazar el backup manual del 2026-09-28 por un dump diario automatizado (`supabase db dump` roles + schema + data) a un almacenamiento fuera de Supabase; (3) copia periódica de los buckets no reconstruibles; (4) regla: dump de las tablas afectadas antes de toda migración destructiva; (5) ensayar una restauración completa en un proyecto descartable con checklist de lo que no está en migraciones (Auth Hook `custom_access_token_hook`, redirect URLs y SMTP de Auth, 5 buckets de `[AUD-SEG-9]`, publicaciones de realtime, extensiones) y escribir el procedimiento en `docs/operacion/`.
- **Criterio de aceptación:** Existe un backup de la base de producción de menos de 24 h que se puede listar (panel de Supabase en plan pago, o archivo de dump fechado fuera de Supabase generado por un proceso automático); existe una copia de los buckets no reconstruibles de menos de 7 días; se restauró ese backup en un proyecto descartable, la app apuntada a él permite entrar con una cuenta de prueba y ver sus clientes, y el procedimiento con tiempos medidos quedó escrito en `docs/operacion/`; la regla de dump previo a migraciones destructivas figura en `docs/arquitectura/base-de-datos.md`.
- **Dónde:** Supabase (plan, backups), `docs/operacion/`, `docs/arquitectura/base-de-datos.md`, script o workflow de dump nuevo.

Prioridad sugerida P0: es pérdida irreversible de datos de todos los clientes y la mitigación mínima (dump diario) es barata.

#### [PERMISOS-SERVER-ACTIONS/infra] Los roles no se hacen cumplir en la base ni en las actions (incluye AUD-SEG-1)
- **Parte de:** `[PERMISOS-SERVER-ACTIONS]` (ítem transversal en Plataforma). Acá, lo específico del área.
- **Tipo:** seguridad
- **Severidad:** Alta
- **Estado verificado:** **Parte A resuelta el 2026-09-29 (SCRUM-1):** `20260929100000_roles_equipo_y_config_en_la_base` agrega `current_user_has_org_role(roles)` y exige founder para escribir `team_roles`, para todo `team_invitations` (incluido leer el token) y para el UPDATE de `organizations`; founder o admin para el DELETE de `clients`. `lib/auth/require-org-role.ts` aplica lo mismo en las actions de configuración de la org, clave de Claude, `deleteClientAction` y los `disconnect*Action` de la org. Lo que sigue abierto es la parte B, descrita en el resto del ítem (permiso por módulo y nivel). Estado anterior: ninguna policy RLS filtra por rol salvo `Founders update org profiles` (UPDATE de `profiles`, `20260616100000_workboard_time_tracking.sql`: founder/admin editan perfiles de su org); el resto va sólo por `organization_id`. No existe ningún helper `requireRole`/`requirePermission` en `app/` ni `lib/` (grep vacío). El único bloqueo es el render en `app/(platform)/layout.tsx` (`<SinAcceso/>`). Un viewer puede, vía PostgREST con su JWT, escribir `team_roles.permissions`, tablas de finanzas y lo que tenga policy `FOR ALL` por org (`discord_integrations`, `unipile_integrations`); vía actions, `saveClaudeApiKeyAction`, los `disconnect*Action`, el Drive del founder y `updateCloserCommissionAction`. `organizations` ya está protegido por grants por columna.
- **Riesgo:** Si un usuario con rol limitado (viewer, closer) usa su propio JWT contra PostgREST, entonces puede hacer PATCH a `team_roles.permissions` de su propio rol y quedar con acceso `full` a todos los módulos (`get-current-permissions.ts:91-101` lee los permisos de esa fila), o borrar/editar filas de finanzas e integraciones. Requiere saber usar la API, pero no hay ninguna barrera técnica.
- **Impacto:** Afecta a toda org con miembros no founder: se rompe el modelo de roles (lo que el founder cree que un viewer no ve ni toca, lo puede cambiar), incluida la key BYOK y comisiones de closers. No cruza organizaciones: el daño queda dentro de la propia org.
- **Qué hay que hacer:** (1) helper `requireRole(minRole | modulo, nivel)` sobre `requireOrganizationId()` y aplicarlo primero en actions de plata, equipo, integraciones y BYOK; (2) policies de escritura por rol en `team_roles`, finanzas y `*_integrations` editables (función SQL `current_user_role()` o similar); (3) test que recorra los exports críticos.
- **Criterio de aceptación:** Con un usuario viewer, invocar saveClaudeApiKeyAction, un disconnect*Action, updateCloserCommissionAction y una action de Finanzas devuelve error de permiso y no cambia nada en la base; con el JWT de ese viewer, un PATCH por PostgREST a team_roles, a una tabla de finanzas y a discord_integrations/unipile_integrations es rechazado por RLS mientras el founder/admin sigue pudiendo escribir; hay un test que recorre los exports críticos y falla si alguno no llama al chequeo de rol (paso 6 de V-INFRA-1 en verificacion-manual.md rechaza)
- **Dónde:** `apps/web/lib/auth/`, `app/settings/actions.ts`, `app/sales/closer-actions.ts`, `app/finance/actions.ts`, `app/team/actions.ts`, `app/integrations/**`, `app/marketing/content/drive-actions.ts`, migración nueva.

### Infraestructura, seguridad y tests (transversal) · P1

#### [ACTIONS-ERRORES-EN-PRODUCCION] (nuevo) 101 server actions lanzan errores con texto para el usuario que en producción no llega
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** en producción Next no le manda al cliente el mensaje de un error lanzado por una server action: sólo un digest, y la pantalla muestra "An error occurred in the Server Components render. The specific message is omitted in production builds…" (verificado el 2026-10-04 con un build de producción de la app en la revisión de SCRUM-210). Conteo del 2026-10-04 sobre `b0f154e9` más la rama `fix/revision-integral-4-oct`: de 99 archivos `"use server"` de `apps/web/app` y `apps/web/lib`, 30 tienen funciones exportadas que hacen `throw new Error(...)` con un texto, un `firstZodError`, un `map*Error` o un `error.message` fuera de `runMutation` y fuera de un `try` cuyo `catch` no relanza: **101 funciones, 186 throws** (58 mutaciones y 43 lecturas por nombre: `get*`, `list*`, `load*`, `search*`). Por módulo (funciones): Marketing 27 (`app/marketing/content/{actions,ad-actions,comment-actions,drive-actions,pattern-report-actions,reel-variation-actions,sync-actions}.ts`, `app/marketing/lead-magnets-actions.ts`), Workboard 16 (`app/workboard/actions.ts`), Ventas 9 (`app/sales/{actions,closer-actions,metrics-actions}.ts`), Lanzamientos 7 (`app/lanzamientos/actions.ts`), Agente 5 (`app/agent/actions.ts`), Integraciones 5 (`app/integrations/zernio/actions.ts`), Clientes 4 (`app/clients/actions.ts`), Fathom 4 (`app/fathom/{actions,member-actions}.ts`), Producto 4 (`app/product/actions.ts`), Contexto del negocio 3 (`app/business-context/actions.ts`), ManyChat 3 (`app/manychat/cta-actions.ts`), Equipo 3 (`app/team/actions.ts`), Holding 2 (`app/(platform)/holding/actions.ts`), Onboarding de holding 2 (`app/(platform)/onboarding/holding/actions.ts`), Reportes ejecutivos 2 (`app/executive-reports/actions.ts`, `report-generation-actions.ts`), Mercado Pago 2 (`app/mercadopago/actions.ts`), Auth 1 (`app/auth/force-password-change/actions.ts`), Closing 1 (`app/closing/actions.ts`), Conversaciones 1 (`app/conversations/actions.ts`). El conteo es una búsqueda estática por función exportada (revisada a mano en una muestra); Operaciones ya no aparece porque se arregló en esta rama.
- **Riesgo:** si una de esas acciones rechaza por un motivo esperable (validación, permiso, recurso de otra org o inexistente, falta de integración), entonces el usuario ve un párrafo técnico en inglés en vez del motivo, o una pantalla de error si es una lectura de un server component. Pasa siempre en producción, no en desarrollo, así que no se ve al probar en local.
- **Impacto:** todos los usuarios de esos módulos, cada vez que una acción rechaza por un motivo esperable; no expone datos ni rompe información, pero el usuario no sabe qué pasó ni cómo seguir.
- **Qué hay que hacer:** regla para toda server action: los errores esperables vuelven como valor (`MutationResult` de `lib/server/action-result.ts`, o un resultado con `motivo` si el llamador tiene que distinguir casos, como `ResultadoReporteSemanal`); sólo lo inesperado lanza. Returns explícitos y no `runMutation` cuando la acción puede hacer `redirect`. En los componentes, `correrAccion`/`correrMutacion` (`lib/operations/correr-accion.ts`, para llevar a un módulo común): mensaje devuelto si lo hay, texto fijo en voseo y `console.error` si lanza. Arreglar por módulo, empezando por las mutaciones.
- **Criterio de aceptación:** con un build de producción, cada mutación de la lista que rechaza por un motivo esperable muestra ese motivo en la pantalla (no el párrafo de Next); el mismo conteo da 0 mutaciones y las lecturas que quedan lanzando están justificadas (las atrapa un error boundary con un texto propio); cada módulo arreglado tiene un test que comprueba el error como valor
- **Dónde:** los archivos listados arriba; `apps/web/lib/server/action-result.ts`, `apps/web/lib/operations/correr-accion.ts`.

#### [INTEGRACIONES-ERROR-SIN-MARCA] Una integración con token vencido sigue figurando como conectada
- **Tipo:** bug
- **Severidad:** Alta
- **Estado verificado:** `syncGHLOrganizationSafe` (`lib/ghl/sync-pipeline.ts:28-…`) atrapa el error del proveedor y devuelve ceros sin tocar la integración; lo mismo Calendly (org y closer, `lib/calendly/sync-pipeline.ts`, `closer-sync.ts`), Fathom org (`lib/fathom/sync.ts`), Typeform y Zernio. Sólo VTurb, Hyros, WebinarJam y Fathom por miembro guardan `last_error`, que es lo único que el tablero de Integraciones convierte en estado `error` (`lib/integrations/health.ts`, `lastErrorIssue`). En prod, `[ghl-sync] Error org=46cce98c-…: Invalid Private Integration token` se repitió 168 veces entre 2026-09-03 y 2026-09-23; `The access token is invalid` de Calendly apareció para la org `997e94be-…`. Si el refresh de Calendly sale bien y falla el `update` (`lib/calendly/oauth-token.ts:120-131`), el refresh token nuevo se pierde (si Calendly lo rota: a confirmar, su doc no está bajada).
- **Riesgo:** Si un cliente revoca o deja vencer un token, entonces la sync falla cada hora indefinidamente y el tablero sigue en verde; ni el cliente ni el equipo lo saben. Pasa hoy con al menos una org.
- **Impacto:** Turnos de GHL/Calendly, llamadas de Fathom y respuestas de formularios que dejan de entrar en las orgs afectadas; métricas de Ventas y Embudos por debajo de lo real.
- **Qué hay que hacer:** columnas `last_error`/`last_error_at` (o equivalente) en todas las integraciones con sync de fondo; escribirlas cuando el proveedor rechaza (401/403 y errores repetidos) y limpiarlas al primer éxito; que el tablero y el aviso del founder lo muestren; con 401/403 persistente, pasar la integración a "reconectar".
- **Criterio de aceptación:** Con un token inválido de GHL, Calendly, Fathom org, Typeform o Zernio, después de la siguiente corrida del cron la integración aparece en estado error en el tablero de Integraciones con el mensaje del proveedor y la acción de reconectar; tras reconectar y una corrida exitosa, el error se limpia; hay tests de la lógica de marcado
- **Dónde:** `apps/web/lib/{ghl,calendly,fathom,typeform,zernio}/`, `apps/web/lib/integrations/health.ts`, migración nueva.

Prioridad sugerida P1: falla silenciosa de procesos centrales, activa hoy.

#### [OBS-SIN-ALERTAS] Nadie se entera cuando un proceso de fondo falla
- **Tipo:** deuda técnica
- **Severidad:** Alta
- **Estado verificado:** `Sentry.captureException` sólo se usa en `app/api/agent/send/route.ts` y `lib/holding/refresh-auth-session.ts`; `onRequestError` (`instrumentation.ts`) sólo ve errores no atrapados, y los crons, workers de QStash y webhooks atrapan el error y hacen `console.*`. No hay tabla de corridas de crons (`information_schema` de prod), ni Sentry Cron Monitors, ni `failureCallback` en `publishJSON` (`lib/queue/qstash-client.ts`), ni Sentry en `apps/discord-bot` y `apps/reel-worker`. Los eventos no llevan `org_id`. El agregado de errores de Vercel (ventana de 7 días, consultado 2026-09-23) muestra fallas repetidas que nadie registró: 168 × token de GHL inválido de una org (desde 2026-09-03), ~3.000 × `401 authentication_error` de Anthropic en `/api/integrations/fathom/process` (2026-09-02 → 09-21), 849 × 429 de Zernio en el cron de métricas, 99 × `Task timed out after 60 seconds` en tres crons.
- **Avance 2026-10-03 (SCRUM-84, código hecho):** errores por org de GHL, Calendly y Fathom y de los 8 workers de QStash a Sentry con tags `org_id`/`cron`/`provider` (`lib/observability/reportar-falla.ts`); Cron Monitors en los 19 crons (`conMonitorDeCron`); `failureCallback` en todos los `publishJSON` → `/api/queue/failure`; `@sentry/node` en el bot y el reel-worker. **Falta, sin código:** comprar el plan Team de Sentry, crear las reglas de alerta por mail y cargar `SENTRY_DSN` en Railway y Fly (`docs/operacion/alertas.md`), y la prueba de aceptación (`verificacion-manual.md` § Alertas de procesos de fondo). Typeform, Google Forms, Instagram, anuncios y `daily-signals` siguen reportando sólo con el monitor del cron, no por org.
- **Riesgo:** Si un proceso de fondo falla de forma persistente (token vencido, clave de IA, proveedor caído, timeout), entonces nadie del equipo se entera hasta que un cliente nota datos faltantes, días o semanas después. Pasa hoy.
- **Impacto:** Todas las orgs: sync de turnos, llamadas, formularios, métricas, reportes de IA y cobros pueden quedar incompletos sin aviso. Las fallas de arriba duraron entre 3 y 8 semanas.
- **Qué hay que hacer:** (complementa `[MONITOREO-Y-ALERTAS]`, que cubre salud y disponibilidad) (1) en el helper común de crons/workers (`[AUD-SALUD-3]`) mandar cada error por org a Sentry con tags `org_id`, `cron`, `provider`; (2) `Sentry.withMonitor` (Cron Monitors) en los 19 crons de `vercel.json`; (3) reglas de alerta de Sentry a mail o Slack del equipo (issue nuevo, pico de eventos, cron que no corrió); (4) `failureCallback` de QStash hacia un endpoint que registre y alerte; (5) Sentry en el bot de Discord y en el reel-worker.
- **Criterio de aceptación:** Un error simulado dentro de un cron con fan-out (p. ej. token inválido en una org) aparece en Sentry con el tag org_id y dispara una alerta que le llega a alguien del equipo; si un cron de vercel.json no corre en su horario, Sentry alerta; un job de QStash que agota sus reintentos queda registrado y alerta; el bot de Discord y el reel-worker reportan sus errores a Sentry
- **Dónde:** `apps/web/instrumentation.ts`, `apps/web/app/api/cron/*`, `apps/web/app/api/queue/*`, `apps/web/lib/queue/qstash-client.ts`, `apps/discord-bot/src/index.ts`, `apps/reel-worker/src/index.ts`, Sentry (reglas de alerta).

Prioridad sugerida P1: la falla es silenciosa y ya está ocurriendo en producción.

#### [MONITOREO-Y-ALERTAS] Sin chequeo de salud ni monitor de disponibilidad: una caída se detecta cuando un cliente avisa
- **Tipo:** deuda técnica
- **Severidad:** Alta
- **Estado verificado:** no hay endpoint de salud en `apps/web/app/api`; la página "Infraestructura" del super admin (`components/super-admin/infrastructure-page.tsx:18-42`) muestra estados escritos a mano (`status: "ok"`, `"Configurado ✓"`) salvo Resend; no hay registro de corridas de crons en la base; `apps/discord-bot` y `apps/reel-worker` no tienen Sentry (`docs/arquitectura/jobs-webhooks-y-colas.md`); no se pudo verificar si Sentry tiene alertas configuradas.
- **Riesgo:** Si un cron deja de correr, un webhook responde 4xx/5xx, una clave global se queda sin créditos o Supabase entra en sólo lectura, entonces nadie se entera hasta que un cliente reclama, y lo que no se reintenta (Commas, snapshots de anuncios, reportes) se pierde en el medio.
- **Impacto:** Todas las orgs; afecta el tiempo de detección de cualquier incidente del runbook `docs/operacion/incidentes.md`.
- **Qué hay que hacer:** `/api/health` (consulta mínima a la base y a Storage, variables críticas presentes, sin exponer valores) con un monitor externo de uptime; registro de cada corrida de cron (ruta, inicio, fin, estado, orgs fallidas); reemplazar los estados fijos de la página de Infraestructura por esos chequeos. Las alertas de errores de crons, colas y webhooks, y Sentry en bot y worker, van en `[OBS-SIN-ALERTAS]` (se hacen juntos).
- **Criterio de aceptación:** `GET /api/health` responde 200 con la base arriba y 503 si no puede consultarla; un monitor externo lo consulta y avisa a un canal del equipo; cada corrida de cron queda registrada con su estado; la página de Infraestructura ya no tiene estados fijos.
- **Dónde:** `apps/web/app/api/health/` (nuevo), `apps/web/components/super-admin/infrastructure-page.tsx`, crons en `apps/web/app/api/cron/`, Sentry, `apps/discord-bot`, `apps/reel-worker`.

Prioridad sugerida P1: es la base del runbook; sin detección, todas las demás fallas silenciosas se alargan.

#### [SUPABASE-PLAN-FREE-LIMITES] Storage al ~80 % del cupo del plan Free y la base pasa a sólo lectura a los 500 MB
- **Tipo:** verificación manual
- **Severidad:** Alta
- **Estado verificado:** tamaño de la base 87 MB (`pg_database_size`); Storage ≈ 797 MB sumando `metadata->>'size'` de `storage.objects` por bucket (`ai-brain-documents` 354 MB, `trial-reels` 351 MB, `business-context-documents` 40 MB, resto < 25 MB). El plan Free incluye 1 GB de Storage y pone la base en sólo lectura al superar 500 MB (doc `guides/platform/database-size`); pausa proyectos con poca actividad durante 7 días; no tiene SLA. Los buckets `sop-videos` (1 GB por archivo) y `trial-reels` (500 MB) declaran límites mayores que el máximo de subida del Free (50 MB según la página de precios, sin confirmar en el panel).
- **Riesgo:** Si Storage pasa el cupo, fallan las subidas (comprobantes, documentos, reels, videos de SOP). Si la base llega a sólo lectura, los webhooks de pagos leen bien pero no pueden insertar y responden 200, así que los cobros se pierden (`[EMBUDOS-WEBHOOK-PERDIDA]`). Storage crece con cada documento del cerebro de IA y cada reel.
- **Impacto:** Todas las orgs que suben archivos; cobros de todas las orgs con pagos conectados durante un eventual modo sólo lectura.
- **Qué hay que hacer:** confirmar en el panel de Supabase el uso y los cupos reales; decidir el plan junto con `[DR-BACKUPS-SUPABASE]`; mientras siga en Free, revisar `ai-brain-documents` y los originales de `trial-reels`, y bajar el `file_size_limit` de los buckets al máximo real.
- **Criterio de aceptación:** Se ejecutó V-INFRA-11 (paso 1 y 2) con cuenta real y quedó anotado el uso real de base y Storage contra el cupo del plan; el proyecto está en un plan con margen de al menos 50 % en Storage o se liberó espacio hasta ese margen; los `file_size_limit` de los buckets no superan el máximo de subida del plan; si algo falló, se abrió un ítem nuevo.
- **Dónde:** Supabase (Billing, Storage), `storage.buckets`.

Prioridad sugerida P1: el margen de Storage es ~200 MB y cruzar el cupo rompe subidas; el modo sólo lectura toca cobros.

#### [ENV-ZERNIO-WEBHOOK-SECRET] El webhook de Zernio responde 503 en producción
- **Tipo:** bug
- **Severidad:** Baja
- **Estado verificado:** `app/api/integrations/zernio/webhook/route.ts:64-72` rechaza con 503 si falta `ZERNIO_WEBHOOK_SECRET`; la variable no está en Vercel ni en `.env.example`. Coherente con `zernio_messages` y `zernio_comments` en 0 filas en prod con 9 integraciones de Zernio conectadas.
- **Riesgo:** Si sigue faltando el secreto, entonces todos los eventos de Zernio se rechazan con 503 (fail-closed: no hay agujero de seguridad). Ya está pasando.
- **Impacto:** Nadie lee `zernio_messages`/`zernio_comments` (sólo se escriben en el webhook y se marcan replied/hidden en `app/integrations/zernio/actions.ts:369,390`); inbox y comentarios son live-fetch. Lo único que se pierde es el aviso `account.connected/disconnected` que actualiza `zernio_integrations`.
- **Qué hay que hacer:** decidir si el webhook se usa (el inbox es live-fetch). Si sí: generar el secreto, cargarlo en Vercel y en el panel de Zernio, sumarlo a `.env.example`. Si no: sacar la ruta y las tablas.
- **Criterio de aceptación:** Agustín decidió si el webhook de Zernio se usa y la decisión quedó registrada en PENDIENTES.md/CHANGES.md; si se usa: un POST sin firma a /api/integrations/zernio/webhook en producción responde 401 (no 503), ZERNIO_WEBHOOK_SECRET figura en .env.example y un mensaje real llega a zernio_messages; si no se usa: la ruta y las tablas zernio_messages/zernio_comments ya no existen
- **Dónde:** `apps/web/app/api/integrations/zernio/webhook/route.ts`, `.env.example`, Vercel.

#### [AUD-SEG-2] Tokens OAuth y API keys guardados en texto plano
- **Tipo:** seguridad
- **Severidad:** Crítica
- **Estado verificado:** `encrypt(` sólo se usa para BYOK, Zernio, GHL, Hyros, VTurb, WebinarJam, Fathom por miembro, pagos y Mercado Pago. Quedan en claro (protegidos sólo por RLS cerrado + service role): `calendly_integrations`, `stripe_integrations`, `instagram_integrations`, `typeform_integrations`, `google_forms_integrations`/`youtube_integrations`, `super_admin_google_tokens`, `fathom_integrations.api_key`, `manychat_integrations.api_token`.
- **Riesgo:** Si se filtra un backup, un dump, la service role key o alguien accede al SQL editor, entonces se leen directamente tokens OAuth y API keys de Calendly, Stripe, Google (incluido el del super admin), Fathom, ManyChat, Instagram y Typeform de todas las orgs. Hoy RLS impide el acceso por la API, así que la probabilidad es baja.
- **Impacto:** Exposición de credenciales de terceros de todas las orgs conectadas (Calendly, Google y Fathom tienen filas en prod), con acceso a agendas, Drive/YouTube y cobros de Stripe fuera de Limitless; el token de Google del super admin es de alcance transversal.
- **Qué hay que hacer:** cifrar al escribir con `lib/security/encryption.ts`, descifrar al leer, y una migración de datos (script con service role) que cifre lo existente. Empezar por Calendly, Google y Fathom (las que tienen filas en prod).
- **Criterio de aceptación:** Al conectar Calendly, Google (Forms/YouTube/super admin), Fathom, Stripe, Instagram, Typeform y ManyChat, la columna del token/API key en la base queda cifrada (no se lee el valor en claro con SQL) y la integración sigue sincronizando; después de correr el script de migración de datos no queda ninguna fila existente con token en texto plano en esas tablas; hay un test que cubre el cifrado al escribir y el descifrado al leer
- **Dónde:** `apps/web/lib/{calendly,stripe,instagram,typeform,google,fathom,manychat}/`, `app/api/integrations/*/callback`.

#### [AUD-SEG-4] Ventanas de replay y firma QStash sin URL
- **Tipo:** seguridad
- **Severidad:** Media
- **Estado verificado:** Calendly (`calendly/webhook/route.ts`) firma `t.body` pero no compara `t` contra el reloj; Mercado Pago (`lib/mercadopago/webhook-verify.ts`) no valida `ts` y la firma sólo cubre `data.id` — el cuerpo (`action`, `user_id`) no está firmado y con `application.deauthorized` desconecta la integración de ese `user_id` (`app/api/webhooks/mercadopago/route.ts:58-72`); GHL (`lib/ghl/verify-webhook.ts`) sin timestamp; `verifyQStashRequest` (`lib/queue/qstash-verify.ts`) llama `receiver.verify({ signature, body })` sin `url`, así que un cuerpo firmado para un worker vale para otro.
- **Riesgo:** Si alguien obtiene un webhook firmado real (logs, proxy, panel del proveedor), entonces puede reenviarlo indefinidamente; en Mercado Pago, como la firma sólo cubre `data.id`, puede cambiar el cuerpo y mandar `action: application.deauthorized` con cualquier `user_id`, que desconecta la integración de MP de esa cuenta (`app/api/webhooks/mercadopago/route.ts:58-72`). Requiere capturar un request firmado: poco probable.
- **Impacto:** Desconexión forzada de integraciones de Mercado Pago de cualquier org (se arregla reconectando) y reprocesos repetidos en workers de QStash dentro de la vida de la firma; los duplicados de pagos quedan frenados por el dedupe por ID de evento.
- **Qué hay que hacer:** tolerancia de 5 min en Calendly y MP (como `WEBHOOK_TOLERANCE_SECONDS` de pagos); pasar `url` al `Receiver`; en GHL apoyarse en el dedupe por `webhookId`.
- **Criterio de aceptación:** Un webhook de Calendly o Mercado Pago con firma válida pero timestamp de más de 5 minutos es rechazado; un cuerpo firmado por QStash para un worker enviado a otra URL de worker es rechazado; un reenvío del mismo webhookId de GHL no se procesa dos veces; hay tests que cubren estos casos
- **Dónde:** archivos citados.

#### [SEG-REEL-WORKER-AUTH] Autenticación débil del worker de Fly.io
- **Tipo:** seguridad
- **Severidad:** Crítica
- **Estado verificado:** `apps/reel-worker/src/index.ts:67-130`: compara `WORKER_AUTH_SECRET` con `===` (no constante); cuando falla loguea los primeros 4 caracteres del secreto esperado; sin secreto ni signing keys acepta requests de `127.0.0.1` o IPs `10.*`/`172.*`, o si `NODE_ENV` no contiene `prod`. La lista de secrets comentada en `fly.toml` no incluye `WORKER_AUTH_SECRET` (el README del worker ya lo lista). Express no tiene `trust proxy`, así que `req.ip` es la IP del proxy de Fly, no la del cliente. La web publica en QStash la URL `...?workerSecret=<secreto>` (`app/marketing/content/reel-variation-actions.ts:142-144`): el secreto queda guardado en QStash y en logs de acceso; el header `x-worker-secret` ya existe como alternativa (`lib/queue/qstash-client.ts:90`).
- **Riesgo:** Si en Fly no están cargados `WORKER_AUTH_SECRET` ni las signing keys de QStash, entonces el worker acepta a cualquiera cuyo `req.ip` empiece con `10.`/`172.` — y como Express no tiene `trust proxy`, `req.ip` es la IP del proxy de Fly, no la del cliente. Además el secreto viaja como query param (`reel-variation-actions.ts:142-144`), así que queda en la URL de destino guardada en QStash y en logs de acceso.
- **Impacto:** Con el worker abierto, cualquiera puede mandar jobs con `organizationId`/`sourceStoragePath` arbitrarios: el worker usa service role sobre el bucket `trial-reels` (`processor.ts:35,46,113`) y escribe `reel_variation_jobs`, o sea lectura/escritura de videos de otras orgs y consumo de cómputo. No se confirmó qué secrets tiene cargados hoy.
- **Qué hay que hacer:** (resuelto el 2026-10-01 en SCRUM-81: el worker ya verifica que el job sea de la `organizationId` del payload y que `sourceStoragePath`/`reelMusicPath` empiecen con `${organizationId}/`). Además: comparación en tiempo constante, no loguear el secreto, fail-closed sin credenciales, sumar `WORKER_AUTH_SECRET` a `fly.toml`/README y confirmar con `fly secrets list` que está cargado.
- **Criterio de aceptación:** Un POST sin credenciales al worker (curl sin header, también desde IP 10.*/172.* o con NODE_ENV no productivo) responde 401; un intento con secreto incorrecto no deja ningún fragmento del secreto en los logs; fly secrets list -a otc-reel-worker muestra WORKER_AUTH_SECRET, figura en fly.toml/README y un reel de prueba llega a preview_ready (V-INFRA-8)
- **Dónde:** `apps/reel-worker/src/index.ts`, `apps/reel-worker/fly.toml`, `apps/reel-worker/README.md`.

#### [AUD-SEG-9] Buckets de Storage fuera de las migraciones
- **Tipo:** verificación manual
- **Severidad:** Media
- **Estado verificado:** el código usa `client-payment-receipts`, `business-context-documents`, `sop-attachments`, `workboard-task-attachments` y `ai-brain-documents`; ninguna migración los crea (las que tocan `storage.buckets` crean `avatars`, `agent-documents`, `content-thumbnails`, `trial-reels`, `client-wins`, `sop-videos`, `discord-bot-avatars`). `content-thumbnails` es público con policy pública de listado (`20260805200000`). Catálogo de prod (2026-09-23): los cinco buckets son `public = false` y no tienen policies en `storage.objects` (acceso sólo por service role). También está fuera de migraciones `import-files`; sus policies abiertas a cualquier `authenticated` se borraron en `20260928210000_import_files_sin_policies` y el bucket se borró desde el panel el 29-sep.
- **Riesgo:** Si se levanta una base nueva (staging, recuperación) desde las migraciones, entonces los cinco buckets no existen o se crean a mano sin policies definidas; en prod, verificado por catálogo hoy, los cinco son `public = false` y no tienen policies en `storage.objects` (sólo service role).
- **Impacto:** Hoy no hay exposición en esos cinco; el problema es de reproducibilidad y de control de cambios. La exposición real estaba en otro bucket fuera de migraciones que el ítem no nombra (`import-files`, cerrado en `20260928210000_import_files_sin_policies`).
- **Qué hay que hacer:** confirmar en el dashboard que los cinco son privados; escribir una migración idempotente que los declare con sus policies; decidir si `content-thumbnails` necesita listado público.
- **Criterio de aceptación:** Se ejecutó el paso de verificacion-manual.md (V-INFRA-7) con cuenta real y el resultado quedó anotado: client-payment-receipts, business-context-documents, sop-attachments, workboard-task-attachments y ai-brain-documents son privados y su URL pública da 400/404; existe una migración idempotente que declara esos cinco buckets con sus policies y aplicada en una base desde cero los crea; Agustín decidió si content-thumbnails necesita listado público y quedó registrado (si falló algo, se abrió un ítem nuevo)
- **Dónde:** Supabase Storage; migración nueva.

#### [AUD-CONF-1] Sin timeouts en los clientes de APIs externas
- **Tipo:** deuda técnica
- **Severidad:** Media
- **Estado verificado:** `AbortSignal.timeout`/`signal:` sólo aparece en `lib/discord/api.ts`, `lib/agent/*`, `app/api/agent/send/route.ts` (`req.signal`, cancelación y no timeout), `lib/fathom/share-link.ts` y `lib/marketing/story-thumbnail-storage.ts`. Ninguno en `lib/zernio/client.ts`, `lib/ghl/client.ts`, `lib/hyros/client.ts`, Stripe, Mercado Pago, Calendly, Typeform. Un proveedor colgado retiene la lambda hasta `maxDuration`.
- **Riesgo:** Si un proveedor (Zernio, GHL, Hyros, Stripe, MP, Calendly, Typeform) se cuelga, entonces la lambda espera hasta `maxDuration` y el cron o la pantalla fallan por timeout en vez de fallar rápido; pasa cada vez que un proveedor tiene una caída.
- **Impacto:** Crons que no completan las orgs siguientes de la lista, pantallas live-fetch (inbox Zernio) que tardan minutos, y más costo de Vercel; no hay pérdida de datos, el próximo ciclo reintenta.
- **Qué hay que hacer:** `signal: AbortSignal.timeout(15_000)` (o similar) en cada `*Fetch` de cliente de proveedor.
- **Criterio de aceptación:** Todos los clientes de proveedor (Zernio, GHL, Hyros, Stripe, Mercado Pago, Calendly, Typeform) pasan un timeout a cada fetch; con un proveedor simulado que no responde, la llamada falla con error de timeout en ~15 s en vez de colgar la lambda hasta maxDuration; typecheck y tests pasan
- **Dónde:** `apps/web/lib/<proveedor>/client.ts`.

#### [AUD-CONF-3] Crons de Calendly que se pisan
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** `vercel.json`: `/api/cron/calendly-sync` y `/api/cron/calendly-sync-closers` ambos en `0 * * * *`. La sync hace N+1 por evento sobre 120 días y `.in()` con URIs largas puede pasarse del largo de URL (no re-medido).
- **Riesgo:** Si las dos syncs corren a la vez sobre la misma org, entonces compiten por las mismas filas de `closing_calls` y pueden duplicar o pisar turnos; con muchos eventos el `.in()` puede superar el largo de URL y la sync falla entera. Pasa cada hora.
- **Impacto:** Turnos de closers duplicados o faltantes en Ventas para orgs con Calendly (hay filas en prod); workaround: sync manual.
- **Qué hay que hacer:** desfasar los horarios (p. ej. `:15`), unificar `sync-events.ts` y `closer-sync.ts` (ver `[AUD-SALUD-2]`), batch de lecturas.
- **Criterio de aceptación:** En vercel.json /api/cron/calendly-sync y /api/cron/calendly-sync-closers ya no corren en el mismo minuto; una corrida de la sync de Calendly de una org con muchos eventos termina sin error de URL demasiado larga y sin una consulta por evento; los turnos importados en closing_calls no se duplican
- **Dónde:** `apps/web/vercel.json`, `apps/web/lib/calendly/`.

#### [AUD-CONF-4] Typeform pierde respuestas y colisiona entre orgs
- **Tipo:** bug
- **Severidad:** Alta
- **Estado verificado:** `lib/typeform/sync.ts:192` pide `page_size=1000` con `since` y no pagina; `form_responses.external_response_id` es `unique` global (`20260522000000_phase11_integrations.sql:223`) y tanto Typeform (`lib/typeform/sync.ts:219-232`) como Google Forms (`lib/google-forms/sync.ts:208-221`) hacen `upsert` con `onConflict: "external_response_id"` y `organization_id` en el payload: si el mismo formulario está conectado en dos orgs, la respuesta no choca sino que se reescribe y pasa a la última org que sincronizó. Hoy hay 0 integraciones de Typeform en prod; Google Forms sí tiene.
- **Riesgo:** Si un formulario tiene más de 1000 respuestas desde el último sync, entonces se pierden las que exceden la página; y si el mismo formulario está conectado en dos orgs (p. ej. dentro de un holding), el `upsert` con `onConflict: external_response_id` reescribe `organization_id` y la respuesta se mueve de una org a la otra en cada sync. Google Forms usa el mismo upsert (`lib/google-forms/sync.ts:208-221`).
- **Impacto:** Respuestas faltantes o que cambian de org (una org ve respuestas que eran de otra y la otra las pierde). Typeform tiene 0 integraciones hoy; Google Forms sí tiene conexiones en prod, así que la parte del índice global ya está expuesta.
- **Qué hay que hacer:** paginar con `before`/`after` hasta agotar; índice único `(organization_id, external_response_id)`.
- **Criterio de aceptación:** Con un formulario de Typeform de más de 1000 respuestas, la sync importa todas (pagina hasta agotar); dos organizaciones con el mismo external_response_id pueden guardar cada una su respuesta sin colisión (índice único por (organization_id, external_response_id)); hay un test de la paginación
- **Dónde:** `apps/web/lib/typeform/sync.ts`, migración nueva.

#### [AUD-CONF-5] Dedupe de webhooks que descarta reintentos legítimos
- **Tipo:** bug
- **Severidad:** Crítica
- **Estado verificado:** **Reintentos resueltos el 2026-09-30 (SCRUM-6):** un reintento de un evento en `error`, o trabado en `pending` hace más de 5 minutos, se reprocesa (`lib/webhooks/reclamar.ts`), y un duplicado de un evento ya procesado se sigue descartando. Lo que sigue abierto es sumar `organization_id` al índice de pagos. Estado anterior: `payment_webhook_events` tiene índice único `(provider, external_event_id)` sin `organization_id` (`20260829200000_payments_whop_fanbasis.sql:115`); un evento que quedó en `error` hace que el reintento del proveedor choque y se descarte. Mismo patrón en `ghl_webhook_events`.
- **Riesgo:** Si el primer procesamiento de un webhook de pago falla (timeout de DB, bug de mapeo, deploy a mitad), entonces el reintento del proveedor choca con el índice único y se marca `duplicate` (`lib/payments/ingest.ts:46-48`), así que ese cobro nunca se registra. Cualquier error transitorio lo dispara.
- **Impacto:** Cobros de Whop/Fanbasis/pagos que no aparecen en Finanzas ni en el cliente, en silencio; el crudo queda guardado pero no hay herramienta ni pantalla para reprocesarlo. Mismo efecto en oportunidades de GHL (`ghl_webhook_events`).
- **Qué hay que hacer:** en conflicto, re-procesar si el estado previo es `error` o si quedó en `pending` hace más de unos minutos (el lambda murió entre el insert del crudo y el `finish()`, `lib/payments/ingest.ts:33-69`; mismo caso en GHL); sumar `organization_id` al índice de pagos.
- **Criterio de aceptación:** Un webhook de pagos o de GHL que quedó en estado error, al ser reenviado por el proveedor con el mismo ID de evento, se reprocesa y termina en estado ok en vez de descartarse; un duplicado de un evento ya procesado ok se sigue descartando; el índice de payment_webhook_events incluye organization_id; hay un test que cubre ambos casos
- **Dónde:** `apps/web/lib/payments/ingest.ts`, `apps/web/lib/ghl/ingest-opportunity-event.ts`, migración nueva.

#### [AUD-CONF-6] Trabajo sin `await` después de responder
- **Tipo:** bug
- **Severidad:** Alta
- **Estado verificado:** no hay ningún uso de `after()` de `next/server` en `apps/web`. Según la auditoría, embeddings RAG, scoring de leads, sync inicial de YouTube, mails de waitlist y eventos de Meta se disparan sin `await` y Vercel puede cortarlos. En la waitlist también la atribución UTM: `void trackUTMLeadCapture` (`app/api/waitlist/route.ts:156`), `void sendWaitlistConfirmationEmail` (`:169`), `void sendMetaLeadEvent` (`:172`).
- **Riesgo:** Si Vercel congela la función apenas se devuelve la respuesta, entonces los `void` quedan a medias: en la waitlist, además de mail y evento de Meta, también `trackUTMLeadCapture` (`app/api/waitlist/route.ts:156,169,172`). Ocurre de forma intermitente y sin error visible.
- **Impacto:** Leads de la waitlist sin mail de confirmación, sin evento de conversión en Meta y sin atribución UTM; documentos de contexto sin indexar para el RAG y leads de ManyChat sin score. Datos de marketing incompletos que se usan para decidir pauta.
- **Qué hay que hacer:** envolver esos disparos en `after(() => …)`.
- **Criterio de aceptación:** Los disparos de embeddings RAG, scoring de leads de ManyChat, sync inicial de YouTube, mails de waitlist y eventos de Meta están envueltos en after() (o con await) y no queda ninguno sin await tras responder; al anotarse en la waitlist llega el mail y al subir un documento de contexto queda indexado en producción
- **Dónde:** `app/api/waitlist/route.ts`, `app/api/integrations/youtube/oauth/callback/route.ts`, `lib/business-context/`, scoring de ManyChat, `lib/fathom/process-call.ts:508,515` (análisis profundo inline y `ingestDocument` del transcript con `void`).

#### [ENV-LIMPIEZA] Variables de entorno desalineadas entre código, `.env.example`, `turbo.json` y Vercel
- **Tipo:** deuda técnica
- **Severidad:** Media
- **Estado verificado:** faltan en `.env.example` y el código las usa: `WORKER_AUTH_SECRET`, `ZERNIO_WEBHOOK_SECRET`, `ZERNIO_BASE_URL`, `CALENDLY_CLOSER_REDIRECT_URI`, `SUPER_ADMIN_GOOGLE_REDIRECT_URI`, `GHL_API_BASE`, `HYROS_API_BASE`, `VTURB_API_BASE`, `WEBINARJAM_API_BASE`, `SENTRY_*`, `NEXT_PUBLIC_SOP_VIDEO_MAX_MB`. Sobra `NEXT_PUBLIC_VSL_URL`. `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` tiene en `.env.example:95` un valor literal predecible en vez de vacío (si se usó el mismo en prod, rotarlo). `.env.example` dice que `CRON_SECRET` es "opcional" (es obligatoria). En Vercel sobran `NEXT_PUBLIC_VSL_URL`, `NEXT_PUBLIC_NAV_STYLE`, `REDIS_URL`, `QSTASH_URL`, `GOOGLE_REDIRECT_URI`, `FATHOM_REDIRECT_URI`; faltan `LIMITLESS_WEBHOOK_SECRET` (está `OTC_`), `FATHOM_WEBHOOK_SECRET`, `NEXT_PUBLIC_UTM_ORGANIZATION_ID`. `turbo.json` `build.env` no declara la mayoría de las nuevas y sigue listando `OTC_WEBHOOK_SECRET`.
- **Riesgo:** Si alguien arma un entorno nuevo desde `.env.example` o borra el respaldo `OTC_WEBHOOK_SECRET` sin cargar `LIMITLESS_WEBHOOK_SECRET`, entonces fallan en silencio el worker, el webhook de Zernio, el bot de Discord o el tracking UTM de la waitlist (sin `NEXT_PUBLIC_UTM_ORGANIZATION_ID` hoy no se registra ningún UTM de la waitlist, `waitlist/route.ts:154`).
- **Impacto:** Operación y deploys: configuraciones incompletas difíciles de diagnosticar; hoy concretamente la captura UTM de la waitlist está apagada en prod por falta de la variable.
- **Qué hay que hacer:** actualizar `.env.example` y `turbo.json` con la tabla de `docs/operacion/entorno-y-deploy.md`; limpiar Vercel; renombrar `OTC_WEBHOOK_SECRET` → `LIMITLESS_WEBHOOK_SECRET` en Vercel y Railway y después borrar el respaldo.
- **Criterio de aceptación:** Todas las variables que usa el código (incluidas WORKER_AUTH_SECRET, ZERNIO_WEBHOOK_SECRET, ZERNIO_BASE_URL, CALENDLY_CLOSER_REDIRECT_URI, SUPER_ADMIN_GOOGLE_REDIRECT_URI, *_API_BASE, SENTRY_*, NEXT_PUBLIC_SOP_VIDEO_MAX_MB) figuran en .env.example y turbo.json, coincidiendo con la tabla de docs/operacion/entorno-y-deploy.md, y CRON_SECRET figura como obligatoria; en Vercel no quedan NEXT_PUBLIC_VSL_URL, NEXT_PUBLIC_NAV_STYLE, REDIS_URL, QSTASH_URL, GOOGLE_REDIRECT_URI ni FATHOM_REDIRECT_URI y sí están LIMITLESS_WEBHOOK_SECRET, FATHOM_WEBHOOK_SECRET y NEXT_PUBLIC_UTM_ORGANIZATION_ID; OTC_WEBHOOK_SECRET ya no se usa en código, turbo.json, Vercel ni Railway y el bot de Discord sigue autenticando contra la web
- **Dónde:** `.env.example`, `turbo.json`, Vercel, Railway, `apps/web/lib/discord/webhook-auth.ts`, `apps/discord-bot/src/lib/limitless-api.ts`.

#### [AUD-SALUD-4 / T-14 / T-BYOK] Sin tests en agente, IA, RAG, auth y colas
- **Tipo:** tests
- **Severidad:** Media
- **Estado verificado:** no hay `__tests__` en `lib/agent`, `lib/ai`, `lib/rag`, `lib/auth`, `lib/holding`, `lib/queue`, `lib/calendly`, `lib/typeform`, `lib/mercadopago`. CLAUDE.md declara invariantes testeables (la compaction no muta el historial; BYOK cae al global).
- **Riesgo:** Si se modifica compaction, credential resolver, verificación de colas o el switch de holding, entonces una regresión (p. ej. aceptar requests de cola sin firma o resolver la org equivocada en un holding) llega a prod sin que ningún test la frene.
- **Impacto:** Los módulos sin red son justo los de aislamiento entre orgs y autenticación de workers; el daño potencial de una regresión es Crítico, pero la falta de tests en sí es un riesgo acotado.
- **Qué hay que hacer:** empezar por `compact-conversation.ts` (no muta la entrada, conserva los últimos 6), `credential-resolver.ts`/`executeWithCredentialFallback` (orden BYOK → global), `verify-queue-request.ts` (secreto vs firma) y `resolveEffectiveOrganizationId` del holding.
- **Criterio de aceptación:** Existen tests en lib/agent, lib/ai, lib/queue y lib/holding que verifican: la compaction no muta la entrada y conserva los últimos 6 mensajes; executeWithCredentialFallback usa primero la key BYOK de la org y cae a la global; verifyQueueRequest acepta secreto o firma QStash y rechaza sin ninguno, y resolveEffectiveOrganizationId respeta el holding; pnpm test pasa
- **Dónde:** `apps/web/lib/{agent,ai,queue,auth,holding}/__tests__/`.

#### [T-3] Tests de `parse-client-import.ts` y `excel-parser.ts`
- **Tipo:** tests
- **Severidad:** Media
- **Estado verificado:** `lib/clients/__tests__/` no cubre los parsers. El bug de montos sigue (`lib/metrics/excel-parser.ts:67` borra todos los puntos), ver `[AUD-DIN-1]`.
- **Riesgo:** Si se importan Excel con montos decimales, entonces hoy ya se multiplican (bug `[AUD-DIN-1]`, `excel-parser.ts:67`); sin tests, el arreglo y futuros cambios del parser no quedan protegidos.
- **Impacto:** Importaciones de clientes y montos incorrectos; el daño del bug vive en AUD-DIN-1, este ítem es la red de seguridad.
- **Qué hay que hacer:** título fusionado, filas vacías, `pickBestSheet`, `sheetName` explícito, montos con punto decimal; workbooks armados en memoria.
- **Criterio de aceptación:** Hay tests de parse-client-import.ts y excel-parser.ts con workbooks armados en memoria que cubren título fusionado, filas vacías, pickBestSheet, sheetName explícito y montos con punto decimal; pnpm test pasa (el caso de montos con punto decimal pasa recién cuando se cierre AUD-DIN-1)
- **Dónde:** `apps/web/lib/clients/`, `apps/web/lib/metrics/excel-parser.ts`.

#### [T-5] Tests de `lib/utm/`
- **Tipo:** tests
- **Severidad:** Baja
- **Estado verificado:** `lib/utm/` no tiene `__tests__`.
- **Riesgo:** Si se toca el match UTM, entonces un lead puede atribuirse al link equivocado sin que nada lo detecte.
- **Impacto:** Atribución de marketing por link UTM; hoy además la captura UTM de la waitlist está apagada por falta de variable (ver ENV-LIMPIEZA), así que el alcance actual es chico.
- **Qué hay que hacer:** match por email vs identificador, ventana, dos links candidatos, lead sin UTM.
- **Criterio de aceptación:** Hay tests en lib/utm/__tests__ que cubren match por email vs por identificador, ventana de atribución, dos links candidatos y lead sin UTM; pnpm test pasa
- **Dónde:** `apps/web/lib/utm/`.

### Infraestructura, seguridad y tests (transversal) · P2

#### [LOGS-DATOS-SENSIBLES] Logs con textos de DMs y filas de clientes; Sentry sin filtro de headers ni query string
- **Tipo:** seguridad
- **Severidad:** Media
- **Estado verificado:** `apps/web/lib/unipile/process-message.ts:91-99` loguea `messageText` (texto completo del DM), nombre del lead y `senderId` de cada mensaje entrante; `:51` el nombre del lead. `apps/web/app/integrations/clickup/import-actions.ts:200` loguea `JSON.stringify(clientRow)` (fila completa del cliente) cuando falla un insert. `app/api/queue/publish-reel-variation/route.ts:146,148` loguea el email del admin. `lib/google/drive-content.ts:36` y `drive-forms.ts:29,35` loguean el cuerpo completo del error de Google. Sentry: `sentry.edge.config.ts` no tiene `beforeSend` (el middleware corre en Edge); `client` y `server` sólo borran `request.cookies`; ningún config filtra headers (`Authorization` con `CRON_SECRET`, `x-worker-secret`, `upstash-signature`, `unipile-auth`) ni query string (`workerSecret`, `secret` de Unipile, `code`/`state` de OAuth, `token` de invitaciones). No se pudo ver un evento real de Sentry.
- **Riesgo:** Si alguien con acceso a los logs de Vercel o al proyecto de Sentry (más gente que a la base, y con otra retención) los consulta, entonces lee DMs de leads y datos de clientes, y puede encontrar secretos de cron/cola si alguna de esas rutas tira error. Probable que ya esté pasando con los DMs mientras el inbox legacy de Unipile reciba mensajes.
- **Impacto:** Datos personales de terceros (leads, clientes de los clientes) fuera de la base y fuera de las bajas del super admin.
- **Qué hay que hacer:** loguear sólo ids en Unipile y ClickUp; `beforeSend` común a los tres configs de Sentry que borre `authorization`, `cookie`, `x-worker-secret`, `upstash-signature`, `unipile-auth` y limpie de la URL/query `workerSecret`, `secret`, `code`, `state`, `token`; mirar un evento real de Sentry de una ruta de cola para confirmar.
- **Dónde:** `apps/web/lib/unipile/process-message.ts`, `apps/web/app/integrations/clickup/import-actions.ts`, `apps/web/app/api/queue/publish-reel-variation/route.ts`, `apps/web/lib/google/drive-*.ts`, `apps/web/sentry.{client,server,edge}.config.ts`.

Prioridad sugerida P2: exposición real pero a quien ya tiene acceso a los paneles de Vercel o Sentry.

#### [DB-DRIFT-STORAGE-REALTIME] Producción difiere del repo en Storage, Realtime y grants de funciones
- **Tipo:** deuda técnica
- **Severidad:** Media
- **Estado verificado:** comparado el 2026-09-23 el estado final de policies de las 175 migraciones contra `pg_policies` de prod. El historial de versiones coincide exactamente y `public` coincide salvo lo ya registrado en `docs/historial/DB_DIFF_PRODUCCION_2026-09-22.md` y: (1) `manychat_events` tiene en prod la policy `org_members_manychat_events` (ALL, por org) que no está en ninguna migración; (2) `storage.objects` tiene 15 policies en prod y 11 en el repo: sólo en prod `Users can read/upload/delete import files` (borradas por `20260928210000_import_files_sin_policies`) y `Avatar delete/update/upload por org` + `Avatar read público` (usan `profiles.organization_id`); sólo en el repo `Org members insert/update/delete avatars` (usan `get_my_organization_id()`); (3) `conversations` está en la publicación `supabase_realtime` sin migración que la agregue; (4) `current_user_is_founder_or_admin()` sin migración (ya anotado en el diff del 22); (5) `anon` tiene EXECUTE sobre `get_my_organization_id()`, `get_my_holding_business_org_ids()` y `current_user_is_founder_or_admin()` aunque el repo revoca `FROM public` (advisor `anon_security_definer_function_executable`). El diff del 22 no cubrió `storage.objects`, `pg_publication_tables` ni grants de funciones.
- **Riesgo:** Si alguien cambia reglas a mano en prod (como pasó con `import-files`), entonces el agujero no aparece en el código ni en el diff; y una base levantada desde el repo (staging, recuperación) queda con reglas distintas a prod (p. ej. sin `conversations` en realtime, con otras policies de avatars).
- **Impacto:** Control de cambios de la seguridad de la base. Hoy, fuera de `import-files`, ninguna de las diferencias cruza organizaciones.
- **Qué hay que hacer:** migración de reconciliación idempotente: declarar las policies de `avatars` que se quieran (y borrar las otras), borrar `org_members_manychat_events`, agregar `conversations` a la publicación, crear `current_user_is_founder_or_admin()` y revocar EXECUTE a `anon` de las tres funciones; sumar `storage.objects`, `pg_publication_tables` y grants de funciones a la comparación repo–prod.
- **Dónde:** migración nueva, `supabase/ci/check-migrations.sh`, `docs/arquitectura/base-de-datos.md`.

Prioridad sugerida P2: no hay fuga activa aparte de la que ya es P0; es prevención y reproducibilidad.

#### [JOBS-TRABADOS-SIN-SALIDA] SOP desde video y Trial Reels quedan "procesando" para siempre si el proceso muere
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** SOP: si el lambda de `/api/queue/process-sop-video` muere por tiempo o memoria, `sop_generation_jobs.status` queda en `transcribing`/`generating`; el botón de reintentar sólo aparece con `failed` (`components/sops/sop-video-creator.tsx:275`). Reels: si el worker de Fly muere a mitad, `reel_variation_jobs` queda `processing` y cualquier reentrega lo saltea (`apps/reel-worker/src/processor.ts:176`). Ninguno tiene rescate como `lib/fathom/reclaim-stuck.ts`.
- **Riesgo:** Si un video largo agota memoria o tiempo, o Fly reinicia la máquina, entonces el usuario ve un spinner eterno y no puede reintentar.
- **Impacto:** SOPs y reels que no salen; hay que tocar la base a mano. Frecuencia baja hoy (poco uso), sube con videos largos (`[OPS-SOP-VIDEO-MEMORIA]`).
- **Qué hay que hacer:** `processing_started_at` en los dos jobs; tratar como `failed` (con motivo) lo que lleve más de X minutos en un estado intermedio, ya sea al leerlo o con el cron de limpieza; mostrar "Reintentar" en ese caso.
- **Dónde:** `apps/web/app/api/queue/process-sop-video/route.ts`, `apps/web/components/sops/sop-video-creator.tsx`, `apps/reel-worker/src/processor.ts`, `apps/web/app/marketing/content/reel-variation-actions.ts`, migración nueva.

#### [CRONS-CORTE-60S] Los crons en serie se cortan a los 60 s y dejan orgs sin sincronizar
- **Tipo:** bug
- **Severidad:** Media
- **Estado verificado:** 99 × `Vercel Runtime Timeout Error: Task timed out after 60 seconds` en `/api/cron/ghl-sync`, `/api/integrations/google-forms/sync` y `/api/cron/calendly-sync` (agregado de Vercel, consultado 2026-09-23). Calendly y Google Forms recorren las orgs en serie sin orden explícito (`lib/calendly/sync-pipeline.ts:186`, `lib/google-forms/sync.ts:281`); GHL las corre todas en un solo `Promise.all` (`lib/ghl/sync-pipeline.ts:118`). Un timeout mata el proceso sin respuesta ni log de lo que quedó sin hacer.
- **Riesgo:** Si la suma de orgs pasa de 60 s, entonces las últimas de la lista quedan sin sincronizar, probablemente siempre las mismas; crece con cada org nueva.
- **Impacto:** Turnos de Calendly/GHL y respuestas de Google Forms que llegan tarde o no llegan para algunas orgs.
- **Qué hay que hacer:** pasar estos crons al fan-out por QStash que ya usan los de IA (`publishCronFanout`), o como mínimo ordenar por `last_sync_at` ascendente con presupuesto de tiempo (patrón de `fathom/process`). Encaja en `[AUD-SALUD-3]`.
- **Dónde:** `apps/web/app/api/cron/{ghl-sync,calendly-sync}/route.ts`, `apps/web/app/api/integrations/google-forms/sync/route.ts`, `apps/web/lib/{ghl,calendly,google-forms}/`.

#### [ENTORNO-STAGING] Los previews y cualquier rama corren contra la base y las claves de producción
- **Tipo:** deuda técnica
- **Severidad:** Alta
- **Estado verificado:** todas las variables del proyecto `otc-plaform` en Vercel tienen target Preview y Production con el mismo valor, incluidas `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `ENCRYPTION_MASTER_KEY` (listado de tipo/target, sin valores, 2026-09-23). Supabase no tiene branches (`list_branches` vacío). `CHANGES.md` registra pruebas "contra el preview con datos reales". Los previews están protegidos por Vercel SSO (`ssoProtection: all_except_custom_domains`).
- **Riesgo:** Si una rama con un bug escribe o borra algo, entonces lo hace sobre datos reales de clientes (sin backup, `[DR-BACKUPS-SUPABASE]`). Tampoco hay dónde ensayar una migración con datos ni una restauración.
- **Impacto:** Todas las orgs; frena el ensayo de recuperación.
- **Qué hay que hacer:** proyecto de Supabase aparte (o Supabase Branching en plan pago) para Preview, con variables de Preview propias en Vercel y una `ENCRYPTION_MASTER_KEY` distinta; datos de prueba sembrados; documentarlo en `docs/operacion/entorno-y-deploy.md`. Con el entorno armado, hacer ahí el ensayo de rotación de la clave maestra y la prueba del webhook con secreto indescifrable (V-INFRA-12), que quedaron pendientes al cerrar SCRUM-86.
- **Dónde:** Vercel (variables de Preview), Supabase, `docs/operacion/entorno-y-deploy.md`.

Prioridad sugerida P2: los previews no son públicos; el daño requiere un bug en una rama, pero el costo de que pase es alto.

#### [SEC-ROTACION-PROCEDIMIENTO] No hay procedimiento para rotar secretos, repartidos entre Vercel, Fly y Railway
- **Tipo:** deuda técnica
- **Severidad:** Alta
- **Estado verificado:** `SUPABASE_SERVICE_ROLE_KEY` vive en Vercel, Fly (`apps/reel-worker`) y Railway (`apps/discord-bot`); `WORKER_AUTH_SECRET` en Vercel y Fly; `LIMITLESS_WEBHOOK_SECRET`/`OTC_WEBHOOK_SECRET` en Vercel y Railway. No hay documento de rotación en `docs/`. Todas las variables de Vercel las creó y edita un solo usuario, y la organización de Supabase es de una sola cuenta.
- **Riesgo:** Si se filtra un secreto, la rotación se improvisa y deja partes caídas (bot o worker con 401); si la única persona con acceso no está disponible, nadie puede rotar ni restaurar.
- **Impacto:** Todas las orgs (la service role da acceso a los datos de todas).
- **Qué hay que hacer:** documentar en `docs/operacion/` una tabla "secreto → dónde vive → cómo se rota → qué se rompe en el medio" (base: §5.2 de la auditoría y §F del runbook); sumar un segundo owner en Supabase, Vercel, Fly y Railway; evaluar pasar a las claves nuevas de Supabase (`sb_secret_…`) que se rotan sin cambiar el JWT secret.
- **Dónde:** `docs/operacion/`, Supabase, Vercel, Fly, Railway.

Prioridad sugerida P2: no hay una filtración conocida; el procedimiento se necesita antes de la primera.

#### [AUD-SEG-5] Mass assignment e ids ajenos
- **Tipo:** seguridad
- **Estado verificado:** `updateContentPieceAction` (`app/marketing/content/actions.ts:148`) hace `.update(updates)` sin zod. (resuelto el 2026-09-30 en SCRUM-43: el `clientId` de `associateFathomCallAction` se valida contra la org en `finalizeAssociatedCall` con `assertClienteDeLaOrg`, `lib/fathom/cliente-de-la-org.ts`). (resuelto el 2026-09-30 en SCRUM-75: el `customRoleId` de invitar, cambiar rol y aceptar una invitación se valida con `assertRolDeLaOrg`, `lib/team/rol-de-la-org.ts`).
- **Qué hay que hacer:** schema zod con campos editables; verificar que `custom_role_id` y `client_id` pertenezcan a la org antes de escribir. Contexto (auditoría de aislamiento, 2026-09-23): ninguna de las 57 FKs de producción hacia `clients`, `workboard_tasks`, `team_roles` y `profiles` es compuesta con `organization_id`, así que RLS acepta filas propias que apuntan a ids ajenos. Se vuelve cruce real cuando un proceso con service role sigue la FK sin filtrar. Casos encontrados:
  - `[FATHOM-CLIENTID-SIN-VALIDAR]` (resuelto en SCRUM-43, `lib/fathom/cliente-de-la-org.ts`);
  - `attributeSaleToUTM` (`lib/utm/attribute-booking.ts:198-210`), que lee `closing_calls.lead_name` por un `closingCallId` que manda el cliente al crear un cliente;
  - `customRoleId` (resuelto en SCRUM-75, `lib/team/rol-de-la-org.ts`).

  Evaluar FKs compuestas `(x_id, organization_id)` en las tablas principales.
- **Dónde:** archivos citados.

#### [AUD-SEG-6] Prompt injection: el wrapper no escapa y hay fuentes sin envolver
- **Tipo:** seguridad
- **Estado verificado:** `lib/ai/wrap-untrusted-content.ts` interpola `content` tal cual: un `</label>` dentro cierra la etiqueta. Según la auditoría quedan sin envolver DMs de Zernio (`app/integrations/zernio/actions.ts`), respuestas de formularios, ManyChat, labeling de contenido, clasificador de Discord y resultados de tools del agente (no re-verificado caso por caso).
- **Qué hay que hacer:** escapar el tag de cierre (o usar un delimitador aleatorio por llamada) y envolver las fuentes listadas.
- **Dónde:** `apps/web/lib/ai/wrap-untrusted-content.ts` y los call sites.

#### [AUD-SEG-8] Errores internos devueltos al cliente
- **Tipo:** seguridad
- **Estado verificado:** `app/api/invite/validate/route.ts` devuelve `error.message` de Supabase con 500; según la auditoría también Calendly webhook/callback, `rag/ingest`, ManyChat y Unipile; Whop y Commas revelan si la org tiene la integración.
- **Qué hay que hacer:** mensaje genérico + log/Sentry del detalle; respuesta uniforme en webhooks de pagos.
- **Dónde:** rutas citadas.

#### [AUD-SEG-10] Auto-vínculo de Discord por nombre parecido
- **Tipo:** seguridad
- **Estado verificado:** `apps/discord-bot/src/handlers/link-handler.ts:149` vincula solo con `confidence > 0.85` sobre un nombre que controla el usuario de Discord.
- **Qué hay que hacer:** pasar el auto-vínculo a propuesta que confirma el equipo (ya existe el flujo de pendientes).
- **Dónde:** `apps/discord-bot/src/handlers/link-handler.ts`.

#### [SEG-WORKER-SECRET-QUERY] `WORKER_AUTH_SECRET` viaja en la query string
- **Tipo:** seguridad
- **Estado verificado:** `app/marketing/content/reel-variation-actions.ts:138-145, 379-384, 581-584` agrega `?workerSecret=` a la URL publicada en QStash; queda en los logs de QStash, de Fly y de Vercel. `verifyQueueRequest` y el worker lo aceptan por query.
- **Qué hay que hacer:** usar sólo el header `x-worker-secret` (QStash lo reenvía con `headers`), o sólo la firma QStash con `url`; dejar de aceptar el query param.
- **Dónde:** `reel-variation-actions.ts`, `lib/sops/enqueue-video-job.ts`, `lib/queue/verify-queue-request.ts`, `apps/reel-worker/src/index.ts`.

#### [SEG-HEADERS] Sin headers de seguridad HTTP
- **Tipo:** seguridad
- **Estado verificado:** ni `vercel.json` ni `next.config.ts` definen CSP, `frame-ancestors`/`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` ni `X-Content-Type-Options`.
- **Qué hay que hacer:** `headers()` en `next.config.ts` con lo básico (empezar por `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`); CSP en modo report-only primero. La CSP es la defensa principal de la sesión: las cookies `sb-*` de `@supabase/ssr` guardan access y refresh token, son legibles por JavaScript (lo necesita el cliente de navegador) y duran 400 días, así que un XSS se lleva la sesión hasta un logout global. Revisar también en Supabase Auth la duración máxima de sesión (time-box / inactividad).
- **Dónde:** `apps/web/next.config.ts`.

#### [DB-ORGS-SELECT-COLUMNAS] SELECT de tabla entera sobre `organizations` en prod
- **Tipo:** seguridad
- **Severidad:** Media
- **Estado verificado:** según `docs/historial/DB_DIFF_PRODUCCION_2026-09-22.md`, en prod `authenticated` tiene SELECT de tabla sobre `organizations` (en el repo es por columna), así que un miembro lee el ciphertext de la key de Claude de su org. Inofensivo sin `ENCRYPTION_MASTER_KEY`. Confirmado en catálogo el 2026-09-23 (`relacl`: `authenticated=r`; UPDATE sí es por columna, 7 columnas). Además, la policy de portfolio `Users read own or linked business orgs` hace que cualquier miembro de un holding lea esas mismas columnas (`claude_api_key_encrypted`, `mrr_usd`, `enabled_add_ons`) de todos los negocios vinculados: el ciphertext cruza organizaciones.
- **Qué hay que hacer:** relevar qué `select("*")` de `organizations` hace la app con cliente de usuario, pasarlos a columnas explícitas y alinear el grant de prod con el repo.
- **Dónde:** `apps/web/app/**` (grep `from("organizations")`), migración nueva.

#### [AUD-CONF-2] Techo de 1000 filas y lecturas que no miran `error`
- **Tipo:** bug
- **Estado verificado:** `fetchAllRows` existe (`lib/supabase/fetch-all-rows.ts`) y se aplicó en leads, costos y llamadas; la auditoría marca `lib/intelligence/collect-context.ts:220` y `lib/super-admin/client-health.ts` como candidatos. El conteo de 290 lecturas sin `error` no se re-midió.
- **Qué hay que hacer:** toda suma/conteo en JS pasa por `fetchAllRows` o se hace en SQL; revisar los dos candidatos.
- **Dónde:** archivos citados.

#### [AUD-CONF-7] Inbox legacy pierde mensajes concurrentes
- **Tipo:** bug
- **Estado verificado:** según la auditoría, el inbox legacy lee y reescribe `conversations.messages` completo. `conversations` tiene 0 filas en prod, así que hoy no pasa.
- **Qué hay que hacer:** si el inbox legacy se mantiene, append atómico en SQL; si no, borrarlo (`[AUD-SALUD-1]`).
- **Dónde:** `apps/web/lib/sales/upsert-inbound-conversation.ts`, `lib/unipile/`, `lib/manychat/`.

#### [AUD-CONF-8] `cleanup-trial-reels` reprocesa los mismos jobs para siempre
- **Tipo:** bug
- **Estado verificado:** `app/api/cron/cleanup-trial-reels/route.ts` selecciona `reel_variation_jobs` `done`/`failed` con `updated_at` > 30 días y no marca el job como limpiado.
- **Qué hay que hacer:** columna `storage_cleaned_at` (o estado) y filtrar por ella.
- **Dónde:** ruta citada, migración nueva.

#### [AUD-CONF-9] Instagram legacy queda fuera de la sync tras un error transitorio
- **Tipo:** bug
- **Estado verificado:** hallazgo de la auditoría, no re-verificado línea por línea; hay 1 integración de Instagram en prod.
- **Qué hay que hacer:** resolver junto con la decisión de `[AUD-SALUD-1]`.
- **Dónde:** `apps/web/lib/instagram/sync.ts`, `poll-conversations.ts`.

#### [AUD-CONF-10] Meses en UTC y no en ART en payroll y client-health
- **Tipo:** bug
- **Estado verificado:** `computeTeamPayrollAction` (`app/finance/actions.ts:482-484`) arma el mes con `new Date(y, m, 1)` en la zona del servidor (UTC en Vercel). Misma familia que BUG-3.
- **Qué hay que hacer:** usar el helper de límites de mes en ART que ya existe para BUG-3.
- **Dónde:** `apps/web/app/finance/actions.ts`, `apps/web/lib/super-admin/client-health.ts`.

#### [AUD-CONF-11] La sync de contenido de Zernio escribe ceros cuando no reconoce el analytics
- **Tipo:** bug
- **Estado verificado:** según la auditoría; el cron diario ya no lo hace. Pertenece a Marketing: ver el backlog del área.
- **Qué hay que hacer:** no pisar `metrics` si `resolvePostAnalytics` devuelve vacío.
- **Dónde:** `apps/web/app/marketing/content/sync-actions.ts`.

#### [AUD-DIN-1…5] Dinero y datos (derivados a sus áreas)
- **Tipo:** bug
- **Estado verificado:** `lib/metrics/excel-parser.ts:67` borra todos los puntos (`"1250.50"` → 125050); `app/sales/closer-actions.ts:151,218` lee `closing_calls.amount_closed`, que no existe en ninguna migración; ClickUp import, moneda USD por defecto y "balance" de Mercado Pago según la auditoría.
- **Qué hay que hacer:** cada uno en su área (Clientes: parsers e import; Ventas: facturación por closer; Finanzas: monedas y MP). Listados acá para que no se pierdan.
- **Dónde:** archivos citados.

#### [AUD-SALUD-1] Legacy todavía agendado
- **Tipo:** decisión de negocio
- **Estado verificado:** `vercel.json` corre `/api/integrations/instagram/poll` cada 5 min y `/instagram/sync` cada hora con 1 integración en prod; ManyChat, Unipile (6 filas) e Instagram Graph están `listed: false` o sin datos (`conversations` 0 filas).
- **Qué hay que hacer:** decidir si se borran Instagram Graph, Unipile, ManyChat y `content_assets`; como mínimo sacar los dos crons de Instagram.
- **Dónde:** `apps/web/vercel.json`, `lib/instagram/`, `lib/unipile/`, `lib/manychat/`.

#### [AUD-SALUD-2] Sync de Calendly duplicada
- **Tipo:** deuda técnica
- **Estado verificado:** `lib/calendly/sync-events.ts` y `lib/calendly/closer-sync.ts` coexisten; según la auditoría `closer-sync` nunca setea `lead_id`.
- **Qué hay que hacer:** una sola sync parametrizada por credencial.
- **Dónde:** `apps/web/lib/calendly/`.

#### [AUD-SALUD-3] Los crons no siguen un patrón común
- **Tipo:** deuda técnica
- **Estado verificado:** 6 crons hacen fan-out por QStash, el resto corre en serie; aislamiento de errores por org desparejo; ningún lock. Consecuencias ya visibles en prod: crons cortados a los 60 s (`[CRONS-CORTE-60S]`), errores por org que no llegan a Sentry ni a ningún registro (`[OBS-SIN-ALERTAS]`, `[EMBUDOS-CRON-ERRORES]`).
- **Qué hay que hacer:** helper `runPerOrg()` con aislamiento de errores, lock (fila en tabla o advisory lock) y resultado uniforme.
- **Dónde:** `apps/web/app/api/cron/*`, `apps/web/lib/queue/`.

#### [AUD-SALUD-5 / CI-COBERTURA] El CI no corre build, e2e ni el reel-worker
- **Tipo:** deuda técnica
- **Estado verificado:** `.github/workflows/ci.yml` corre typecheck, lint, test y migraciones (el chequeo de migraciones ya está). No corre `next build`, Playwright ni nada de `apps/reel-worker` (sin script `typecheck`).
- **Qué hay que hacer:** agregar `typecheck` al reel-worker; job de `next build` (o confiar en el preview de Vercel y documentarlo); decidir E2E en CI (`[T-INFRA-E2E-CI]`).
- **Dónde:** `.github/workflows/ci.yml`, `apps/reel-worker/package.json`.

#### [AUD-SALUD-6] Helpers exportados desde archivos `"use server"`
- **Tipo:** seguridad
- **Estado verificado:** siguen exportados `getConversationIdByExternalRef` (`app/conversations/actions.ts:29`), `loadTaskLinksBundle` (`app/workboard/task-link-actions.ts:47`), `getProductContextForOrg` (`app/product/actions.ts:673`). Cada export es un endpoint.
- **Qué hay que hacer:** moverlos a `lib/` y relevar el resto con un grep de exports sin sufijo `Action`.
- **Dónde:** archivos citados.

#### [AUD-SALUD-ORG-HOLDING] Acciones que ignoran el negocio activo del holding (AUD-SALUD-7)
- **Tipo:** bug
- **Estado verificado:** usan `profile.organization_id` en vez de `requireOrganizationId()`: `app/marketing/content/{actions,sync-actions,drive-actions,reel-variation-actions,reel-music-actions}.ts`, `app/workboard/actions.ts`, `app/sales/closer-actions.ts`, `app/team/actions.ts`, `app/profile/actions.ts`, `app/api/integrations/calendly/closer/start/route.ts`. Algunos pueden ser a propósito (perfil, equipo).
- **Qué hay que hacer:** revisar uno por uno; los de datos del negocio pasan a `requireOrganizationId()`.
- **Dónde:** archivos citados.

#### [DB-TABLAS-HUERFANAS] Tablas sin ningún uso en el código
- **Tipo:** decisión de negocio
- **Estado verificado:** sin referencias en `apps/`: `agent_projects`, `competitors`, `competitor_posts`, `story_sequences`, `story_frames`, `funnel_benchmarks`, `funnel_period_snapshots`, `lead_magnet_clicks`.
- **Qué hay que hacer:** decidir por cada una (FEAT-1/FEAT-2/EMBUDOS-SALUD las reservan); borrar con migración las que no tengan futuro.
- **Dónde:** migración nueva.

#### [INTEGRACIONES-REGISTRO-DESALINEADO] El registro describe flujos que el código no hace
- **Tipo:** bug
- **Estado verificado:** `lib/integrations/registry.ts` dice YouTube `transport: "cron"` → `content_assets`, pero no hay cron y `lib/google/sync-youtube.ts:139` escribe `content_pieces`; Stripe y Mercado Pago dicen `lands: "payments"` (esa tabla no existe) por `webhook` (Stripe no tiene ruta de webhook); Discord dice `webhook` cuando el bot escribe directo. La pantalla muestra esto al usuario.
- **Qué hay que hacer:** corregir las entradas del registro.
- **Dónde:** `apps/web/lib/integrations/registry.ts`.

#### [MOCK-DATA-AUDIT] Código de producción que todavía importa `@/mocks`
- **Tipo:** deuda técnica
- **Estado verificado:** 10 archivos: `app/sales/actions.ts`, `app/finance/actions.ts`, `app/(platform)/operations/overview/page.tsx`, `components/workboard/workboard-time-report.tsx`, `components/finance/payment-platforms-section.tsx`, `components/marketing-insights/lead-journey-timeline.tsx`, `components/marketing/overview/metrics-sections.tsx`, `providers/finance-data-provider.tsx`, `providers/platform-data-provider.tsx`, `lib/metrics/frequent-objections.ts`.
- **Qué hay que hacer:** cada área decide si es fallback de modo demo (aceptable) o dato falso mostrado como real (quitar). `docs/archivo/mock-data-audit.md` (2026-07-03) está desactualizado.
- **Dónde:** archivos citados.

#### [REBRAND-EXTERNO] Nombres externos que siguen diciendo OTC
- **Tipo:** deuda técnica
- **Estado verificado:** Vercel `otc-plaform`, Supabase `OTC`, Fly `otc-reel-worker`, Railway `otc-discord-bot`, verify token `otc_instagram_webhook_2024` (en `.env.example`), fallback `https://otc-plaform.vercel.app` en `lib/email/welcome-email.ts:6` y `components/super-admin/infrastructure-page.tsx:52`, cookie `otc_active_org` leída como respaldo (`lib/holding/constants.ts:12`), `OTC_WEBHOOK_SECRET`/`OTC_API_URL` leídas como respaldo, holding sembrado `'OTC Portfolio'` (`supabase/migrations/20260618100000_holding.sql:38`).
- **Qué hay que hacer:** coordinar el renombre externo; borrar los respaldos de cookie (ya pasaron más de 24 h del cambio) y de variables una vez cargadas las nuevas (`[ENV-LIMPIEZA]`).
- **Dónde:** archivos citados; Vercel, Fly, Railway, Meta.

#### [REPO-RENOMBRADO-DEPLOYS] Railway tras el renombre del repo
- **Tipo:** verificación manual
- **Estado verificado:** Vercel **sí** sigue: los tres últimos deploys de producción (incluido `038caca`) salen de `santiagozurbrigk/limitless-system`. Railway no se puede ver desde acá.
- **Qué hay que hacer:** Railway → servicio del bot → Settings → Source: repo `limitless-system` y `Root Directory = apps/discord-bot`; actualizar remotes locales.
- **Dónde:** Railway.

#### [T-INFRA-SUPABASE-MOCK] Helper de mock de Supabase
- **Tipo:** tests
- **Estado verificado:** no existe `lib/__tests__/helpers/`; ningún test usa `vi.mock`.
- **Qué hay que hacer:** stub encadenable (`from().select().eq()…` → `{ data, error, count }`) reutilizable; lo necesitan T-6/T-6b (Embudos) y T-10.
- **Dónde:** `apps/web/lib/__tests__/helpers/supabase-mock.ts`.

#### [T-9] `lib/sales/lead-journey.ts`
- **Tipo:** tests
- **Estado verificado:** `lib/sales/__tests__/` tiene `follow-up-options` y `lead-thread`, no `lead-journey`.
- **Qué hay que hacer:** dedupe multicanal, orden del timeline, lead sin llamadas.
- **Dónde:** `apps/web/lib/sales/lead-journey.ts`.

#### [T-10] `lib/sales/upsert-inbound-conversation.ts`
- **Tipo:** tests
- **Estado verificado:** sin tests.
- **Qué hay que hacer:** idempotencia del mismo mensaje entrante (necesita `[T-INFRA-SUPABASE-MOCK]`).
- **Dónde:** archivo citado.

#### [T-11] `lib/zernio/resolve-analytics.ts`
- **Tipo:** tests
- **Estado verificado:** `lib/zernio/__tests__/` no tiene tests de `resolve-analytics.ts`; `metricas-para-guardar.test.ts` y `filas-de-contenido.test.ts` (SCRUM-172) cubren de forma indirecta que un analytics vacío o desconocido da `recognized: false`.
- **Qué hay que hacer:** vacío/inválido → ceros; plano; anidado (`{instagram}` y `{platforms:{instagram}}`) suma; campos faltantes.
- **Dónde:** archivo citado.

#### [T-12] `lib/marketing/overview-metrics.ts`
- **Tipo:** tests
- **Estado verificado:** `lib/marketing/__tests__/` sólo tiene `ad-metrics-snapshot`.
- **Qué hay que hacer:** `trendPct` con previo cero, bordes de `isInDaysRange`, engagement con alcance cero.
- **Dónde:** archivo citado.

#### [T-13] `lib/metrics/derive-dashboard-data.ts`
- **Tipo:** tests
- **Estado verificado:** sin tests.
- **Qué hay que hacer:** MRR y clientes nuevos con org vacía.
- **Dónde:** archivo citado.

#### [T-15] `lib/metrics/frequent-objections.ts`
- **Tipo:** tests
- **Estado verificado:** sin tests; además importa `@/mocks` como fallback.
- **Qué hay que hacer:** agrupación, tendencia y cadena de fallback.
- **Dónde:** archivo citado.

#### [T-16] `lib/validations.ts`
- **Tipo:** tests
- **Estado verificado:** sin tests.
- **Qué hay que hacer:** esquemas usados en actions con input de usuario: válidos, inválidos, borde.
- **Dónde:** archivo citado.

#### [T-18] E2E del wizard de importación
- **Tipo:** tests
- **Estado verificado:** `e2e/` sólo tiene `holding.spec.ts`.
- **Qué hay que hacer:** Excel multi-hoja → hoja → mapeo → importar → aparecen en `/clients`.
- **Dónde:** `apps/web/e2e/`.

#### [T-19] E2E de permisos por rol
- **Tipo:** tests
- **Estado verificado:** sin cobertura.
- **Qué hay que hacer:** viewer con módulos limitados: no los ve en la nav y por URL ve `<SinAcceso/>`.
- **Dónde:** `apps/web/e2e/`.

#### [T-INFRA-E2E-CI] Correr Playwright en CI
- **Tipo:** decisión de negocio
- **Estado verificado:** `playwright.config.ts` tiene rama de CI; el workflow no lo invoca; necesita una cuenta de test y una base.
- **Qué hay que hacer:** decidir cuenta/base de test (proyecto Supabase aparte) y agregar el job.
- **Dónde:** `.github/workflows/ci.yml`.

#### [CAMPO-FECHA-MIGRAR] 14 campos de fecha todavía no usan `CampoFecha`
- **Tipo:** deuda técnica
- **Estado verificado:** SCRUM-493 creó `CampoFecha` (`apps/web/components/shared/campo-fecha.tsx`), que muestra el
  valor guardado (columna `date` o `timestamptz`) con el día que se eligió, y lo usa en los 13 campos que tenían el
  bug de UTC (11 archivos). Quedan 14 campos `type="date"` en 11 archivos que hoy funcionan bien:
  `client-onboarding/onboarding-form.tsx` (1), `clients/client-tasks-section.tsx` (1),
  `clients/custom-fields/field-value-input.tsx` (1), `clients/wins/client-baseline-dialog.tsx` (1, fecha de egreso),
  `closing/payment-modal.tsx` (1), `fathom/fathom-task-proposal-modal.tsx` (1),
  `finance/facturacion-period-filter.tsx` (2, rango personalizado), `lanzamientos/create-launch-modal.tsx` (2),
  `sales/client-payments-section.tsx` (2), `workboard/workboard-shell.tsx` (1) y
  `workboard/workboard-task-detail-dialog.tsx` (1), todos bajo `apps/web/components/`.
- **Qué hay que hacer:** pasarlos a `CampoFecha` al tocar cada pantalla (regla en
  `docs/arquitectura/vision-general.md` § Convenciones), sin cambiar lo que guardan.
- **Dónde:** los archivos citados.

#### [FECHAS-UTC-RESTO] Períodos de reporte que todavía se cortan en UTC o en el navegador, fuera del alcance de SCRUM-493
- **Tipo:** bug
- **Estado verificado:** SCRUM-493 dejó una regla para toda la app: el "hoy" y las fechas calendario de un dato de
  la organización son los de su zona (`organizations.timezone`). Quedan afuera, con motivo, los **períodos de
  reporte** (ventanas de días, "mes actual"), porque se cortan todos juntos y en algunos la zona no es la de la org:
  - Anuncios: el día lo define la zona de la cuenta de Meta, no la de la org
    (`components/marketing/ads-dashboard.tsx:101`, `app/(platform)/marketing/anuncios/page.tsx:10`,
    `app/api/cron/capture-ad-metrics/route.ts:56`, `lib/marketing/ad-metrics-snapshot.ts:42`).
  - Reportes por cron: `lib/executive-reports/generate-daily.ts:144`, `compute-departments.ts:61`,
    `lib/intelligence/collect-context.ts:198,298`.
  - Ventanas de los últimos días y del mes en pantallas y actions: sparklines de conversaciones del Panel y de Ventas
    (`lib/metrics/derive-dashboard-data.ts:64,158-168`, `derive-sales-metrics.ts:25`), agrupado por semanas de las
    métricas de ventas (`components/sales/metrics/use-sales-metrics.ts:74,90`, semanas de 7 días desde el reloj del
    navegador; el rango elegido ya se corta en la zona de la org), `app/sales/metrics-actions.ts:43-59`, `app/manychat/cta-actions.ts:19-36` y `lib/metrics/custom-metrics.ts:109`.
  - "Mes actual" con el reloj del navegador o del servidor: `lib/metrics/derive-dashboard-data.ts:127-130` (clientes
    nuevos del mes), `lib/metrics/enrich-team-compensation.ts:5-11`, `lib/metrics/derive-monthly-series.ts:36` (serie de 6 meses),
    `lib/product/offer-metrics.ts:34,43,87`. Los
    meses de Finanzas están en `[FIN-MESES-UTC]` y `[AUD-CONF-10]`; Embudos, VTurb y Hyros, en `[EMBUDOS-TIMEZONE]`.
  - Super admin, que cruza organizaciones y necesita decidir una zona: `lib/super-admin/period.ts`,
    `lib/super-admin/queries.ts:682,990`, `lib/super-admin/org-metrics.ts:73` y la biblioteca global del AI Brain
    (`lib/ai-brain/mapper.ts:114,145,200`).
  - ClickUp: la fecha de alta importada se corta en UTC y además no entiende los timestamps en milisegundos que
    manda ClickUp (`app/integrations/clickup/import-actions.ts:230`).
- **Qué hay que hacer:** decidir en qué zona se cortan los períodos de reporte (la de la org, salvo anuncios: la de la
  cuenta; super admin: una fija) y pasarlos juntos a `lib/fechas` (`inicioDelDiaEnZona`, `fechaDeInstanteEnZona`).
- **Dónde:** los archivos citados.

### Infraestructura, seguridad y tests (transversal) · P3

#### [FATHOM-LINK-EN-TEST] Un link compartido de Fathom con aspecto real en un test commiteado
- **Tipo:** seguridad
- **Severidad:** Baja
- **Estado verificado:** `apps/web/lib/fathom/__tests__/share-link.test.ts:57-69` (commit `42534ba`, 2026-09-20, sigue en el árbol) usa `https://fathom.video/share/<token de 32 caracteres>` con aspecto de token real, mientras el resto del archivo usa `TOKENDEPRUEBA` y aclara que los datos son inventados. No se abrió el link.
- **Riesgo:** Si el token es de una grabación real, entonces cualquiera con acceso al repo (o a un clon) ve la llamada y su transcript; los links compartidos de Fathom no vencen solos.
- **Impacto:** Una grabación de venta o de entrega de un cliente (datos personales y comerciales). Media si resulta real.
- **Qué hay que hacer:** abrir el link una vez; si lleva a una grabación, revocar el link compartido desde Fathom y reemplazar el token del test por uno inventado (no hace falta reescribir el historial una vez revocado).
- **Dónde:** `apps/web/lib/fathom/__tests__/share-link.test.ts`, Fathom.

Prioridad sugerida P3 (P2 si el link resulta real): verificación de un minuto.

---

#### [SERVER-ONLY-GUARDS] El admin client y el cifrado no están marcados como sólo-servidor
- **Tipo:** deuda técnica
- **Severidad:** Baja
- **Estado verificado:** `apps/web/lib/supabase/admin.ts` y `apps/web/lib/security/encryption.ts` no tienen `import "server-only"` (sí lo tienen 6 archivos menos sensibles, p. ej. `lib/auth/add-ons.ts`). `lib/supabase/env.ts`, que incluye `getSupabaseServiceRoleKey()`, llega al bundle del navegador desde 65 archivos `"use client"` vía `lib/supabase/client.ts`; en el navegador la variable vale `undefined` (Next sólo inyecta `NEXT_PUBLIC_*`), así que hoy no hay fuga. Ningún archivo cliente importa `admin.ts` ni `encryption.ts` (grafo de imports de los 428 archivos cliente, 2026-09-23).
- **Riesgo:** Si un cambio futuro importa el admin client o el cifrado desde un componente cliente, entonces el build no falla y el error aparece en runtime, con la tentación de "arreglarlo" exponiendo la variable como `NEXT_PUBLIC_`.
- **Impacto:** Prevención; hoy no afecta a nadie.
- **Qué hay que hacer:** `import "server-only"` en `admin.ts`, `encryption.ts` y `lib/ai/credential-resolver.ts`; mover `getSupabaseServiceRoleKey` de `env.ts` a `admin.ts`.
- **Dónde:** `apps/web/lib/supabase/{admin,env}.ts`, `apps/web/lib/security/encryption.ts`, `apps/web/lib/ai/credential-resolver.ts`.

Prioridad sugerida P3: preventivo, cambio de minutos.

#### [SERVICE-ROLE-FUERA-DE-VERCEL] El bot de Discord y el worker de Fly tienen la clave de service role completa
- **Tipo:** seguridad
- **Severidad:** Media
- **Estado verificado:** `apps/discord-bot/src` y `apps/reel-worker/src` leen `SUPABASE_SERVICE_ROLE_KEY` (grep de `process.env`), que saltea RLS en todas las tablas, incluidas las de secretos en claro (`[AUD-SEG-2]`). El bot sólo necesita tablas de Discord y clientes; el worker, `reel_variation_jobs`, Storage de `trial-reels` y la música de la org.
- **Riesgo:** Si se compromete la cuenta o el contenedor de Railway o de Fly (dependencia maliciosa, token de deploy filtrado), entonces el atacante tiene lectura y escritura sobre toda la base de todas las orgs.
- **Impacto:** Todas las orgs y todas las credenciales guardadas en claro.
- **Qué hay que hacer:** evaluar un rol de Postgres propio por servicio (JWT firmado con `role` restringido, o funciones RPC `SECURITY DEFINER` acotadas) con permisos sólo sobre sus tablas; como mínimo, inventariar quién tiene acceso a Railway y Fly y rotar la clave de service role si alguien sale del equipo.
- **Dónde:** `apps/discord-bot/src/lib/supabase.ts`, `apps/reel-worker/src/`, Railway, Fly.io.

Prioridad sugerida P3: reduce el alcance de un compromiso que hoy no está pasando; requiere diseño.

#### [DB-FK-MISMA-ORG] La base no impide que una fila apunte a filas de otra organización
- **Tipo:** seguridad
- **Severidad:** Media
- **Estado verificado:** en prod hay 115 FKs desde tablas con `organization_id` hacia otras tablas con `organization_id`, todas de una sola columna (ninguna compuesta con `organization_id`, `pg_constraint`). Las policies de INSERT/UPDATE miran sólo el `organization_id` de la fila escrita, así que un miembro puede guardar en su org filas con `client_id`, `sop_id`, `custom_role_id`, etc. de otra org. `notification_preferences` (policy `own_preferences`) filtra sólo por `profile_id = auth.uid()`: el usuario puede escribir filas con el `organization_id` de otra org; hoy sólo las lee su dueño (`app/settings/actions.ts:295-370`).
- **Riesgo:** Si un proceso con service role sigue una de esas FKs (como `[FATHOM-CLIENTID-SIN-VALIDAR]` del lado de la app), entonces muestra o procesa datos de otra org dentro de la propia. Además la FK responde si un UUID ajeno existe. Requiere conocer UUIDs de otra org.
- **Impacto:** Mezcla de datos entre orgs en reportes o jobs; hoy no se identificó un consumidor con admin client que lo explote además del de Fathom.
- **Qué hay que hacer:** en las relaciones críticas (`client_id`, `sop_id`, `win_id`, `task_id`, `custom_role_id`) FK compuesta `(organization_id, x_id)` → `(organization_id, id)` o trigger de misma org; en `notification_preferences`, sumar `organization_id = get_my_organization_id()` al WITH CHECK.
- **Dónde:** migración nueva; tablas hijas de `clients`, `sops`, `client_wins`, `workboard_tasks`, `team_roles`; `notification_preferences`.

Prioridad sugerida P3: por sí sola no expone datos; depende de un consumidor con service role que no valide.

#### [LOGS-SIN-CONTEXTO] Logs sin request_id, con org_id desparejo y niveles mezclados
- **Tipo:** deuda técnica
- **Severidad:** Baja
- **Estado verificado:** ningún log lleva `request_id` (grep sin resultados); `org_id` aparece a veces en el texto, a veces en un objeto, a veces no; mensajes informativos con `console.error` (`lib/rag/ingest.ts:75`, que suma 31 "errores" en el agregado de Vercel); `fathom/process` imprime varias líneas de diagnóstico por corrida. ~514 llamadas a `console.*` en 181 archivos de `apps/web`.
- **Riesgo:** Si hay que reconstruir qué le pasó a un cliente o a una corrida, entonces lleva mucho más tiempo, y el ruido tapa errores reales en el agregado de errores.
- **Impacto:** Tiempo del equipo al investigar incidentes.
- **Qué hay que hacer:** helper mínimo `log({ level, scope, orgId, requestId, ... })` en JSON; empezar por crons y webhooks; bajar a `info` lo que no es error.
- **Dónde:** `apps/web/lib/` (helper nuevo), `apps/web/app/api/**`.

---

#### [T-17] E2E del flujo de embudos
- **Tipo:** tests
- **Estado verificado:** sin spec. (Coordinar con el backlog de Embudos, que tiene T-6…T-8.)
- **Qué hay que hacer:** crear embudo DM, 7 etapas, "Sin fuente" no es cero, período en la URL, empty state.
- **Dónde:** `apps/web/e2e/`.

#### [T-20] `lib/navigation/sidebar-modules.ts`
- **Tipo:** tests
- **Estado verificado:** los tests de navegación cubren `module-for-path` y `page-meta`, no `buildPlatformRootItems` ni `getParentFromPath`.
- **Qué hay que hacer:** combinaciones de add-ons; rutas anidadas.
- **Dónde:** archivo citado.

#### [T-21] `lib/format.ts` y `lib/locale/`
- **Tipo:** tests
- **Estado verificado:** sin tests.
- **Qué hay que hacer:** moneda y fechas es-AR.
- **Dónde:** archivos citados.

#### [T-22] `lib/product/mapper.ts`
- **Tipo:** tests
- **Estado verificado:** sin tests.
- **Qué hay que hacer:** mapeo de filas a tipos.
- **Dónde:** archivo citado.

#### [T-23] `lib/rate-limit.ts`
- **Tipo:** tests
- **Estado verificado:** sin tests.
- **Qué hay que hacer:** contador en memoria (ventana, expiración) y fail-open cuando la RPC falla (con el cliente mockeado).
- **Dónde:** archivo citado.

#### [T-24] `lib/sanitize.ts` y `wrap-untrusted-content.ts`
- **Tipo:** tests
- **Estado verificado:** `lib/security/__tests__/` cubre cifrado y `safeEqual`; `sanitize` y el wrapper no tienen tests.
- **Qué hay que hacer:** caracteres de control, techo de largo, escapado; y el caso del tag de cierre de `[AUD-SEG-6]` como `it.fails` hasta arreglarlo.
- **Dónde:** archivos citados.

#### [T-INFRA-COVERAGE] Medir cobertura
- **Tipo:** tests
- **Estado verificado:** `@vitest/coverage-v8` no está instalado ni configurado.
- **Qué hay que hacer:** sumarlo sin umbral; poner umbral cuando la cobertura sea significativa.
- **Dónde:** `apps/web/vitest.config.ts`.

#### [PACKAGES-RESERVADOS] Cuatro paquetes vacíos
- **Tipo:** deuda técnica
- **Estado verificado:** `packages/{ai,database,integrations,queue}` sólo exportan una constante `*_RESERVED`; `apps/web/api/` y `apps/web/server/` son carpetas vacías con `.gitkeep`; `apps/web/workspaces/` es un placeholder sin funcionalidad.
- **Qué hay que hacer:** borrarlos o documentar que no se van a usar; hoy confunden a quien lee la estructura.
- **Dónde:** `packages/`, `apps/web/{api,server,workspaces}`.

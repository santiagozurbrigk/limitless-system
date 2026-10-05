# Plataforma: panel, onboarding, ajustes, integraciones y super admin

> Verificado contra el código el 2026-09-23 (commit 038caca). Backlog del área: `PENDIENTES.md` § Plataforma.
> Auth, holding y permisos están en [`../arquitectura/auth-organizaciones-y-permisos.md`](../arquitectura/auth-organizaciones-y-permisos.md).
> UI y navegación en [`../diseno/ui-y-navegacion.md`](../diseno/ui-y-navegacion.md).

## Qué es

Las pantallas que no son de un dominio de negocio: el Panel General, el gate y checklist de onboarding del
founder, Ajustes, la pantalla de Integraciones (el tablero, no cada proveedor), el panel interno de Super
Admin (staff Limitless), el Área del fundador y las páginas públicas que quedan (`/prueba`,
`/privacidad`, `/demo`, `/design-system`). **No** incluye la lógica de cada integración ni los módulos
de negocio (clientes, ventas, marketing, etc.).

## Pantallas y rutas

### Plataforma (`app/(platform)`, con notch nav y gate de permisos)

| Ruta | Archivo | Qué muestra |
|---|---|---|
| `/dashboard` | `app/(platform)/dashboard/page.tsx` → `components/dashboard/dashboard-page-content.tsx` | Checklist de configuración + KPIs, embudo, ingresos, ventas, closers, Zernio. Holding sin negocio activo → redirige a `/holding` |
| `/onboarding` | `app/(platform)/onboarding/page.tsx` → `components/onboarding/onboarding-gate.tsx` | Gate de 3 pasos del founder, sin chrome (`lib/navigation/chromeless.ts`) |
| `/onboarding/holding` | `app/(platform)/onboarding/holding/page.tsx` | Wizard de alta del holding (`onboarding_responses`) |
| `/holding` | `app/(platform)/holding/page.tsx` | Portfolio del holding, entrar/salir de un negocio |
| `/settings` | `app/(platform)/settings/page.tsx` → `components/settings/settings-form.tsx` | Pestañas General, Perfil, Notificaciones, IA (BYOK Claude), Seguridad; Pagos (sólo founder); Mi Calendly (sólo si el nombre del rol custom contiene "closer") |
| `/integrations` | `app/(platform)/integrations/page.tsx` → `components/integrations/integrations-board.tsx` | Tablero de las integraciones por categoría, estado y detalle |
| `/integrations/import` | `app/(platform)/integrations/import/page.tsx` | Importación de históricos desde Excel o GoHighLevel. El import de ClickUp es un diálogo aparte, desde la tarjeta de ClickUp del tablero |
| `/integrations/discord` | `app/(platform)/integrations/discord/page.tsx` | Ver [`discord.md`](./discord.md) |
| `/team`, `/team/members`, `/team/roles` | `app/(platform)/team/*` | Miembros, invitaciones y roles. `/team/members` y `/team/roles` redirigen a `/team#…` (`lib/navigation/redirects.ts`) |
| `/redesign-preview` | `app/(platform)/redesign-preview/page.tsx` | Pantalla interna de diseño, sin datos, libre de permisos |

### Fuera de plataforma

| Ruta | Archivo | Qué muestra |
|---|---|---|
| `/` | redirect en `next.config.ts` | Temporal (307) a `/login`. La landing pública se borró el 2026-09-23 |
| `/login`, `/auth/*` | `app/login`, `app/auth/*` | Login + signup, recuperar, actualizar y forzar cambio de contraseña. Sin Supabase: `MockLoginPage` |
| `/invite` | `app/invite/page.tsx` | Aceptar invitación de equipo por token (legado: invitar hoy crea la cuenta con contraseña temporal y no genera filas en `team_invitations`) |
| `/founder` | `app/(founder)/founder/page.tsx` | Área del fundador: el último `intelligence_snapshots` con layout propio (`layouts/founder-layout.tsx`) |
| `/prueba` | `app/(landing)/prueba/page.tsx` | Confirmación de prueba gratis → `POST /api/trial-confirm` → `waitlist_leads` (`source = 'trial'`) |
| `/privacidad` | `app/(landing)/privacidad/page.tsx` | Política de privacidad, pública (la piden las apps OAuth) |
| `/demo` | `app/demo/page.tsx` | Tour estático (`components/demo`, `lib/demo/tour-steps.ts`), público |
| `/design-system`, `/design-system/charts`, `/design-system/categorias` | `app/design-system/*` | Showcase de componentes y gráficos, público |
| `/superadmin/login` | `app/superadmin/login/page.tsx` | Login del staff (`signInSuperAdminAction`) |
| `/super-admin/*` | `app/(super-admin)/super-admin/*` | Panel interno (tabla abajo) |

`app/superadmin/` (sin guion) no es un duplicado del panel: sólo tiene `login/` y `dashboard/`, que
redirige a `/super-admin/organizations`. El panel es `app/(super-admin)/super-admin/`; las acciones,
`app/super-admin/*.ts`.

### Super Admin

| Ruta | Datos | Qué hace |
|---|---|---|
| `/super-admin/organizations` (+ `/new`, `/[id]`) | `lib/super-admin/queries.ts` | Lista, alta de founder, detalle: estado, MRR, notas, add-ons, contraseña temporal, **baja** |
| `/super-admin/users` | `loadAdminUsers` | Todos los perfiles, último login, baja de persona |
| `/super-admin/holding` | `lib/super-admin/holding-queries.ts`, `holdings-admin.ts` | Portfolio agregado, crear holding y negocios |
| `/super-admin/costs` | `loadAiCostDashboard` | Costo de IA desde `token_usage` |
| `/super-admin/infrastructure` | `loadInfrastructureStats` | Conteos de infraestructura |
| `/super-admin/client-health` | `lib/super-admin/org-health.ts` | Score 0–100: 25 pts por tener conversaciones, llamadas Fathom, SOPs activos e inputs semanales |
| `/super-admin/onboarding` | `lib/super-admin/onboarding-progress.ts` (RPC `onboarding_org_progress`) | En qué paso quedó cada org, ordenado por atención |
| `/super-admin/waitlist`, `/super-admin/trials` | `lib/super-admin/waitlist-queries.ts` | `waitlist_leads` |
| `/super-admin/ai-brain/*` | `app/super-admin/actions.ts` | "Cerebro de IA general": documentos globales, import desde Drive del super admin, batch de resúmenes |

Estado de la organización: el de la base, `organizations.status in ('active', 'paused', 'churned')`, con el tipo `OrganizationStatus` de `@ai-coo/types` (también lo usan `AdminOrgStatus` y `organizaciones-activas.ts`). `lib/super-admin/estado-de-org.ts` lo lee (`estadoDeOrg`; un valor desconocido no se convierte en ningún estado: queda `unknown`, se muestra "Desconocido" y no tiene botón de pausar ni activar, `accionDeEstado`), le da texto (Activa, Pausada, Dada de baja, desde `es.status.org`) y color, y estima el plan sólo por MRR (`planPorMrr`; no hay columna de plan). La lista de organizaciones filtra por esos tres estados; "Pausar" deja la org en `paused` y "Activar" la vuelve a `active` (`setOrganizationStatusAction`); ninguna pantalla pasa una org a `churned`. El estado "activo/inactivo" de `/super-admin/users` es otra cosa: si la persona puede entrar (`AdminUserStatus`, baneada en Auth o perfil inactivo).

Guard doble: `app/(super-admin)/super-admin/layout.tsx` (redirect) y `requireSuperAdmin()` dentro de
cada query/acción (incluidas las de sólo lectura, vía `lib/super-admin/queries.ts`, `org-health.ts` y
`onboarding-progress.ts` y `getSignedFileUrl`, que lo suman desde SCRUM-111). Los dos guards (`isSuperAdminUser` y `requireSuperAdmin`) comparten una resolución memoizada con `cache` de React (`lib/auth/require-super-admin.ts`): dentro de un mismo render de server components (layout + página, p. ej. `/super-admin/ai-brain/[id]` con imagen, que encadena tres chequeos) se hace un solo `auth.getUser()` y una sola consulta a `super_admin_users`. En server actions y route handlers `cache` no memoiza: cada llamada consulta, como antes. Los mensajes de rechazo no cambiaron.

## Modelo de datos

| Tabla | Para qué | Notas |
|---|---|---|
| `onboarding_state` | `gate_completed_at`, `dismissed_items text[]`, `tours_seen text[]` por org | RLS por org. Lo único persistido del onboarding |
| `onboarding_responses` | Respuestas del wizard de holding | Sólo holding. `completed_at` decide `/holding` vs `/onboarding/holding` |
| `organizations.skip_onboarding` | Excusa del gate | Hoy sólo se setea al crear negocios de holding; **no hay botón en super admin** |
| `super_admin_deletions` | Registro de bajas (quién, qué, `problemas`) | No se borra con lo borrado (`20260906110000_registro_de_bajas.sql`) |
| `organization_notes` | Notas del staff por org | |
| `token_usage` | Tokens y costo por org/modelo/feature | Base de `/super-admin/costs` |
| `waitlist_leads` | Waitlist y pruebas gratis | Escriben `/api/trial-confirm` y `/api/waitlist` |
| `custom_metrics` | Métricas custom del panel | Se consultan en `/dashboard` pero hoy no se dibujan (ver deuda) |

Funciones: `onboarding_connected_source_count(org_id)` y `onboarding_org_progress()` son SECURITY DEFINER
con execute sólo para `service_role` (`20260831140000`, `20260831150000`).

## Cómo fluye el dato

### Panel General

`page.tsx` (server) trae objeciones frecuentes, analytics de Zernio y métricas custom; el resto sale de
providers de cliente (`usePlatformData`, `useFinanceData`) y se deriva en
`lib/metrics/derive-dashboard-data.ts`. Si no hay clientes, conversaciones ni llamadas, muestra
`DashboardEmptyState`. El `SetupChecklist` va **arriba y por fuera** de `DashboardOverview` porque ese
componente hace early return al empty state, que es justo donde está una cuenta nueva.

### Onboarding del founder

Spec: [`../specs/ONBOARDING_PLAN.md`](../specs/ONBOARDING_PLAN.md) (la citan comentarios del código).
Resumen de lo construido:

| Nivel | Ítems (`lib/onboarding/items.ts`) | Comportamiento |
|---|---|---|
| `gate` | `business_identity` (moneda + zona horaria), `core_offer`, `primary_avatar` | Bloquea la entrada del founder hasta `gate_completed_at` |
| `checklist` | `data_source`, `first_funnel`, `historical_import`, `team_invited` | Tarjeta en el panel + contador en la notch nav; se puede ocultar |
| `suggested` | `knowledge_base` | Se ofrece |

```
middleware: founder && !gate_completed_at && !skip_onboarding && !holding → /onboarding
/onboarding (page): getOnboardingStateAction()
   gate.passed → /dashboard · gate.satisfied (datos cargados por fuera) → skipSatisfiedGateAction()
   → OnboardingGate(initialStep = primer paso pendiente)
      saveGateBusinessAction / saveGateOfferAction / saveGateAvatarAction → completeOnboardingGateAction
      → markWelcomePending() → CinematicWelcome una vez (components/platform/welcome-gate.tsx)
(platform)/layout: getCurrentOnboardingContext() → OnboardingProvider → SetupChecklist, NotchSetupIndicator
TourRunner (Driver.js): tours de /funnels, /marketing/content, /agent, /sales/inbox (lib/onboarding/tours.ts)
```

- **El progreso se deriva de las tablas reales**, no se guarda (`lib/onboarding/derive.ts`, puro). Los
  hechos los junta `lib/onboarding/resolve.ts` con service role: org, `products.is_core_offer`,
  `customer_avatars.is_primary`, fuentes conectadas (RPC), embudos con todos los pasos vinculados,
  `metrics_snapshots`, `profiles`, documentos indexados.
- Cache en memoria del proceso, 60 s por org (`factsCache`); `invalidateOnboardingState()` sólo limpia la
  instancia que atiende.
- Sólo el founder ve gate y checklist. Los members reciben únicamente los tours de módulos que pueden ver.

### Ajustes

`lib/settings/initial-data.ts` junta todo en el servidor. Acciones en `app/settings/actions.ts`
(org, notificaciones, clave Claude) y `app/profile/actions.ts` (perfil propio). La clave BYOK se valida
contra Anthropic antes de guardarse cifrada (`validateClaudeApiKey`, `assertClaudeKeyFormat`).

### Integraciones (la pantalla)

`getIntegrationsOverviewAction()` (`app/integrations/actions.ts`) pide en paralelo el estado de cada
proveedor y los normaliza a `IntegrationHealth` (`lib/integrations/health.ts`). Qué es cada integración
(categoría, auth, descripción) vive en el registro único `lib/integrations/registry.ts`; los ids en
`constants/integrations.ts`; colores en `lib/integrations/brand-colors.ts`. La página además renderiza en
el servidor la configuración de VTurb, Hyros, WebinarJam, GHL, pagos, Fathom y ManyChat y se la pasa al
tablero como props. Detalle de cada proveedor: `docs/integraciones/README.md` y el doc del área que la use.

### Bajas (super admin)

`app/super-admin/delete-actions.ts` + `lib/super-admin/deletion-plan.ts` (puro) + `execute-deletion.ts`:
1. `preview*` cuenta alcance y arma advertencias (holding con negocios, único founder, org propia).
2. La confirmación es el nombre exacto, revalidado en el servidor.
3. Lee ids y rutas de Storage **antes** de borrar; borra la fila de `organizations` (cascade a ~130
   tablas); después barre Storage (`BUCKETS_POR_ORGANIZACION`) y borra los `auth.users`.
4. Lo que falla queda en `problemas` y en `super_admin_deletions`; una baja parcial no se reporta como éxito.

El login se borra aparte porque la FK es `profiles.id → auth.users` (borrar la org borra el perfil, no la
cuenta). El comentario de `execute-deletion.ts` dice "cero FK a `auth.users`": es falso (la FK existe desde
`20260521000000`), pero la conclusión —hay que borrar el login a mano— sigue siendo correcta.

## Integraciones externas

| Proveedor | Uso en esta área | Sin conexión |
|---|---|---|
| Supabase Auth | Sesión, signup, recover, `admin.createUser`/`deleteUser` | Modo demo (ver abajo) |
| Anthropic | Validar la clave BYOK en Ajustes | La org usa la clave global |
| Resend | Mail de waitlist (sólo desde `/api/waitlist`, sin llamador) y aviso de reels de prueba (`lib/email.ts`, `lib/email/*`). `sendWelcomeEmail` existe pero nadie la llama | No sale el mail |
| Google Drive (super admin) | Import al cerebro global (`app/super-admin/drive-actions.ts`) | Sección vacía |
| Meta Pixel | `(landing)/layout.tsx` en `/prueba` y `/privacidad` | No trackea |

**Modo demo:** sin `NEXT_PUBLIC_SUPABASE_URL` + anon key, `isSupabaseConfigured()` es falso: el
middleware deja pasar todo, `/login` muestra un login mock y los providers usan `mocks/*`. Pero **cualquier
pantalla de `(platform)` da 500**: `getHoldingSessionState()` llama `createClient()` sin chequear la
configuración (`[DEMO-LAYOUT-500]`). `/demo` y `/design-system` sí funcionan.

## Reglas de negocio y decisiones no obvias

- **El gate es sólo del founder y va después del cambio de contraseña.** Invitados, holdings y orgs con
  `skip_onboarding` no lo ven. La única salida manual es `skip_onboarding`, y hoy se setea por SQL.
- **Derivar, no guardar.** Si una org borra su oferta principal después del gate, el ítem se reabre en el
  checklist pero **no la expulsa** (el gate sólo mira `gate_completed_at`).
- **Toda ruta nueva de `(platform)` tiene que decidir su módulo** en `module-for-path.ts`, o falla el test.
- **Super admin no tiene organización.** Todo lo que haga contra una org lo hace con service role.
- **Integraciones: para agregar un proveedor** se tocan cuatro lugares y nada más (id, registro, color,
  health). La UI se arma sola.
- `/`, `/prueba`, `/privacidad`, `/demo`, `/design-system`, `/invite`, `/onboarding-cliente/*` son públicas
  (`lib/supabase/public-paths.ts`).

## Limitaciones conocidas y deuda

- `[DEMO-LAYOUT-500]` El layout de plataforma rompe sin Supabase.
- `[DASHBOARD-CODIGO-MUERTO]` (nuevo) `/dashboard` pide `getCustomMetricsAction("dashboard")` y
  `DashboardPageContent` lo recibe pero **no lo dibuja**. Además hay 10 componentes sin uso en
  `components/dashboard/` (`ai-recommendations`, `alerts-intelligence`, `custom-metrics-section`,
  `custom-metric-builder`, `executive-summary`, `next-actions-strip`, `operational-metrics-section`,
  `opportunities-list`, `risks-list`, `weekly-changes`).
- `[EMBUDO-PANEL-DMS]` El embudo del panel arranca en llamadas; el tramo de DMs quedó sin fuente.
- `[ONBOARDING-SKIP-SIN-UI]` (nuevo) No hay forma desde el super admin de marcar `skip_onboarding`.
- `[BAJAS-SIN-PROBAR]` La baja nunca se ejecutó entera en producción.
- `[CLIENT-HEALTH-LEGACY]` (nuevo) El score de `/super-admin/client-health` da 25 pts por `conversations`,
  la tabla del inbox viejo que quedó vacía con Zernio: nadie los suma.
- `[FOUNDER-AREA]` `/founder` es el mismo snapshot de Inteligencia con otro layout, y no pasa por el
  bloqueo de permisos (está fuera de `(platform)`).
- `[WAITLIST-HUERFANO]` (nuevo) `/api/waitlist` sigue público y sin llamador desde que se borró la landing.
- `[SETTINGS-CLOSER-POR-NOMBRE]` (nuevo) La pestaña "Mi Calendly" aparece si el nombre del rol custom
  contiene "closer" (`includes`, sin distinguir mayúsculas): renombrar el rol la esconde.
- `[INTEGRACIONES-PLAYWRIGHT]` El tablero de Integraciones no tiene e2e.
- `[BRAND-E]` Dominio `optimizatucontrol.com` en `brand.domain` y en referencias sueltas.

## Tests

| Archivo | Cubre |
|---|---|
| `apps/web/lib/onboarding/__tests__/derive.test.ts`, `items.test.ts` | Derivación del estado y catálogo |
| `apps/web/lib/onboarding/__tests__/gate-routing.test.ts` | Redirect al gate sin loops |
| `apps/web/lib/onboarding/__tests__/tours.test.ts` | Cada `data-tour` existe en el JSX y no hay anclas huérfanas |
| `apps/web/lib/super-admin/__tests__/deletion-plan.test.ts` | Confirmación y advertencias de baja |
| `apps/web/lib/super-admin/__tests__/onboarding-progress.test.ts` | Orden y mapeo del panel de onboarding |
| `apps/web/lib/integrations/__tests__/health.test.ts` | Contrato de estado de integraciones |
| `apps/web/lib/navigation/__tests__/page-meta.test.ts` | Título y "volver" de cada pantalla |

Sin tests: `lib/onboarding/resolve.ts` (IO), `execute-deletion.ts`, las queries de super admin, las
acciones de Ajustes, `derive-dashboard-data.ts` (`[T-13]`). Sin e2e de onboarding ni de super admin.

## Archivos clave

- `apps/web/app/(platform)/dashboard/page.tsx`, `apps/web/components/dashboard/dashboard-page-content.tsx`
- `apps/web/lib/onboarding/items.ts`, `derive.ts`, `resolve.ts`, `current.ts`
- `apps/web/app/onboarding/actions.ts`, `apps/web/components/onboarding/onboarding-gate.tsx`
- `apps/web/lib/settings/initial-data.ts`, `apps/web/app/settings/actions.ts`
- `apps/web/app/(platform)/integrations/page.tsx`, `apps/web/lib/integrations/registry.ts`, `health.ts`
- `apps/web/app/super-admin/actions.ts`, `delete-actions.ts`
- `apps/web/lib/super-admin/queries.ts`, `execute-deletion.ts`, `deletion-plan.ts`
- `apps/web/lib/supabase/public-paths.ts`

## Escondido para el release de octubre (SCRUM-490)

Banderas en `apps/web/lib/release/escondido.ts` (detalle en `docs/FUNCIONAL.md` § Escondido para el release):
el link "¿Olvidaste tu contraseña?" de los dos logins, la pestaña Notificaciones de Ajustes (`?tab=notificaciones`
cae en General), ManyChat en el catálogo de Integraciones (`listed` sale de la bandera), `/demo`, `/design-system`
y `/redesign-preview` (un `layout.tsx` en cada una responde `notFound()`), `/lanzamientos` (redirige al Panel) y el
"Recorrido guiado (demo)" del ⌘K y de la página 404. El ⌘K (`buildPlatformNavigation`) filtra los hijos `hidden`.

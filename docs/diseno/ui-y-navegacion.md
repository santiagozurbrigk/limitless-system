# UI y navegación

> Verificado contra el código el 2026-09-23 (commit 038caca). Backlog del área: `PENDIENTES.md` § Plataforma (UI).
> Tokens, tipografía y componentes de `@ai-coo/ui` en detalle: [`design-system.md`](./design-system.md).

## Qué es

Cómo está armada la interfaz de `apps/web`: el shell de la plataforma, la navegación (notch nav), de
dónde salen los ítems y sus permisos, las rutas canónicas, el paquete `@ai-coo/ui` y los patrones que
se repiten (título de página, vacío, carga, toasts, filtros, íconos). Para un dev nuevo: **no se crea
navegación nueva; se agrega un módulo en un config y el resto se deriva**.

## Capas

```
app/layout.tsx              fuentes (Inter, JetBrains Mono), script de tema, metadata de marca
└─ app/(platform)/layout.tsx  [server] permisos, holding, onboarding → providers → gate de módulo
   └─ layouts/platform-layout.tsx  [client] chromeless (/onboarding) | full-bleed | PageTransition
      └─ components/layout/platform-shell.tsx
         ├─ PlatformNotchNav        barra superior de tres islas
         ├─ HoldingViewingBanner    "viendo como founder" en un negocio del holding
         ├─ título + "volver"       de lib/navigation/page-meta.ts (fijo, fuera del scroll)
         └─ contenido               .main-container-scroll
app/(super-admin)/layout.tsx → layouts/super-admin-layout.tsx  Topbar de @ai-coo/ui + sidebar propio
app/(landing)/layout.tsx     Geist + fondo #0A0A0A + Meta Pixel   (/prueba, /privacidad)
```

Providers de plataforma (`providers/index.tsx`, `AppProviders`): Toast → CommandPalette → Workspace →
PlatformData → FinanceData → MarketingData → PageContext → FloatingChat. Los tres `*DataProvider` cargan
datos del lado del cliente para toda la plataforma (clientes, conversaciones, finanzas).

## Navegación

### Una sola fuente: `lib/navigation/sidebar-modules.ts`

El nombre es histórico (el sidebar de plataforma se eliminó el 2026-08-30). Define:

| Export | Qué es |
|---|---|
| `directModules` | Links de primer nivel con `href`, `icon` (nombre Lucide) y `permissionId` |
| `modulesWithChildren` | Grupos con dropdown: Marketing, Ventas, Finanzas, Operaciones, Agente, Configuración. Hijos con `hidden` no se muestran |
| `buildPlatformRootItems(enabledAddOns)` | Orden final: Panel, Clientes, Equipo · Marketing, Ventas, Finanzas, [Operaciones si add-on], [Producto si add-on], Embudos · Tablero, SOPs, Configuración |
| `getParentFromPath` | Qué grupo marcar activo para una ruta |

Para agregar un módulo: ruta en `routes/paths.ts` → entrada en `sidebar-modules.ts` → módulo de permiso
en `lib/navigation/module-for-path.ts` (el test lo exige) → título en `lib/navigation/page-meta.ts`.

### Notch nav (`components/navigation/notch-nav/`)

| Archivo | Rol |
|---|---|
| `notch-nav.tsx` | Presentacional: tres islas colgadas del borde (logo · ítems · acciones), filetes SVG, pill activo con `layoutId` de Framer Motion. No sabe de permisos |
| `platform-notch-nav.tsx` | Adaptador: arma ítems desde `buildPlatformSidebarNav`, filtra con `canSeeNavItem`, badge de cantidad de clientes, "Mi Holding" para cuentas holding |
| `notch-profile-menu.tsx` | Menú de perfil: Ajustes, cerrar sesión |

Isla derecha: `NotchSetupIndicator` (pasos de onboarding abiertos), `HoldingBusinessSwitcher`, acceso a
Integraciones (si hay permiso), `ReportsPanel` (reportes ejecutivos), `ThemeToggle`, perfil. Ajustes **no**
está en la barra. Holding sin negocio activo: la barra va sin ítems.

Mobile: `components/layout/mobile-nav.tsx` (drawer) reutiliza `components/navigation/sidebar-*`, que
también usa el sidebar de super admin. Esos archivos **no son restos**.

Paleta de comandos: `components/navigation/command-palette.tsx`, ⌘K / Ctrl+K
(`providers/command-palette-provider.tsx`). En una organización `full` lista `platformNavigation` de
`routes/navigation.ts` y las acciones rápidas, **sin filtrar por permisos ni add-ons**
(`[NAV-PALETA-PERMISOS]`). En una organización `webinar` o `limitless` lista sólo las entradas listas
de su menú, filtradas por permiso con `canSeeNavItem` (`itemsDeLaPaleta`); una entrada que es un
grupo (Ventas) lista sus hijos.

### Rutas

- `apps/web/routes/paths.ts` es la única fuente de paths (`paths.platform.*`, `paths.auth.*`,
  `paths.superAdmin.*`, `paths.founder.root`). No hay prefijo: `PLATFORM = ""`.
- Redirects de secciones y rutas legadas: `lib/navigation/redirects.ts` (los carga `next.config.ts`;
  temporales, no 308). `/` → `/login`.
- Full-bleed (sin título ni padding): `/agent`, `/sales/inbox`, `/product` (`lib/navigation/full-bleed.ts`).
- Chromeless (sin barra): `/onboarding` (`lib/navigation/chromeless.ts`).

### Menú por experiencia (Limitless Webinars y Limitless de gestión)

Cada organización tiene una experiencia (`organizations.experience`, SCRUM-523): `full` (Limitless
completo), `webinar` (Limitless Webinars) o `limitless` (Limitless de gestión). La lee `getOrganizationExperience()` para la organización
activa (la del negocio elegido, en un holding), una vez por request; si falla, es `full`. El layout de
`(platform)` la pasa al cliente con `ExperienciaProvider` (`providers/experiencia-provider.tsx`).

- **Config:** `lib/navigation/menu-por-experiencia.ts`. `MENU_POR_EXPERIENCIA` tiene un menú por
  experiencia salvo `full` (que ve el menú de siempre), con las entradas del PO en orden:
  - `webinar` (19-oct y 28-oct-2026): Inicio (`/inicio`, módulo `dashboard`, SCRUM-534), Lanzamientos
    (`/lanzamientos`, `funnels`, SCRUM-529), Leads (`/leads`, `sales`, SCRUM-537) y Equipo (`/team`,
    `team`). Llamadas salió del menú el 28-oct. Hoy sólo Equipo está lista.
  - `limitless` (28-oct-2026): Clientes (`/clients`, `clients`), Tablero de trabajo (`/workboard`,
    `workboard`), Ventas (el grupo `ventas` del menú completo, con sus hijos, `sales`; lleva a
    `/sales/inbox`) y Administración (`/administracion`, SCRUM-551; el módulo `finance` es provisorio
    hasta que esa tarea lo decida). Hoy están listas las tres primeras; Administración queda definida y
    no se muestra. Clientes, Tablero y Ventas tienen el mismo nombre, ícono y módulo que en el menú completo
    (lo exige un test).

  Cada entrada tiene `lista`. Una entrada que no está lista no se muestra (sin "Próximamente") y su
  ruta no se abre. Lo que ve quien tipea la URL depende de si la pantalla existe: mientras no exista
  (hoy `/inicio`, `/leads` y `/administracion`, sin carpeta en `app/(platform)`), la URL da el 404 de la
  app, sin la barra, porque no hay layout de segmento que redirija; cuando su tarea cree la carpeta,
  su `layout.tsx` aplica el bloqueo y la ruta redirige a la pantalla de inicio mientras la entrada no
  esté lista (como hoy `/lanzamientos`). Lo fija el test "entradas no listas" de
  `rutas-por-experiencia.test.ts`. Lo que abre una entrada es el segmento de primer nivel de su
  `href` (`/sales` para Ventas), con todo lo que cuelga de él.
  `RUTAS_EXTRA_POR_EXPERIENCIA` (fix-pack 1 de A1, decisión de Fernando del 1-nov-2026): pantallas
  fuera del menú que una experiencia abre igual porque una pantalla de su menú enlaza a ellas. No se
  muestran en la barra, en el menú del celular ni en la paleta; se llega por el link o tipeando la URL,
  y el permiso del módulo de la ruta sigue valiendo. `limitless` abre `/integrations` (la Bandeja de
  Ventas lleva a «Conectar integración», «Conectar Zernio» y «Gestionar Zernio»), `/sops` (el SOP
  vinculado a una tarea del Tablero, `/sops/[id]`) y `/business-context` (los documentos de una tarea,
  `/business-context/[id]`). La biblioteca de SOP (`/operations/sops`) no, y `/sops` y `/sops/create`
  tampoco en la práctica: `next.config.ts` los manda a esa biblioteca. Por eso el panel de un
  documento del contexto (`document-viewer-sidebar.tsx`) muestra «Generar SOP», que lleva a esa
  biblioteca, sólo si `rutaPermitidaParaLaExperiencia` abre su destino: en `limitless` no está
  (fix-pack 2 de A1, decisión de Fernando). Es el único link a un segmento cerrado en las pantallas de
  las rutas extra (revisado sobre los componentes que importan sus páginas). `webinar` no tiene ninguna. `RUTAS_LIBRES` (para toda experiencia):
  `/onboarding` (adonde el middleware manda al founder sin onboarding; bloquearla armaría un bucle),
  `/holding` y `/settings` (ajustes de la cuenta, desde el menú de perfil).
- **Reglas:** `lib/navigation/rutas-por-experiencia.ts`, las mismas para toda experiencia con menú
  propio. `full` abre todo y su pantalla de inicio es `/dashboard`. `webinar` y `limitless` abren los
  segmentos de sus entradas listas (con sus subrutas), los de sus rutas extra y las libres. La pantalla de inicio depende de
  quien mira: de las entradas listas que ve por sus permisos (la misma regla que la barra,
  `entradasVisibles`), la de id `inicio` si está y si no, la primera (hoy `/team` en `webinar` y
  `/clients` en `limitless`; `/sales/inbox` para un miembro de `limitless` con sólo Ventas); si no ve
  ninguna, `/settings`. Un miembro sin Equipo cae en Ajustes, no en «No tenés acceso». Ajustes tiene
  su propio módulo (`settings`): un rol sin ninguna entrada y sin Ajustes ve «No tenés acceso» ahí,
  porque no le queda ninguna pantalla. Los permisos sólo eligen el destino; qué rutas se abren lo
  decide la experiencia.
- **Barra:** `buildPlatformSidebarNav(enabledAddOns, experiencia)` devuelve, para `webinar` y
  `limitless`, `buildSidebarNavDelMenu`: sólo las entradas listas, como links directos con su
  `permissionId` o, si la entrada tiene `grupo`, como ese grupo del menú completo con sus hijos; la
  notch nav y el menú móvil las filtran por permiso como siempre. Sin add-ons ni grupo
  `configuracion`, así que tampoco aparece Integraciones en la isla derecha.
- **Isla derecha y logo:** `ACCESOS_DE_LA_ISLA` (`menu-por-experiencia.ts`) dice qué accesos fijos
  fuera del menú se muestran: para `webinar` y `limitless`, ni el panel de reportes ejecutivos ni el
  indicador de configuración pendiente (el checklist del Panel). El logo (barra y versión celular) y el pie de la
  paleta llevan a la pantalla de inicio de quien mira (`usePantallaDeInicio`, que calcula el layout
  con sus permisos). Lo que queda en la isla es libre: negocio activo del holding, tema y el menú de
  perfil (Ajustes). La plataforma no dibuja migas: `getBreadcrumbs` sólo lo usa el super admin, y la
  vuelta de `/team/*` lleva a `/team`.
- **Bloqueo de rutas:** cada carpeta de `app/(platform)` tiene un `layout.tsx` que llama a
  `exigirRutaDeLaExperiencia("/<segmento>")` (`lib/organization/ruta-de-la-experiencia.ts`) y
  redirige a la pantalla de inicio (no muestra `SinAcceso`). Va ahí y no en el layout de `(platform)`
  porque ese no se vuelve a ejecutar en una navegación del cliente; el del segmento se ejecuta en el
  servidor cada vez que se entra al segmento (URL tipeada, link, `router.push`, ruta anidada). No va en
  el middleware porque ahí no se puede usar `getOrganizationExperience()` y habría que copiar la
  resolución del negocio activo del holding. `/lanzamientos` primero aplica la experiencia y después
  `ESCONDIDO.lanzamientos`, que sigue mandando al Panel a todas las organizaciones `full`.
- **Fuera de la experiencia, el layout de `(platform)` no decide:** con `x-pathname` mira si la ruta
  es de la experiencia y, si no lo es, no dibuja `SinAcceso` (que le taparía `children` al layout del
  segmento) ni redirige: deja pasar y redirige el segmento. Así un miembro sin el módulo Marketing que
  tipea `/marketing` va a su inicio y no ve «No tenés acceso». El layout de `(platform)` no hace
  `redirect`: lo hacía, y en una organización webinar un `router.push` a una ruta bloqueada más
  `router.refresh()` (aceptar una invitación, entrar a un negocio del holding) dejaba la pantalla sin
  barra y un bucle de pedidos `?_rsc=` (QA final; `scripts/flujos-reales.mjs` de la evidencia lo mide). Queda un caso: desde una pantalla que ya muestra `SinAcceso`,
  una navegación del cliente cambia la URL pero sigue mostrando `SinAcceso` (no muestra la pantalla
  bloqueada ni redirige); es el límite de `[PERMISOS-LAYOUT-NAV-SUAVE]`, anotado ahí.
- **Destino después del login:** `signInAction` y `/auth/callback` (sin `next` válido) usan la misma
  resolución, `destinoPorDefectoDespuesDelLogin` (`lib/auth/destino-despues-del-login.ts`): una
  cuenta holding va a `/holding`, sea cual sea la experiencia, y el resto a la pantalla de inicio de
  quien entra (`pantallaDeInicioDeLaOrganizacionActiva`, que para `webinar` y `limitless` lee sus
  permisos). Antes del fix-pack 1 de A1 el callback no tenía la rama del holding y un holding
  `webinar` terminaba en Equipo. El `next` de una invitación y `destinoSeguro` se respetan. Las pantallas del cliente que mandan a `/dashboard`
  (recuperar contraseña, cambio obligatorio, aceptar invitación, onboarding) y el middleware que saca
  de `/login` a quien ya tiene sesión llegan a la pantalla de inicio por el layout de `/dashboard`,
  con un salto más. Lo mismo `enterBusinessAction` del holding: redirige a `/dashboard` y la request
  siguiente, ya con la cookie del negocio nuevo, decide (la misma request todavía lleva el header
  `x-active-org-id` del negocio anterior).
- **Ajustes (`/settings`) es libre y completo (decisión abierta):** para una organización `webinar`
  (y `limitless`) muestra todas sus pestañas, las mismas que en `full` (General, Perfil, IA, Seguridad, Pagos para el
  founder, Mi Calendly para un closer), cada una con sus permisos de siempre. No es un problema de
  datos (son de su organización), pero no está en las decisiones del PO. Queda para revisar con
  SCRUM-535 y SCRUM-537, que van a usar pagos y Calendly: si Webinars necesita esas pestañas, cuáles
  se esconden y si conviene separar la parte personal (contraseña, tema, cerrar sesión) del resto.
- Para encender una entrada: crear la pantalla y poner `lista: true` en `MENU_POR_EXPERIENCIA`. Si
  su segmento todavía la esconde con una bandera de `ESCONDIDO` (hoy `/lanzamientos`), hay que
  apagarla o cambiar ese layout: si no, se arma un bucle de redirecciones, y el test de invariante de
  `rutas-por-experiencia.test.ts` falla con ese mensaje. Administración (SCRUM-551) necesita además su
  carpeta en `app/(platform)` con el layout del bloqueo (lo exige `rutas-por-experiencia-en-disco`) y
  confirmar su módulo de permisos en la entrada y en `module-for-path`.
- Para sumar una experiencia: el valor en el CHECK de la migración y en `EXPERIENCIAS`
  (`lib/organization/experience.ts`), su menú en `MENU_POR_EXPERIENCIA`, su lista (aunque sea vacía)
  en `RUTAS_EXTRA_POR_EXPERIENCIA` y su fila en `ACCESOS_DE_LA_ISLA`. Qué falla si falta cada uno: un
  valor que está en el CHECK y no en `EXPERIENCIAS`, o al revés, hace fallar
  `lib/organization/__tests__/experiencias-de-la-base.test.ts` (lee las migraciones; el test de RLS 97
  compara además la definición del CHECK en la base); el menú, las rutas extra y la isla son `Record`
  por experiencia, así que si faltan no compila. Ninguno de esos controles ve un CHECK cambiado a
  mano en una base ni una base local con una versión vieja de la migración. La barra, la paleta, el bloqueo
  y el destino del login no se tocan.

### Título y "volver"

`getPageMeta(pathname)` (`lib/navigation/page-meta.ts`) da `title`, `subtitle` y `back`. El shell los
dibuja; **las páginas no ponen su propio h1 de título**. `PlatformDocumentTitle` sincroniza el `<title>`.
El test `lib/navigation/__tests__/page-meta.test.ts` recorre las rutas en disco y exige que las pantallas
hondas tengan "volver" y que no apunte a sí mismas.

## `@ai-coo/ui` (`packages/ui`)

Paquete interno, se consume desde el código fuente (`transpilePackages` en `next.config.ts`, sin build).
Exporta `./src/index.ts` y `./styles/tokens.css` (el archivo está en `src/styles/tokens.css`).

| Grupo | Contenido |
|---|---|
| Primitivas (`src/primitives`) | Button, Badge, Card, Dialog, DropdownMenu, Input, Label, Separator, Skeleton, Table, Tabs, Textarea, Tooltip, Typography (Heading, Text, Caption, Mono) — Radix + `cva` |
| Componentes (`src/components`) | MetricCard, MetricStat, MetricBand, MetricLineChart, AnimatedNumber/MetricAnimatedValue, Sparkline, DecorativeSparkline, BarChart, AiCard, GlassPanel, NotchedCard, SteppedAlert, SectionHeader, FormField, DataTable, Topbar, SidebarShell, Spotlight, StaggerFade |
| Lógica | `lib/parse-metric-value.ts`, `lib/metric-trend.ts`, `hooks/use-prefers-reduced-motion.ts`, `cn()` |

Sin tests (`[UI-SIN-TESTS]`). `SidebarShell` sólo lo usa el showcase de `/design-system`.

Además de `@ai-coo/ui`: `apps/web/components/ui/` tiene dos piezas locales (`ai-prompt-box`,
`bg-pattern`), y `components.json` declara registries shadcn de `@bklit` y `@motion-primitives` (de ahí
vienen los gráficos de `components/charts/`).

### Gráficos

`components/charts/` (78 archivos: 51 en la raíz más `platform/` y `tooltip/`): wrappers Visx estilo Bklit (área, barras, embudo, gauge, grilla,
tooltip) y `components/charts/platform/` con los paneles que usan las pantallas (`ChartShell`,
`FunnelChartPanel`, `CategoryBarChart`, etc.). Colores por token CSS (`--chart-*`, ver design-system) o
`brandColors` de `lib/brand.ts` cuando el prop no acepta variables. Galería en `/design-system/charts`.

## Patrones de pantalla

| Necesidad | Usar | Dónde |
|---|---|---|
| Estado vacío | `EmptyState` (`variant: "full" \| "inline"`) | `components/shared/empty-state.tsx` |
| Cargando | `PageLoading` / `Skeleton` | `components/shared/page-loading.tsx`, `@ai-coo/ui` |
| Toast | `useToast()` | `providers/toast-provider.tsx` (render en `components/shared/toast-viewport.tsx`) |
| Filtros en pastilla | `FilterPills` | `components/marketing/filter-pills.tsx` (vive en marketing, lo usan ~16 archivos) |
| Pestañas segmentadas | `segmentedNavContainerClass`, `segmentedNavItemClass` | `components/shared/segmented-nav-styles.ts` |
| Pestañas por hash dentro de una página | `ModuleSubnav`, `HashTabLink`, `pushHashTab` | `components/shared/module-subnav.tsx`, `hash-tab-link.tsx` (Team, SOPs, Closing) |
| Métricas | `MetricCard` / `MetricStat` / `MetricBand` | `@ai-coo/ui` |
| Insight de IA | `AiCard variant="insight" \| "recommendation"` | `@ai-coo/ui` |
| Íconos de navegación | `NavIcon name="…"` (mapa string → Lucide) | `components/navigation/nav-icons.tsx` |
| Íconos de dominio marketing | `ContentTypeIcon`, `MetricIcon`, `DriveMimeIcon`… | `components/marketing/marketing-icons.tsx` |
| Sin acceso a un módulo | `SinAcceso` | `components/platform/sin-acceso.tsx` (lo pone el layout) |

Reglas de `components/shared/README.md` (las valida ESLint): `index.ts` sólo exporta componentes de
servidor, `client.ts` los `"use client"`; nunca importar un barrel con clientes desde un `page.tsx`/
`layout.tsx` de servidor.

## Reglas de negocio y decisiones no obvias

- **No hay subnav por módulo.** Los hijos de un módulo son el dropdown de la notch nav.
  `ModuleSubnav` es para pestañas internas de una misma página, no navegación entre rutas.
- **Ningún wrapper de página puede tener `transform`** (ni la matriz identidad que deja una animación):
  se vuelve el bloque contenedor de los `position: fixed` de adentro. Por eso `PageTransition` usa
  `animate-page-fade-in` (sólo opacidad) y no `fade-in` (`packages/config/tailwind/preset.ts`).
- **Un ítem de nav sin `permissionId` es sólo para el founder** (`canSeeNavItem`).
- **Tema oscuro por defecto**: el script de `app/layout.tsx` pone `.dark` salvo `localStorage.theme === "light"`.
- **Server-first**: las páginas son Server Components; los `*DataProvider` son la excepción histórica.

## Limitaciones conocidas y deuda

- `[NAV-1]` La notch nav nunca se validó con sesión real (pill activo, dropdowns, switcher, drawer mobile).
- `[NAV-2]` Renombrar `sidebar-modules.ts` a `platform-modules.ts` (cosmético: 3 imports y algunas menciones en comentarios).
- `[NAV-3]` La etiqueta "Fase 1 · Beta" se perdió con el sidebar; decidir si vuelve.
- `[NAV-PALETA-PERMISOS]` (nuevo) En una organización `full`, la paleta ⌘K ofrece todos los módulos aunque
  el rol o el add-on no los incluya. Junto con `[PERMISOS-LAYOUT-NAV-SUAVE]` (ver arquitectura) puede abrir
  un módulo bloqueado. En una organización `webinar` ya filtra por permiso (SCRUM-524).
- `[NAV-ISLAS-1280]` Con 10 módulos las islas se superponen a 1280 px; medir antes de activar Operaciones
  y Producto juntos.
- `[UI-EMOJIS]` (nuevo) 20 archivos de `components/` tienen emojis o símbolos (✓, ✗, ⚠) en JSX o strings de UI
  (10 si se cuentan sólo emojis; los ⭐ de los comentarios no cuentan), contra la regla
  (p. ej. `components/sales/zernio-inbox-panel.tsx` "🔥 Caliente", `components/sales/team-call-ranking.tsx`
  medallas, `components/settings/theme-selector.tsx`, `components/lanzamientos/launch-post-mortem-panel.tsx`).
- `[UI-CODIGO-MUERTO]` (nuevo) `components/marketing/marketing-subnav.tsx` y `SidebarShell` no se usan en la app.
- `[DIALOG-DOBLE-PADDING]` `DialogContent` trae `p-6` y header/footer `px-6`: 48 px al borde.
- `[LAYOUT-CAJONES]` Cuatro cajones laterales sin revisar tras el arreglo de `transform`.
- `[TECH-5]` Primitivas que extienden `HTMLAttributes` sin `children` explícito (hoy CI typecheckea limpio).
- `[CHART-A]` / `[CHART-B]` Vista de tabla accesible para gráficos; embudo con rangos muy dispares.
- `[DEMO-LAYOUT-500]` Ninguna pantalla de plataforma se puede renderizar en local sin Supabase.

## Tests

| Archivo | Cubre |
|---|---|
| `apps/web/lib/navigation/__tests__/module-for-path.test.ts` | Toda ruta de `(platform)` tiene módulo o es libre |
| `apps/web/lib/navigation/__tests__/page-meta.test.ts` | Título y "volver" de cada pantalla |
| `apps/web/lib/onboarding/__tests__/tours.test.ts` | Anclas `data-tour` existen en el JSX |
| `apps/web/lib/navigation/__tests__/rutas-por-experiencia.test.ts` | Menús de `webinar` y `limitless`: orden, entradas listas, módulo de cada entrada igual al de su ruta, segmentos sin repetir, pantalla existente para cada entrada lista, entradas de `limitless` iguales a las del menú completo, pantalla de inicio, reglas de rutas, rutas extra de `limitless` (Integraciones, SOP, contexto del negocio) abiertas y cerradas para `webinar`, qué ve hoy quien tipea una entrada no lista (404 sin pantalla, redirección con pantalla), destino sin bucle en las tres experiencias, invariante de que una entrada lista no siga escondida por `ESCONDIDO`, y que la barra y la paleta usen `hijosVisiblesDelGrupo` y la barra de un menú propio `coincide` |
| `apps/web/components/layout/__tests__/menu-celular-por-experiencia.test.ts` | El `MobileNav` real abierto: `full` con los ítems de siempre, `webinar` y `limitless` sólo con las entradas que el rol ve |
| `apps/web/components/navigation/__tests__/paleta-por-experiencia.test.ts` | La paleta real: link del pie y lista para `full`, `webinar` y `limitless` |
| `apps/web/components/business-context/__tests__/generar-sop-por-experiencia.test.ts` | El panel real de un documento del contexto: «Generar SOP» está para `full` y no para `limitless` (fix-pack 2 de A1) |
| `apps/web/lib/navigation/__tests__/rutas-por-experiencia-en-disco.test.ts` | Toda pantalla de `(platform)` cuelga del layout de su segmento con `exigirRutaDeLaExperiencia` de su propia ruta; las de afuera no pasan por el bloqueo |
| `apps/web/lib/navigation/__tests__/menu-por-experiencia.test.ts` | Barra y paleta para `full` (igual que antes), `webinar` y `limitless` (entradas listas, el grupo Ventas, filtradas por permiso) |
| `apps/web/components/navigation/notch-nav/__tests__/barra-por-experiencia.test.ts` | La barra real: logo, ítems e isla derecha para `full` (igual que antes), `webinar` y `limitless` (sin reportes, sin configuración pendiente, logo a la pantalla de inicio) |
| `apps/web/app/__tests__/bloqueo-por-experiencia.test.ts` | Ejecuta el layout real de cada segmento: webinar redirige a Equipo, limitless a Clientes (o a la primera entrada que ve) salvo sus entradas, sus rutas extra y las libres, full no cambia, cambio de negocio en un holding, organización activa y falla de lectura |

Sin tests: `packages/ui` entero, la notch nav como componente, `buildPlatformRootItems`. Sin Playwright de
navegación (sólo `e2e/holding.spec.ts`).

## Archivos clave

- `apps/web/lib/navigation/sidebar-modules.ts`
- `apps/web/components/navigation/notch-nav/platform-notch-nav.tsx`, `notch-nav.tsx`
- `apps/web/components/layout/platform-shell.tsx`, `apps/web/layouts/platform-layout.tsx`
- `apps/web/routes/paths.ts`, `apps/web/lib/navigation/redirects.ts`
- `apps/web/lib/navigation/page-meta.ts`, `module-for-path.ts`
- `apps/web/providers/index.tsx`, `permissions-provider.tsx`, `toast-provider.tsx`
- `apps/web/components/shared/` (README incluido)
- `packages/ui/src/index.ts`
- `apps/web/components/charts/platform/`

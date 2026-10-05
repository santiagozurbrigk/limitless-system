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
(`providers/command-palette-provider.tsx`). Lista `platformNavigation` de `routes/navigation.ts`,
**sin filtrar por permisos ni add-ons**.

### Rutas

- `apps/web/routes/paths.ts` es la única fuente de paths (`paths.platform.*`, `paths.auth.*`,
  `paths.superAdmin.*`, `paths.founder.root`). No hay prefijo: `PLATFORM = ""`.
- Redirects de secciones y rutas legadas: `lib/navigation/redirects.ts` (los carga `next.config.ts`;
  temporales, no 308). `/` → `/login`.
- Full-bleed (sin título ni padding): `/agent`, `/sales/inbox`, `/product` (`lib/navigation/full-bleed.ts`).
- Chromeless (sin barra): `/onboarding` (`lib/navigation/chromeless.ts`).

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
- `[NAV-PALETA-PERMISOS]` (nuevo) La paleta ⌘K ofrece todos los módulos aunque el rol o el add-on no los
  incluya. Junto con `[PERMISOS-LAYOUT-NAV-SUAVE]` (ver arquitectura) puede abrir un módulo bloqueado.
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

Sin tests: `packages/ui` entero, la notch nav, `buildPlatformRootItems`, la paleta. Sin Playwright de
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

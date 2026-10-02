# FUNNELS_ARCHITECTURE.md — Arquitectura de embudos intercambiables

> **Estado:** análisis aprobado · decisiones cerradas · **implementado en parte** (Fases 0, 1, 3 y 4; ver §10)
> **Revisado contra el código:** 2026-09-23. Las secciones 3.8, 4, 5, 6 y 7 conservan el diseño y el
> inventario del 2026-08-29; donde nombran archivos, funciones o pantallas que hoy no existen o
> quedaron distintos, hay una nota. El estado actual del módulo está en
> [`../areas/embudos.md`](../areas/embudos.md).
> **Fecha:** 2026-08-29
> **Rama:** `Claude-New-Features`
> **Fuente:** `Funnel Metrics Standard v1.0` (Aug 2026) — documento de estándar de medición
> **Alcance:** define cómo Limitless modela, resuelve, evalúa y presenta embudos de venta de cualquier tipo.

Este documento es la referencia de implementación. Antes de tocar código de embudos,
leerlo completo. Si una decisión cambia, actualizar acá **antes** de codear.

---

## 0. Resumen ejecutivo

El documento fuente no es material de lectura: es **un schema con datos semilla**. Afirma
que webinar, VSL book-a-call y DM son tres instancias de un mismo tipo, colapsables a las
mismas siete etapas. Van a venir más documentos, uno por tipo de embudo.

**Consecuencia arquitectónica única e innegociable:** no se construyen N módulos de embudo.
Se construye **un motor genérico + N definiciones declarativas**. Agregar un tipo de embudo
nuevo debe ser agregar un archivo de plantilla en TypeScript — sin migración, sin páginas
nuevas, sin componentes nuevos.

Si al agregar un tipo de embudo hace falta escribir un componente, la arquitectura falló.

---

## 1. Decisiones cerradas

Las siete decisiones que gobiernan el diseño, ya resueltas:

| # | Decisión | Resolución | Implicación |
|---|----------|-----------|-------------|
| 1 | ¿Una instancia por org o varias por oferta? | **Varias por oferta** (fidelidad al doc) | El doc prohíbe comparar una oferta de $27 con una de $5k. `price_point` y `currency` son parte de la identidad de la instancia. |
| 2 | ¿El spine de 7 etapas es inmutable? | **Sí** | Es la tesis del documento. Todo lo específico de cada embudo vive en los *steps*, nunca en el spine. |
| 3 | ¿Cómo se llenan webinar y VSL? | **Sí o sí con integración** | No hay input manual como salida. Bloquea Fase 3 hasta que existan las integraciones. Ver §7. |
| 4 | ¿Módulo nuevo o contexto global? | **Lectura A — módulo de medición** | Marketing/Ventas/Finanzas siguen operativos. Embudos es un lente sobre ellos. El resolver igual lleva `funnelInstanceId` desde el día uno. |
| 5 | Switcher de vistas | **Ruta dinámica + sidebar dinámico + switcher con salud** | Ver §6, análisis completo. |
| 6 | ¿Quién crea un tipo de embudo? | **Catálogo curado por Limitless** (add-on + super-admin), builder para el founder más adelante | Mismo patrón que `enabled_add_ons`. |
| 7 | Atribución, timezone, etiquetado | **Tal cual asume el documento** | Hyros como fuente de atribución, reporte en EST, cada figura etiquetada `[Meta]` / `[Hyros]`. Integración Hyros nueva. |

---

## 2. Lectura estructural del documento fuente

El documento tiene cinco secciones y cada una mapea a una capa distinta del sistema:

| Sección del doc | Qué es en software |
|---|---|
| 01 — Universal spine (7 etapas) | **Enum fijo.** La invariante. |
| 02 — Los tres embudos mapeados | **Plantillas.** Datos, no código. |
| 03 — Universal KPIs | **Fórmulas cross-funnel.** Capa de comparación. |
| 04 — Health bands | **Motor de evaluación.** Umbrales + comparadores. |
| 05 — Instrumentación y cadencia | **Bindings a integraciones + crons.** |

Y una sexta cosa, que no tiene sección propia pero es lo más valioso del documento — el
**algoritmo de diagnóstico**:

> *"you diagnose by walking the spine left to right and finding the first broken transition,
> not by looking at the final close rate"*

Eso no es prosa: es una función. `diagnoseFunnel(instance, period) → primera transición rota`.
Es la respuesta que un cerebro operativo tiene que dar y el diferencial real frente a un
dashboard. **Todo lo demás del sistema existe para hacer posible esa función.**

---

## 3. Modelo de datos

Al normalizar el documento aparecen decisiones que el HTML esconde. Estas son las que importan
y ya están resueltas en el modelo de abajo.

### 3.1 El spine es disperso, no denso

Ninguna de las tres tablas del doc tiene fila de **Spend** (está implícito en Meta Ads). Y el
embudo **VSL no tiene etapa Lead** — va de Click directo a Engaged, porque no hay opt-in: se
va derecho al booking. El DM tiene 6 filas; webinar y VSL, 7.

→ El modelo **debe** permitir etapas del spine sin ningún step. Salteo y ruptura son cosas
distintas y la UI tiene que distinguirlas visualmente. Una etapa salteada es correcta; una
etapa con datos faltantes es un problema de instrumentación; una transición por debajo del
piso es un problema de negocio. **Tres estados, tres tratamientos.**

### 3.2 La relación step → stage es N:1, ordenada

- Webinar: `Engaged` aparece dos veces (show-up rate, stick rate)
- VSL: `Intent` dos veces (booking, calidad de aplicación) y `Sales Conv.` dos veces (show rate, close rate)

→ Los steps son una lista ordenada con FK a una etapa del spine. No es un mapa 1:1.

### 3.3 "Healthy range" no es legible por máquina

La columna del doc mezcla al menos cinco formas:

| Valor en el doc | Forma real |
|---|---|
| `1–3% CTR` | rango porcentual simple |
| `25–45% · $3–15` | **dos métricas en una fila** (tasa + costo) |
| `50–70% of attendees` | porcentual **con denominador explícito** |
| `55–70% play · to CTA` | compuesto, segunda parte sin número |
| `context-set` | **sin benchmark** — se calibra por contexto |

→ Guardado como texto, las health bands no se pueden computar y el diagnóstico no funciona.
Se normaliza a `{ metricKey, unit, min, max }`, con N benchmarks por step y un estado
explícito `sin-benchmark`.

### 3.4 El denominador es parte de la identidad de la métrica

El caso más claro está en el webinar: la etapa `Sales Conv.` tiene benchmark **2–6%** (sobre
asistentes) y la etapa `Cash` tiene **1–3%** (sobre registrantes). Es el mismo evento de venta
medido contra dos bases distintas.

→ Una métrica de tasa **no** es un nombre con un número: es `numerador ÷ denominador`, ambos
referencias explícitas a un step o a una etapa. Si no se modela así, "close rate" significa
cosas distintas en cada embudo y el documento pierde su propósito entero, que es literalmente
*"the same numbers mean the same thing across every client and every offer"*.

### 3.5 Tres niveles de precedencia de benchmark

La sección 04 mezcla umbrales **absolutos** (`LTV:CAC ≥ 3.0`, `Show rate ≥ 60%`) con umbrales
**relativos al benchmark** (`Lead → Intent: −20% of bench`). Y la nota de la sección 02 agrega
un tercer nivel:

> *"Reset each floor against the client's own 30-day baseline once there is one, then treat
> the baseline as the benchmark."*

→ Precedencia de resolución de umbral, de menor a mayor prioridad:

```
1. benchmark de la plantilla     (lo que dice el documento)
2. override por oferta            (lo que configuró el founder)
3. baseline propio a 30 días      (lo que la org realmente hace)  ← gana
```

El nivel 3 ya tiene infraestructura construida: `lib/metrics/baseline-service.ts`.

### 3.6 Punteros a métricas

`North-star`, `Leading indicator` y `Governing rate` son referencias a métricas
("Cost per Sale", "Show-up rate", "Attendee → Sale"). Necesitan **IDs estables**, no strings
de display, para ser evaluables y clickeables.

### 3.7 Reglas de gobernanza que son validaciones, no notas al pie

Tres reglas del documento son restricciones duras del sistema (decisión 7 — tal cual el doc):

1. *"never compare a $27 offer's numbers to a $5k offer's"* → la vista comparativa agrupa o
   advierte por rango de precio. No es opcional.
2. *"report every metric in EST"* → **timezone de reporte** configurable por org. Implementado como
   `funnel_instances.reporting_timezone` (por instancia, no por org, default `America/New_York`):
   se guarda y se muestra, pero los períodos se siguen cortando en UTC (`[EMBUDOS-TIMEZONE]`).
3. *"label each figure with its source — [Meta] / [Hyros]"* → cada valor resuelto carga su
   **procedencia**. No es cosmética: es la diferencia entre un reporte confiable y uno que
   mezcla plataformas silenciosamente.

### 3.8 Tipos núcleo

> **Boceto de diseño.** Los tipos reales de `lib/funnels/types.ts` difieren: `MetricUnit` no tiene
> `"minutes"`; `FunnelStep` suma `metricLabel` y `benchmarkLabel` y su `sourceHint` es un
> `InstrumentationToolId`; `FunnelTemplate` usa `northStar` / `leadingIndicator` / `governingRate`
> de tipo `MetricPointer` (etiqueta + `metricId`) y suma `sourceDocVersion` y `funnelMetrics`;
> `ResolvedMetric.provenance` es `InstrumentationToolId | "derived" | "unknown"`. No existe un
> tipo `FunnelInstance`: la fila es `FunnelInstanceRow` en `lib/funnels/resolve.ts`.

```ts
// lib/funnels/spine.ts — INMUTABLE (decisión 2)
export const SPINE_STAGES = [
  { id: "spend",     order: 1, label: "Spend",       metric: "$ deployed / reach"  },
  { id: "click",     order: 2, label: "Click",       metric: "traffic to funnel"   },
  { id: "lead",      order: 3, label: "Lead",        metric: "opt-in captured"     },
  { id: "engaged",   order: 4, label: "Engaged",     metric: "consumed the pitch"  },
  { id: "intent",    order: 5, label: "Intent",      metric: "booked / applied"    },
  { id: "sales_conv",order: 6, label: "Sales Conv.", metric: "call / offer live"   },
  { id: "cash",      order: 7, label: "Cash",        metric: "collected revenue"   },
] as const;

export type SpineStageId = (typeof SPINE_STAGES)[number]["id"];
```

```ts
// lib/funnels/types.ts
export type MetricUnit = "count" | "percentage" | "currency" | "ratio" | "minutes";

/** Una tasa es SIEMPRE numerador ÷ denominador explícitos (§3.4) */
export type MetricDefinition = {
  id: string;                       // ID estable — referenciable (§3.6)
  label: string;
  unit: MetricUnit;
  numerator?: MetricRef;            // step id o spine stage id
  denominator?: MetricRef;          // step id o spine stage id
  formula?: string;                 // display, para KPIs universales
};

export type Benchmark =
  | { kind: "range";  min: number; max: number; unit: MetricUnit }
  | { kind: "floor";  min: number; unit: MetricUnit }
  | { kind: "context_set" };        // "context-set" del doc (§3.3)

export type FunnelStep = {
  id: string;
  stageId: SpineStageId;            // N:1, ordenado (§3.2)
  order: number;
  label: string;                    // "Showed up (live + replay)"
  metrics: MetricDefinition[];      // N métricas por step (§3.3)
  benchmarks: Record<string, Benchmark>;  // metricId → benchmark
  sourceHint: IntegrationId;        // qué herramienta debería alimentarlo (§05 del doc)
};

export type FunnelTemplate = {
  id: string;                       // "webinar" | "vsl_call" | "dm" | ...
  label: string;
  description: string;
  badge: string;                    // "Registration-led" | "Application-led" | ...
  accentToken: string;              // token del design system, NO hex
  northStarMetricId: string;        // punteros (§3.6)
  leadingIndicatorMetricId: string;
  governingRateMetricId: string;
  steps: FunnelStep[];              // spine disperso: etapas sin steps son válidas (§3.1)
};
```

```ts
// Instancia = plantilla + oferta concreta de una org (decisión 1)
export type FunnelInstance = {
  id: string;
  organizationId: string;
  templateId: string;
  name: string;
  productId: string | null;         // FK al módulo Producto
  currency: string;
  pricePoint: number;               // §3.7 regla 1 — gobierna la comparabilidad
  reportingTimezone: string;        // §3.7 regla 2 — default "America/New_York" (EST)
  isActive: boolean;
};
```

```ts
// Todo valor resuelto carga procedencia (§3.7 regla 3)
export type ResolvedMetric = {
  metricId: string;
  value: number | null;             // null ≠ 0 — ver §9, riesgo principal
  provenance: "meta" | "hyros" | "ghl" | "calendly" | "zernio" | "stripe" | ...;
  resolvedAt: string;
  isEstimated: boolean;
};
```

---

## 4. Qué ya existe en Limitless

> Inventario del 2026-08-29, antes de construir el módulo. El módulo terminó **sin** reutilizar
> `funnel-chart.tsx` ni `custom-metrics.ts` (tiene su propio resolver y su `FunnelSpineStrip`), y
> la tabla de §4.2 quedó superada por el catálogo de fuentes de `lib/funnels/sources.ts`.

### 4.1 Piezas reutilizables

| Pieza actual | Uso en la nueva arquitectura |
|---|---|
| `components/charts/funnel-chart.tsx` + `components/charts/platform/funnel-chart-panel.tsx` | Visualización del spine. Lista, no tocar. |
| `lib/metrics/custom-metrics.ts` (`METRIC_SOURCES`, `resolveSourceValue`) | **Semilla del resolver.** Ya es un catálogo fuente→valor. Extender, no duplicar. |
| `metrics_snapshots` (period_start, metrics JSONB, data_source) | Almacén de series por período. Necesita cambios — ver §9. |
| `lib/metrics/baseline-service.ts` | Precedencia nivel 3 de benchmarks (§3.5). |
| `organizations.enabled_add_ons` + `AddOnId` | Precedente exacto para el add-on `embudos` (decisión 6). |
| `buildPlatformSidebarNav(enabledAddOns)` | Sidebar ya es dinámico. Extender para recibir instancias (§6). |
| `components/holding/holding-business-switcher.tsx` | Referencia visual del switcher (§6). |
| Crons `executive-report-weekly` / `-monthly` | Cubren 2 de las 3 cadencias del doc. Falta el pulso diario. *(Después se sumó `executive-report-daily`, que no lee los embudos.)* |
| `components/dashboard/sales-funnel-strip.tsx` | Embudo DM **hardcodeado**. Debe pasar a ser la instancia DM renderizada por el motor. |

### 4.2 Mapeo del spine a fuentes reales

| Etapa | Fuente en Limitless hoy | Estado |
|---|---|---|
| **1. Spend** | Meta Ads vía Zernio (`getMarketingAdsAction`), `expenses` | ⚠️ Live fetch, **no persiste** — ver §9 *(después se sumó `ad_metrics_daily`, que sí persiste)* |
| **2. Click** | `utm_links.clicks`, `ZernioAdMetrics` | ✅ |
| **3. Lead** | `utm_lead_captures`, `conversations`, Typeform, Google Forms, lead magnets | ✅ |
| **4. Engaged** | `conversations` (respuesta activa), `content_pieces.metrics` | 🟡 Sirve para DM. **No** para webinar ni VSL |
| **5. Intent** | `closing_calls` (scheduled), Calendly, GHL | ✅ |
| **6. Sales Conv.** | `closing_calls.status` (`scheduled/closed/not_closed/no_show`) | ✅ Cobertura muy buena |
| **7. Cash** | `clients.total_amount`, pagos, Mercado Pago / Stripe, `finance` | ✅ |

**El embudo DM se puede construir end-to-end hoy.** Webinar y VSL no — ver §7.

---

## 5. Arquitectura en cinco capas

Principio ordenador: **un tipo de embudo es un dato, no un módulo.**

> **Diagrama de diseño.** Lo construido difiere en la capa 3 y siguientes: el resolver es
> `resolveFunnel(supabase, instance, bindings, period)` en `lib/funnels/resolve.ts` (no extiende
> `resolveSourceValue`); la evaluación vive en `lib/funnels/compute.ts` (`computeFunnel`) y
> `lib/funnels/health-bands.ts` (`resolveBenchmark`, `applyHealthBand`, sin consumidor fuera de los
> tests); **no existen** `lib/funnels/evaluate.ts`, `diagnoseFunnel()`,
> `app/(platform)/funnels/comparar/page.tsx` ni `components/funnels/diagnosis-panel.tsx`; la tira
> del spine es `components/funnels/funnel-spine-strip.tsx`. Las capas 1 y 2 están construidas tal
> cual, aunque `funnel_benchmarks` y `funnel_period_snapshots` no se usan.

```
┌─ 1. DEFINICIÓN (código, versionado, sin DB) ────────────────┐
│  lib/funnels/spine.ts          → las 7 etapas (inmutable)   │
│  lib/funnels/types.ts          → tipos núcleo               │
│  lib/funnels/templates/                                     │
│    ├── webinar.ts        ← doc v1.0                         │
│    ├── vsl-call.ts       ← doc v1.0                         │
│    ├── dm.ts             ← doc v1.0                         │
│    ├── index.ts          → registry + lookup por id         │
│    └── <cada documento nuevo = un archivo nuevo>            │
│  lib/funnels/kpis.ts           → CAC, ROAS, EPL/EPC, AOV,   │
│                                   LTV, Cash collected       │
│  lib/funnels/health-bands.ts   → umbrales + 2 comparadores  │
└─────────────────────────────────────────────────────────────┘
┌─ 2. INSTANCIA (DB, por org) ────────────────────────────────┐
│  funnel_instances        → plantilla + oferta + price_point │
│                             + currency + reporting_timezone │
│  funnel_step_bindings    → step → fuente concreta           │
│  funnel_benchmarks       → overrides de umbral por oferta   │
│  funnel_period_snapshots → serie histórica (§9)             │
└─────────────────────────────────────────────────────────────┘
┌─ 3. RESOLVER (servidor) ────────────────────────────────────┐
│  lib/funnels/resolve.ts                                     │
│    resolveFunnelMetrics(instanceId, period) → ResolvedMetric│
│  Extiende resolveSourceValue con: ventana temporal +        │
│  procedencia + freshness + distinción null vs 0             │
└─────────────────────────────────────────────────────────────┘
┌─ 4. EVALUACIÓN ─────────────────────────────────────────────┐
│  lib/funnels/evaluate.ts                                    │
│    computeTransitions()  → tasas entre etapas OCUPADAS      │
│    resolveBenchmark()    → precedencia de 3 niveles (§3.5)  │
│    applyHealthBands()    → good | watch | below | no-data   │
│    diagnoseFunnel()      → PRIMERA transición rota      ★   │
└─────────────────────────────────────────────────────────────┘
┌─ 5. PRESENTACIÓN ───────────────────────────────────────────┐
│  app/(platform)/funnels/page.tsx            → índice         │
│  app/(platform)/funnels/[funnelId]/page.tsx → detalle GENÉRICO│
│  app/(platform)/funnels/comparar/page.tsx   → KPIs universales│
│  components/funnels/funnel-switcher.tsx                     │
│  components/funnels/spine-strip.tsx                         │
│  components/funnels/diagnosis-panel.tsx                 ★   │
└─────────────────────────────────────────────────────────────┘
```

### Por qué las plantillas van en código y no en DB

Van a venir más documentos. Con plantillas en TypeScript, agregar el embudo #4 es un archivo
nuevo más un `tsc --noEmit` — sin migración, sin seed, sin drift entre orgs, con historial de
git y revisión por PR. La DB guarda solo lo específico de cada org: qué instancias tiene, cómo
están conectadas, qué umbrales sobreescribió, qué series históricas acumuló.

Es exactamente el patrón que el repo ya usa con `METRIC_SOURCES` y `ADD_ON_IDS`.

---

## 6. El switcher de vistas — análisis y resolución

Decisión 5 quedó abierta a análisis. Esta es la resolución, con el razonamiento.

### 6.1 Restricciones

- Varias instancias por org, una por oferta (decisión 1). Realista: 1–6, puede crecer.
- Alcance de módulo, no contexto global (decisión 4).
- Next.js 15 App Router, Server Components por defecto.
- Precedente existente: `holding-business-switcher` — cookie global `limitless_active_org`.

### 6.2 Opciones evaluadas

| Opción | A favor | En contra |
|---|---|---|
| **A.** Cookie global (patrón holding) | Consistente con lo que ya existe | Estado invisible en el servidor: dos pestañas se pisan, URLs no compartibles, y contamina módulos fuera de Embudos |
| **B.** Query param `?funnel=id` | Simple | `revalidatePath` no discrimina por query — se invalida el path entero, cache pobre |
| **C.** Segmento dinámico `/funnels/[funnelId]` | Cache RSC por instancia, `revalidatePath` granular, URL compartible, back/forward nativo | Requiere resolver qué pasa en `/funnels` sin id |
| **D.** Solo estado de cliente | Cero fricción | Rompe deep-linking y Server Components; obliga a client-side fetching |

### 6.3 Resolución

**Segmento dinámico (C) como única fuente de verdad, sin cookie de estado.**

Razones, en orden de peso:

1. **Deep linking.** El valor del módulo es el diagnóstico. Cuando el pulso diario o el agente
   detecten "el embudo VSL tiene rota la transición Intent → Sales Conv.", ese aviso tiene que
   linkear directo al embudo. Sin URL, no hay link.
2. **Granularidad de cache.** Con segmento, cada instancia tiene su propia entrada de cache RSC
   y su propio `revalidatePath("/funnels/<id>")`. Con query param, refrescar un embudo invalida
   todos.
3. **Sin estado invisible.** La cookie del holding es un patrón correcto ahí porque la org
   activa **sí** es contexto global. El embudo activo no lo es (decisión 4). Meterlo en cookie
   reproduce la clase de bug de dos pestañas peleándose, sin ninguna ventaja.
4. **Compartible.** El founder le pasa la URL al closer. Con cookie, el closer ve otro embudo.

**Estructura de rutas:**

```
/funnels                   → índice: grid de instancias con estado de salud de un vistazo
/funnels/[funnelId]        → detalle: spine + steps + benchmarks + diagnóstico
/funnels/comparar          → KPIs universales cross-instancia (sección 03 del doc)
```

`/funnels` es un **índice real, no un redirect**. Un redirect al "último usado" es
impredecible: el mismo click lleva a lugares distintos según el día. El índice siempre lleva
al mismo lugar y además es útil por sí mismo — muestra qué embudo necesita atención sin
abrir ninguno.

**Comodidad para el usuario — las tres piezas que la resuelven:**

> Estado al 2026-09-23: sólo la 3 está construida (el switcher conserva `?period=`). No hay sidebar
> dinámico por instancia —la barra tiene un solo acceso "Embudos"— ni indicador de salud en el
> switcher ni en el índice (`[EMBUDOS-SALUD]`), y `/funnels/comparar` no existe
> (`[EMBUDOS-COMPARAR]`).

1. **Sidebar dinámico.** "Embudos" como parent con hijos = `Todos` + una entrada por instancia
   activa (hasta 5; con más, solo `Todos` + `Comparar`). Acceso de un click a cualquier embudo,
   sin pasar por el índice. `buildPlatformSidebarNav` ya construye items dinámicamente — hay
   que extender su firma para recibir también las instancias.
2. **Switcher en el header del detalle.** Visualmente igual al `holding-business-switcher`,
   pero **con indicador de salud por instancia** (punto good/watch/below). Cambiar de embudo no
   requiere volver al índice, y el usuario ve cuál está en problemas *antes* de entrar. Ese
   indicador es lo que convierte el switcher de navegación en información.
3. **Período persistente entre embudos.** El selector de período va como query param
   (`?period=30d`) y **se preserva al cambiar de instancia**. Comparar la misma ventana entre
   embudos es exactamente el trabajo del usuario; obligarlo a re-seleccionar el período en cada
   switch sería la fricción más molesta del módulo.

**Lo que explícitamente no se hace:** cookie de "último embudo usado". No aporta —el sidebar ya
da acceso de un click— y reintroduce estado invisible.

---

## 7. Integraciones requeridas (decisión 3 y 7)

> **Mapa completo:** [`FUNNELS_SOURCE_MAP.md`](./FUNNELS_SOURCE_MAP.md) enumera las
> 34 medidas atómicas del documento, su estado en Limitless y el orden de construcción.
> Esta sección es el resumen; el mapa es la fuente de verdad.

Las decisiones 3 ("sí o sí con integración") y 7 ("tal cual asume el doc") convierten un
conjunto de integraciones en **prerrequisito bloqueante**, no en mejora futura. Hay que ser
explícito sobre esto porque cambia el camino crítico.

> La columna "Estado en Limitless" es la del 2026-08-29. Hoy Hyros, WebinarJam/EverWebinar
> (Zoom no), VTurb (el proveedor de VSL elegido) y Whop/Commas tienen integración construida, sin
> verificar con cuentas reales; Stripe y Mercado Pago **no** alimentan los embudos. Ver el mapa.

| Integración | Alimenta | Estado en Limitless | Bloquea |
|---|---|---|---|
| **Hyros** | Atribución real, ROAS by-source, EPL, journeys | ❌ No existe | Etiquetado `[Hyros]`, KPIs universales, sección 03 y 05 del doc |
| **WebinarJam / Zoom** | Show-up rate, stick rate, CTA clicks | ❌ No existe | **Embudo Webinar entero** (etapa Engaged) |
| **Hosting de VSL con analytics** | Play rate, avg watch % | ❌ No existe | **Embudo VSL** (etapa Engaged) |
| **Whop / Fanbasis** | AOV, cash collected, refunds | 🟡 Equivalente: Stripe + Mercado Pago *(corregido: hoy Whop y Fanbasis están integrados y Stripe y Mercado Pago no alimentan los embudos, ver la nota de arriba)* | Nada — cubierto por los equivalentes |
| Scoring de calificación | Qualified rate (aplicaciones) | 🟡 Derivable de Typeform/Google Forms + IA | Etapa Intent del VSL |

**Consecuencia sobre las fases:** las Fases 0–5 quedan como fueron aprobadas, pero el **track
de integraciones corre en paralelo y debe aterrizar antes de la Fase 3**, que es donde se
instancian el segundo y tercer embudo. La Fase 1 usa el embudo **DM**, que es el único
construible end-to-end con lo que hay hoy.

**Decisión abierta (cerrada después: VTurb, ver `FUNNELS_SOURCE_MAP.md` §6):** qué proveedor de hosting de video se soporta para el VSL (Wistia, Vimeo,
YouTube, player propio). Cada uno tiene un modelo de analytics distinto. Hay que resolverlo
antes de escribir el binding de la etapa Engaged del VSL.

---

## 8. Impacto en la estructura de módulos

Lectura A (decisión 4): **Embudos es una capa de medición, no un contenedor.**

Marketing, Ventas, Closing y Finanzas siguen siendo módulos **operativos** — donde se trabaja.
Embudos es un **lente de lectura** sobre esos mismos datos. No duplica tablas, no crea un silo.

**Lo que no hay que hacer:** mover Marketing o Ventas adentro de Embudos. Son ejes ortogonales.
Un embudo Webinar toca Marketing (spend, click), Ventas (intent) y Finanzas (cash) al mismo
tiempo. El embudo **cruza** los módulos; no los contiene.

**Preparación para el futuro:** aunque hoy es alcance de módulo, el resolver lleva
`funnelInstanceId` desde el día uno. Si más adelante se decide que el embudo activo filtre el
Dashboard y los demás módulos (la "Lectura B" descartada por ahora), es una extensión y no una
reescritura. El costo de llevar el parámetro ahora es cero; retrofitearlo después es caro.

**Solapamientos a manejar:**

- `sales-funnel-strip.tsx` es un embudo DM hardcodeado → pasa a ser la instancia DM renderizada
  por el motor. Es la validación natural de la Fase 1.
- `/sales/metrics` y `/marketing` (overview) van a tener métricas duplicadas → **coexistencia en
  Fase 1**. La migración se decide con datos reales de uso, no por anticipado.
- Cadencia del doc: `executive-report-weekly` y `-monthly` ya existen. Falta el **pulso diario**
  (§05 del doc: spend, leads, CPL, bookings, roturas obvias). *(Después se construyó el cron
  `executive-report-daily`, un reporte ejecutivo de la org que no lee los embudos.)*

**Permisos y activación:**

- Nuevo `AddOnId`: `embudos` — activable por org desde super-admin (decisión 6).
- Nuevas entradas en `PermissionModuleId` / `PERMISSION_MODULES`: `funnels` y probablemente
  `funnels_config` (quién puede editar bindings y umbrales, que es distinto de quién puede leer).

> Cómo quedó: el `AddOnId` `embudos` existe pero **no** decide nada —Embudos aparece siempre en la
> navegación— y el único permiso es `funnels` (cubre `/funnels` y `/lanzamientos`). `funnels_config`
> no existe, y las server actions no chequean permiso (`[EMBUDOS-PERMISOS-ACCIONES]`).

---

## 9. Riesgos y deuda conocida

Ordenados por probabilidad de causar daño real.

### 9.1 `null` vs `0` — el riesgo principal del diseño

Si un embudo se llena con datos parciales, el diagnóstico va a señalar como "roturas" lo que en
realidad son **huecos de instrumentación**. Un founder que ve "tu embudo está roto en Engaged"
cuando lo que pasa es que WebinarJam no está conectado pierde confianza en el módulo entero, y
no la recupera.

**Mitigación obligatoria:** `ResolvedMetric.value` es `number | null`. El resolver **nunca**
devuelve `0` por ausencia de datos. `diagnoseFunnel()` distingue tres estados y la UI los
muestra distinto:

| Estado | Significado | Tratamiento |
|---|---|---|
| Etapa salteada | El embudo no tiene esa etapa por diseño (VSL sin Lead) | Neutro, sin alerta |
| Sin datos | La fuente no está conectada o no reportó | Alerta de **instrumentación**, no de negocio |
| Bajo el piso | Hay datos y están mal | Alerta de **negocio** → diagnóstico |

Esta distinción es lo primero que hay que escribir en la Fase 0 y lo primero que hay que testear.

### 9.2 `metrics_snapshots` no sirve tal cual

- `CHECK (category IN ('sales','finance'))` no contempla embudos.
- `UNIQUE (organization_id, category, period_start)` **colisiona** con varias instancias de
  embudo en el mismo período (decisión 1: varias por oferta).

→ Se necesita tabla propia `funnel_period_snapshots` con `funnel_instance_id` en la clave
única. No forzar `metrics_snapshots`.

### 9.3 Sin snapshot, no hay historia de Spend

Por convención del repo, los ads de Zernio son *live fetch, no se persisten*. El Spend histórico
**no es reconstruible**. Sin un job periódico por instancia, la serie temporal de cualquier
embudo arranca el día que se activa el feature.

→ Excepción acotada a la convención: se persiste el **agregado por período**, no la data cruda
de ads. Va en Fase 5, pero la tabla tiene que existir desde la Fase 1 para no perder datos
durante el desarrollo.

### 9.4 `custom_metrics` no tiene noción de período

`resolveSourceValue` hace counts sobre toda la historia de la org, sin ventana temporal. Los
embudos siempre se miden en un período. → Extender la firma con `period`, no duplicar el módulo.

### 9.5 No existe timezone de reporte por org

El doc lo declara no-negociable (`EST`, y advierte que Hyros default es Mountain Time). Limitless no
tenía el concepto. → Columna en `funnel_instances`, default `America/New_York`. *(Existe desde la
Fase 1, pero no se usa para calcular: los períodos se cortan en UTC.)*

### 9.6 Deriva entre plantilla y documento

Las plantillas en código son una transcripción del documento fuente. Si el documento se
actualiza a v1.1 y las plantillas no, el sistema miente en silencio.

→ Cada `FunnelTemplate` lleva `sourceDocVersion: "1.0"` (hecho, y los tests de conformidad lo
comparan con el fixture) y la UI lo muestra en el detalle del embudo (**no hecho**: ninguna pantalla
lo muestra). Al llegar un documento nuevo, se compara versión antes de asumir que la plantilla está
vigente.

---

## 10. Plan de fases

| Fase | Alcance | Entregable | Estado |
|---|---|---|---|
| **0** | Normalizar el documento a schema | `spine.ts`, `types.ts`, las 3 plantillas, `kpis.ts`, `health-bands.ts`. Sin UI, sin DB. | ✅ 2026-08-29 |
| **1** | Instancias + resolver + página genérica | `/funnels/[id]` con el embudo **DM** end-to-end | ✅ 2026-08-29 |
| **2** | Evaluación + diagnóstico | Health bands con precedencia de 3 niveles + `diagnoseFunnel()` | ⏸️ **En pausa por decisión del usuario.** Las bandas y la precedencia existen y están testeadas (`health-bands.ts`), sin consumidor; `diagnoseFunnel()` **no existe** y `funnel_benchmarks` no se lee |
| **3** | Switcher + configuración de fuentes | Cambiar de embudo sin perder el período; binding por paso con sus parámetros | ✅ 2026-08-30 |
| **4** | KPIs universales en la UI | Sección 03 completa, con las dos ratios decisivas destacadas y las etiquetas `[Meta]` / `[Hyros]` | ✅ 2026-08-30 |
| **5** | Snapshots periódicos + pulso diario | Historia y las 3 cadencias del doc | Pendiente (el pulso diario de la org existe como `executive-report-daily`, sin datos de embudos) |

**Track de integraciones:** ✅ **las diez unidades cerradas** entre el 2026-08-29 y el
2026-08-30 (nueve construidas; `I-7` se absorbió en `I-8`). Ver `docs/specs/FUNNELS_SOURCE_MAP.md` §5 y el estado de verificación en
`docs/operacion/verificacion-manual.md` (sección Embudos).

> ⚠️ **La Fase 4 destapó un hueco de la Fase 0/1:** `computeFunnel` calculaba los
> KPIs universales pero **no los devolvía** — sólo se usaban de rebote cuando una
> plantilla los referenciaba como north-star. Se agregó `kpis` a `ComputedFunnel`,
> separado de `metrics` para no hacerlos parecer propiedad de un embudo.
>
> La vista comparativa (`/funnels/comparar`, con agrupación por price point) no se
> construyó: con un solo embudo instanciado no tiene qué comparar. Vuelve cuando
> haya varias instancias con datos reales.

---

## 11. Tests de conformidad

El documento fuente y las plantillas tienen que decir lo mismo, siempre. Eso no
se sostiene con revisiones manuales: se sostiene con tests.

`lib/funnels/__tests__/document-fixture.ts` es una transcripción **verbatim** del
documento — no importa nada de `lib/funnels`, sólo copia el HTML. Los tests de
conformidad comparan esa transcripción contra las plantillas fila por fila.

**Cuando llegue una versión nueva del documento:**

1. Actualizar `document-fixture.ts` con el contenido nuevo y subir `DOC_VERSION`.
2. Subir `SOURCE_DOC_VERSION` en `lib/funnels/types.ts`.
3. Correr `pnpm test`. Los tests que fallan señalan exactamente qué plantillas
   quedaron atrás.
4. Actualizar las plantillas hasta que vuelva a estar todo en verde.

Nunca al revés: si un test falla, el error está en la plantilla, no en el
documento. No "arreglar" el fixture para que pase.

Lo que cubren los tests hoy (los principales; en total son 10 archivos `*.test.ts` en
`lib/funnels/__tests__/`, que además cubren `compute`, `period`, `sources` y `source-signal`):

| Archivo | Qué verifica |
|---|---|
| `templates.conformance.test.ts` | Cada fila de cada tabla del documento contra su step; los rangos normalizados; los denominadores explícitos (§3.4); el spine disperso (§3.1) |
| `health-bands.test.ts` | `null` vs `0` (§9.1), dirección de la métrica, precedencia de benchmark (§3.5), la tabla cross-funnel de la sección 04 |
| `validate-template.test.ts` | Que las plantillas reales pasen, y que el validador atrape cada clase de error |
| `kpis.test.ts` | Las 6 tarjetas de la sección 03 y las dos ratios decisivas |
| `instrumentation.test.ts` | Sección 05, y qué herramientas siguen bloqueando (§7) |
| `spine.test.ts` | Las 7 etapas, su orden y sus helpers |

---

## 12. Checklist de implementación

Antes de dar por cerrada cualquier fase:

- [ ] `tsc --noEmit` pasa en `apps/web`
- [ ] `pnpm test` pasa, y la lógica nueva tiene tests
- [ ] Las Server Actions nuevas usan `requireOrganizationId()`
- [ ] `ResolvedMetric.value` distingue `null` de `0` en todos los caminos (§9.1)
- [ ] Toda métrica de tasa tiene numerador y denominador explícitos (§3.4)
- [ ] Todo valor resuelto carga `provenance` (§3.7)
- [ ] Rutas nuevas en `routes/paths.ts` y en el sidebar dinámico
- [ ] Agregar un tipo de embudo no requirió tocar ningún componente
- [ ] Iconos Lucide, sin emojis en JSX
- [ ] Strings de UI en español (es-AR)
- [ ] Si el documento fuente cambió: `document-fixture.ts` actualizado primero
- [ ] `CHANGES.md` y `PENDIENTES.md` actualizados

---

*Documento vivo. Actualizar cuando cambien las decisiones de §1, el modelo de §3, o el estado
de las integraciones de §7.*

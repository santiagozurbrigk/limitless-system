# Producto

> Verificado contra el código el 2026-09-23 (commit 038caca). Backlog del área: `PENDIENTES.md` § Operaciones, Finanzas y Producto.

## Qué es

La **definición de la oferta** del negocio: avatares (cliente ideal), productos/ofertas con precio y posición en
la escalera de valor, la oferta principal (core offer), la propuesta de valor y los frameworks de ventas. No
vende ni mide nada por sí mismo: es contexto. Lo consumen el Agente de negocio (system prompt y RAG), el gate de
onboarding (oferta y avatar principal) y Lanzamientos (picker de productos).

**Qué NO hace:** no es un catálogo de checkout ni se sincroniza con pasarelas; los precios son informativos. Las
"métricas" por oferta son derivaciones aproximadas (ver reglas).

## Pantallas y rutas

Rutas en `paths.platform.product`. **No tiene módulo propio en la grilla de permisos**: `/product*` lo protege
`operations` (`lib/navigation/module-for-path.ts`). En el menú sólo aparece con el add-on `producto`
(`buildPlatformRootItems` en `lib/navigation/sidebar-modules.ts`); por URL responde siempre.

| Ruta | Archivo | Qué muestra |
|---|---|---|
| `/product` | `app/(platform)/product/page.tsx` → `components/product/product-module.tsx` | Tres vistas por `?view=`: grafo (default, `graph-view.tsx` con React Flow, posiciones persistidas), espacial (`spatial-view.tsx`) y detalle (`detail-view.tsx`: avatares, ofertas, escalera, propuesta, frameworks). Botón "Sugerir desde el contexto" (`product-rag-suggest.tsx`) |
| `/product/avatar/[id]` | `app/(platform)/product/avatar/[id]/page.tsx` → `avatar-detail.tsx` | Ficha del avatar con insights |
| `/product/offer/[id]` | `app/(platform)/product/offer/[id]/page.tsx` → `offer-detail-page-content.tsx` | Oferta con stats, editar y borrar |
| `/product/value-ladder` | `app/(platform)/product/value-ladder/page.tsx` → `value-ladder-section.tsx` | Escalera: reordenar, editar escalón, marcar core offer |
| `/product/proposition` | `app/(platform)/product/proposition/page.tsx` → `proposition-section.tsx` | Propuesta de valor en cuatro campos, persistida |

**Datos:** todo real. Sin avatares ni productos, `getProductPageData` devuelve `emptyProductData`
(`hasRealData = false`) y la UI muestra empty states y el badge "Sin datos configurados" (`mock-phase-badge.tsx`,
el nombre es histórico: no hay mocks). Sin Supabase, lo mismo.

## Modelo de datos

| Tabla | Columnas clave | Notas |
|---|---|---|
| `customer_avatars` | `name`, `main_pain`, `secondary_pains`/`desires`/`fears`/`objections` (JSONB `string[]`), `age_range`, `occupation`, `location`, `income_range`, `where_they_hang`, `language_they_use`, `is_primary` | Un solo `is_primary` por org, impuesto por la action |
| `products` | `name`, `description`, `type` (`curso/mentoria/consultoria/comunidad/evento/otro`), `price`, `currency`, `billing_type` (`unico/mensual/anual/personalizado`), `value_ladder_position`, `is_active`, `is_core_offer`, `bonuses` JSONB, `guarantee`, `target_avatar_id` → `customer_avatars` | Un solo `is_core_offer`, impuesto por la action |
| `value_ladder` | `product_id`, `level`, `name`, `description`, `price_range`, `goal` | **Nadie inserta filas** (0 en producción al 2026-09-23). La escalera se arma desde `products` |
| `value_propositions` | PK `organization_id`; `avatar_text`, `result_text`, `pain_removed_text`, `timeframe_text` | Una por org. Sin policy de DELETE |
| `sales_frameworks` | `name`, `description`, `content`, `type` (`script/objeciones/followup/onboarding/otro`), `is_active` | |
| `business_graph_node_positions` | PK `(organization_id, node_key)`, `x`, `y` | Posición de cada nodo del grafo |
| `agent_graph_proposals` | propuestas del agente para crear/editar entidades del grafo | Se aplican con las mismas actions de producto (`app/agent/graph-proposal-actions.ts`) |

RLS: todas filtran por `organization_id = get_my_organization_id()`, ninguna por rol. Migraciones:
`20260616500000_product_module`, `20260721100000_product_value_proposition_and_core_offer`,
`20260726200000_business_graph_node_positions`, `20260726300000_agent_graph_proposals`.

## Cómo fluye el dato

```
getProductPageData (lib/product/queries.ts, server)
  customer_avatars, products(+avatar), value_ladder(+product), value_propositions,
  sales_frameworks(active), business_graph_node_positions
  + loadProductMetricsInput: clients, client_payments, closing_calls   (sin paginar)
     → buildProductData / enrichWithMetrics / buildGraphData / buildSpatialNodes (lib/product/mapper.ts)
```

- **Escrituras** (`app/product/actions.ts`, todas con zod de `lib/validations.ts`, `requireOrganizationId()` y
  cliente de usuario): `saveAvatarAction`, `deleteAvatarAction`, `saveProductAction`, `deleteProductAction`,
  `saveSalesFrameworkAction`, `deleteSalesFrameworkAction`, `saveValuePropositionAction` (upsert),
  `reorderValueLadderAction`, `setCoreOfferAction`, `updateValueLadderStepAction`.
  Todas llaman `revalidateProduct()`. Los `save*` (avatar, producto, framework, propuesta) además llaman
  `invalidateOrgContext()` e `ingestProductContext()` **sin `await`** (reindexa avatares, productos y frameworks
  en el RAG, `lib/rag/ingest.ts`); `deleteSalesFrameworkAction`, `reorderValueLadderAction`, `setCoreOfferAction`
  y `updateValueLadderStepAction` sólo invalidan el contexto, y `deleteAvatarAction` / `deleteProductAction` no
  hacen ninguna de las dos (el agente y el RAG siguen viendo lo borrado hasta el próximo guardado).
  `deleteProductAction` no borra: pone `is_active = false`.
- **Sugerir desde el contexto:** `extractAndSuggestProductContextAction` exige fuentes
  (`hasProductContextSources`, `lib/rag/product-context-sources.ts`: algún chunk en el RAG, SOPs activos,
  llamadas de Fathom o documentos), busca en el RAG y pide a Claude
  (`task: "product_extraction"`, `lib/rag/extract-product-context.ts`) un avatar, productos, frameworks y
  propuesta. El usuario revisa y `applySuggestedProductContextAction` los guarda **reusando las actions de
  arriba** (el avatar entra como principal).
- **Grafo:** cada `onNodeDragStop` llama `saveGraphNodePositionAction` (`app/product/graph-positions.ts`), que
  hace upsert y traga cualquier error.
- **Consumidores externos:**
  - `lib/ai/org-context.ts`: el agente recibe el avatar principal, hasta 5 productos activos y hasta 5 frameworks activos.
  - `app/onboarding/actions.ts`: `saveGateOfferAction` (producto con `isCoreOffer: true`,
    `valueLadderPosition: 1`) y `saveGateAvatarAction` (`isPrimary` + `replacePrimary`).
  - `lib/agent/graph-proposal-tools.ts`: tools del agente que proponen cambios al grafo.
  - `app/lanzamientos/actions.ts`: lista productos para el picker.

## Integraciones externas

Ninguna directa. Usa Anthropic (sugerencia desde contexto) y el RAG (OpenAI embeddings) vía `lib/rag`.

## Reglas de negocio y decisiones no obvias

- ⭐ **La escalera de valor es `products` ordenado por `value_ladder_position`** cuando `value_ladder` está
  vacía (siempre, hoy). `reorderValueLadderAction` y `updateValueLadderStepAction` escriben en `products` y,
  además, intentan actualizar `value_ladder` por las dudas. Si alguien empieza a insertar en `value_ladder`, el
  mapper pasa a leer **sólo** esa tabla (`buildProductData`) y la escalera cambia de fuente sin aviso.
- ⭐ **Avatar principal y core offer únicos** se garantizan en la action (desmarca todos, después marca uno), sin
  índice parcial en la base ni transacción: dos escrituras concurrentes pueden dejar dos o ninguno.
- **`replacePrimary`** existe para que reintentar el último paso del onboarding pise el avatar en vez de duplicarlo.
  La oferta del gate **no** tiene el equivalente: cada reintento de `saveGateOfferAction` inserta otro producto.
- **Métricas por oferta** (`lib/product/offer-metrics.ts`) matchean clientes por **nombre**
  (`clients.offered_product` == `products.name`, normalizado). Renombrar un producto le borra la historia.
  - `closeRate` es el de **toda la org** (llamadas `closed` / total), no el de la oferta.
  - `monthlyRevenue` suma todo lo pagado por clientes que **entraron** este mes.
  - `topObjection`/`aiInsight` dependen de `topOrgObjection`, que `loadProductMetricsInput` nunca carga: salen
    siempre "Sin datos" / vacíos. `mainObjection` y `objectionHandler` se fuerzan a `""`.
- **`canEdit` es siempre `true`** con Supabase: no hay chequeo de rol en la página ni en las actions.
- El nodo raíz del grafo intenta leer `profiles.org_name`, **columna que no existe**; el error se traga y el nodo
  se llama siempre "Mi negocio" (`lib/product/queries.ts`).

## Limitaciones conocidas y deuda

- **Métricas de oferta engañosas** (close rate global, objeción vacía, match por nombre) `[PRODUCTO-METRICAS]`.
- **`value_ladder` es una tabla sin productor** `[PRODUCTO-VALUE-LADDER-TABLA]`.
- **Nombre del negocio en el grafo** roto por `profiles.org_name` `[PRODUCTO-GRAFO-NOMBRE]`.
- **Reindexado RAG sin `await`** después de responder; Vercel puede cortarlo `[AUD-CONF-6]`.
- **Lecturas sin paginar** de `clients`, `client_payments` y `closing_calls` (techo de 1000 filas;
  `closing_calls` ya tiene ~1.450 en producción al 2026-09-23) `[AUD-CONF-2]`, `[PRODUCTO-METRICAS]`.
- **Oferta duplicada al reintentar el onboarding** `[PRODUCTO-GATE-OFERTA-DUP]`.
- **`getProductContextForOrg` exportado desde un archivo `"use server"`** (es un endpoint) `[AUD-SALUD-6]`.
- Permisos: módulo prestado de `operations`, sin distinción `view`/`full` `[PERMISOS-SERVER-ACTIONS]`.
- `getSalesFrameworksAction` chequea `operations` (SCRUM-541, corte B): a quien no lo tiene le devuelve el rechazo y
  `SalesFrameworksSection` dibuja `SinAcceso`. Las lecturas de `app/product/actions.ts` que están en
  `LECTURAS_SIN_LLAMADOR_CONOCIDAS` (por ejemplo `getProductsAction` y `getAvatarsAction`) siguen sin chequeo.
- Avatar principal y core offer únicos sólo por la action `[PRODUCTO-UNICIDAD]`.

## Tests

Ninguno. `lib/product/mapper.ts` (550 líneas), `offer-metrics.ts` y `graph-layout.ts` son lógica pura sin cobertura
(`[T-22]` en `PENDIENTES.md`). No hay e2e.

## Archivos clave

- `apps/web/lib/product/queries.ts` — carga y enriquecimiento de la página
- `apps/web/lib/product/mapper.ts` — filas → `ProductData`, grafo, nodos espaciales, texto para el agente
- `apps/web/lib/product/offer-metrics.ts` — stats de oferta y escalón
- `apps/web/app/product/actions.ts` — todas las escrituras y la sugerencia desde RAG
- `apps/web/app/product/graph-positions.ts`
- `apps/web/components/product/product-module.tsx`, `detail-view.tsx`, `graph-view.tsx`, `value-ladder-section.tsx`
- `apps/web/components/product/product-rag-suggest.tsx`, `apps/web/lib/rag/extract-product-context.ts`
- `apps/web/app/onboarding/actions.ts` (gate), `apps/web/app/agent/graph-proposal-actions.ts`
- `supabase/migrations/20260616500000_product_module.sql`

## Lo que ya no existe

- **Fallback a `mocks/product.ts`** con badge "Mock · Phase 2": hoy sin datos
  hay empty state.
- **Propuesta de valor sólo en `useState`**: ya persiste con `saveValuePropositionAction`.

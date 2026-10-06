# Clientes

> Verificado contra el código el 2026-09-23 (commit 038caca). Backlog del área: `PENDIENTES.md` § Clientes.
>
> Esta área tiene tres documentos:
> - **`clientes.md`** (éste): visión general, CRM, lista, ficha, 1-1 y tareas, import, permisos.
> - **[`clientes-recorrido-y-wins.md`](./clientes-recorrido-y-wins.md)**: campos configurables (C0), recorrido y checkpoints (C1–C3), buzón de propuestas, wins, revisión semanal.
> - **[`clientes-growth-partners.md`](./clientes-growth-partners.md)**: add-on `growth_partners` — clientes de clientes, facturación del negocio, onboarding por link, señales de silencio y fechas.

## Qué es

El módulo de **entrega**: dónde está parado cada cliente después de la venta, qué le falta y cómo viene.
Lo usa el founder y el equipo de fulfillment (coaches, CSM). Parte del cliente creado al cerrar una
llamada en Closing (o cargado a mano / importado) y lo sigue hasta caso de éxito.

**Qué NO hace:** no es el seguimiento financiero. Plan, cuotas, pagos y adeudado viven en
**Ventas → Cobros** (`/sales/cobros`, `app/sales/payment-actions.ts`, ver el doc del área Ventas).
Los componentes de planes (`components/clients/plan-*.tsx`) y sus actions (`app/clients/plan-actions.ts`,
`plan-duration-actions.ts`) siguen físicamente en esta carpeta, pero sólo los usa `components/sales/cobros-page.tsx`
(más `listPlansAction`, que también lee el modal de cobro de Closing, `components/closing/payment-modal.tsx`).
`plan-durations-dialog.tsx` no lo importa nadie.
La clasificación de grabaciones de Fathom (a qué cliente pertenece cada llamada) es del área de Llamadas/Fathom;
acá sólo se consume.

## Pantallas y rutas

Todas bajo el layout `(platform)`; el acceso por pantalla lo corta `app/(platform)/layout.tsx` con
`permissionModuleForPath` (`/clients*` → módulo `clients`). Rutas canónicas en `apps/web/routes/paths.ts` → `paths.platform.clients`.

| Ruta | Archivo | Qué muestra |
|---|---|---|
| `/clients` | `app/(platform)/clients/page.tsx` → `components/clients/clients-list.tsx` | Tabla de entrega: etapa, próxima tarea, satisfacción, facturación (add-on), última 1-1, columnas configurables con `show_in_table`. Filtros armados con los datos (sólo aparece una pastilla si hay alguien detrás). Botones: nuevo cliente, cargar clientes (CSV o Excel), revisión, wins, Cobros (si tiene acceso a Ventas) y el menú «Configurar» (recorrido, campos). Con el add-on, la bandeja de onboarding «sin asignar» |
| `/clients/[id]` | `app/(platform)/clients/[id]/page.tsx` → `components/clients/client-detail.tsx` | La ficha (ver abajo). **Client Component**: toma el cliente de `usePlatformData().clients`, no de una query propia |
| `/clients/checkpoints` | `app/(platform)/clients/checkpoints/page.tsx` → `components/clients/checkpoints/journey-page.tsx` | Catálogo de fases y checkpoints (C1). Ver doc de recorrido |
| `/clients/wins` | `app/(platform)/clients/wins/page.tsx` → `components/clients/wins/wins-page.tsx` | Tracker, dashboard de casos y candidatos desde Discord. Ver doc de recorrido |
| `/clients/campos` | `app/(platform)/clients/campos/page.tsx` → `components/clients/custom-fields/custom-fields-page.tsx` | Campos personalizados: solapas Wins / Checkpoints / Clientes. Ver doc de recorrido |
| `/clients/revision` | `app/(platform)/clients/revision/page.tsx` → `components/clients/weekly-review/weekly-review-page.tsx` | Revisión semanal: cuatro listas de nombres |
| `/clients/pending-calls` | `app/(platform)/clients/pending-calls/page.tsx` → `components/clients/pending-fathom-calls.tsx` | Grabaciones de Fathom sin cliente, para confirmar a mano, y el botón «Cargar identidades desde el CRM». **No hay ningún link a esta pantalla en la UI de escritorio** (ver `[CLIENTES-PENDING-CALLS-HUERFANA]`) |
| `/onboarding-cliente/[token]` | `app/onboarding-cliente/[token]/page.tsx` | Formulario **público** de onboarding (add-on). Ver doc de growth partners |

### La ficha (`components/clients/client-detail.tsx`)

Tres capas. Encabezado (`client-header.tsx`: nombre, alta, producto, estado grueso y atajo a Cobros si el usuario
tiene acceso a Ventas) → franja de indicadores (`client-overview-strip.tsx` ← `getClientOverviewAction`: sesiones 1-1,
tareas pendientes, posición en el recorrido, satisfacción) → dos columnas:

| Columna izquierda (el trabajo) | Columna derecha (el contexto) |
|---|---|
| Recorrido + buzón de propuestas + selector de fase manual (`checkpoints/client-journey-section.tsx`) | Clientes del cliente y facturación del negocio (sólo add-on `growth_partners`) |
| Sesiones 1-1 (`client-one-on-ones.tsx`, subir por link con `upload-one-on-one-dialog.tsx`) | Campos configurables **sueltos** (`section = null`) (`client-custom-fields-section.tsx`) |
| Tareas del cliente (`client-tasks-section.tsx`) | Satisfacción (`client-satisfaction-section.tsx`) |
| Llamadas de venta vinculadas (`client-linked-calls.tsx`, lee `clients.linked_calls`) | Notas (`client-notes-section.tsx`) |
| Historial (`client-timeline.tsx` ← `loadClientTimelineAction` de `app/fathom/actions.ts`) | Wins (`wins/client-wins-section.tsx`), Discord (`client-discord-activity.tsx`), link a la grabación de venta, «Contexto del cierre» (`ai_insights`) |

Cada tarjeta pide sus datos por separado al montarse (del orden de 15 server actions por ficha): ver `[FICHA-LENTA]`.

## Modelo de datos

Todas las tablas tienen `organization_id` y RLS estándar `organization_id = get_my_organization_id()` (que resuelve
el claim `active_business_org_id` del JWT para holdings, o `profiles.organization_id`). **Ninguna policy mira el rol.**
Todas las migraciones listadas están aplicadas en producción (`list_migrations`, 2026-09-23).

### `clients` — columnas por origen

| Grupo | Columnas | Migración | Notas |
|---|---|---|---|
| Venta (legacy) | `name`, `join_date`, `payment_type`, `platform`, `total_amount`, `upfront_amount`, `fee_*`, `installments` (jsonb), `sales_fathom_url`, `closing_call_id` (text), `ai_insights` (jsonb), `linked_calls` (jsonb), `plan_id`, `selected_installment_system_id`, `offered_product`, `email`, `nickname` | `20260521100000_clients.sql`, `20260720100000_…` y posteriores | `installments` es lo que lee la señal «pago atrasado» de la revisión semanal |
| Estado grueso | `status` (`pending_onboarding`/`onboarding_done`/`active`/`success_case`), `is_success_case` | `20260521100000` | **No es configurable.** Lo mueven la ficha y los checkpoints con `sets_client_status` |
| Recorrido | `current_stage_id` (derivada, se recalcula al registrar/deshacer un hito), `manual_stage_id`, `manual_stage_set_at` | `20260903082000`, `20260921120000` | `manual_stage_set_at` se escribe pero **nadie lo lee** (`[FASE-MANUAL-SIN-PLAZOS]`) |
| Caso / baseline | `niche`, `baseline_metric_key/value/unit`, `baseline_captured_at` | `20260903090000_client_wins.sql` | Se cargan desde el diálogo de baseline del dashboard de wins |
| Seguimiento | `goal_text`, `goal_metric_key/value/unit`, `exit_date`, `current_status_note`, `current_metric_value`, `current_status_updated_at` | `20260904100000_trackers_desde_excel.sql` | `current_status_note` se pisa cada semana (revisión semanal) |
| Cuaderno | `notes`, `notes_updated_at` | `20260906100000_client_notes.sql` | Se acumula; distinto de `current_status_note`. Tope 20.000 caracteres en la action |
| Satisfacción | `satisfaction` (`en_riesgo`/`disconforme`/`neutral`/`conforme`/`muy_conforme`), `satisfaction_updated_at`, `satisfaction_updated_by` | `20260915110000` | Siempre con fecha y autor; borrar la marca borra ambos |
| Configurables | `custom` jsonb (claves de `field_definitions` con `entity='client'`) + índice GIN | `20260911120000` | Ver doc de recorrido (C0) |

### Tablas satélite de la ficha

| Tabla | Qué guarda | Claves / reglas |
|---|---|---|
| `client_tasks` | Compromisos del cliente: `title`, `description`, `owner` (`client`/`coach`), `status` (`pending`/`done`), `due_date`, `source` (`manual`/`fathom_call`), `source_call_id`, `workboard_task_id`, `position` | `20260920100000`. Distinta de `workboard_tasks`: mandar al tablero crea una tarea allá y **la de acá se queda** |
| `client_timeline_entries` | Historial de la ficha (llamadas procesadas, onboarding completado) | Tabla del área Fathom; se escribe desde `lib/fathom/process-call.ts` y el onboarding |
| `client_problems` | Problemas detectados en llamadas | Área Fathom |
| `client_identities` | Alias/mail/nombre/teléfono → `client_id` o `lead_id` (uno de los dos), `source` (`seed`/`manual_confirmation`/…), `times_matched` | `20260903100000_fathom_member_keys.sql`. Único por `(org, identity_type, normalized_value)`. **0 filas en producción** (estimado de `list_tables`, 2026-09-23): nunca se sembró (`[B-SEMBRAR-IDENTIDADES]`) |
| `fathom_calls` (columnas de la 1-1) | `ingest_source` (`sync`/`webhook`/`manual_link`), `uploaded_by`, `share_token`, `share_payload` (crudo), `one_on_one_tasks_extracted_at` | `20260920100000`. La marca de extracción es el seguro contra tareas duplicadas |
| `client_payments` | Lo que el cliente **nos paga** | Área Ventas (Cobros). No confundir con `client_revenue_entries` (lo que factura el negocio del cliente) |

Tamaño real en producción (estimado `list_tables`, 2026-09-23): 337 clientes, 288 `client_tasks`, 30 eventos de checkpoint,
9 propuestas, 4 wins, 10 `client_sub_clients`, 0 links de onboarding.

## Cómo fluye el dato

```
Closing (markCallClosed en providers/platform-data-provider.tsx)
   └─ createClientAction ── atribución UTM + lead magnet (best-effort, no rompe el alta)
Alta manual (new-client-dialog) ─┘
CSV/Excel (import-clients-dialog → importClientsAction, todo o nada)
Excel (/integrations/import → importClientsFromExcelAction, dedupe por nombre)

PlatformDataProvider.listClientsAction()  ← select * de clients (incluye custom entero)
   ├─ /clients: ClientsList + getClientsBoardAction()  (una sola vuelta:
   │     journey derivado, checkpoints, campos, última 1-1, próxima tarea,
   │     facturación, fases manuales) + getClientSignalsAction() (add-on)
   └─ /clients/[id]: ClientDetail → cada tarjeta llama su action
```

| Flujo | Entrada | Dónde |
|---|---|---|
| CRUD cliente | `createClientAction`, `updateClientAction`, `deleteClientAction`, `importClientsAction` (y `assignClientPlanAction`, que delega en `updateClientAction`) | `app/clients/actions.ts`. Validan con zod (`lib/validations`); revalidan `/clients`, wins, revisión y dashboard. Devuelven sus errores esperables como valor (`MutationResult` con `mutacionConErroresEsperables`, SCRUM-497): validación, sin permiso para borrar, sesión, cliente de otra org o inexistente, plan o llamada que ya no existe. Cualquier otro error (la red, la base, un bug) se registra, va a Sentry y el usuario ve el texto fijo. Los errores por fila del import siguen en `errors` del dato. Los componentes las corren con `correrMutacion`; el provider, con `datoDeLaMutacion` (`lib/client/correr-accion.ts`) |
| Lista | `getClientsBoardAction` | `app/clients/clients-board-actions.ts`. `pickNextTask` (`lib/clients/next-task.ts`) es la misma regla en tabla y ficha |
| Franja de la ficha | `getClientOverviewAction` | `app/clients/overview-actions.ts` |
| 1-1 por link | `uploadOneOnOneFromShareLinkAction` → `fetchFathomShare` (página pública de Fathom, sin API key) → `finalizeAssociatedCall` | `app/fathom/manual-upload-actions.ts`, `lib/fathom/share-link.ts`. **No corre el clasificador**: el cliente lo eligió una persona |
| Tareas desde la 1-1 | `lib/fathom/one-on-one-tasks.ts` (Claude) → `lib/clients/client-tasks.ts` | Marca `one_on_one_tasks_extracted_at` sólo si la respuesta se pudo leer. Reintento: `retryOneOnOneTasksAction` (`app/fathom/one-on-one-actions.ts`, botón «Buscar tareas») |
| Tareas a mano | `create/update/toggle/delete/sendClientTaskToBoardAction` | `app/clients/task-actions.ts`. `sendClientTaskToBoardAction` crea un `workboard_tasks` y guarda `workboard_task_id` (no duplica) |
| Notas, satisfacción, seguimiento | `updateClientNotesAction`, `updateClientSatisfactionAction`, `updateClientTrackingAction`, `updateClientCurrentStatusAction` | `app/clients/tracking-actions.ts` |
| Fase manual | `setClientManualStageAction` (valida que la fase sea de la org) | `app/clients/stage-actions.ts`. La UI llama `refreshClients()` después (recarga la lista entera) |
| Llamadas sin asociar | `listPendingFathomCallsAction`, confirmación y siembra de identidades | `app/fathom/actions.ts`, `lib/fathom/identities.ts`, `lib/fathom/seed-identities.ts` |
| Propuestas de hitos | cron `/api/cron/daily-signals` (07:20 UTC) | Ver doc de recorrido |

## Integraciones externas

| Proveedor | Qué se usa acá | Si no está |
|---|---|---|
| Fathom | Página compartida (`fathom.video/share/…`) para subir 1-1 sin API key; sync/webhook del área Fathom para «Última 1-1» y llamadas vinculadas | Subir por link funciona igual (no usa credencial). Sin sync, «Última 1-1» sólo muestra las subidas a mano |
| Anthropic (Claude) | Extracción de tareas de la 1-1; análisis de la llamada; matcher de hitos | Sin clave de Claude de la org la 1-1 se sube pero no salen tareas, y la plataforma avisa que la IA está desactivada (SCRUM-7) |
| Discord | Actividad por cliente en la ficha, candidatos a win, propuestas de hitos | Las tarjetas quedan vacías |
| Supabase Storage | Bucket privado `client-wins` (capturas de wins) | Ver doc de recorrido |

## Reglas de negocio y decisiones no obvias

- **La ficha no consulta al cliente por id.** `[id]/page.tsx` busca en `usePlatformData().clients`; si el cliente no
  está en esa lista, da 404. Cualquier mutación que cambie algo que la ficha muestra desde `Client` tiene que llamar
  `refreshClients()`: `router.refresh()` no alcanza (bug real del 2026-09-21).
- **Estado grueso vs fase del recorrido.** `clients.status` son 4 valores fijos; la fase (`current_stage_id` /
  `manual_stage_id`) es configurable. Un checkpoint puede mover el estado al registrarse; **deshacerlo no lo revierte**.
- **Fase efectiva = la más avanzada entre manual y derivada** (`lib/checkpoints/effective-stage.ts`). Fijar la fase no
  registra hitos: los anteriores se muestran «salteados». La ficha aplica esta regla; **la tabla no** (ver `[CLIENTES-ETAPA-TABLA-VS-FICHA]`).
- **«Próxima tarea» de la tabla es una `client_task`, no el próximo hito del recorrido.** Tildarla en la tabla llama
  `toggleClientTaskAction`, no registra checkpoints.
- **Dos «objetivos».** El campo configurable (categoría, ej. «Escalar a 50k») y `goal_text` + `goal_metric_*`
  (medida que el dashboard de wins compara). Se llaman igual; miden distinto (`[OBJETIVO-DOS-LUGARES]`).
- **Dos «silencios».** La revisión semanal cuenta 30 días fijos desde el último win o hito (`lib/clients/weekly-review.ts`);
  la marca «Sin novedades» de la lista (sólo add-on) usa `organizations.client_silence_days` y el RPC
  `client_last_activity` con 8 fuentes. Pueden discrepar para el mismo cliente.
- **Mail del cliente.** `clients.email` se hereda del lead al cerrar; es la identidad determinista para vincular
  llamadas. Casi todos los clientes viejos no lo tienen (`[CLIENTES-SIN-MAIL]`).
- **Permisos.** Sólo el founder configura catálogo (recorrido, campos, duración de planes, umbral de silencio): lo
  hacen cumplir las actions con `requireFounder()` (el umbral de silencio, con un chequeo equivalente de `profile.role` en `setClientSilenceDaysAction`). Todo lo demás (alta, borrado, tareas, notas, hitos, wins) sólo
  exige estar en la org: el permiso por módulo (`full` / `read` / `none`) corta el render y esconde botones
  (`useModuleAccess("clients")`), **no** las server actions ni la RLS (`[PERMISOS-SERVER-ACTIONS]`).
- **Add-on `growth_partners`.** `useHasAddOn` esconde las tarjetas; el servidor lo vuelve a exigir con `requireAddOn`
  en cada escritura (`lib/auth/add-ons.ts`).

## Limitaciones conocidas y deuda

| ID | Resumen |
|---|---|
| `[CLIENTES-ETAPA-TABLA-VS-FICHA]` | La tabla muestra la fase derivada aunque la manual sea más avanzada; la ficha, la más avanzada |
| `[FICHA-LENTA]` / `[FASE-REFRESCO-CARO]` / `[FICHA-CUSTOM-EN-LA-LISTA]` | Ficha con ~15 actions; fijar fase recarga toda la lista; `listClientsAction` trae `custom` entero |
| `[CLIENTES-TECHO-1000]` | `listClientsAction`, `getClientsJourneyStatusAction`, próxima tarea, wins y eventos no paginan: pasadas las 1000 filas se trunca en silencio |
| `[CLIENTES-IMPORT-EXCEL-MONTOS]` | El parser de Excel convierte montos ilegibles en 0 y fechas ilegibles en hoy |
| `[CLIENTES-SIN-MAIL]` | Casi ningún cliente viejo tiene mail; el import de Excel lee la columna Email y **no la guarda** en `clients.email` (queda como texto en `ai_insights`) |
| `[CLIENTES-PENDING-CALLS-HUERFANA]` | `/clients/pending-calls` no tiene link en la navegación de escritorio |
| `[1A1-EDITAR-DETALLE]` | La acción de editar tarea existe; la UI no la ofrece |
| `[PERMISOS-SERVER-ACTIONS]` | Roles sin enforcement en actions/RLS |
| `[TRACKERS-RIESGO-PAGOS]` | «Pago atrasado» sólo mira `clients.installments` |

Lista completa y verificada: [`PENDIENTES.md` § Clientes](../../PENDIENTES.md#clientes).

## Tests

- Vitest, lógica pura: `lib/clients/__tests__/` (next-task, revenue, satisfaction, signals, sub-clients, weekly-review;
  ~76 casos), más los de `lib/checkpoints`, `lib/custom-fields`, `lib/wins`, `lib/client-onboarding` (ver los otros dos docs)
  y los de Fathom que tocan la 1-1 (`lib/fathom/__tests__/one-on-one-tasks.test.ts`, `one-on-one-stats.test.ts`,
  `share-link.test.ts`, `seed-identities.test.ts`, `resolve-counterparty.test.ts`).
- **Sin tests:** `lib/clients/excel-parser.ts`, `lib/clients/parse-client-import.ts` (`[T-3]`), `lib/clients/payment-utils.ts`
  (`[T-4]`), `lib/clients/mapper.ts`, ninguna server action.
- **E2E:** ninguno del área (`apps/web/e2e/` sólo tiene `holding.spec.ts`).

## Archivos clave

- `apps/web/app/clients/actions.ts` — CRUD de `clients`
- `apps/web/app/clients/clients-board-actions.ts` — todo lo que pide la tabla
- `apps/web/components/clients/clients-list.tsx` — la tabla y sus filtros
- `apps/web/components/clients/client-detail.tsx` — la ficha
- `apps/web/providers/platform-data-provider.tsx` — de dónde sale `clients` en el navegador
- `apps/web/lib/clients/mapper.ts` — fila ↔ `Client` (`apps/web/types/clients.ts`)
- `apps/web/app/clients/task-actions.ts` + `apps/web/lib/clients/client-tasks.ts` + `apps/web/lib/clients/next-task.ts`
- `apps/web/app/fathom/manual-upload-actions.ts` + `apps/web/lib/fathom/one-on-one-tasks.ts` — 1-1 por link
- `apps/web/app/clients/tracking-actions.ts` — notas, satisfacción, seguimiento, revisión semanal
- `apps/web/app/clients/stage-actions.ts` + `apps/web/lib/checkpoints/effective-stage.ts` — fase manual
- `apps/web/app/clients/import-actions.ts` + `apps/web/lib/clients/excel-parser.ts` — import Excel
- `apps/web/lib/navigation/module-for-path.ts` — qué módulo de permisos cubre `/clients`

## Lo que ya no existe

- `app/clients/payment-actions.ts` (lo citaba la documentación vieja): los pagos están en `app/sales/payment-actions.ts` (Cobros).
- Las columnas financieras de la tabla (plan, días de programa, adeudado) y el botón «Crear planes»: se mudaron a `/sales/cobros`.
- La columna «Estado» de la tabla y el campo «Apodo» de la ficha (`clients.nickname` sigue en la base).
- La tarjeta «Información del cliente» con apartados sobre el propio cliente: los campos con `section` ahora se cargan
  por cliente-de-cliente (add-on). Una org sin el add-on con valores de sección cargados en `clients.custom` ya no los ve en la ficha.

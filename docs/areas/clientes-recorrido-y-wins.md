# Clientes — recorrido, campos configurables y wins

> Verificado contra el código el 2026-09-23 (commit 038caca). Backlog: `PENDIENTES.md` § Clientes.
> Parte del área Clientes; la visión general está en [`clientes.md`](./clientes.md).

## Qué es

Tres piezas que se apoyan entre sí:

- **C0 · Campos configurables** (`field_definitions`): columnas que cada organización agrega sin migración, para
  wins, checkpoints y clientes. Una columna nueva es una fila, no un `ALTER TABLE`.
- **C1–C3 · Recorrido del cliente**: un catálogo de fases y checkpoints (hitos) por organización, el registro de
  qué hitos alcanzó cada cliente, la detección de **clientes trabados** y un **buzón de propuestas** que llenan la IA
  (Discord y llamadas de entrega) y que una persona acepta o descarta.
- **A · Wins**: tracker de logros de clientes con medida comparable, permisos de publicación, usos en marketing y
  capturas; un dashboard que arma el caso «punto inicial → punto final».

Más la **revisión semanal** (`/clients/revision`), que cruza las tres.

**Qué NO hace:** nada se registra solo. Ni un hito ni un win se crean sin que alguien acepte. El recorrido es uno
por organización (la columna `product_id` existe pero la UI no la usa).

## Pantallas y rutas

| Ruta | Archivo | Qué muestra |
|---|---|---|
| `/clients/campos` | `components/clients/custom-fields/custom-fields-page.tsx`, `field-definition-dialog.tsx` | Solapas Wins / Checkpoints / Clientes. Botones de ejemplo, «Cargar plantilla» (22 campos Marketing/Ventas/Sistemas) y «Preguntas del onboarding» → «Cargar preguntas» (86 campos), estos dos sólo con add-on. Umbral «Clientes sin novedades» (add-on) |
| `/clients/checkpoints` | `components/clients/checkpoints/journey-page.tsx`, `stage-dialog.tsx`, `checkpoint-dialog.tsx` | Fases con sus checkpoints: plazo, estado que fija, métricas pedidas. Botón «Cargar un recorrido de ejemplo» |
| Ficha → Recorrido | `components/clients/checkpoints/client-journey-section.tsx`, `record-checkpoint-dialog.tsx` | Hitos por fase (alcanzado / pendiente / salteado), registrar y deshacer, selector de fase manual, propuestas pendientes del cliente |
| `/clients/wins` | `components/clients/wins/wins-page.tsx` → `wins-tracker.tsx`, `wins-dashboard.tsx`, `win-candidates.tsx`, `win-form-modal.tsx`, `client-baseline-dialog.tsx` | Solapas Tracker, Dashboard y Candidatos (testimonios de Discord) |
| Ficha → Wins | `components/clients/wins/client-wins-section.tsx` | Wins del cliente |
| `/clients/revision` | `components/clients/weekly-review/weekly-review-page.tsx` | Cuatro listas: trabados, por tener un resultado, cerca del egreso, en riesgo. Anotación semanal por cliente |

Edición del catálogo (campos, fases, checkpoints): la UI la esconde si `profile.role !== "founder"` (`canManage`) y las
actions la rechazan con `requireFounder()`.

## Modelo de datos

Todas con RLS por `organization_id = get_my_organization_id()` en las cuatro operaciones y trigger `set_updated_at`
(salvo `win_attachments` y `win_usages`, que no tienen `updated_at`).
Migraciones aplicadas en producción.

### C0 — `field_definitions` (`20260903080000`, `20260911120000`, `20260915110000`, `20260921120000`, `20260923140000`)

| Columna | Valores / forma |
|---|---|
| `entity` | `win` / `checkpoint` / `client` |
| `key` | Derivada de la etiqueta al crear (`lib/custom-fields/key.ts`: sin acentos, `a-z0-9_`, ≤60, reservadas `id,key,value,custom,metrics`). **Inmutable.** Única por `(org, entity, key)` |
| `label`, `description` | Editables libremente |
| `field_type` | `select`, `multi_select`, `text`, `number`, `currency`, `date` |
| `options` | jsonb `[{ value, label, color, archived }]`. Se guarda `value`; `color` es un token (`neutral`, `cat-1`…`cat-6`) |
| `options_source` | `inline` / `journey_stages`. La UI **sólo crea `inline`** (`[C0-JOURNEY-STAGES-UI]`) |
| `unit` (number), `currency` (`USD`/`ARS`), `is_required`, `sort_order`, `archived_at` | |
| `alert_days_before` | Sólo `date`: a cuántos días se pinta en alerta (1–365) |
| `section` | `marketing` / `ventas` / `sistemas` / `onboarding` / null. Agrupa en solapas de la ficha del cliente-de-cliente |
| `show_in_table` | Si la columna de cliente se dibuja en `/clients`. Default `false` |
| `onboarding` | jsonb `{ step, question, required, showIf, audio }` o null: si se pregunta en el formulario público |

Los valores viven en jsonb con la `key` como clave: `client_wins.custom`, `client_checkpoint_events.metrics`,
`clients.custom`, `client_sub_clients.custom`.

### Recorrido

| Tabla | Columnas clave | Reglas |
|---|---|---|
| `client_journey_stages` (`20260903081000`) | `name`, `color` (token), `sort_order`, `archived_at` | No se borra una fase con checkpoints (lo frena la action; la FK borraría en cascada) |
| `client_checkpoints` | `stage_id`, `name`, `description`, `sets_client_status` (uno de los 4 de `clients.status` o null), `expected_days` (>0, **desde el checkpoint anterior**), `metric_schema` jsonb `[{ field_key, required }]` → referencias a `field_definitions` con `entity='checkpoint'`, `product_id` (sin uso) | Nombre único por fase (action) |
| `client_checkpoint_events` (`20260903082000`) | `client_id`, `checkpoint_id`, `reached_at` (nunca futura), `metrics` jsonb, `note`, `recorded_by`, `source` (`manual`/`discord`/`fathom`/`automatic`) | **Único `(client_id, checkpoint_id)`**: registrar de nuevo edita (upsert) |
| `client_checkpoint_proposals` (`20260903083000`) | `client_id`, `checkpoint_id`, `source` (`discord`/`fathom`/`automatic`), `source_ref`, `rationale`, `suggested_reached_at`, `suggested_metrics`, `confidence` 0–1, `status` (`pending`/`accepted`/`rejected`), `resolved_by/at` | Único parcial `(client_id, checkpoint_id, source) WHERE status='pending'` |
| `discord_messages.checkpoint_checked_at`, `fathom_calls.checkpoint_checked_at` (`20260904110000`) | Marca de «ya evaluado por el matcher» | Evita volver a pagar IA por el mismo texto |

### Wins (`20260903090000`, `20260904100000`)

| Tabla | Columnas clave | Reglas |
|---|---|---|
| `client_wins` | `client_id`, `win_date`, `achievement` (obligatorio), `metric_key/value/unit`, `custom`, `source` (`manual`/`discord`/`fathom`), `source_ref`, `notes`, `consent_status` (`not_asked`/`granted`/`denied`), `consent_display` (`name_and_face`/`name_no_numbers`/`anonymous`), `consent_note`, `usage_state` (`unused`/`used`/`reserved`), `needs_screenshot` | Check `consent_status <> 'granted' or consent_display is not null` |
| `win_attachments` | `win_id` **o** `draft_id`, `storage_path` (único), `mime_type`, `file_size` | Bucket privado `client-wins` (10 MB, png/jpeg/webp), sin policies en `storage.objects`: sólo el service role. Ruta `<org>/wins/<winId>/…` o `<org>/drafts/<draftId>/…` |
| `win_usages` | `win_id`, `channel` (`landing`/`vsl`/`ad`/`story`/`dm`/`proposal`/`other`), `location_label`, `url`, `used_at` | |
| `clients` (columnas de caso) | `niche`, `baseline_*`, `goal_*`, `exit_date`, `current_status_*` | Ver `clientes.md` |

## Cómo fluye el dato

```
Catálogo (founder)                     Registro (cualquier miembro)
checkpoint-actions.ts ──┐              checkpoint-event-actions.ts
custom-field-actions.ts ┘                recordCheckpointAction
                                           ├ valida fecha ≤ ahora
                                           ├ valida métricas con C0 (resolveMetricSchema + validateFieldValues)
                                           ├ upsert (client_id, checkpoint_id), source = 'manual'
                                           ├ sets_client_status → clients.status (+ is_success_case)
                                           └ recomputeCurrentStage → clients.current_stage_id
cron /api/cron/daily-signals (07:20 UTC, CRON_SECRET)
  1. classifyDiscordMessagesForOrg
  2. proposeCheckpointsFromDiscordForOrg  (mensajes con client_id y ya clasificados)
  3. proposeCheckpointsFromCallsForOrg     (fathom_calls purpose='delivery' con client_id; manda el resumen, no el transcript)
        └ proposeCheckpointsFromTexts → Haiku (callClaudeJson) → parseCheckpointMatches → createCheckpointProposal
Ficha: acceptCheckpointProposalAction → recordCheckpointAction (mismas validaciones) → proposal.status='accepted'
```

| Pieza | Dónde |
|---|---|
| Armar el recorrido y el progreso | `lib/checkpoints/journey.ts` (`buildJourney`, excluye archivados), `lib/checkpoints/progress.ts` |
| Trabado, fase actual, «3 de 4», vencimiento | `lib/checkpoints/stalled.ts` (`deriveClientJourneyStatus`) |
| Fase efectiva y salteados | `lib/checkpoints/effective-stage.ts` |
| Filtro del matcher (umbral `MIN_MATCH_CONFIDENCE = 0.7`, un hito por texto, ids fuera de catálogo descartados) | `lib/checkpoints/match-proposal.ts` |
| Resumen de estados para la lista | `getClientsJourneyStatusAction` en `app/clients/checkpoint-derived-actions.ts` |
| Wins: CRUD, capturas (signed upload URL con admin → finalize), usos, baseline | `app/clients/win-actions.ts` |
| Win desde testimonio de Discord | `createWinFromTestimonialAction` en `app/discord/actions.ts` (área Discord) |
| Caso medido | `lib/wins/derive-case.ts` |
| Permisos y estado de uso | `lib/wins/consent.ts`, `lib/wins/usage-state.ts` |
| Revisión semanal | `getWeeklyReviewAction` (`app/clients/tracking-actions.ts`) + `lib/clients/weekly-review.ts` |

## Integraciones externas

| Proveedor | Uso | Sin él |
|---|---|---|
| Anthropic (Haiku) | Matcher de hitos | El cron registra el error del paso y sigue; sin propuestas |
| Discord (bot, área Discord) | Mensajes para proponer hitos; testimonios → candidatos a win | Sin candidatos ni propuestas desde Discord |
| Fathom (área Fathom) | Resúmenes de llamadas de entrega clasificadas | Sin propuestas desde llamadas. Hoy casi ninguna llamada queda como `delivery` con cliente (ver `[1-1-SEMBRAR-Y-MEDIR]`) |
| Supabase Storage | Bucket `client-wins` | Subir captura falla con mensaje |

## Reglas de negocio y decisiones no obvias

- **La `key` de un campo no cambia nunca.** Renombrar es cambiar `label`. Si alguien «arregla» la derivación para que
  siga a la etiqueta, todos los datos cargados quedan huérfanos.
- **Un campo con datos no se borra, se archiva** (`isFieldInUse` mira `client_wins.custom`,
  `client_checkpoint_events.metrics`, `clients.custom` y `client_sub_clients.custom`). Una opción en uso tampoco se
  quita: se archiva.
- **Archivar no borra el pasado.** `mergeCustomFieldValues` (`lib/custom-fields/merge.ts`) conserva al guardar las claves de
  campos archivados y las huérfanas; el formulario sólo pisa lo que ofreció. Vaciar un campo activo es la única forma de borrar.
- **Validación honesta.** Un número o monto ilegible se rechaza, no se guarda como cero. Texto: tope 20.000 caracteres
  (`MAX_TEXT_LENGTH`, `lib/custom-fields/validate.ts`). La ficha del cliente informa todos los errores; checkpoints y
  wins sólo el primero (`[CUSTOM-ERRORES-PRIMERO]`).
- **Plazo = días desde el hito inmediatamente anterior**, no desde el alta. Si el anterior no está registrado, el
  cliente **no puede estar trabado** (incluye al que nunca arrancó y al de fase fijada a mano): `[C3-TRABADO-SIN-PRIMER-HITO]`,
  `[FASE-MANUAL-SIN-PLAZOS]`.
- **Fase actual = la del hito más avanzado en el orden del recorrido**, no el más reciente por fecha. El «n de m» cuenta
  sólo la fase actual y sin archivados.
- **Deshacer un hito no revierte `clients.status`** (sería adivinar a cuál volver); sí recalcula la fase.
- **Aceptar una propuesta pasa por `recordCheckpointAction`.** Es lo que impide que el buzón sea una puerta trasera.
  Efecto colateral: el evento queda con `source = 'manual'` y se pierde que vino de Discord/Fathom (`[C3-ORIGEN-PROPUESTA]`).
- **Una propuesta no se crea para un hito ya registrado** ni se duplica mientras hay otra pendiente de la misma fuente.
- **Wins comparables = misma `metric_key` y misma `metric_unit`.** Sin dos puntos comparables el caso es «sin medir», con
  motivo (`sin_wins_con_medida`, `un_solo_punto`, `unidades_distintas`, `misma_fecha`). No se interpola.
- **Medida a medias se rechaza** (clave sin número o al revés): en wins lo hace el servidor (`metricSchema` de
  `win-actions.ts`); en baseline y objetivo lo hace el diálogo del dashboard, y las actions
  (`updateClientBaselineAction`, `updateClientTrackingAction`), si les llega a medias, la guardan vacía en silencio.
- **Lo no autorizado no se ofrece para publicar.** `canPublish` exige `granted` + `consent_display`. Los wins viejos
  quedaron `not_asked` a propósito (`[TRACKERS-PERMISOS-VACIOS]`).
- **`used`/`unused` se derivan de `win_usages`**; sólo `reserved` se declara.
- **Revisión semanal:** «en riesgo» exige **dos** señales de tres (trabado, ≥30 días sin win ni hito, cuota vencida en
  `clients.installments`). Un cliente sin dato para una lista no aparece en ella; no se inventa el motivo.
- **El "hoy" de la revisión semanal es el de la organización** (`organizations.timezone`, una consulta por pedido):
  una cuota que vence hoy no es pago atrasado y la fecha de cada hito se cuenta en esa zona (SCRUM-493).
- **La fecha de un hito (`reached_at`) tiene una sola convención** (`lib/checkpoints/fecha-del-hito.ts`): el diálogo
  guarda el día elegido a las 12:00 locales (hoy, antes de las 12, un poco antes de ahora, porque la action rechaza
  un hito futuro) y se lee en una zona: la de la org en la revisión semanal, la del navegador en la ficha. Las filas
  del diálogo viejo (12:00:00.000 UTC exactas) se leen con su fecha de UTC, así no se corren en UTC+12.
- **Fechas `YYYY-MM-DD` se formatean partiendo el string**, no con `new Date()`: en UTC-3 se corre un día.

## Limitaciones conocidas y deuda

| ID | Resumen |
|---|---|
| `[C3-TRABADO-SIN-PRIMER-HITO]`, `[FASE-MANUAL-SIN-PLAZOS]` | Sin hito anterior no hay trabado |
| `[CLIENTES-ETAPA-TABLA-VS-FICHA]` | La tabla ignora la fase manual cuando hay derivada (no hay filtro por fase) |
| `[C3-ORIGEN-PROPUESTA]` | El evento aceptado desde una propuesta queda como `manual` |
| `[PROPUESTAS-CALIDAD-SIN-VER]` | Nadie midió aceptadas vs descartadas (hay 9 propuestas en producción) |
| `[CUSTOM-ERRORES-PRIMERO]` | Wins y checkpoints informan sólo el primer error |
| `[C0-JOURNEY-STAGES-UI]` | `options_source='journey_stages'` no se puede elegir |
| `[A-ENGANCHES-W3]` | Win desde Discord hecho; desde llamadas de Fathom, no |
| `[WINS-BORRADORES-HUERFANOS]` | Capturas de un win que nunca se guardó quedan en `win_attachments` y en el bucket |
| `[OBJETIVO-DOS-LUGARES]` | Dos «objetivos» con el mismo nombre |
| `[TRACKERS-EGRESO-MANUAL]`, `[TRACKERS-RIESGO-PAGOS]`, `[TRACKERS-RECOMENDACIONES-6-10]` | Egreso a mano, riesgo de pago sólo por cuotas, recomendaciones pendientes |

## Tests

Vitest, lógica pura (entorno `node`):

| Carpeta | Archivos | Casos aprox. |
|---|---|---|
| `lib/custom-fields/__tests__/` | key, validate, merge, resolve, format, date-alert, onboarding-config | ~85 |
| `lib/checkpoints/__tests__/` | journey, progress, stalled, effective-stage, metric-schema, match-proposal, fecha-del-hito | ~102 |
| `lib/wins/__tests__/` | derive-case, consent | ~34 |
| `lib/clients/__tests__/weekly-review.test.ts` | revisión semanal, incluido el hoy de la organización | ~24 |

No cubierto: server actions (upsert de eventos, `applyClientStatus`, aceptar propuesta), `propose-from-texts.ts` (IO),
`usage-state.ts`, flujo de capturas, ninguna pantalla (sin Playwright).

## Archivos clave

- `apps/web/app/clients/custom-field-actions.ts` — CRUD de C0, plantillas, `isFieldInUse`
- `apps/web/lib/custom-fields/validate.ts`, `merge.ts`, `key.ts`
- `apps/web/app/clients/checkpoint-actions.ts` — catálogo del recorrido
- `apps/web/app/clients/checkpoint-event-actions.ts` — registrar / deshacer hitos
- `apps/web/app/clients/checkpoint-derived-actions.ts` — trabados y buzón de propuestas
- `apps/web/lib/checkpoints/stalled.ts`, `effective-stage.ts`, `match-proposal.ts`, `propose-from-texts.ts`
- `apps/web/app/api/cron/daily-signals/route.ts`
- `apps/web/app/clients/win-actions.ts` + `apps/web/lib/wins/derive-case.ts`
- `apps/web/app/clients/tracking-actions.ts` + `apps/web/lib/clients/weekly-review.ts`
- `apps/web/types/checkpoints.ts`, `apps/web/types/custom-fields.ts`, `apps/web/types/wins.ts`

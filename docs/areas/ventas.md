# Ventas

> Verificado contra el código el 2026-09-23 (commit 038caca). Backlog del área: `PENDIENTES.md` § Ventas.
> Conteos de producción (`list_tables`, proyecto `nrzlylzbmsuowzhpdnjl`) al 2026-09-23.

## Qué es

El tramo comercial del negocio del founder: los DMs con leads (Bandeja), los turnos de la
llamada de cierre y su seguimiento (Closing), las grabaciones de esas llamadas con análisis IA
(Llamadas), las métricas del proceso (Métricas) y el seguimiento de lo que cada cliente debe
(Cobros). Lo usan el founder, setters y closers con el permiso de módulo `sales`.

**No hace:** no cobra ni concilia pagos automáticos (Whop/Commas alimentan Embudos, no Cobros),
no persiste los DMs (Zernio se lee en vivo) y no clasifica llamadas de entrega/1-1 (eso es
Clientes, aunque el pipeline de Fathom es compartido).

## Pantallas y rutas

Las cinco entradas del menú "Ventas" (`apps/web/lib/navigation/sidebar-modules.ts`, rutas en
`apps/web/routes/paths.ts` → `paths.platform.sales.*`). Todas bajo el permiso `sales`; el
layout `app/(platform)/layout.tsx` corta el render si el rol lo tiene en `none`.

| Ruta | Archivo | Qué muestra |
|---|---|---|
| `/sales/inbox` | `app/(platform)/sales/inbox/page.tsx` → `components/sales/sales-inbox-layout.tsx` → `zernio-inbox-panel.tsx` | Bandeja unificada de Zernio (IG, WhatsApp, etc.) en vivo, con envío, polling de mensajes cada 30 s y panel lateral de análisis IA (`zernio-side-panel.tsx`) + recorrido del lead (`lead-journey-inline.tsx`; si una fuente no se pudo leer, avisa cuál falta) |
| `/sales/metrics` | `app/(platform)/sales/metrics/page.tsx` → `components/sales/sales-metrics-redesign.tsx` | KPIs de cierre/show/leads por rango de fechas, ranking de equipo (`call_analyses`), objeciones frecuentes, fallback a `metrics_snapshots` importados |
| `/sales/closing` | `app/(platform)/sales/closing/page.tsx` → `components/closing/closing-overview.tsx` | Tabs por hash: `#calendario`, `#lista`, `#seguimiento` (tabla de leads, `leads-table.tsx`), `#equipo` (`closers-ranking.tsx`). Drawer de turno con botones de resultado, modal de cierre con pago (`payment-modal.tsx`) y de no-cierre/no-show (`call-outcome-modal.tsx`). `?call=<id>` abre un turno |
| `/sales/cobros` | `app/(platform)/sales/cobros/page.tsx` → `components/sales/cobros-page.tsx` | Tabla por cliente: plan, días restantes, tipo de pago, adeudado, monto. Historial y registro de cuotas con comprobante (`client-payments-section.tsx`). `?cliente=<id>` lo abre desplegado |
| `/sales/llamadas` | `app/(platform)/sales/llamadas/page.tsx` → `components/sales/sales-calls-list.tsx` | Llamadas de Fathom con `purpose = 'sales'` (últimas 100) y su `call_analyses`, unidos en código por `fathom_call_id` (`lib/fathom/sales-calls.ts`) |

Superficies de Ventas que viven en otras pantallas:

| Dónde | Archivo | Qué |
|---|---|---|
| `/integrations` → Fathom | `components/integrations/fathom-member-accounts.tsx`, `unlinked-recordings-panel.tsx` | Keys de Fathom por miembro; grabaciones de venta que no cruzaron un turno y vinculación manual |
| `/settings` | `components/settings/closer-calendly-settings.tsx` | Cada closer conecta su propio Calendly (`/api/integrations/calendly/closer/start`) |
| `/clients/pending-calls` | `components/clients/pending-fathom-calls.tsx` | Cola de grabaciones a asociar a cliente + botón "Cargar identidades desde el CRM" (`seedClientIdentitiesAction`) |
| Panel general | `components/dashboard/sales-funnel-strip.tsx` | Embudo de ventas; su tramo de DMs lee `conversations` (vacía) — ver `[EMBUDO-PANEL-DMS]` |

## Modelo de datos

| Tabla | Filas prod | Columnas clave | Notas |
|---|---|---|---|
| `closing_calls` | 1.455 | `status`, `status_source` (`sync`/`manual`), `scheduled_at`, `lead_name/email/phone`, `lead_id`, `closer_id`, `calendly_event_id`, `ghl_appointment_id`, `ghl_calendar_id`, `ghl_contact_id`, `outcome` (JSONB), `next_action`, `next_action_at`, `next_action_owner_id`, `next_action_notes`, `pre/post_call_qualification`, `cancelled_by`, `form_answers` (JSONB), `utm_*`, `conversation_id` | Un **turno** = un intento. No tiene columna de monto (ver `amount_closed`) |
| `sales_leads` | 1.252 | `name`, `email`, `phone`, `ghl_contact_id`, `client_id` | El lead como entidad; hila turnos. Únicos parciales por `(org, lower(email))` y `(org, ghl_contact_id)`. RLS select/insert/update por org, sin delete |
| `sales_follow_up_options` | 1 | `kind` (`next_action`/`qualification`), `slug`, `label`, `color`, `behavior` (`needs_date`/`closes_thread`/`neutral`), `sort_order`, `archived_at` | Valores propios de la org; los de fábrica viven en código (`lib/sales/follow-up-options.ts`). La migración sacó los CHECK de `closing_calls.next_action` y calificaciones |
| `fathom_calls` | 468 | `fathom_call_id`, `user_id` (quién grabó), `purpose` (`sales`/`delivery`/`team`), `counterparty`, `resolution_method`, `counterparty_lead_id`, `closing_call_id`, `appointment_match`, `client_id`, `status` (CHECK: `pending`/`processing`/`associated`/`unmatched`/`pending_review`/`ignored`), `processing_started_at`, `calendar_invitees`, `transcript` | Compartida con Clientes (1-1) |
| `call_analyses` | 19 | `fathom_call_id` (TEXT), `closer_id`, `closer_name`, `overall_score`, `section_scores`, `objections`, `sold`, `booked` | Análisis profundo de la llamada. **Sin FK a `fathom_calls`** (ver bugs) |
| `client_identities` | 0 | `client_id` xor `lead_id`, `identity_type` (`email`/`speaker_alias`/`name`/`phone`), `normalized_value`, `source` | Resolución de contraparte. Única por `(org, type, normalized_value)`. **Nunca se sembró** |
| `team_member_integrations` | 8 | `user_id`, `integration_type` (`fathom`/`calendly`), `encrypted_api_key`, `webhook_token`, `webhook_secret`, `status`, `last_event_at`, `last_error` | Keys de Fathom por miembro y Calendly por closer |
| `zernio_conversation_analysis` | 12 | `(organization_id, conversation_id)` único, `ai_tag`, `ai_status`, `ai_qualification`, `ai_ghosting_risk`, `agenda_sent`, `is_scheduled`, `suggested_next_message` | Único dato del inbox Zernio que se persiste |
| `client_payments` | 7 | `client_id`, `amount`, `payment_date`, `installment_number`, `storage_path` (opcional), `payment_received_from`, `payment_destination_platform_id` | Cobros cargados a mano. Comprobantes en bucket `client-payment-receipts` (no creado por migración) |
| `metrics_snapshots` | 1 | `category = 'sales'`, `period_start`, `metrics` (JSONB) | Métricas importadas de Excel; fallback de `/sales/metrics` |
| `calendly_integrations` | 3 | `access_token`, `refresh_token`, `webhook_signing_key` | Tokens en texto plano (RLS cerrado, sólo service role) |
| `fathom_integrations` | 7 | `api_key`, `webhook_secret`, `connected_at`, `last_sync_at` | Key de la org, en texto plano |
| `fathom_sync_fallas` | 0 (nueva) | `organization_id`, `user_id` (nulo = conexión de la org), `fathom_call_id`, `fathom_created_at`, `primera_falla_at`, `intentos`, `descartada_at` | Reuniones que la sync no pudo guardar; decide cuándo dejar de reintentar (SCRUM-36). Sólo service role |

**Legacy (tablas vivas en la base, sin uso real):** `conversations` (0 filas), `manychat_events` (0),
`instagram_threads`/`instagram_messages` (0), `manychat_integrations` (4), `unipile_integrations` (6),
`instagram_integrations` (1). `closing_calls.conversation_id` tiene FK a `conversations`: borrar la
tabla exige soltar esa FK.

**`closing_calls.status`** mezcla tres ejes; se lee **sólo** con los predicados de
`lib/closing/call-status.ts` (`callHappened`, `callWasAttended`, `callIsSale`, `needsDisposition`,
`acceptsManualOutcome`, `syncMayOverwriteStatus`):

| Estado | Significado |
|---|---|
| `scheduled` | Agendado, o ya pasó y nadie cargó el resultado |
| `attended` | Asistió, sin resultado (`showed` de GHL) |
| `closed` / `not_closed` | Asistió y compró / no compró |
| `no_show` | No vino a una llamada que existió |
| `cancelled` | La llamada nunca ocurrió |

**Privacidad de `fathom_calls`** (migración `20260903100000_fathom_member_keys.sql`): el SELECT deja
ver una fila si `client_id is not null`, o `user_id = auth.uid()`, o `user_id is null`. Una grabación
de un miembro vinculada **sólo a un lead** (`counterparty_lead_id`) sigue siendo privada de quien la
grabó, aunque el comentario de la migración dice lo contrario.

Migraciones del área (todas aplicadas en producción): `20260521300000_closing_calls`,
`20260805220000_multi_closer`, `20260824200000_closing_calls_utm`,
`20260901120000_closing_calls_disposition`, `20260901180000_fathom_classification`,
`20260901210000_sales_calls_only`, `20260902100000_sales_leads`,
`20260903100000_fathom_member_keys`, `20260903120000_sales_follow_up_options`,
`20260915120000_fathom_desde_la_conexion`, `20260715100000_client_payments`,
`20260716100000_client_payment_tracking`, `20260906101000_comprobante_opcional`,
`20260710120000_zernio_conversation_analysis`.

## Cómo fluye el dato

### Turnos → leads → seguimiento

```
Calendly org   ── webhook /api/integrations/calendly/webhook ─┐
               ── cron /api/cron/calendly-sync (hora) ─────────┼─ lib/calendly/sync-events.ts ─┐
Calendly closer── cron /api/cron/calendly-sync-closers (hora) ─── lib/calendly/closer-sync.ts ─┤ (sin lead_id)
GHL            ── cron /api/cron/ghl-sync (hora) ──────────────── lib/ghl/sync-appointments.ts ┤
                                                                                              ▼
                                   resolveLeadId (lib/sales/resolve-lead.ts) → sales_leads ← closing_calls.lead_id
                                                                                              ▼
 /sales/closing#seguimiento ← listLeadsTableAction (app/sales/lead-actions.ts)
                              lee sales_leads + closing_calls embebidos (fetchAllRows, techo 2.000)
                              deriva el estado con buildLeadThread (lib/sales/lead-thread.ts)
```

- **Identidad del lead:** mail (case-insensitive), con `ghl_contact_id` de respaldo. Nunca el nombre.
  Un turno sin mail ni contacto GHL queda sin `lead_id` y **no aparece en la tabla de seguimiento**.
- **Estado del hilo** (derivado, no persistido; `buildLeadThread`), en este orden: `won` (algún
  intento es venta) > `lost` > `follow_up_due` > `pending_outcome` > `scheduled` >
  `follow_up_planned` > `stalled` (nada de lo anterior, o sin intentos). Accionables:
  `follow_up_due`, `pending_outcome`, `stalled`. `lost` sólo si el intento **más
  reciente** tiene un próximo paso con `behavior = closes_thread`.
- **Ediciones del closer** (`setNextActionAction`, `setNextActionOwnerAction`,
  `setNextActionNotesAction`, `setLeadQualificationAction`, `saveCallFollowUpAction`) escriben sobre
  el turno accionable (`targetAttemptId`) con el cliente de sesión (RLS).
- **Los syncs no pisan lo manual:** todo cambio de estado hecho por una persona pasa por
  `updateClosingCallAction` → `patchToClosingUpdateRow` (`lib/closing/mapper.ts`), que marca
  `status_source = 'manual'` (las ediciones de seguimiento de `lead-actions.ts` no tocan `status`); los syncs consultan
  `syncMayOverwriteStatus`.
- **Errores como valor (SCRUM-504):** todas las acciones de `app/sales` que leen o escriben la base
  devuelven `MutationResult` (incluidas Cobros y el recorrido del lead); la única que no es
  `getMockCallAnalysisKeysAction`, que no tiene llamadores ni lee la base. En el seguimiento (`lead-actions.ts`, `follow-up-options-actions.ts`) la sesión y la validación
  (valor que no está en el catálogo, archivado, sin fecha, nombre vacío o repetido) vuelven con su
  motivo; un error de la base se registra, va a Sentry y vuelve con el texto fijo (antes llegaba el
  mensaje crudo de la base). Si `listLeadsTableAction` falla, `/sales/closing` se dibuja igual y la
  pestaña de seguimiento muestra el motivo (antes mostraba la tabla vacía); una edición rechazada
  vuelve atrás la fila y avisa. El catálogo vive en `lib/sales/catalogo-de-seguimiento.ts`: para
  validar una escritura se lee con `leerCatalogoParaEscribir`, que lanza `FallaDeLaBase` si la lectura
  falla (texto fijo y Sentry; con los valores de fábrica, un valor propio válido se rechazaría como
  "no existe en el catálogo"); para mostrar, `leerCatalogoConRespaldo` cae en los valores de fábrica
  y registra la falla. Las lecturas de closers (`getCloserMetricsAction` y las sin llamador) registran los errores
  de la base que antes ignoraban: el ranking de closers (escondido) ya no se ve como "sin closers"
  cuando falla ([CLOSER-AMOUNT-CLOSED]).
- **Recorrido del lead** (`lib/sales/lead-journey.ts`, SCRUM-504): devuelve `{ pasos, faltan }`. La
  conversación es la lectura principal: si falla, `FallaDeLaBase` y la acción devuelve el texto fijo.
  La llamada, la venta, el contenido, los comentarios de Zernio, los CTA de ManyChat y la atribución por
  UTM son fuentes opcionales (`fuenteOpcional`): si una falla, se registra una vez en Sentry
  (`[getLeadJourney] <fuente>`), se nombra en `faltan` y el resto llega igual; el panel muestra los pasos
  y "Faltan datos del recorrido: no se pudieron leer …". Zernio sin conectar no es falla. Marketing
  (`closed-buyer-journeys.ts`) usa sólo los pasos.
- **Sync manual del Calendly de un closer** (botón "Sincronizar ahora" en Configuración y el del ranking
  de closers): `syncCloserCalendlyAction` devuelve `MutationResult` (SCRUM-504). Vuelven con un motivo
  claro: sin integración (sin fila o sin token), conexión vencida o revocada (el refresh responde 400
  `invalid_grant` o la API de eventos 401: hay que desconectar y volver a conectar; un 403 no está
  verificado y se trata como falla), conexión sin el
  usuario de Calendly y límite de consultas (429). Lo distingue `sincronizarEventosDelCloser`
  (`lib/calendly/closer-sync.ts`), que lanza `RechazoDeCalendly`; cualquier otra falla (la red, la base,
  un 5xx de Calendly) se registra, va a Sentry y vuelve con el texto fijo. El cron usa
  `syncCloserCalendlyEvents`, que no lanza y anota el mismo `reason` que antes. `disconnectMyCalendlyAction`
  también devuelve `MutationResult` y ya no avisa "desconectado" si el borrado falla. Si al renovar el
  token no se puede guardar el nuevo, es una falla de la base (Calendly rota el refresh token). El
  estado (`getMyCalendlyIntegrationAction`) devuelve `MutationResult`: una falla de la base ya no se
  muestra como "No conectado".

### Resultado de un turno (cliente)

`markCallClosed` / `markCallNotClosed` / `markCallNoShow` viven en
`providers/platform-data-provider.tsx`, no en el servidor. `markCallClosed` encadena desde el
navegador: `updateClosingCallAction` → tag en `conversations` (legacy, no-op hoy) →
`createClientAction` → `linkLeadToClientAction` → `recordClientPaymentAction` si hay comprobante.
No es atómico: si falla a mitad, queda el turno cerrado sin cliente o el cliente sin pago.
`updateClosingCallAction` y `createClientAction` devuelven sus errores esperables como valor
(`MutationResult`, SCRUM-497); el provider los pasa por `datoDeLaMutacion` (`lib/client/correr-accion.ts`),
que lanza en el navegador con el motivo (así llega entero en producción) o con el texto fijo si la acción
lanzó algo inesperado. Una llamada que no existe o es de otra org vuelve como "No se encontró la llamada.
Puede que la hayan eliminado."; un error de la base que no se conoce se registra, va a Sentry y vuelve
con el texto fijo.

### Fathom → Llamadas

```
Key org:     cron /api/integrations/fathom/sync (hora) ─┐
Key miembro: webhook /api/integrations/fathom/webhook/[token] ─┼→ fathom_calls (status pending)
             (crudo primero en fathom_webhook_events; user_id del miembro, ingest_source 'webhook')
             + cron horario /api/integrations/fathom/sync y botón "Sincronizar mis llamadas" (lib/fathom/member-sync.ts) ┤
Legacy:      webhook /api/integrations/fathom/webhook (409 si la firma sirve a >1 org) ┘
                         │
cron /api/integrations/fathom/process (10 min, espera 30 min por llamada) → processSingleFathomCall
   1. toma atómica pending→processing (+ reclaimStuckFathomCalls rescata trabadas >15 min)
   2. resolveSalesCall: cruce mail invitado ↔ closing_calls.lead_email en ventana (match-appointment.ts)
   3. classifyRecording → resolveCounterparty: purpose/counterparty/resolution_method
   4. si hay client_id con confianza ≥0.75 → finalizeAssociatedCall
        → timeline + problemas del cliente + análisis profundo (QStash /api/queue/process-fathom-analysis,
          o inline si no hay QStash) → call_analyses → RAG
      si no → asociación por título (associate.ts): unmatched / pending_review / finalize

/sales/llamadas → getSalesCallsAction: fathom_calls (purpose = 'sales', últimas 100)
                  + call_analyses por fathom_call_id in (…) → attachCallAnalyses (lib/fathom/sales-calls.ts)
```

**Sync horaria por miembro** (`lib/fathom/member-sync.ts`, SCRUM-448, 2026-10-03): el cron
`/api/integrations/fathom/sync`, después de la key de cada org, trae las grabaciones de cada miembro conectado
desde la sección por miembro (filas con `webhook_token`, no `revoked`) con su propia key, desde la conexión en
adelante, con el mismo upsert y `user_id` del miembro. El botón "Sincronizar mis llamadas" usa la misma función.
El cursor (`last_sync_at`) sigue la misma regla que el de la org (ver "Cursor de la sync" más abajo). Si la key falla, la fila queda en
`status = 'error'` con `last_error` y va a Sentry. **Por qué:** en la prueba real (2026-10-03) Fathom no disparó el
webhook aunque la grabación ya estaba lista; con el cron la grabación entra igual, como mucho una hora después.
Las filas que crea la conexión de la organización (`connectFathomAction`, sin `webhook_token`) no se sincronizan
acá: llevan la misma key que el negocio y harían privadas de quien conectó todas las llamadas.

**Webhook por miembro** (`app/api/integrations/fathom/webhook/[token]/route.ts`, SCRUM-37):

1. El token de la URL identifica **una** fila de `team_member_integrations`; la firma se verifica
   contra su `webhook_secret` con el esquema de la doc de Fathom (headers `webhook-id`,
   `webhook-timestamp`, `webhook-signature`; HMAC-SHA256 base64 de `id.timestamp.cuerpo`, secreto
   `whsec_` decodificado, tolerancia 5 min) — `lib/fathom/webhook-signature.ts`.
2. El cuerpo crudo se guarda en `fathom_webhook_events` **antes** de interpretarlo. `webhook-id`
   es único por integración: un reintento de una entrega ya procesada responde 200 sin repetir.
3. `leerReunionDelWebhook` (`lib/fathom/webhook-meeting.ts`) mapea el cuerpo con el mismo parser
   que la sync (`mapFathomMeeting`), en la raíz o bajo `meeting`/`recording`/`data`. Sin id de
   grabación, el evento queda con `error` y se responde 200 (no se inventa una llamada).
4. `upsertFathomCallFromMeeting(..., { userId, ingestSource: "webhook" })`: el mismo guardado que
   la sync, con `title`, `calendar_invitees`, transcript, `processed_after` (+30 min), el dueño de
   la grabación y `ingest_source = 'webhook'`. Si falla responde 500 y deja el evento sin
   `processed_at`, así el reintento de Fathom lo vuelve a intentar.

- **Unión llamada ↔ análisis:** `call_analyses.fathom_call_id` guarda el ID de la grabación en Fathom
  (el mismo texto que `fathom_calls.fathom_call_id`), no `fathom_calls.id`, y no hay FK entre las
  tablas: PostgREST no puede embeberlas, así que la pantalla hace dos lecturas y las une por
  organización + ID de grabación. Si falla la lectura de llamadas, la pantalla muestra un aviso (el
  error va a los logs); si falla la de análisis, muestra las llamadas sin análisis y lo loguea.

- **Ventana de sync:** desde `last_sync_at`, pero nunca antes de `connected_at` (el historial no se trae)
  (`lib/fathom/sync-window.ts`). Excepción: si no hay ninguna de las dos fechas, trae todo.
- **Cursor de la sync** (`lib/fathom/cursor.ts`, SCRUM-36), igual para la org y para el miembro. `last_sync_at`
  ya no es la hora del servidor: es el `created_at` de Fathom de lo leído y guardado, menos un solape de 2 h.
  - **Solape de 2 h:** cubre las reuniones que Fathom lista un rato después de su `created_at` (el transcript de
    una llamada larga tarda en estar listo; el retraso no está documentado). Volver a leer cuesta poco: el
    guardado no vuelve a mandar a análisis una llamada ya procesada (ver el último punto).
  - Una grabación que falla al guardarse frena el cursor en su `created_at`: la corrida siguiente la vuelve a pedir.
    Cada falla se anota en `fathom_sync_fallas` (una fila por reunión y por conexión, con la primera falla y los
    intentos; `lib/fathom/fallas-de-sync.ts`). Se deja de reintentar cuando pasaron **24 h desde su primera
    falla y falló por lo menos 6 veces**: ahí se marca `descartada_at`, se reporta a Sentry (`reportarFalla`, con
    el `recording_id`, su `created_at` y cómo recuperarla) y la sync sigue sin ella. Se mide desde la primera
    falla y no desde el `created_at` porque, después de una caída, todo lo atrasado ya es "viejo" y se habría
    descartado sin reintentos. Cuando la reunión se guarda, su fila se borra. Si la tabla no se puede leer o
    escribir, la reunión frena el cursor y no se descarta. Una que falla sin ninguna fecha no puede frenar el
    cursor: se reporta.
  - Una descartada **sigue descartada** aunque vuelva a llegar (cae en el solape, o el cursor no pudo pasarla en
    la corrida del descarte): no suma intentos, no frena el cursor y no se reporta otra vez. Para reintentarla
    hay que borrar su fila (ver "Cómo recuperar una reunión descartada"); así la sync no tiene que adivinar si
    volvió porque alguien rebobinó el cursor.
  - Limpieza: en cada corrida se borran las filas de esa conexión sin fallas nuevas en **30 días**
    (`limpiarFallasViejas`). Cubre las que ya no se vuelven a leer (una falla sin fecha, una reunión borrada en
    Fathom mientras fallaba) y las descartadas, que se pueden recuperar durante ese plazo. Una reunión que
    sigue frenando el cursor se relee en cada corrida y renueva su `ultima_falla_at`, así que no vence.
  - `listFathomMeetings` avisa si se cortó en el tope de páginas (20 la org, 5 el miembro). Fathom devuelve primero
    lo más nuevo, así que lo que queda sin leer es lo más viejo: el cursor no pasa de ahí. Si llegó en orden
    ascendente, avanza hasta lo último leído.
  - Si el cursor quedó atrasado más de 12 h, la lectura es por tramos cerrados de 6 h desde el más viejo
    (`lib/fathom/leer-ventana.ts`), como mucho **4 tramos por corrida** (cada pedido con transcript es "pesado"
    para Fathom: 30 por minuto, que puede bajar a 5) y con el mismo presupuesto de páginas. Cada tramo leído
    entero hace avanzar el cursor aunque no haya traído nada: una caída de varios días se pone al día sola, a
    razón de 24 h por corrida. Si un solo tramo tiene más reuniones que el presupuesto (más de 200 en 6 h para la
    org, 50 para un miembro), el cursor no puede avanzar y se reporta a Sentry en cada corrida.
    Sólo ese corte (por el tope de páginas) se reporta como sync trabada: la lectura dice por qué se cortó
    (`motivoDeCorte`: tope, plazo del cron, límite de tramos o Fathom) y los otros cortes siguen solos en la
    corrida siguiente.
  - Si Fathom corta a mitad (429 o una falla de su lado) después de algún tramo completo, lo leído se guarda y el
    cursor avanza hasta el último tramo completo. Si el 429 trae un `Retry-After` de hasta 10 s, se espera y se
    reintenta el mismo tramo una vez por conexión, si entra antes del plazo del cron (ver más abajo). Sin ningún tramo completo, la falla se propaga como siempre.
  - Si no se guardó ni falló nada, el cursor queda donde estaba; nunca retrocede.
  - Si `created_at` falta o no se puede leer, se usa el inicio de la grabación, que nunca es posterior.
  - Volver a traer una llamada ya guardada (por el solape o por un reintento) actualiza sus datos de Fathom pero
    no vuelve a pasarla por el matcher por título si ya se procesó (`debeReasociarAlSincronizar` en
    `lib/fathom/sync.ts`): el matcher la devolvía a `pending` y se pagaba de nuevo el análisis, con entradas
    duplicadas en el timeline y en problemas del cliente.
  - **Plazo del cron** (`lib/fathom/plazo-del-cron.ts`): el cron tiene 60 s para todas las conexiones, en serie.
    La corrida tiene un plazo de 45 s desde el inicio: pasado, no se arranca ninguna conexión más (quedan como
    `postergadas`/`postergados` en la respuesta), no se pide otra página ni otro tramo (la lectura vuelve
    cortada y el cursor no pasa de lo que faltó leer) y un `Retry-After` sólo se espera si la espera más 8 s
    de margen entran antes del plazo. Los 15 s restantes son para terminar la página en curso y escribir los
    cursores. Para que no queden siempre las mismas afuera, las tandas se alternan cada hora (en las corridas
    impares van primero los miembros) y dentro de cada tanda el orden rota con la mitad del número de corrida
    (`ordenDeLaTanda`). Rotar con el mismo número que la alternancia hacía que, con una cantidad par de
    conexiones, arrancaran primero siempre las de índice par; así, cada conexión arranca primera de toda la
    corrida una vez cada 2 × n horas. La sincronización manual (botones) no tiene plazo.
  - **Cómo recuperar una reunión descartada** (o una que el bug anterior a SCRUM-36 salteó): arregla primero la
    causa (el error del guardado está en los logs `[Fathom:sync]` y en Sentry). Después, en el SQL Editor de
    Supabase, borra su fila de `fathom_sync_fallas` (si no, sigue descartada) y rebobina el cursor de esa
    conexión a un poco antes del `created_at` de la reunión. Las descartadas se guardan 30 días.

    ```sql
    -- Conexión de la organización
    update public.fathom_integrations
       set last_sync_at = timestamptz '2026-10-03 09:00:00+00'  -- un rato antes del created_at
     where organization_id = '<org>';

    -- Conexión de un miembro
    update public.team_member_integrations
       set last_sync_at = timestamptz '2026-10-03 09:00:00+00'
     where organization_id = '<org>' and user_id = '<miembro>' and integration_type = 'fathom';

    -- Las descartadas de una org, con su created_at (user_id nulo = la conexión de la org)
    select id, user_id, fathom_call_id, fathom_created_at, intentos, primera_falla_at, descartada_at
      from public.fathom_sync_fallas
     where organization_id = '<org>' and descartada_at is not null
     order by fathom_created_at;

    -- Borrar la fila de la que se quiere recuperar (por su id, de la consulta anterior)
    delete from public.fathom_sync_fallas
     where organization_id = '<org>' and id = '<id>';
    ```

    El cursor nunca baja de `connected_at`. La corrida siguiente relee desde ahí por tramos (las ya guardadas
    no se vuelven a analizar); si la reunión vuelve a fallar, su cuenta de intentos arranca de cero.
- **Keys por miembro:** `app/fathom/member-actions.ts` valida la key, la cifra
  (`lib/fathom/member-key.ts`, atada a la org y al miembro; `ENCRYPTION_MASTER_KEY` obligatoria) y crea
  el webhook por API (`lib/fathom/webhooks.ts`). Conectar Fathom para la org (`connectFathomAction`)
  también registra al que conecta como miembro, con la key cifrada de la misma forma (antes la guardaba en claro).
  `syncMemberFathomAction` (botón "Sincronizar mis llamadas" en Integraciones) trae las reuniones del miembro con la misma
  ventana y el mismo upsert que el cron de la org (`upsertFathomCallFromMeeting`).

### Bandeja (Zernio)

Todo en vivo desde `app/integrations/zernio/actions.ts`: `listZernioConversationsAction` (fan-out
por cuenta conectada), `getZernioMessagesAction`, `sendZernioMessageAction`. El análisis IA es
**manual** (botón en el panel lateral): `analyzeZernioConversationAction` manda los últimos 40
mensajes a Haiku (`task: conversation_scoring`) junto con el SOP de agendamiento si existe, hace
upsert en `zernio_conversation_analysis` y registra lead magnets si detecta sus URLs en mensajes
salientes (`registerLeadMagnetFromDm`).

### Métricas

`getSalesPerformanceMetricsAction` (`app/sales/metrics-actions.ts`) cuenta `closing_calls` del rango
(show rate = asistidas / **todas** las agendadas, incluidas canceladas; close rate = cerradas /
asistidas) y leads/agendas/nurturing desde `conversations` (vacía → siempre 0). Si todo da 0 y hay
`metrics_snapshots`, la pantalla muestra el snapshot **más reciente** sin importar el rango elegido.
El ranking de equipo sale de `call_analyses` (`getTeamRankingAction`) y las objeciones de
`lib/metrics/frequent-objections.ts`.

Las lecturas de métricas (`getSalesPerformanceMetricsAction`, `getSalesMetricsSnapshotsAction`,
`getFrequentObjectionsAction`, que la página usa en vez de leer la base directo) y de análisis de llamadas (`getTeamRankingAction`, `getCloserEvolutionAction`, `getTeamAverageEvolutionAction`)
devuelven `MutationResult` (SCRUM-504): la sesión que falta vuelve con su motivo; un error de la base
(salvo la tabla que falta en las de `call_analyses`, que se lee como "sin datos") se registra, va a Sentry
y vuelve con el texto fijo. `/sales/metrics` (server component) se dibuja igual y avisa el motivo de las
métricas importadas y de las objeciones; la pantalla avisa también el de las de rendimiento, y el rendimiento del equipo y la
evolución del closer (ficha del cliente) muestran el motivo en su estado de error (`leerConMotivo`,
`lib/client/correr-accion.ts`, junto a `correrAccion` y `correrMutacion`). `updateCloserCommissionAction` (sin llamadores) también devuelve
`MutationResult`: porcentaje fuera de 0-100, closer de otra org o sin permiso y el `42501` del trigger de
perfiles vuelven como motivo.

### Cobros

Lee clientes del provider y `getClientsTableEnrichmentAction` + `listPlansAction`. El adeudado se
calcula con `computeOutstandingBalance` / `computeRemainingProgramDays` (`lib/clients/plan-utils.ts`).
Registrar una cuota: `prepareClientPaymentReceiptUploadAction` (URL firmada al bucket, path
`<org>/<client>/<uuid>-<nombre>`) → subida directa → `recordClientPaymentAction` o
`addInstallmentPaymentAction`, que llaman a la función `registrar_pago_de_cliente`
(`20261008150000`, SCRUM-504): inserta el pago y marca la cuota en `clients.installments` en una sola
transacción, con el cliente bloqueado, la RLS y la org de la sesión; si la cuota no se puede marcar no
queda el pago. Cada formulario de la ficha genera una clave de idempotencia al abrirse: si la respuesta
se pierde y se vuelve a guardar, la función devuelve el pago ya registrado (índice único por org). El
cierre de venta desde Closing todavía no pasa una clave (`[CLOSING-CIERRE-ATOMICO]`).

Las 6 acciones de `app/sales/payment-actions.ts` devuelven `MutationResult` (SCRUM-504): validación,
sesión, cliente de otra org, sin plan de cuotas, sin cuotas pendientes, archivo no permitido, comprobante
inexistente y una ruta de comprobante que no es de la org vuelven con su motivo; un error de la base o del
Storage se registra, va a Sentry y vuelve con el texto fijo (antes llegaba el mensaje crudo). Las lecturas
de pagos (`lib/sales/pagos.ts`, que usan también Finanzas, Clientes y la cuota) ya no devuelven `[]` ante
una falla: Cobros (`getClientsTableEnrichmentAction`), la ficha de pagos, Finanzas y el Panel avisan que
lo cobrado no está al día en vez de mostrar todo adeudado. En Finanzas, si sólo falla la lectura de
pagos, la configuración (gastos, suscripciones, equipo y plataformas) llega igual y las secciones de
plataformas avisan que lo recibido no está al día. Si la primera lectura de la ficha falló y después se
lee bien, el error se va; con los pagos sin leer, el botón dice "Registrar la próxima cuota" (sin un
número calculado sobre una lista vacía).

## Integraciones externas

| Proveedor | Estado | Qué se lee/escribe | Cliente / entrada | Sin conexión |
|---|---|---|---|---|
| **Zernio** | Vigente | DMs y envío en vivo | `lib/zernio/client.ts` | Bandeja vacía con CTA a Integraciones |
| **Calendly (org)** | Vigente | Turnos y cancelaciones → `closing_calls` | OAuth `/api/integrations/calendly/oauth/{start,callback}`; `lib/calendly/*` | Closing sólo con GHL o manual |
| **Calendly (closer)** | Vigente | Turnos del closer con `closer_id` | `/api/integrations/calendly/closer/*`, `lib/calendly/closer-sync.ts` | Sin atribución por closer |
| **GoHighLevel** | Vigente | Turnos por calendario seleccionado → `closing_calls` | `lib/ghl/sync-appointments.ts` (documentado en el área de Integraciones/Embudos) | Idem |
| **Fathom** | Vigente | Grabaciones, transcripción, invitados | `lib/fathom/api.ts`, `sync.ts`, `webhooks.ts` | Llamadas vacía |
| **Anthropic** | Vigente | Análisis de DM (Haiku), análisis profundo (Sonnet), timeline | `lib/ai/anthropic.ts` | Sin análisis |
| **QStash** | Opcional | Cola del análisis profundo | `lib/queue/qstash-client.ts` | Corre inline (puede cortarse por timeout) |
| **ManyChat** | Legacy listado | DMs → `conversations` + scoring | `app/api/integrations/manychat/webhook/[token]`, `lib/manychat/*` | — |
| **Unipile** | Legacy no listado | DMs IG/WA → `conversations` | `/api/webhooks/unipile`, `/api/integrations/unipile/*`, `lib/unipile/*` | 503 sin `UNIPILE_WEBHOOK_SECRET` |
| **Instagram Graph** | Legacy no listado | DMs → `conversations` (poll 5 min) | `/api/integrations/instagram/poll`, `/api/webhooks/instagram/messages`, `lib/instagram/*` | Cron sigue agendado |

## Legacy: qué se puede borrar

El inbox pasó a Zernio y `SalesInboxLayout` sólo renderiza `ZernioInboxPanel`. `conversations` tiene
**0 filas** en producción. Lo que sigue en el código:

| Pieza | Estado | Qué la mantiene viva |
|---|---|---|
| `SalesInboxClassic` en `components/sales/sales-inbox-layout.tsx` | Función no exportada, código muerto | Nada |
| `conversation-list/thread/analysis`, `conversation-status/tag/source-badge`, `lead-avatar`, `lead-qualification-badge` | Sólo los usa `SalesInboxClassic` (y `conversation-tag-badge` el design-system preview) | `components/sales/index.ts` los re-exporta |
| `conversation-tag-select.tsx`, `sales-metrics-page-content.tsx`, `sales-metrics-overview.tsx`, `sales-performance-metrics-section.tsx`, `components/closing/lead-follow-up-panel.tsx` | Sin importadores vivos (`sales-metrics-overview` y `sales-performance-metrics-section` sólo los importa `sales-metrics-page-content`, que nadie importa; `index.ts` re-exporta `SalesMetricsOverview`) | Nada |
| `app/conversations/actions.ts` | Vivo **por el provider**: `PlatformDataProvider` carga `listConversationsAction` y abre un canal Realtime en **cada** pantalla de la plataforma | `providers/platform-data-provider.tsx`, `sales-funnel-strip.tsx`, `use-sales-metrics.ts`, `syncConversationTagForCall` |
| `lib/conversations/repair-links.ts` | Se ejecuta (y escribe) en cada `listClosingCallsAction` | `app/closing/actions.ts` |
| ManyChat (`lib/manychat`, `app/manychat`, webhook, reanalyze, 4 componentes de integración) | **Todavía `listed: true`** en `lib/integrations/registry.ts`, escribe en una tabla que ninguna pantalla muestra | Registro de integraciones |
| Unipile (`lib/unipile`, `app/unipile`, 6 rutas API) | `listed: false`; `app/unipile/actions.ts` sin uso | Webhooks registrados en Unipile |
| Instagram DMs (`lib/instagram/poll-conversations.ts`, `process-message.ts`, webhook, cron `*/5`) | `listed: false`; `app/instagram/actions.ts` sin uso; crons en `vercel.json` | `vercel.json` |
| `lib/sales/upsert-inbound-conversation.ts`, `unipile-inbox-filter.ts`, `lead-name.ts`, `getLeadJourney` (rama no-Zernio de `lib/sales/lead-journey.ts`) | Sólo alimentan `conversations` | Los tres canales legacy |
| `app/api/integrations/calendly/sync` | Responde 410 | Nada |
| Server actions sin uso: `getMockCallAnalysisKeysAction` (`app/sales/actions.ts`), `getCloserCallsAction`, `updateCloserCommissionAction`, `getClosersWithCalendlyStatusAction` (`closer-actions.ts`), `getLeadThreadAction` (`lead-actions.ts`), `getConversationIdByExternalRef` (`getCallAnalysesAction` se borró en SCRUM-504) | Endpoints expuestos sin llamador; `updateCloserCommissionAction` no deja a un miembro fijar su comisión (la policy de UPDATE de `profiles` y el trigger `protect_profile_columns` sólo dejan a founder/admin) | Nada |

Orden sugerido: (1) sacar `conversations` del provider y de métricas/embudo, (2) deslistar ManyChat,
(3) quitar crons de Instagram, (4) borrar código, (5) migración que suelte la FK
`closing_calls.conversation_id` y las tablas. Son ~7.600 líneas.

## Reglas de negocio y decisiones no obvias

- **La identidad del lead es el mail, nunca el nombre.** Los nombres vienen con emojis y dobles
  espacios; fusionar por nombre ensucia hilos de forma irreversible (`lib/sales/resolve-lead.ts`).
- **El estado del lead se deriva, no se guarda.** Guardarlo haría mentir la tabla cuando cambian
  los turnos. Si no escala, derivarlo en SQL (vista/función), no persistirlo.
- **No se infieren reagendas.** El hilo muestra intentos en orden; la reagenda la declara el closer.
- **Un "perdido" viejo no mata el hilo:** sólo cuenta si es el intento más reciente.
- **No compares estados de turno con strings:** usá `lib/closing/call-status.ts`. `attended` acepta
  resultado manual; `cancelled` no es `no_show`.
- **Lo manual gana a los syncs** (`status_source`). Filas previas a la Fase 0 quedaron en `sync`.
- **Valores de seguimiento propios:** preguntá por `behavior` (`closesThread`, `needsDate`), nunca
  compares contra `"lost"`. Archivar no blanquea el dato en filas existentes.
- **Fecha por defecto:** un próximo paso que pide fecha sin fecha se guarda a pasado mañana (deliberado),
  contado desde el día local de quien lo carga (`fechaPropuestaDelProximoPaso` en
  `lib/sales/follow-up-options.ts`, la misma para el modal de resultado, el seguimiento del lead y la tabla).
- **`next_action_at` es `timestamptz` pero se elige una fecha, y la fecha es de la organización:** se propone
  (pasado mañana desde el hoy de la org), se guarda (ese día a las 12:00 de la zona de la org,
  `fechaAInstanteEnZona`), se muestra (`CampoFecha`, cajón y panel con `formatearFechaGuardada`) y vence en la
  zona de la org (`organizations.timezone`), así todos los miembros ven el mismo día estén donde estén. En el
  cliente la zona sale de `useZonaDeLaOrganizacion()` (la lee una vez el layout); el servidor la lee una vez por
  pedido para derivar el estado. El cobro del cierre (modal de pago) usa también el hoy de la org. Las filas que el seguimiento del lead guardó a medianoche UTC (antes de SCRUM-493) se leen con su día
  de UTC.
- **El rango de métricas de ventas se corta en días de la zona de la org** (`lib/sales/rango-de-metricas.ts`): "desde"
  empieza a las 00:00 de la org y "hasta" termina a las 23:59:59.999 de la org; el valor por defecto ("este mes"), los
  atajos y el tope son el hoy de la org. El agrupado por semanas de la misma pantalla sigue en `[FECHAS-UTC-RESTO]`.
- **El próximo paso vence por día, en la zona de la organización.** `buildLeadThread(intentos, ahora, zona)` lee
  `next_action_at` con `fechaDeValorGuardado` en `organizations.timezone`: lo que vence hoy es "Seguimiento
  agendado" todo el día y pasa a "Seguimiento vencido" al día siguiente. `listLeadsTableAction` lee la zona una vez
  por pedido; la tabla recalcula el estado en el navegador con la misma zona (la del provider). Los turnos
  (`scheduled_at`) sí son instantes.
- **Una grabación sólo se asigna a un cliente sin confirmación si el resolvedor es determinista**
  (mail o alias aprendido); los candidatos por nombre piden confirmación.
- **Sin participantes (`calendar_invitees` vacío) no se clasifica** — vacío es "no sabemos", no "no
  hay externos". Con participantes y ninguno externo → `team`.
- **Grabaciones de un miembro sin vincular son privadas de quien grabó** (decisión de Santiago).
- **Fathom trae desde la conexión, no el historial** (costo de IA por llamada).
- **Cobros vive en Ventas** porque continúa el cierre; quien no tiene `sales` no ve montos ni en
  Clientes (`useModuleAccess("sales")` en `clients-list.tsx` y `client-detail.tsx`).
- **El permiso de módulo es sólo de navegación:** ninguna server action del área verifica rol
  (`[PERMISOS-SERVER-ACTIONS]`).

## Limitaciones conocidas y deuda

Detalle y prioridad en [`PENDIENTES.md` § Ventas](../../PENDIENTES.md#ventas).

- **Tab Equipo de Closing siempre vacío** `[CLOSER-AMOUNT-CLOSED]`: `getCloserMetricsAction` pide
  `closing_calls.amount_closed`, que no existe.
- **Turnos del Calendly de closers sin `lead_id`** `[CALENDLY-CLOSER-SIN-LEAD]`: no entran al seguimiento.
- **Análisis profundo con criterio equivocado** `[FATHOM-DEEP-ANALISIS-ALCANCE]`: corre para toda
  llamada vinculada a cliente de ≥10 min (también 1-1 de entrega) y nunca para ventas con leads;
  `closer_name` queda null → el ranking agrupa todo en "Sin nombre".
- **Peldaño de cruce con agenda desconectado:** `processSingleFathomCall` pasa `calendarLeadId: null`;
  y el peldaño 5 del resolvedor marca `purpose = sales` a cualquier externo no resuelto.
- **Métricas de leads leen `conversations`** (0) `[EMBUDO-PANEL-DMS]`; show rate incluye canceladas.
- **Cierre no atómico, en el cliente** `[CLOSING-CIERRE-ATOMICO]`.
- Sync Calendly duplicada y superpuesta `[CALENDLY-CRONS-SUPERPUESTOS]`; `cancelled_by` siempre
  `unknown` `[LLAMADAS-CANCELED-BY]`; techo 2.000 leads `[SEGUIMIENTO-ESCALA]`.
- Seguridad: DMs de Zernio sin `wrapUntrustedContent` y análisis con mensajes enviados por el
  cliente `[ZERNIO-ANALISIS-UNTRUSTED]`; `clientId` sin validar contra la org en
  `associateFathomCallAction`; tokens de Calendly/Fathom org/ManyChat en texto plano.
- Emojis en JSX de la bandeja (`TAG_CONFIG` en `zernio-inbox-panel.tsx` y en `zernio-side-panel.tsx`), contra la regla de diseño.

## Tests

| Cubierto (Vitest, `apps/web`) | Qué |
|---|---|
| `lib/sales/__tests__/lead-thread.test.ts` | Derivación del estado del hilo |
| `lib/sales/__tests__/follow-up-options.test.ts` | Catálogo, `closesThread`, `needsDate`, slugs |
| `lib/closing/__tests__/call-status.test.ts` | Predicados de estado y `syncMayOverwriteStatus` |
| `lib/fathom/__tests__/{match-appointment,resolve-counterparty,seed-identities,crm-matches,sync-window,reclaim-stuck,share-link}.test.ts` | Cruce con turnos, resolvedor, siembra, alias, ventana, rescate, links compartidos |
| `lib/ghl/__tests__/appointment-status.test.ts` | Mapeo de estados GHL |
| `lib/unipile/__tests__/verify-secret.test.ts` | Secreto del webhook legacy |
| `lib/metrics/__tests__/build-sales-funnel-stages.test.ts` | Embudo del panel |

**Sin tests:** `lib/sales/resolve-lead.ts`, `lib/sales/lead-journey.ts` `[T-9]`, `lib/calendly/*`,
`lib/fathom/process-call.ts`, `app/sales/metrics-actions.ts`, el cierre del provider. **Sin e2e:**
`apps/web/e2e/` sólo cubre auth y holding; ninguna pantalla de Ventas.

## Archivos clave

1. `apps/web/lib/closing/call-status.ts` — vocabulario de estados del turno
2. `apps/web/lib/sales/lead-thread.ts` — derivación del estado del lead
3. `apps/web/lib/sales/resolve-lead.ts` — identidad del lead
4. `apps/web/app/sales/lead-actions.ts` — tabla de seguimiento y ediciones
5. `apps/web/lib/sales/follow-up-options.ts` + `app/sales/follow-up-options-actions.ts` — valores propios
6. `apps/web/components/closing/closing-overview.tsx` — pantalla de Closing
7. `apps/web/providers/platform-data-provider.tsx` — cierre/no-cierre de turnos (y carga legacy)
8. `apps/web/lib/calendly/sync-events.ts` y `closer-sync.ts` — ingesta de turnos
9. `apps/web/lib/fathom/process-call.ts` — pipeline de grabaciones
10. `apps/web/lib/fathom/match-appointment.ts` y `resolve-counterparty.ts` — reglas de cruce y contraparte
11. `apps/web/app/fathom/actions.ts`, `member-actions.ts`, `sales-call-actions.ts` — acciones de Fathom
12. `apps/web/app/integrations/zernio/actions.ts` — bandeja y análisis de DMs
13. `apps/web/app/sales/metrics-actions.ts` — métricas
14. `apps/web/app/sales/payment-actions.ts` + `components/sales/cobros-page.tsx` — cobros
15. `apps/web/lib/integrations/registry.ts` — qué integración de ventas está listada y cuál no

## Escondido para el release de octubre (SCRUM-490)

La pestaña Equipo de Closing (`#equipo` cae en Calendario; `[CLOSER-AMOUNT-CLOSED]`) y el recuadro "Vista previa"
de Fathom del drawer del turno (queda "Abrir en Fathom"). Banderas `closingEquipo` y `vistaPreviaFathomEnTurno` en
`apps/web/lib/release/escondido.ts`.

### Lectura de Closing (SCRUM-4, 2026-10-04)

`listClosingCallsAction` (`app/closing/actions.ts`) trae los turnos con `fetchAllRows` (páginas de 1.000,
orden `scheduled_at` y `id`) y filtra por la organización activa (`organization_id`). Antes cortaba en las
primeras 1.000 filas ordenadas de la más vieja a la más nueva, así que quedaban afuera los turnos recientes, y
un usuario de holding veía los turnos de todo el portfolio mezclados.

### Privacidad de las grabaciones de Fathom (SCRUM-157, 2026-10-04)

Policy de `fathom_calls` (`20261004000200_fathom_llamada_de_lead_es_de_la_org.sql`): una grabación vinculada a
un cliente, a un lead (`counterparty_lead_id`) o a un turno (`closing_call_id`) la ve toda la organización,
founder incluido. Sin vínculo, sólo quien la grabó (`user_id`); las viejas sin dueño, toda la org.


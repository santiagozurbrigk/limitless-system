# Operaciones y equipo

> Verificado contra el código el 2026-09-23 (commit 038caca). Backlog del área: `PENDIENTES.md` § Operaciones, Finanzas y Producto.
>
> Cubre: SOPs (incluido SOP desde video), Operaciones (overview e inputs semanales), Tablero de trabajo
> (tareas, sprints, tiempo, links y adjuntos) y Equipo (miembros, roles, invitaciones). Inteligencia,
> Reportes ejecutivos y Área del fundador cuelgan del mismo grupo de navegación pero tienen su propio doc.

## Qué es

Todo lo que el negocio usa para **operar por dentro**: el tablero donde el equipo carga y mueve su trabajo,
los procedimientos escritos (SOPs), el pulso semanal por departamento que alimenta a la IA, y la gestión de
quién está en la cuenta y qué puede ver. Lo usan el founder y el equipo interno; no hay nada acá que vea un
cliente final.

**Qué NO hace:** no es un gestor de proyectos con dependencias ni un timer en vivo (el tiempo se carga a mano
al cerrar la tarea). Las **tareas de cliente** que salen de una 1-1 viven en `client_tasks` (área Clientes);
sólo llegan al tablero si alguien las manda. ClickUp **no** sincroniza el tablero: es un importador de
clientes (ver "Integraciones externas").

## Pantallas y rutas

Rutas canónicas en `apps/web/routes/paths.ts` (`paths.platform.{operations,sops,workboard,team}`). El layout
`app/(platform)/layout.tsx` corta el render si el rol tiene el módulo en `none` (`lib/navigation/module-for-path.ts`):
`/operations*`, `/sops*` y `/product*` → módulo `operations`; `/workboard` → `workboard`; `/team` → `team`.

| Ruta | Archivo | Qué muestra | Datos |
|---|---|---|---|
| `/workboard` | `app/(platform)/workboard/page.tsx` → `components/workboard/workboard-shell.tsx` | Tres vistas (`FilterPills`): Kanban (`workboard-kanban.tsx`, 4 columnas), Calendario (`workboard-calendar.tsx`), Tiempo por persona (`workboard-time-report.tsx`). Header de sprint con filtro por área, retrospectiva, detalle de tarea editable con SOP/documentos/adjuntos | Reales. Mock sólo sin Supabase (`mocks/workboard-time.ts` en el reporte de tiempo) |
| `/operations/sops` | `app/(platform)/operations/sops/page.tsx` → `components/sops/sops-overview.tsx` | Biblioteca (`#biblioteca`) y creador (`#crear`, modos "texto" y "video"). Banner de SOPs sugeridos | Reales |
| `/sops` | redirect a `/operations/sops` (`lib/navigation/redirects.ts`, aplicado en `next.config.ts`) | `app/(platform)/sops/page.tsx` (la biblioteca sin sugerencias) existe pero es inalcanzable: el redirect corre antes | — |
| `/sops/[id]` | `app/(platform)/sops/[id]/page.tsx` | Detalle de solo lectura: objetivo + markdown con capturas | Reales |
| `/sops/create` | redirect a `/operations/sops#crear` | — | — |
| `/operations/overview` | `app/(platform)/operations/overview/page.tsx` → `components/operations/operations-overview.tsx` | Reporte semanal IA (resumen, riesgos, cuellos de botella, recomendaciones) si `status = 'ready'`; grilla de departamentos | Reales. Mock (`mocks/operations-overview.ts`) sólo sin Supabase |
| `/operations/inputs` | `app/(platform)/operations/inputs/page.tsx` | Dos tabs: "Por departamento" (formulario por depto + botón de generar reporte + historial) y "Input rápido". El founder arranca en la primera, el resto en la segunda | Reales |
| `/operations/weekly-inputs`, `/operations/team-inputs` | redirects a `/operations/inputs` | — | — |
| `/team` | `app/(platform)/team/page.tsx` → `components/team/team-overview.tsx` | Miembros (la tarifa por hora no tiene pantalla de carga: `[EQUIPO-TARIFA-SIN-UI]`), roles custom con grilla de 13 módulos, invitaciones pendientes | Reales. Sin Supabase: todo vacío |
| `/team/members`, `/team/roles` | redirects a `/team#miembros` / `#roles` | — | — |
| `/invite?token=` | `app/invite/page.tsx` (fuera de `(platform)`) | Aceptar una invitación de `team_invitations` con la sesión de la cuenta invitada; no crea cuentas (SCRUM-495) | Ver "Lo que ya no existe" |

**Navegación** (`lib/navigation/sidebar-modules.ts`): Tablero, SOPs y Equipo son ítems fijos. El grupo
"Operaciones" (Overview, Inputs, Inteligencia, Área del fundador) **sólo aparece con el add-on `operaciones`**
(`buildPlatformRootItems`). El add-on esconde el menú, no la ruta: `/operations/*` responde igual por URL.

## Modelo de datos

| Tabla | Columnas clave | Notas |
|---|---|---|
| `workboard_tasks` | `status` (`todo/in_progress/review/done`), `area` (`marketing/ventas/operaciones/finanzas/clientes/general`), `priority`, `position`, `assignee_id`, `assignee_ids uuid[]`, `due_date`, `tags[]`, `sprint_id`, `launch_id`, `sop_id`, `estimated_minutes`, `actual_minutes`, `time_entries` JSONB, `completed_by`, `completed_at` | `time_entries`: `[{logged_at, minutes, note, logged_by}]`. `timer_started_at`/`timer_running` existen pero ningún flujo los prende |
| `sprints` | `name`, `goal`, `area_focus` (`ventas/marketing/operaciones/delivery/producto/general`), `start_date`, `end_date`, `status` (`planning/active/completed`), `completion_rate` | Un solo `active` por org (lo impone la action, no la base) |
| `workboard_task_attachments` | `task_id`, `storage_path`, `file_name`, `mime_type`, `file_size` | Bucket `workboard-task-attachments` (25 MB, pdf/office/imagen) |
| `workboard_task_documents` | `(task_id, document_id)` único | Link a `business_context_documents` |
| vista `workboard_time_by_member` | `security_invoker`; costo = `actual_minutes * profiles.hourly_rate / 60` | Agrupa por `assignee_id` (el primer responsable) |
| `sops` | `title`, `goal`, `department`, `content` (markdown), `status` (`draft/active/outdated`), `generated_by_ai`, `ai_model`, `version`, `tags` | |
| `sop_versions` | `sop_id`, `version`, `content`, `changed_by`, `change_note` | |
| `sop_attachments` | `sop_id` **o** `draft_id`, `storage_path`, `file_name` | Bucket `sop-attachments`. Mientras el SOP es borrador cuelgan de `draft_id` (el id del job de video, o uno del formulario) |
| `sop_generation_jobs` | `status` (`pending/transcribing/generating/ready/failed`), `video_path`, `transcript`, `transcript_seconds`, `generated_markdown`, `open_questions` JSONB, `error` | Realtime habilitado. Bucket privado `sop-videos` (1 GB; mp4, mov, webm, mkv), creado en la migración |
| `weekly_inputs` | `week_start` (lunes), `department` (`ventas/delivery/operaciones/marketing/founder`), `content`, `rating 1-5`, `submitted_by` | Único `(organization_id, week_start, department, submitted_by)` |
| `weekly_reports` | `week_start`, `executive_summary`, `risks`/`bottlenecks`/`recommendations` JSONB, `status` (`pending/generating/ready/error`) | Único `(organization_id, week_start)` |
| `team_roles` | `name`, `is_default`, `permissions` JSONB `{moduleId: none/view/full}` | Defaults sembrados por la RPC `create_default_roles` la primera vez que se lee Equipo |
| `profiles` (parte de equipo) | `role` (`founder/admin/member/…`), `custom_role_id`, `is_active`, `hourly_rate`, `hourly_rate_currency`, `invited_by` | Trigger `protect_profile_columns` (20260922100000): nadie cambia `role`/`organization_id` desde PostgREST; un no-founder/admin sólo edita nombre, email y avatar |
| `team_invitations` | `token`, `email`, `role`, `status`, `expires_at` | 0 filas en producción (al 2026-09-23): nada las crea hoy |

**RLS:** todas las tablas del área filtran sólo por `organization_id = get_my_organization_id()`. **Ninguna
policy mira el rol**, salvo el UPDATE de `profiles` ("Founders update org profiles", founder/admin editan a otros
miembros de la org; `20260616100000`). Migraciones: `20260522300000_workboard_tasks`, `20260616100000_workboard_time_tracking`,
`20260616200000_workboard_sprints`, `20260714100000_workboard_task_links`, `20260915100000_tareas_varios_responsables`,
`20260615300000_weekly_inputs`, `20260616300000_sops_enhanced`, `20260719100000_sop_attachments`,
`20260903110000_sop_video_jobs`, `20260616400000_team_roles_permissions`, `20260906102000_permisos_por_modulo`.

## Cómo fluye el dato

### Tablero

- **Carga:** `loadWorkboardPageDataAction` (`app/workboard/actions.ts`) → tareas + miembros + sprints; más
  `listLaunchPickerOptionsAction` de Lanzamientos. Estado en cliente vía `providers/workboard-provider.tsx`.
- **Crear:** `createWorkboardTaskAction` valida con zod, asigna el sprint activo si no viene uno, escribe
  `assignee_ids` y copia el primero a `assignee_id`, linkea documentos y recalcula el `completion_rate` del sprint.
- **Mover / editar:** `moveWorkboardTaskAction` (arrastrar en el Kanban), `updateWorkboardTaskAction` (detalle).
  Sólo `updateWorkboardTaskAction` setea `completed_by`/`completed_at` al pasar a `done` y los borra al reabrir;
  `moveWorkboardTaskAction` sólo cambia `status` y `position`, así que una tarea cerrada **arrastrándola** queda
  sin `completed_by`. Al llegar a `done` la UI abre `log-time-modal.tsx` →
  `logTaskTimeAction` (acumula en `actual_minutes` y agrega a `time_entries`).
- **Otros que escriben tareas:** `app/agent/workboard-actions.ts` (`createWorkboardTasksAction`,
  `updateWorkboardTaskAction` homónima), usada por las tools del agente, el modal de propuestas de Fathom
  (`components/fathom/fathom-task-proposal-modal.tsx`) y "mandar al tablero" de las tareas de cliente
  (`app/clients/task-actions.ts`).
- **Adjuntos:** `prepareTaskAttachmentUploadAction` (signed upload URL con admin client, path
  `{org}/{task}/{uuid}-{nombre}`) → subida directa del navegador → `finalizeTaskAttachmentAction` valida el
  path con `assertOrgStoragePath`. Lectura con URL firmada de 1 h.
- **Sprints:** `createSprintAction` **completa el sprint activo anterior** y crea el nuevo como `active`.
- **Tarifas:** `setMemberHourlyRateAction` (founder/admin) escribe `profiles.hourly_rate`.

### SOPs

```
Texto:  formulario → generateSOPAction (Sonnet, contexto org + 10 SOPs + sales_script) → preview editable
        → saveSOPAction → sops + sop_versions v1 → si status=active: ingestDocument (RAG, sin await)
Video:  prepareSopVideoUploadAction (signed URL a sop-videos) → navegador sube
        → createSopVideoJobAction (fila en sop_generation_jobs) → enqueueSopVideoJob (QStash, retries: 1)
        → POST /api/queue/process-sop-video (maxDuration 800, verifyQueueRequest)
             bajar video → ffmpeg: duración + mp3 → Whisper (en trozos si es largo; audio-chunks.ts)
             → guarda transcript → Sonnet (video-sop-prompt.ts) → validateAttachmentMarkers → ready
        → la pantalla escucha el job por realtime (sop-video-creator.tsx) y carga el markdown en el creador
        → el usuario guarda con saveSOPAction (draftId = el UUID propio del formulario, sólo si se subieron
          adjuntos en modo texto; el id del job no se pasa)
```

- Si el worker falla responde **200** a propósito (el job queda `failed` con el motivo) para que QStash no
  reintente y vuelva a pagar Whisper. `retrySopVideoJobAction` reencola y **no retranscribe** si ya hay `transcript`.
- El worker busca capturas en `sop_attachments` con `draft_id = id del job`, pero **ninguna pantalla sube capturas
  a un job de video** (`sop-video-creator.tsx` sólo sube el video): hoy esa lista siempre llega vacía.
- Las capturas se guardan como **marcadores** en el markdown, no como URL firmada; se resuelven al mostrar
  (`lib/sops/attachment-markers.ts`, `components/sops/sop-content-with-attachments.tsx`).
- `trackTranscriptionUsage` registra Whisper en `token_usage` (`model = 'whisper-1'`).
- **Sugerencias** (`lib/sops/suggest-sops.ts`): tareas `done` de los últimos 30 días con el mismo título
  (normalizado) 3+ veces → hasta 5 sugerencias. Sólo en `/operations/sops`.

### Inputs y reporte semanal

- `saveWeeklyInputAction` hace **upsert** por `(org, semana, depto, usuario)` y manda el input al RAG sin `await`.
  El tab "Input rápido" usa la misma action: un input rápido **pisa** el input del mismo usuario y departamento de esa semana.
- `updateWeeklyInputAction` / `deleteWeeklyInputAction`: sólo el autor o el founder.
- `generateWeeklyReportAction` (Sonnet, `callClaudeJson`, org context cacheado + métricas de `conversations`):
  lo dispara el botón de Inputs (habilitado con 2+ departamentos, cualquier miembro) o
  `triggerWeeklyPipelineAction` (`app/executive-reports/report-generation-actions.ts`, sólo founder) desde el
  empty state del Overview. **Ningún cron** genera `weekly_reports`.
- La grilla de departamentos del Overview sale de `computeDepartmentStatuses` (`lib/executive-reports/compute-departments.ts`),
  no del reporte semanal.
- Errores: las cuatro acciones devuelven sus errores esperables como valor y no los lanzan, porque en producción
  Next no le manda al cliente el mensaje de un error lanzado por una server action (sólo un digest y un párrafo en
  inglés). Las tres de inputs devuelven `MutationResult` (validación, "Input no encontrado.", "Solo podés editar/eliminar
  tus propios inputs.", `mapWeeklyError`); `generateWeeklyReportAction` devuelve `ResultadoReporteSemanal`
  (`lib/operations/resultado-reporte-semanal.ts`, con `motivo` `org-no-activa`, `sin-inputs` o `falla`; una org pausada
  no genera, SCRUM-210). Sólo lo inesperado (sin sesión) sigue lanzando. Los componentes las corren con
  `correrAccion`/`correrMutacion` (`lib/client/correr-accion.ts`, módulo común de cliente): un error devuelto se muestra con su mensaje y uno
  lanzado se registra en consola y se avisa con "Ocurrió un error inesperado. Intentá de nuevo.".

### Equipo

- `inviteTeamMemberAction` (sólo `role = 'founder'`): crea el usuario en Auth con **contraseña temporal**
  (`generateTempPassword`), inserta el `profile` con `role: 'member'` y el `custom_role_id` elegido, y devuelve
  las credenciales para que el founder las pase a mano. El middleware obliga a cambiarla al primer login.
- `updateMemberRoleAction` cambia `custom_role_id` / `is_active`; `deactivateMemberAction` pone `is_active = false`. Las dos, al cambiar `is_active`, banean o desbanean al usuario en Auth, y al desactivar vencen las invitaciones que haya creado (SCRUM-8).
- Roles: `createCustomRoleAction`, `deleteCustomRoleAction` (no borra `is_default`). Permisos consolidados a
  13 módulos (`constants/permission-modules.ts`); las claves viejas se traducen al leer.
- Resolución de permisos: `lib/auth/get-current-permissions.ts`. Founder = todo `full`. Sin rol cargado
  (`hasRoleConfigured = false`) no se bloquea nada.

## Integraciones externas

| Proveedor | Uso | Dónde | Sin configurar |
|---|---|---|---|
| Anthropic (Sonnet) | Generar SOP (texto y video), reporte semanal | `app/sops/actions.ts`, `app/api/queue/process-sop-video/route.ts`, `app/operations/actions.ts` | Error "Configurá tu API key de Claude" |
| OpenAI Whisper | Transcripción del video | `process-sop-video/route.ts` (`transcribeFile`) | Job `failed` |
| Upstash QStash | Cola del worker de video | `lib/sops/enqueue-video-job.ts`, `lib/queue/verify-queue-request.ts` | El job queda `pending`; se puede reintentar |
| ffmpeg (`@ffmpeg-installer/ffmpeg`) | Duración, extracción y corte de audio | worker | Job `failed` |
| ClickUp | **Importador de clientes**, no del tablero: lee una lista y crea `clients` con mapeo de campos | `lib/clickup/*`, `app/integrations/clickup/import-actions.ts`, `components/integrations/clickup-import-wizard.tsx` | No se ofrece |

## Reglas de negocio y decisiones no obvias

- ⭐ **`assignee_id` se sigue escribiendo** con el primer responsable: el reporte de tiempo y la vista
  `workboard_time_by_member` lo leen. Todo el costo de una tarea compartida va al primero.
- ⭐ **El mapper prefiere `assignee_ids`** (`lib/workboard/mapper.ts`) y cae a `assignee_id` sólo si la lista
  está vacía. Cualquier camino que escriba sólo `assignee_id` en una tarea que ya tiene lista queda invisible.
- **Cualquier responsable cierra la tarea**; `completed_by` dice quién.
- **Un sprint activo por org**: crear uno cierra el anterior sin preguntar.
- **La semana es lunes-domingo, en la zona horaria de la organización** (`organizations.timezone`; si está en
  null, `America/Argentina/Buenos_Aires`). `getCurrentWeekStart(hoy)` recibe la fecha de hoy ya armada: las
  actions y la pantalla de inputs la sacan con `fechaDeHoyDeLaOrganizacion`, igual que el reporte ejecutivo
  semanal y la tool `get_operations_summary` del agente (SCRUM-493).
- **SOP desde video**: el worker nunca reintenta la transcripción si ya existe (Whisper cobra por minuto); la
  regla "no inventar pasos" y "listar lo que el video no aclara" vive en `lib/sops/video-sop-prompt.ts`.
- **SOPs es módulo propio**, fuera del add-on `operaciones` (si no, en orgs sin add-on no había cómo llegar).
- **Permisos:** el layout sólo distingue `none` vs. cualquier otra cosa. El nivel `view` **no se aplica en
  ningún lado**: un rol "solo lectura" puede editar todo lo que la pantalla le deja tocar.
- **Equipo es sólo del founder**: `canManageTeam` es `role === 'founder'`; un `admin` no invita ni edita roles
  (aunque la policy de `profiles` y `setMemberHourlyRateAction` sí lo dejan tocar tarifas).

## Limitaciones conocidas y deuda

- **SOP desde video nunca corrió de punta a punta** `[D-SOPS-VIDEO-NUNCA-CORRIO]`. Hay 1 fila en
  `sop_generation_jobs` en producción (al 2026-09-23); no se sabe si llegó a `ready`.
- **El video no se borra** del bucket al terminar, aunque la migración dice que sí `[OPS-SOP-VIDEO-NO-SE-BORRA]`.
- **El worker carga el video entero en memoria y en `/tmp`** (la subida se corta en `NEXT_PUBLIC_SOP_VIDEO_MAX_MB`,
  50 MB por defecto; el bucket acepta hasta 1 GB) y mide la duración decodificando
  todo con `-f null` `[OPS-SOP-VIDEO-MEMORIA]`.
- **Las escrituras del agente/Fathom/clientes no mantienen `assignee_ids`** `[WORKBOARD-ASIGNACION-AGENTE]`.
- **Cerrar una tarea arrastrándola no registra quién la cerró** (`moveWorkboardTaskAction` no toca `completed_by/at`) `[WORKBOARD-CIERRE-ARRASTRANDO]`.
- **El SOP desde video no puede tener capturas**: ninguna pantalla las sube contra el job `[OPS-SOP-VIDEO-CAPTURAS]`.
- **No hay edición ni borrado de SOPs** en la UI: `updateSOPAction` existe pero nadie la llama, y no hay delete;
  por eso el versionado nunca se ejercita `[SOPS-EDITAR]`. `sop_versions` tiene 0 filas con 3 SOPs (producción, al 2026-09-23).
- **Permisos sólo en el render**: actions y RLS abiertas a cualquier miembro `[PERMISOS-SERVER-ACTIONS]`.
- **Buckets `sop-attachments` y `workboard-task-attachments` no están en migraciones** `[OPS-STORAGE-BUCKETS]` (auditoría §3.9).
- **`/invite` y `team_invitations` no tienen productor** `[EQUIPO-INVITE-LEGADO]`: nada crea invitaciones (la parte B de
  `[AUTH-ALTA-EMAIL-AJENO]`, SCRUM-499, puede serlo). Desde SCRUM-495 aceptar una no crea cuentas: ver
  `docs/arquitectura/auth-organizaciones-y-permisos.md` § Aceptar una invitación.
- `loadWorkboardPageDataAction` lee las tareas dos veces y los miembros tres (`getSprintsAction` vuelve a llamar
  `listWorkboardTasksAction`) `[WORKBOARD-CARGA-DUPLICADA]`.

## Tests

| Archivo | Cubre |
|---|---|
| `lib/sops/__tests__/audio-chunks.test.ts` | Corte de audio con solape y unión de transcripciones |
| `lib/sops/__tests__/attachment-markers.test.ts` | Marcadores de captura: validar, borrar inventados |
| `lib/workboard/__tests__/filtrar-por-responsable.test.ts` | Filtro por responsable con `assigneeIds` y fallback |
| `lib/navigation/__tests__/module-for-path.test.ts` | Qué módulo protege cada ruta (recorre `app/(platform)` en disco) |
| `constants/__tests__/permisos-consolidados.test.ts` | Traducción de claves viejas de permisos a los 13 módulos (`permissionsFromRow` de `lib/team/mapper.ts`) |
| `lib/team/__tests__/invitacion.test.ts`, `app/team/__tests__/aceptar-invitacion.test.ts`, `app/invite/__tests__/pagina-invitacion.test.ts`, `app/auth/__tests__/login-vuelve-a-la-invitacion.test.ts`, `supabase/ci/tests/80_aceptar_invitacion.sql` | Aceptar una invitación sin crear cuentas: estados de `/invite`, la action sin sesión, la vuelta desde el login sin open redirect y la función en la base (una sola vez, rol de la org, sin tocar nada al rechazar) |

Sin tests: `parseVideoSopResponse`, `lib/workboard/{mapper,sprint,time-report}` (de `group-tasks` sólo
`filterTasksByAssignee`), `lib/operations/*`, el resto de `lib/team/mapper.ts`, `suggest-sops.ts`, y ninguna action. No hay e2e del área (`apps/web/e2e/` sólo tiene holding).

## Archivos clave

- `apps/web/app/workboard/actions.ts` — tareas, sprints, tiempo
- `apps/web/app/workboard/task-link-actions.ts` — SOP, documentos y adjuntos de una tarea
- `apps/web/app/agent/workboard-actions.ts` — el otro camino de escritura (agente, Fathom, clientes)
- `apps/web/lib/workboard/mapper.ts` — fila → `WorkboardTask`, resolución de responsables
- `apps/web/components/workboard/workboard-shell.tsx` — entrada de la UI del tablero
- `apps/web/app/sops/actions.ts` y `apps/web/app/sops/video-actions.ts`
- `apps/web/app/api/queue/process-sop-video/route.ts` — el worker
- `apps/web/lib/sops/video-sop-prompt.ts`, `audio-chunks.ts`, `attachment-markers.ts`
- `apps/web/app/operations/actions.ts` — inputs y reporte semanal
- `apps/web/app/team/actions.ts` — miembros, roles, invitaciones
- `apps/web/lib/auth/get-current-permissions.ts`, `apps/web/lib/navigation/module-for-path.ts`
- `supabase/migrations/20260922100000_profiles_columnas_protegidas.sql`

## Lo que ya no existe

- **Invitación por email con token** (`team_invitations` + Resend). Hoy la alta es
  con contraseña temporal; `/invite` (que desde SCRUM-495 sólo acepta con la sesión de la cuenta invitada) y la
  lista de pendientes siguen en el código pero no hay nada que cree invitaciones. `/api/invite/validate` y el
  formulario de alta con contraseña de `/invite` se borraron en SCRUM-495.
- **Grabación de voz en inputs semanales**: ya no está en `weekly-input-form.tsx`.
- **Fallback a `mocks/sops.ts`** en la biblioteca: con Supabase la biblioteca vacía muestra empty state.

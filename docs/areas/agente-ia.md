# Agente de negocio e IA

> Verificado contra el código el 2026-09-23 (commit 038caca). Backlog del área: `PENDIENTES.md` § Agente de negocio e IA.

## Qué es

La capa de IA de Limitless y los productos que viven encima de ella:

- **Agente de negocio** (`/agent`): chat con Claude que lee datos reales de todos los módulos con tools, crea tareas, genera documentos (Canvas o Excel/CSV) y propone cambios al modelo del negocio (avatares, productos, escalones, frameworks, propuesta de valor) que el founder aprueba.
- **Base de conocimiento** (`/business-context/documents`): notas, PDFs, Google Docs/Sheets y llamadas de Fathom, indexados con embeddings de OpenAI (RAG) para el agente.
- **Inteligencia** (`/intelligence`, `/founder`) y **reportes ejecutivos** (pulso diario, semanal, mensual): generados por cron, sin intervención del usuario.
- **Tono del founder**: análisis semanal de cómo escribe el founder, que se inyecta como contexto.
- **Infraestructura compartida**: `lib/ai/anthropic.ts` (routing de modelos, clave propia de la org, prompt caching, tracking de costo en `token_usage`), `wrap-untrusted-content`, QStash.

No hace: análisis de llamadas, scoring de leads/formularios, etiquetado o análisis de contenido. Esos pipelines usan esta capa pero se documentan en sus áreas (Ventas, Marketing, Clientes). El mapa completo de llamadas a Claude/OpenAI está más abajo.

Uso real en producción (filas al 2026-09-23): `agent_messages` 12, `agent_conversations` 4, `agent_graph_proposals` 0, `rag_documents` 59 / `rag_chunks` 2010, `intelligence_snapshots` 118, `executive_reports` 52, `founder_communication_tone` 23, `token_usage` 2212, `ai_brain_documents` 87. El agente casi no se usa; los crons sí corren.

## Pantallas y rutas

| Ruta | Archivo | Qué muestra |
|---|---|---|
| `/agent`, `/agent/[conversationId]`, `/agent/stage/[stageId]` | `app/(platform)/agent/*/page.tsx` → `components/agent/agent-shell.tsx` | Chat SSE, historial, etapas de negocio, Canvas, propuestas. El layout (`agent/layout.tsx`) saca `conversationId`/`stageId` del path para `AgentDataProvider` |
| `/agent/project/[projectId]` | `app/(platform)/agent/project/[projectId]/page.tsx` | Redirect a `/agent` (proyectos ya no tienen UI) |
| `/business-context/documents` | `app/(platform)/business-context/documents/page.tsx` → `components/business-context/knowledge-base-page.tsx` | Documentos, calls de Fathom, categorías custom, import de Google |
| `/business-context/[id]` | `app/(platform)/business-context/[id]/page.tsx` | Visor de un documento |
| `/intelligence` | `app/(platform)/intelligence/page.tsx` → `components/intelligence/intelligence-page-content.tsx` | Último `intelligence_snapshots` de la org |
| `/intelligence/{insights,recommendations,bottlenecks,opportunities,ai-memory}` | `app/(platform)/intelligence/*/page.tsx` | Redirects a anchors de `/intelligence` |
| `/founder` | `app/(founder)/founder/page.tsx` | Mismo snapshot, vista "área del fundador" |
| `/executive-reports/history` | `app/(platform)/executive-reports/history/page.tsx` | Grilla de reportes + las tres cadencias. Sin entrada en la nav: se llega desde el panel de la notch nav (`components/executive-reports/reports-panel.tsx`) |
| `/executive-reports/[id]` | `app/(platform)/executive-reports/[id]/page.tsx` | Detalle de un reporte |

Nav (`lib/navigation/sidebar-modules.ts`): isla "Agente de negocio" con Chat (permiso `agent`) y Base de conocimiento (permiso `knowledge_base`). Inteligencia y Área del fundador cuelgan de Operaciones.

## Modelo de datos

| Tabla | Columnas clave | Notas |
|---|---|---|
| `agent_conversations` | `organization_id`, `title`, `stage_id`, `updated_at` | Título lo genera Haiku en el primer mensaje |
| `agent_messages` | `conversation_id`, `organization_id`, `role`, `content`, `action_type`, `action_ref_id`, `attachments` (JSONB), `thinking_content`, `canvas_content` | Historial completo. La compaction **no** lo toca |
| `business_stages` / `agent_projects` | `organization_id`, `name`, `description` | Etapa de negocio que contextualiza el prompt |
| `agent_graph_proposals` | `entity_type`, `action` (`create`/`update`), `entity_id`, `payload` (JSONB), `status` (`pending`/`approved`/`rejected`), `message_id` | Propuestas del agente; `applyProposalAction` las aplica vía las actions de Producto |
| `business_context_documents` | `title`, `category`, `source`, `content_text`, `content_markdown`, `storage_path`, `status` (`processing`/`indexed`/`error`), `index_error`, `external_source_id` | Realtime habilitado (`use-documents-realtime.ts`). Bucket `business-context-documents` (no está en migraciones) |
| `knowledge_base_categories` | slug custom por org | |
| `rag_documents` | `organization_id`, `source_type`, `source_id`, `content`, `embedding_status`, `is_active` | Único `(organization_id, source_type, source_id)`. `source_type` con CHECK: `fathom_call, sop, sales_framework, weekly_input, agent_conversation, product_context, manual, business_context_note, business_context_document, canvas` |
| `rag_chunks` | `document_id`, `content`, `chunk_index`, `embedding vector(1536)`, `source_type`, `title` | Índice `ivfflat (lists=100)`. RPC `search_rag_chunks(query_embedding, org_id, match_count, source_types)`, SECURITY DEFINER, revocada a `authenticated` (`20260922110000`, aplicada): sólo service role |
| `ai_brain_documents` | `content_type`, `content_text`, `status`, `ai_summary`, `batch_job_id` | "Cerebro global": docs del staff de Limitless que ven **todas** las orgs vía JIT |
| `intelligence_snapshots` | `insights`, `recommendations`, `bottlenecks`, `opportunities`, `memory_chunks` (JSONB), `generated_at` | Append-only, 2 por día por org. Sólo SELECT por org |
| `executive_reports` | `period` (`daily`/`weekly`/`monthly`), `week_label`, `period_start/end`, `executive_summary`, `risks`, `bottlenecks`, `recommendations`, `departments` | Append-only, **sin índice único** por (org, period, period_start) |
| `founder_communication_tone` | `organization_id` (único), `tone_description`, `source_summary`, `analyzed_at` | Upsert semanal |
| `token_usage` | `model`, `feature`, `input/output_tokens`, `cache_read/creation_input_tokens`, `*_cost_usd` | Costos IA; lo lee super-admin |
| `organizations` | `claude_api_key_encrypted`, `claude_api_key_status` (`none/valid/valid_no_credits/invalid/error`), `claude_api_key_last_validated_at` | `authenticated` no puede leer el ciphertext (`20260619100000`). Las columnas `claude_oauth_*` y `claude_credential_mode` siguen en la DB pero el código no las lee |

Migraciones: `20260522100000_agent_module`, `20260615400000_byok_claude`, `20260617100000_rag_infrastructure`, `20260619100000_byok_real_encryption`, `20260627200000_token_usage_cache_tokens`, `20260702100000_intelligence_snapshots`, `20260704100000_executive_reports`, `20260705100000_business_context_documents`, `20260726300000_agent_graph_proposals`, `20260727100000_rag_canvas_source_type`, `20260830230000_executive_reports_daily`. Todas aplicadas en producción.

## Cómo fluye el dato

### Agente (camino vivo: SSE)

```
AgentDataProvider (providers/agent-data-provider.tsx)
  └─ POST /api/agent/send  (requireOrganizationId; maxDuration 300)
       └─ streamAgentMessage()  lib/agent/stream-agent-message.ts
            1. requireAuthContext + aiRateLimit (10/min por usuario) + aiPromptSchema
            2. crea conversación si no hay; inserta mensaje del usuario
            3. contexto:
               - buildJitOrgContextText()  → Haiku elige bloques (org, avatar, productos,
                 SOPs, frameworks, guión, tono, 20 docs indexados, 30 docs del cerebro global);
                 si falla o devuelve [], los 3 más recientes. Va como cachedSystemPrompt
               - loadProductEntityContext() → IDs/nombres para las tools propose_*
               - searchRAG(match 5, similarity ≥ 0.65)
               - últimos 20 mensajes de OTRAS conversaciones de la org
               - pageContext (entidad que el usuario está mirando)
            4. compactConversationMessages(): >20 mensajes o >40K tokens estimados (chars/4)
               → Haiku resume todo menos los últimos 6. Sólo el payload, no la DB
            5. detectAgentComplexity() → agent_simple (Haiku) | agent_complex (Sonnet)
               resolveAgentFlags(): canvas se activa solo por regex de intención
            6. streamClaudeAgent(): hasta 4 iteraciones de tools/pause_turn, emite SSE
            7. post-proceso: [ACTION:CREATE_SOP:{...}] → inserta SOP draft (3/hora por org);
               si canvas está activo y no hubo propuestas: canvas del documento generado o,
               si no, la respuesta si es larga con headings/tablas; persiste assistant msg;
               vincula propuestas al message_id; emite `done`
            8. título con Haiku (fire-and-forget, sólo en el primer mensaje)
```

Eventos SSE (`lib/agent/sse.ts`): `delta`, `tool_start`, `tool_end`, `done`, `error`. No hay eventos `token` ni `thinking` (los nombraba la documentación vieja); el thinking se persiste en `thinking_content` y viaja con el mensaje.

`max_tokens` (`lib/agent/max-tokens.ts`): 8192 normal, 6144 con thinking, 12288 con canvas (canvas manda aunque haya thinking); budget de thinking 4000. El thinking sólo va en el primer turno; los turnos posteriores a una tool van sin thinking y sin prompt caching.

### Tools del agente (`AGENT_CHAT_TOOLS`, 20)

| Grupo | Tools | Handler |
|---|---|---|
| Lectura (8) | `get_business_snapshot`, `get_clients_data`, `get_sales_metrics`, `get_closing_calls`, `get_finance_summary`, `get_marketing_overview`, `get_lead_magnets_data`, `get_operations_summary` | `lib/agent/data-reader-handlers.ts` (cliente Supabase del usuario, RLS por org) |
| Workboard (3) | `create_workboard_tasks`, `search_workboard_tasks`, `update_workboard_task` | `app/agent/workboard-actions.ts` |
| Contenido (3) | `analyze_content_piece`, `create_content_variants`, `get_top_performing_content` | `app/marketing/content/actions.ts` (área Marketing) |
| Documento (1) | `generate_document` (xlsx/csv/docx/pdf) | `lib/agent/document-generator.ts` + bucket `agent-documents` |
| Propuestas (5) | `propose_customer_avatar`, `propose_product`, `propose_value_ladder_step`, `propose_sales_framework`, `propose_value_proposition` | Inserta en `agent_graph_proposals` como `pending` |
| Servidor | `web_search` (`web_search_20260209`) si el usuario lo activa | Anthropic |

Despacho: `lib/agent/agent-tool-handler.ts`. Aprobación de propuestas: `app/agent/graph-proposal-actions.ts` → `saveAvatarAction`/`saveProductAction`/`saveSalesFrameworkAction`/`saveValuePropositionAction`.

### Canvas

`components/agent/canvas-panel.tsx`: exportar a DOCX (`exportCanvasAsDocxAction`) o "guardar en base de conocimiento" (`saveCanvasToKnowledgeBaseAction`), que escribe directo en `rag_documents` con `source_type = 'canvas'` y embeddings chunk por chunk. Ese documento **no** crea fila en `business_context_documents`: no aparece en la pantalla de la base de conocimiento ni se puede borrar desde la UI.

### Base de conocimiento y RAG

```
createTextNoteAction / createDocumentFromFileAction / importGoogleDoc|Sheet
  └─ scheduleBusinessContextRagIndexing()  lib/business-context/schedule-rag-indexing.ts
       ├─ QStash configurado → publishRagIngestionJob (retries 3)
       │     └─ POST /api/queue/process-rag-ingestion → processRagIngestion()
       │           (idempotente: si ya está indexed + chunks, skip. Una falla de ingesta se guarda
       │            como `error` y responde 200 → QStash NO reintenta; sólo un throw inesperado da 500)
       └─ sin QStash → indexBusinessContextInRag() inline
            └─ ingestDocument()  lib/rag/ingest.ts
                 upsert rag_documents → chunkText (≈2000 chars, overlap 50 palabras)
                 → generateEmbeddings (OpenAI text-embedding-3-small, 1536 dims, 8000 chars por input)
                 → borra chunks viejos → inserta → embedding_status = done
```

`resyncDocumentMarkdownAction` sólo regenera `content_markdown` de un Google Doc: no re-indexa en RAG.

Otros que indexan en RAG: SOPs activos al crear/editar (`app/sops/actions.ts`, fire-and-forget), weekly inputs (`app/operations/actions.ts`), contexto de producto al tocar avatar/producto/framework (`app/product/actions.ts`), llamadas de Fathom (`lib/fathom/process-call.ts`). Re-indexado masivo: `POST /api/rag/ingest` con `CRON_SECRET`, body `{ organizationId, types?: ["sops","fathom","product"] }`.

Extracción de texto: PDF con `unpdf`, texto/markdown directo (`lib/business-context/extract-text.ts`), límite 25 MB.

### Inteligencia y reportes ejecutivos (crons)

| Cron (`vercel.json`) | Horario UTC | Worker QStash | Generador |
|---|---|---|---|
| `/api/cron/intelligence-snapshot` | `0 0,12 * * *` | `/api/queue/process-cron-intelligence-snapshot` | `lib/intelligence/generate-snapshot.ts` |
| `/api/cron/executive-report-daily` | `0 11 * * *` | `/api/queue/process-cron-executive-report` (`period: daily`) | `lib/executive-reports/generate-daily.ts` |
| `/api/cron/executive-report-weekly` | `30 12 * * 1` | ídem (`weekly`) | `generate-weekly.ts` |
| `/api/cron/executive-report-monthly` | `0 13 1 * *` | ídem (`monthly`) | `generate-monthly.ts` |
| `/api/cron/founder-tone-analysis` | `0 12 * * 1` | `/api/queue/process-cron-founder-tone` | `lib/founder-tone/analyze-tone.ts` |

Patrón común: el cron valida `CRON_SECRET`; con `?organizationId=` corre una sola org; con QStash hace fan-out (`publishCronFanout`, retries 2) sobre `listActiveOrganizationIds()` (`lib/intelligence/organizaciones-activas.ts`) = las orgs `account_type = 'founder'` con `status = 'active'`: una pausada o dada de baja no corre (SCRUM-210; la usan inteligencia, los tres reportes ejecutivos y el tono del founder); sin QStash corre en serie dentro del `maxDuration` del cron (60 s; 300 s el mensual). Los workers validan `WORKER_AUTH_SECRET` (header `x-worker-secret`, Bearer o query) o, si no está, la firma de QStash (`lib/queue/verify-queue-request.ts`).

Datos de entrada: el snapshot, el diario y el semanal usan `collectIntelligenceData()` (`lib/intelligence/collect-context.ts`) con ventana fija de **14 días**; entre diario y semanal lo único que cambia es `computeDepartmentStatuses(sinceDays: 1 | 7)`. Si `hasMeaningfulData` es falso, se saltean sin llamar a Claude. El mensual no usa `collectIntelligenceData`: resume los semanales del mes (si no hay ninguno, se saltea) más `computeDepartmentStatuses(sinceDays: 35)`.

El botón `GenerateWeeklyPipelineButton` (empty states de Inteligencia y Operaciones, sólo founder) llama `triggerWeeklyPipelineAction`: reporte semanal de Operaciones + ejecutivo semanal + snapshot, en serie dentro de una server action.

### Transcripción de voz

`POST /api/agent/transcribe` (`components/ui/ai-prompt-box.tsx`): Whisper (`whisper-1`, `language: es`, `verbose_json`), 25 MB máx., 30/min por usuario, `maxDuration` 30 s. Registra el costo por minuto en `token_usage` (`lib/sops/transcription-usage.ts`, `model = whisper-1`, tokens en 0).

## Capa de IA: `lib/ai/anthropic.ts`

### Tarea IA → modelo → dónde se usa (verificado)

`AI_MODELS.HAIKU = claude-haiku-4-5-20251001`. `AI_MODELS.SONNET = claude-sonnet-4-6`, que `API_MODEL_ALIASES` reescribe a **`claude-sonnet-4-5-20250929`** antes de llamar a la API. En `token_usage` se guarda el modelo lógico (`claude-sonnet-4-6`). Sin task ni model → Haiku. Opus no se usa en ningún lado.

| Task | Modelo real | Callers (feature) |
|---|---|---|
| `agent_simple` | Haiku 4.5 | Agente (`agent_chat` cuando la pregunta es corta), título (`agent_conversation_title`), JIT (`agent_context_selection`), compaction (`agent_conversation_compaction`) — `lib/agent/*` |
| `agent_complex` | Sonnet 4.5 | Agente (`agent_chat`) — `lib/agent/stream-agent-message.ts`, `app/agent/actions.ts` |
| `conversation_scoring` | Haiku 4.5 | `lib/manychat/score-conversation.ts`, `app/integrations/zernio/actions.ts` (`zernio_conversation_analysis`) |
| `content_labeling` | Haiku 4.5 | `lib/content/label-content.ts`, `lib/discord/classify-run.ts`, `lib/checkpoints/propose-from-texts.ts` (`checkpoint_proposal_*`), `app/marketing/content/reel-variation-actions.ts` (caption) |
| `data_extraction` | Haiku 4.5 | `lib/forms/score-response.ts` (`form_lead_scoring`), `lib/content/distribution-insight.ts`, `lib/rag/extract-plan-durations.ts` |
| `booking_detection` | Haiku 4.5 | Sin callers |
| `call_analysis` | Sonnet 4.5 | `lib/fathom/analyze-transcript.ts`, `lib/fathom/deep-call-analysis.ts` |
| `weekly_report` | Sonnet 4.5 | `app/operations/actions.ts` (reporte de Operaciones), `lib/executive-reports/generate-{daily,weekly,monthly}.ts` |
| `sop_generation` | Sonnet 4.5 | `app/sops/actions.ts`, `app/api/queue/process-sop-video/route.ts` |
| `product_extraction` | Sonnet 4.5 | `lib/rag/extract-product-context.ts` |
| `sales_analysis` | Sonnet 4.5 | `app/lanzamientos/actions.ts` (post-mortem), `lib/marketing/analyze-content-patterns.ts`, `lib/forms/score-response.ts` (`form_pattern_analysis`) |
| `intelligence_analysis` | Sonnet 4.5 | `lib/intelligence/generate-snapshot.ts` |
| `tone_analysis` | Sonnet 4.5 | `lib/founder-tone/analyze-tone.ts` |
| `analyze_content_piece` | Sonnet 4.5 (visión) | `app/marketing/content/actions.ts` (`callClaudeVisionJson`) |
| `create_content_variants` | Sonnet 4.5 | `app/marketing/content/actions.ts` (variantes y caption) |
| `content_pattern_report` | Sonnet 4.5 | `app/marketing/content/pattern-report-actions.ts` |
| `model: HAIKU` explícito | Haiku 4.5 | `lib/fathom/team-task-extraction.ts`, `lib/fathom/one-on-one-tasks.ts` |

### Mapa de todas las llamadas a proveedores de IA

| Proveedor / vía | Dónde | BYOK + fallback | `token_usage` |
|---|---|---|---|
| `callClaudeText` / `callClaudeJson` / `callClaudeVisionJson` / `callClaudeAgent` | Todos los de la tabla anterior | Sólo la de la org (`executeWithOrgCredential`) | Sí |
| `streamClaudeAgent` (SDK stream directo) | `lib/agent/stream-claude-agent.ts` | Sólo la de la org; ante 401 o sin créditos la marca | Sí |
| `new Anthropic` + Batch API (Haiku, `ai_summary` del cerebro) | `app/super-admin/actions.ts` (`submitBrainSummaryBatchAction` y siguientes) | Clave de la plataforma (`platform_ai_credentials`); si falta, error claro | Sí (org nula, precio Batch) |
| `fetch api.anthropic.com/v1/messages` (Haiku, validar clave) | `lib/ai/validate-claude-key.ts` | La clave a validar | No |
| OpenAI embeddings `text-embedding-3-small` | `lib/rag/embeddings.ts` (ingesta, búsqueda del agente, canvas) | Sólo `OPENAI_API_KEY` global | No |
| `new Anthropic` en el worker de reels (Haiku, captions de variantes) | `apps/reel-worker/src/captions.ts` | Sólo `ANTHROPIC_API_KEY` del worker | No |
| OpenAI Whisper `whisper-1` | `app/api/agent/transcribe/route.ts`, `app/api/queue/process-sop-video/route.ts`, `lib/content/transcribe-whisper.ts` | Sólo global | Sí en los dos primeros (costo por minuto) |

El bot de Discord (`apps/discord-bot`) no llama a ningún proveedor de IA; su clasificador corre en la web (`lib/discord/classify-run.ts`).

### Clave de Claude: sólo la propia de cada organización

**Regla (SCRUM-7, 2026-10-02): sin clave propia, no hay IA.** No hay clave global de respaldo (ADR-004, revisión 2026-10-02).

`lib/ai/credential-resolver.ts`:

1. Lee `claude_api_key_encrypted` y `claude_api_key_status` con admin client. Sólo usa la clave si el status es `valid` o `valid_no_credits` y se puede descifrar (AES-256-GCM, `lib/security/encryption.ts`).
2. Si no → `source: none`: no se llama a nadie, las funciones devuelven `null` y los crons saltean la org. `ANTHROPIC_API_KEY` no se lee en `apps/web`.
3. Cache en memoria por lambda de **30 s**.
4. `executeWithOrgCredential` (`lib/ai/anthropic.ts`) y `streamClaudeAgent`: si Anthropic da **401/403**, `registrarFallaDeClave` invalida el cache, marca `claude_api_key_status = 'invalid'` (condicionado a que siga `valid`) y se tira `AI_KEY_REJECTED_MESSAGE`; con un 400 de créditos marca `valid_no_credits` y tira el mensaje de créditos. No se reintenta con otra clave.
5. El agente sin clave responde `NO_AI_CREDENTIALS_MESSAGE` (dice qué falta y dónde cargarla), no el genérico.
6. Aviso en toda la plataforma (`components/platform/aviso-clave-ia.tsx`; textos en `lib/ai/aviso-clave-ia.ts`): sin clave, rota, ilegible (`keyUnreadable`) o sin créditos. No se puede cerrar; el link a Ajustes → IA sólo para el founder.
7. **Trabajo de plataforma (super-admin, Batch API del cerebro):** clave propia de la plataforma en `platform_ai_credentials` (`lib/ai/platform-credential.ts`), cargada en Super-admin → Infraestructura. Su costo va a `token_usage` con `organization_id` nulo y la mitad del precio de lista (Batch).

OAuth de Claude: no existe más. `normalizeCredentialMode` trata cualquier modo legacy como API key; las columnas `claude_oauth_*` quedaron en la DB sin uso.

Validación al guardar (`saveClaudeApiKeyAction` en `app/settings/actions.ts`): prefijo `sk-ant-`, llamada real a Haiku, guarda `valid` o `valid_no_credits`, invalida caches.

### Prompt caching y costo

- `cachedSystemPrompt` va como primer bloque de `system` con `cache_control: ephemeral` y beta `prompt-caching-2024-07-31`.
- `trackTokenUsage` (`lib/track-token-usage.ts`) calcula el costo con `MODEL_PRICING`: cache read al 10 %, cache write al 125 %. Si falla el insert, se loguea y se sigue (`.catch(() => {})`).

## Integraciones externas

| Proveedor | Qué se usa | Sin configurar |
|---|---|---|
| Anthropic | Messages (stream y no stream), tools, web search, extended thinking, visión, Batch API | Sin clave de la org: el agente dice que falta la clave y dónde cargarla; crons se saltean la org; la plataforma muestra el aviso |
| OpenAI | Embeddings y Whisper | Sin `OPENAI_API_KEY`: RAG devuelve vacío (el agente sigue sin contexto semántico), la indexación marca el documento en `error`, transcripción responde 503 |
| Upstash QStash | Cola de ingesta RAG y fan-out de crons | Sin `QSTASH_TOKEN`: ingesta inline y crons en serie (con el riesgo de timeout: 60 s, 300 s el mensual) |
| Google Drive | Import de Docs/Sheets a la base de conocimiento (`lib/google/drive-content.ts`) | La página recibe `googleConnected` de `getGoogleFormsIntegrationStatusAction`; sin conexión no hay import |
| Miro | Contenido de tableros para el cerebro global (`lib/ai-brain/process-document.ts`) | Sólo super-admin |

## Reglas de negocio y decisiones no obvias

- **Dos caminos al agente.** El vivo es `/api/agent/send` (SSE). `sendAgentMessageAction` (`app/agent/actions.ts`, ~570 líneas) es la versión no-stream del chat flotante, que dejó de renderizarse el 2026-08-26; sigue exportada y alcanzable como server action. No tiene compaction ni JIT ni las 8 tools de lectura, y duplica definiciones de tools. Cualquier cambio al agente se hace en `lib/agent/*`.
- **El resolver de modelo está duplicado** en `lib/agent/stream-claude-agent.ts` (alias y mapa legacy propios). Si se cambia un modelo en `anthropic.ts`, cambiarlo también ahí.
- **El JIT tiene fallback, la compaction casi no:** si la selección de contexto falla se usan los 3 bloques más recientes; si la llamada del resumen de la compaction tira error, falla el mensaje entero (si sólo vuelve vacía, se manda el historial sin compactar).
- **El prompt caching del agente casi no pega:** el bloque cacheado es el contexto elegido por Haiku para *esa* pregunta, que cambia de mensaje a mensaje.
- **El contexto incluye mensajes de otras conversaciones de la org** (últimos 20, todos los usuarios). Un operador con acceso al agente ve fragmentos de lo que charló el founder.
- **Las tools de lectura no miran los permisos por módulo.** Alguien con permiso `agent` pero sin `finance` obtiene finanzas vía `get_finance_summary`. RLS sólo separa por org (ver `[PERMISOS-SERVER-ACTIONS]`).
- **`CREATE_SOP` se dispara por texto** (`[ACTION:CREATE_SOP:{...}]` parseado con regex). Lo puede provocar contenido inyectado vía RAG o tools; queda como draft y con rate limit de 3/hora.
- **El cerebro global es para todas las orgs:** lo que sube el staff en super-admin entra al JIT de cualquier cliente.
- **Canvas automático:** además del flag del usuario, `detectCanvasIntent` lo activa por regex ("armá un SOP…"). Con canvas activo y sin propuestas, `shouldExtractCanvas` manda al panel la respuesta si tiene ≥600 caracteres y headings, tabla o bloque de código.
- **Pulso diario sin recomendaciones:** el prompt lo pide y además el código descarta lo que venga (`recommendations: []`). Deliberado, por la §06 del Funnel Metrics Standard (`lib/executive-reports/cadences.ts`).
- **No hay generación manual de reportes ejecutivos en su pantalla**, pero el botón del pipeline semanal en Inteligencia/Operaciones genera el ejecutivo semanal (`[REPORTES-GENERACION-MANUAL]`).
- **Los generadores atrapan su error y devuelven `"failed"`.** El worker de reportes ejecutivos lo convierte en 500 para que QStash reintente; los de inteligencia y tono devuelven 200 y QStash no reintenta.
- **Prompt injection:** RAG, bloques JIT, datos de reportes y fuentes del tono van envueltos con `wrapUntrustedContent`. No van envueltos: resultados de tools, `pageContext`, los mensajes de otras conversaciones de la org y la descripción de tono (que la escribió Claude a partir de transcripts). El wrapper no escapa el tag de cierre.

## Limitaciones conocidas y deuda

- (Resuelto el 2026-10-02, SCRUM-67) Reporte mensual: el cron del día 1 reporta el mes que terminó (`mesAReportar`), con sus semanales; antes calculaba el mes en curso y casi siempre se salteaba.
- El semanal se etiqueta con la semana que empieza el lunes del cron, no con la que terminó `[REPORTES-SEMANA-ETIQUETA]`.
- Inteligencia y reportes leen `conversations` y `content_assets` (legacy, 0 y 6 filas en prod al 2026-09-23) en vez de `sales_leads` y `content_pieces` `[INTELIGENCIA-FUENTES-LEGACY]`.
- Ventana fija de 14 días para el pulso diario `[REPORTES-VENTANA-FIJA]`.
- Sin índice único en `executive_reports` ni en `intelligence_snapshots`: un reintento duplica `[REPORTES-DUPLICADOS]`.
- Una falla de ingesta en la cola RAG responde 200 y QStash no reintenta `[RAG-INGESTA-SIN-REINTENTO]`.
- Google Docs/Sheets importados no se re-sincronizan: re-importar falla y el "resync" sólo regenera el Markdown del visor `[KB-GOOGLE-SIN-RESYNC]`.
- SOP archivado o pasado a draft sigue en RAG `[RAG-SOP-HUERFANO]`; canvas guardado invisible e imborrable `[RAG-CANVAS-INVISIBLE]`.
- Links de documentos generados vencen a la hora (`SIGNED_URL_EXPIRES_IN = 3600`) y quedan persistidos en `attachments` `[AGENTE-LINKS-VENCIDOS]`.
- `MODEL_PRICING` de Haiku (0,80/4 USD por MTok) parece el precio de Haiku 3.5; los embeddings no se registran `[IA-COSTOS-INCOMPLETOS]`.
- `sendAgentMessageAction` sin llamadas desde la UI: su único caller es `FloatingChatProvider`, que sigue montado en `AppProviders` pero nadie lo consume `[AGENTE-CAMINO-LEGACY]`.
- Sin tests de `lib/agent`, `lib/ai`, `lib/rag`, `lib/queue`, `lib/intelligence` `[T-14]`, `[IA-TESTS]`.

Detalle y prioridades en `PENDIENTES.md` § Agente de negocio e IA.

## Tests

| Qué | Dónde |
|---|---|
| Cadencias, `isStale`, `isReportPeriod` | `apps/web/lib/executive-reports/__tests__/cadences.test.ts` |
| `/api/agent/send` excluida de redirects públicos | `apps/web/lib/supabase/__tests__/public-paths.test.ts` |
| Agente accesible dentro del negocio activo del holding (sólo navegación) | `apps/web/e2e/holding.spec.ts` |
| Scripts manuales de ingesta (no Vitest) | `apps/web/scripts/test-ingest-throws-on-failure.ts`, `apps/web/scripts/verify-business-context-rag.ts` |

Sin cobertura: compaction, JIT, `detectAgentComplexity`, `resolveAgentFlags`, `parseAgentActions`, `parseSseBuffer`, `computeTokenCostUsd`, chunker, `mapAnthropicCallError`, generadores de reportes. Todos son lógica pura o casi pura y testeable en `node`.

## Archivos clave

1. `apps/web/lib/ai/anthropic.ts` — modelos, tasks, clave de la org y sus fallas, `callClaude*`
2. `apps/web/lib/ai/credential-resolver.ts` — clave propia de la org, cache, marca de clave rechazada o sin créditos
3. `apps/web/lib/track-token-usage.ts` — precios y `token_usage`
4. `apps/web/app/api/agent/send/route.ts` — entrada SSE
5. `apps/web/lib/agent/stream-agent-message.ts` — orquestación del agente
6. `apps/web/lib/agent/stream-claude-agent.ts` — loop de streaming y tools
7. `apps/web/lib/agent/jit-context.ts` y `compact-conversation.ts`
8. `apps/web/lib/agent/agent-tools.ts`, `agent-tool-handler.ts`, `data-reader-handlers.ts`
9. `apps/web/lib/agent/prompt.ts` — system prompt
10. `apps/web/lib/rag/ingest.ts`, `search.ts`, `embeddings.ts`
11. `apps/web/lib/business-context/schedule-rag-indexing.ts` y `app/business-context/actions.ts`
12. `apps/web/lib/intelligence/collect-context.ts` y `generate-snapshot.ts`
13. `apps/web/lib/executive-reports/generate-{daily,weekly,monthly}.ts` y `cadences.ts`
14. `apps/web/lib/queue/qstash-client.ts` y `verify-queue-request.ts`
15. `apps/web/lib/ai/wrap-untrusted-content.ts`

## Lo que ya no existe

- OAuth de Claude como credencial (quedan columnas `claude_oauth_*` sin uso).
- Respuesta mock del agente sin API key (`MOCK_REPLY`): hoy devuelve error.
- Páginas `/executive-reports/weekly` y `/monthly`: todo pasa por `history` y `[id]`.
- Botón flotante del agente: `FloatingChat` sigue en el código sin renderizarse; `FloatingChatProvider` sigue montado en `providers/index.tsx` sin consumidores.

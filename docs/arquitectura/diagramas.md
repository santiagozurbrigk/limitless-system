# Diagramas del sistema

> Verificado contra el código el 2026-09-23 (commit `038caca`). Cada nodo que nombra un archivo, una ruta o una
> tabla se comprobó que existe en `apps/`, `supabase/migrations/` o `apps/web/vercel.json`. Los diagramas son
> [Mermaid](https://mermaid.js.org/): GitHub los dibuja solos. Si algo de acá contradice al código, manda el código.

Estos diagramas son el mapa; el detalle está en los documentos hermanos:
[visión general](./vision-general.md) · [auth, organizaciones y permisos](./auth-organizaciones-y-permisos.md) ·
[jobs, webhooks y colas](./jobs-webhooks-y-colas.md) · [base de datos](./base-de-datos.md) ·
[seguridad](./seguridad.md) · [integraciones](../integraciones/README.md).

## Leyenda común

| Cómo se ve | Qué significa |
|---|---|
| Caja y flecha de línea llena | Camino vivo, usado en producción hoy |
| Caja con borde gris punteado y flecha punteada `-.->` | **Legacy o dormido**: el código existe y a veces corre, pero no es el camino vigente o no tiene uso en producción (0 integraciones) |
| Caja con borde rojo punteado | **Roto**: está en el camino pero hoy falla o no deja datos. Lleva el ID de `PENDIENTES.md` en la etiqueta |
| Texto sobre la flecha | Protocolo o transporte (HTTPS, WebSocket, SSE, cola) o qué dispara el paso |
| Cilindro | Tabla de Postgres |

Por prolijidad las etiquetas no llevan paréntesis: el route group `app/(platform)/` figura como `app/platform`.

Índice:
1. [Contexto (C4 nivel 1)](#1-contexto-c4-nivel-1)
2. [Contenedores (C4 nivel 2)](#2-contenedores-c4-nivel-2)
3. [Del lead al cliente](#3-flujo-de-datos-principal-del-lead-al-cliente)
4. [Agente de IA](#4-flujo-del-agente-de-ia)
5. [Ingesta de integraciones](#5-flujo-de-ingesta-de-integraciones)
6. [Modelo multi-tenant](#6-modelo-multi-tenant)

---

## 1. Contexto (C4 nivel 1)

```mermaid
flowchart LR
    classDef legacy stroke-dasharray:5 5,stroke:#888,color:#777
    classDef sistema stroke-width:3px

    subgraph personas["Personas"]
        founder["Founder / infoproductor<br/>dueño de la org"]
        equipo["Equipo del founder<br/>closers, setters, coaches<br/>perfil member + rol custom"]
        superadmin["Super admin<br/>staff de Limitless"]
        clienteFinal["Clientes del infoproductor"]
        lead["Leads del infoproductor"]
    end

    limitless["LIMITLESS<br/>apps/web + discord-bot + reel-worker"]:::sistema

    founder -->|"navegador, HTTPS"| limitless
    equipo -->|"navegador, HTTPS"| limitless
    superadmin -->|"/super-admin"| limitless
    clienteFinal -->|"formulario público /onboarding-cliente/token"| limitless
    clienteFinal -->|"escribe en su canal"| discord
    lead -->|"DM y comentarios IG/WA"| zernio
    lead -->|"agenda llamada"| calendly
    lead -->|"agenda llamada"| ghl

    subgraph plataforma["Servicios de plataforma"]
        supabase["Supabase<br/>Postgres, Auth, Storage, Realtime"]
        vercel["Vercel<br/>hosting + 19 crons"]
        qstash["Upstash QStash<br/>cola HTTP"]
        anthropic["Anthropic<br/>Claude Haiku y Sonnet, BYOK"]
        openai["OpenAI<br/>embeddings + Whisper"]
        sentry["Sentry"]
        resend["Resend<br/>emails"]
        fly["Fly.io<br/>reel-worker"]
        railway["Railway<br/>discord-bot"]
    end

    subgraph ventas["Ventas y conversaciones"]
        zernio["Zernio<br/>inbox, contenido, comentarios, ads de Meta"]
        calendly["Calendly"]
        ghl["GoHighLevel"]
        fathom["Fathom<br/>grabaciones"]
    end

    subgraph medicion["Medición, cobros y contenido"]
        whop["Whop"]
        commas["Commas ex Fanbasis"]
        hyros["Hyros"]
        vturb["VTurb"]
        webinarjam["WebinarJam / EverWebinar"]
        typeform["Typeform"]
        google["Google<br/>Drive, Forms, YouTube"]
        metacapi["Meta Pixel + Conversions API"]
    end

    subgraph operacion["Operación"]
        discord["Discord<br/>Gateway + REST"]
        clickup["ClickUp<br/>import puntual"]
        miro["Miro<br/>cerebro del super admin"]
    end

    subgraph dormidos["Legacy o sin uso en producción"]
        stripe["Stripe Connect<br/>no listado, 0 conexiones"]:::legacy
        mercadopago["Mercado Pago<br/>no listado, 0 conexiones"]:::legacy
        manychat["ManyChat<br/>listado, 0 conversaciones"]:::legacy
        unipile["Unipile<br/>reemplazado por Zernio"]:::legacy
        instagram["Instagram Graph<br/>reemplazado por Zernio"]:::legacy
    end

    limitless --> plataforma
    limitless <--> ventas
    limitless <--> medicion
    limitless <--> operacion
    limitless -.-> dormidos
```

**Cómo leerlo.** Limitless es el sistema de gestión del negocio de un infoproductor (el *founder*) y su equipo.
Los clientes finales del founder casi no tocan Limitless: sólo el formulario público de onboarding (add-on
`growth_partners`) y, de forma indirecta, sus mensajes en Discord, que lee el bot. Los leads nunca entran a la
app: escriben por Instagram/WhatsApp (Zernio los muestra en vivo) y agendan en Calendly o GHL. Stripe y
Mercado Pago tienen OAuth y cliente en el código pero nadie los conectó y no se ofrecen en la pantalla; ManyChat,
Unipile e Instagram Graph son el inbox legacy (sus crons y webhooks siguen vivos, ver
`[AUD-SALUD-1]`). Detalle por proveedor: [integraciones](../integraciones/README.md).

---

## 2. Contenedores (C4 nivel 2)

```mermaid
flowchart TB
    classDef legacy stroke-dasharray:5 5,stroke:#888,color:#777
    classDef roto stroke-dasharray:5 5,stroke:#d33,color:#d33

    browser["Navegador<br/>founder, equipo, super admin"]
    publico["Navegador sin sesión<br/>/onboarding-cliente, /prueba"]

    subgraph vercel["Vercel · proyecto otc-plaform · región gru1"]
        direction TB
        mw["middleware.ts<br/>lib/supabase/middleware.ts: updateSession"]
        ui["App Router<br/>Server Components en app/platform, super-admin, founder"]
        actions["Server Actions<br/>actions.ts por dominio en app, 98 archivos use server"]
        api["Route Handlers app/api, 84<br/>webhooks, integrations, queue, discord, rag"]
        sse["POST /api/agent/send<br/>SSE, maxDuration 300"]
        crons["Vercel Cron<br/>19 entradas en vercel.json"]
    end

    subgraph supa["Supabase OTC nrzlylzbmsuowzhpdnjl"]
        pg["Postgres 17 + RLS<br/>get_my_organization_id"]
        auth["Auth<br/>custom_access_token_hook"]
        storage["Storage<br/>buckets trial-reels, client-wins, agent-documents..."]
        realtime["Realtime"]
        vector["pgvector<br/>rag_chunks + RPC search_rag_chunks"]
    end

    qstash["Upstash QStash"]
    reel["apps/reel-worker<br/>Express + FFmpeg · Fly.io otc-reel-worker"]
    bot["apps/discord-bot<br/>discord.js · Railway"]
    discordgw["Discord Gateway y REST"]
    proveedores["Proveedores de negocio<br/>Zernio, Calendly, GHL, Fathom, Whop, Commas..."]
    ia["Anthropic + OpenAI"]
    obs["Sentry + Resend"]
    drive["Google Drive API"]

    browser -->|"HTTPS + cookie de sesión"| mw
    publico -->|"HTTPS, rate limit por IP"| mw
    mw --> ui
    mw --> actions
    browser -->|"fetch, text/event-stream"| sse
    browser <-->|"WebSocket: docs de la KB, jobs de reels y SOP"| realtime
    browser -.->|"WebSocket canal conversations, legacy"| realtime

    ui -->|"HTTPS PostgREST, JWT del usuario"| pg
    actions -->|"createClient: JWT del usuario, RLS"| pg
    actions -->|"createAdminClient: service role, secretos"| pg
    api -->|"service role"| pg
    mw -->|"auth.getUser + profiles con service role"| auth
    sse --> vector
    actions --> storage

    crons -->|"HTTPS GET, Bearer CRON_SECRET"| api
    api -->|"publishCronFanout, publishJSON"| qstash
    actions -->|"publishJSON: RAG, reels"| qstash
    qstash -->|"HTTPS POST /api/queue/*, x-worker-secret o firma"| api
    qstash -->|"HTTPS POST, WORKER_AUTH_SECRET"| reel

    reel -->|"HTTPS descarga del video"| drive
    reel -->|"service role: sube variantes, actualiza reel_variation_jobs"| storage
    reel -->|"Haiku, captions"| ia

    discordgw <-->|"WebSocket Gateway 24/7"| bot
    bot -->|"service role: discord_messages, discord_client_links"| pg
    bot -->|"HTTPS POST /api/discord/testimonial y pending-link, Bearer"| api
    actions -->|"REST con DISCORD_BOT_TOKEN"| discordgw

    proveedores -->|"webhooks HTTPS firmados"| api
    actions <-->|"HTTPS API: sync manual y lecturas en vivo"| proveedores
    api <-->|"HTTPS API: syncs por cron"| proveedores
    actions --> ia
    sse -->|"stream Messages API"| ia
    api --> ia
    vercel --> obs
```

**Cómo leerlo.** Todo el dominio vive en `apps/web`, desplegado en Vercel. Las pantallas y las Server Actions
consultan Postgres con el JWT del usuario (RLS filtra por organización); los webhooks, crons y workers de cola
usan la service role y se autentican solos (firma, `CRON_SECRET`, `WORKER_AUTH_SECRET`). QStash reparte trabajo
largo: fan-out de crons por organización, ingesta RAG, análisis de Fathom, SOP en video y el procesamiento de
reels en Fly. El bot de Discord existe aparte porque necesita un WebSocket abierto 24/7; escribe directo en la
base y avisa a la web por HTTPS. El navegador se suscribe a Realtime para la base de conocimiento, los jobs de
reels y de SOP; el canal de `conversations` que abre `providers/platform-data-provider.tsx` en cada pantalla es
legacy (la tabla tiene 0 filas). Detalle: [visión general](./vision-general.md),
[jobs, webhooks y colas](./jobs-webhooks-y-colas.md), [operación: entorno y deploy](../operacion/entorno-y-deploy.md).

---

## 3. Flujo de datos principal: del lead al cliente

```mermaid
flowchart TD
    classDef legacy stroke-dasharray:5 5,stroke:#888,color:#777
    classDef roto stroke-dasharray:5 5,stroke:#d33,color:#d33
    classDef tabla stroke-width:2px

    subgraph dm["1. Conversación: Zernio, en vivo"]
        zernioApi["Zernio API<br/>DMs y comentarios de IG/WA"]
        inbox["/sales/inbox<br/>app/integrations/zernio/actions.ts"]
        zca[("zernio_conversation_analysis")]:::tabla
        zwh["/api/integrations/zernio/webhook<br/>503 en prod: falta ZERNIO_WEBHOOK_SECRET"]:::roto
        zmsg[("zernio_messages, zernio_comments<br/>zernio_messages sin lector")]:::roto
        legacyInbox["Inbox legacy: ManyChat, Unipile, Instagram Graph"]:::legacy
        conv[("conversations<br/>0 filas")]:::legacy
    end

    zernioApi -->|"lectura en vivo, no se persiste"| inbox
    inbox -->|"análisis IA manual, Haiku"| zca
    zernioApi -.->|"webhook"| zwh
    zwh -.-> zmsg
    legacyInbox -.-> conv

    subgraph turno["2. Turno agendado: aparece el lead"]
        calOrg["Calendly de la org<br/>webhook + cron horario<br/>lib/calendly/sync-events.ts"]
        ghlSync["GoHighLevel<br/>cron /api/cron/ghl-sync<br/>lib/ghl/sync-appointments.ts"]
        calCloser["Calendly de cada closer<br/>lib/calendly/closer-sync.ts<br/>sin lead_id: CALENDLY-CLOSER-SIN-LEAD"]:::roto
        resolve["lib/sales/resolve-lead.ts<br/>identidad = mail, o ghl_contact_id"]
        cc[("closing_calls<br/>un turno = un intento")]:::tabla
        sl[("sales_leads")]:::tabla
    end

    calOrg --> cc
    ghlSync --> cc
    calCloser -.-> cc
    calOrg --> resolve
    ghlSync --> resolve
    resolve --> sl
    sl ---|"closing_calls.lead_id"| cc

    subgraph closing["3. Closing y llamada"]
        seguimiento["/sales/closing, pestaña seguimiento<br/>app/sales/lead-actions.ts<br/>estado del hilo derivado, no guardado"]
        fathomRec["Fathom: grabación de la llamada<br/>cron sync + process cada 10 min"]
        fc[("fathom_calls")]:::tabla
        ca[("call_analyses<br/>sin FK: se une en código por fathom_call_id")]:::tabla
    end

    cc --> seguimiento
    seguimiento -->|"next_action, calificación, status_source manual"| cc
    fathomRec -->|"lib/fathom/process-call.ts"| fc
    fc -->|"cruce mail invitado con closing_calls.lead_email"| cc
    fc -->|"análisis profundo, QStash"| ca

    subgraph cierre["4. Cierre: markCallClosed en el navegador, no atómico"]
        provider["providers/platform-data-provider.tsx<br/>CLOSING-CIERRE-ATOMICO"]
        upd["updateClosingCallAction<br/>app/closing/actions.ts"]
        create["createClientAction<br/>app/clients/actions.ts"]
        link["linkLeadToClientAction<br/>app/sales/lead-actions.ts"]
        pay["recordClientPaymentAction<br/>app/sales/payment-actions.ts"]
        tagLegacy["tag en conversations, no-op"]:::legacy
    end

    provider --> upd
    upd -->|"status = closed"| cc
    provider -.-> tagLegacy
    provider --> create
    create --> cl[("clients")]:::tabla
    provider --> link
    link -->|"sales_leads.client_id"| sl
    provider -->|"si hay comprobante"| pay
    pay --> cp[("client_payments<br/>+ clients.installments")]:::tabla

    subgraph cobros["5. Cobros y pagos"]
        cobrosUi["/sales/cobros<br/>cuotas a mano con comprobante"]
        whopCommas["Whop y Commas<br/>webhooks /api/webhooks/whop y fanbasis"]
        pt[("payment_orders, payment_transactions<br/>alimentan Embudos, no Cobros ni Finanzas")]:::tabla
    end

    cobrosUi --> cp
    whopCommas --> pt

    subgraph entrega["6. Entrega: recorrido, 1-1 y wins"]
        onb["Onboarding por link, add-on<br/>app/onboarding-cliente/actions.ts"]
        onbT[("client_onboarding_submissions<br/>client_timeline_entries")]:::tabla
        oneOnOne["1-1 por link de Fathom<br/>app/fathom/manual-upload-actions.ts"]
        tasks[("client_tasks")]:::tabla
        botMsg["apps/discord-bot<br/>message-handler.ts"]
        dmsg[("discord_messages")]:::tabla
        signals["cron /api/cron/daily-signals<br/>lib/checkpoints/propose-from-texts.ts, Haiku"]
        prop[("client_checkpoint_proposals")]:::tabla
        record["recordCheckpointAction<br/>app/clients/checkpoint-event-actions.ts"]
        ev[("client_checkpoint_events<br/>+ clients.status, current_stage_id")]:::tabla
        wins["createWinFromTestimonialAction<br/>app/discord/actions.ts + app/clients/win-actions.ts"]
        cw[("client_wins")]:::tabla
    end

    cl --> onb
    onb --> onbT
    oneOnOne -->|"lib/fathom/one-on-one-tasks.ts"| tasks
    oneOnOne --> fc
    botMsg --> dmsg
    dmsg --> signals
    fc -->|"llamadas de entrega"| signals
    signals --> prop
    prop -->|"acceptCheckpointProposalAction"| record
    record --> ev
    dmsg -->|"testimonio"| wins
    wins --> cw
```

**Cómo leerlo.** El DM **no crea un lead**: la bandeja de Zernio se lee en vivo y sólo se guarda el análisis IA
que alguien pide a mano (`zernio_conversation_analysis`). El lead como entidad (`sales_leads`) nace cuando llega
un turno de Calendly o GHL con mail o contacto de GHL; los turnos del Calendly propio de cada closer entran sin
`lead_id` y no aparecen en el seguimiento. El cierre lo encadena el navegador (turno cerrado, cliente, vínculo
lead-cliente, pago): si falla a mitad queda inconsistente. Whop y Commas escriben en tablas que sólo lee Embudos;
Cobros son cuotas cargadas a mano. Después del cierre, el recorrido avanza con hitos registrados a mano o
aceptados desde propuestas que arma el cron diario con Discord y las llamadas de entrega; nada se registra solo.
Detalle: [ventas](../areas/ventas.md), [clientes](../areas/clientes.md),
[recorrido y wins](../areas/clientes-recorrido-y-wins.md), [growth partners](../areas/clientes-growth-partners.md),
[discord](../areas/discord.md), [finanzas](../areas/finanzas.md).

---

## 4. Flujo del agente de IA

```mermaid
flowchart TD
    classDef legacy stroke-dasharray:5 5,stroke:#888,color:#777
    classDef roto stroke-dasharray:5 5,stroke:#d33,color:#d33
    classDef tabla stroke-width:2px

    user["Usuario en /agent<br/>providers/agent-data-provider.tsx"]
    route["POST /api/agent/send<br/>app/api/agent/send/route.ts<br/>requireOrganizationId, maxDuration 300"]
    orch["streamAgentMessage<br/>lib/agent/stream-agent-message.ts<br/>aiRateLimit 10 por minuto"]
    legacyAction["sendAgentMessageAction<br/>app/agent/actions.ts, sin UI: AGENTE-CAMINO-LEGACY"]:::legacy

    user -->|"fetch, respuesta text/event-stream"| route
    route --> orch
    user -.->|"chat flotante ya no se renderiza"| legacyAction

    orch -->|"inserta mensaje del usuario"| msgs[("agent_conversations<br/>agent_messages")]:::tabla

    subgraph contexto["Armado del contexto"]
        jit["JIT: buildJitOrgContextText<br/>lib/agent/jit-context.ts<br/>Haiku elige bloques; va como system cacheado"]
        kb[("organizations, avatares, productos, SOPs<br/>business_context_documents, ai_brain_documents<br/>founder_communication_tone")]:::tabla
        rag["RAG: searchRAG<br/>lib/rag/search.ts, 5 chunks, similitud 0.65"]
        emb["OpenAI text-embedding-3-small<br/>lib/rag/embeddings.ts"]
        vec[("rag_chunks, pgvector<br/>RPC search_rag_chunks")]:::tabla
        otras["últimos 20 mensajes de otras<br/>conversaciones de la org"]
        compact["compaction: compactConversationMessages<br/>lib/agent/compact-conversation.ts<br/>más de 20 mensajes o 40K tokens: Haiku resume"]
    end

    orch --> jit
    jit --> kb
    orch --> rag
    rag --> emb
    rag --> vec
    orch --> otras
    orch --> compact

    subgraph claude["Llamada a Claude"]
        complexity["detectAgentComplexity<br/>Haiku agent_simple o Sonnet agent_complex"]
        cred["resolveCredentialForOrg<br/>lib/ai/credential-resolver.ts<br/>clave BYOK de la org si valid, si no ANTHROPIC_API_KEY"]
        stream["streamClaudeAgent<br/>lib/agent/stream-claude-agent.ts<br/>hasta 4 iteraciones de tools"]
        nofallback["sin reintento con la clave global ante 401<br/>AGENTE-SIN-FALLBACK-CLAVE"]:::roto
        tools["20 tools: lectura, workboard, contenido,<br/>generate_document, propose_*, web_search<br/>lib/agent/agent-tool-handler.ts"]
        anth["Anthropic Messages API, stream"]
    end

    compact --> complexity
    complexity --> stream
    stream --> cred
    cred -.-> nofallback
    stream -->|"HTTPS stream"| anth
    anth -->|"tool_use"| tools
    tools -->|"cliente del usuario, RLS por org"| datos[("clients, closing_calls, workboard_tasks,<br/>agent_graph_proposals, content_pieces...")]:::tabla
    tools -->|"tool_result"| anth

    stream -->|"eventos delta, tool_start, tool_end<br/>lib/agent/sse.ts"| route
    route -->|"SSE"| user
    stream -->|"trackTokenUsage por iteración<br/>lib/track-token-usage.ts"| tu[("token_usage")]:::tabla
    orch -->|"post-proceso: respuesta, thinking, canvas;<br/>vincula propuestas; evento done"| msgs
    orch -->|"título con Haiku, solo 1er mensaje"| msgs

    subgraph otros["Resto de la capa de IA, fuera del chat"]
        callClaude["callClaudeText, Json, Vision, Agent<br/>lib/ai/anthropic.ts"]
        fallback["executeWithCredentialFallback<br/>401 o 403 con clave de la org: la marca invalid<br/>y reintenta con la global"]
    end

    jit --> callClaude
    compact --> callClaude
    callClaude --> fallback
    callClaude --> tu
```

**Cómo leerlo.** El chat vivo es SSE: `POST /api/agent/send` abre el stream y `streamAgentMessage` orquesta.
El contexto se arma "justo a tiempo": Haiku elige qué bloques del negocio entran, se suman hasta 5 fragmentos
del RAG (embeddings de OpenAI en `rag_chunks`), mensajes de otras conversaciones de la org y, si la charla es
larga, un resumen hecho por Haiku (la compaction no toca la base, sólo lo que se manda). Claude llama tools que
leen datos con el cliente del usuario (RLS por org, pero sin mirar permisos por módulo). La clave BYOK de la org
se usa si es válida; las llamadas no-stream (`lib/ai/anthropic.ts`) caen a la clave global ante un 401/403, pero
el stream del agente no. El costo de cada llamada queda en `token_usage`; embeddings y la Batch API del
super admin no se registran (`[IA-COSTOS-INCOMPLETOS]`). Detalle: [agente de IA](../areas/agente-ia.md).

---

## 5. Flujo de ingesta de integraciones

```mermaid
flowchart LR
    classDef legacy stroke-dasharray:5 5,stroke:#888,color:#777
    classDef roto stroke-dasharray:5 5,stroke:#d33,color:#d33
    classDef tabla stroke-width:2px

    subgraph disparo["Disparadores"]
        wh["Webhook firmado<br/>/api/webhooks/*<br/>/api/integrations/*/webhook"]
        cron["Cron de Vercel<br/>assertCronAuthorized"]
        manual["Sync manual<br/>botones en /integrations, server actions"]
        vivo["En vivo al abrir la pantalla<br/>con caché"]
    end

    subgraph crudo["Evento crudo, se guarda antes de interpretar"]
        pwe[("payment_webhook_events<br/>Whop, Commas")]:::tabla
        gwe[("ghl_webhook_events<br/>GHL oportunidades")]:::tabla
        fcp[("fathom_calls status pending")]:::tabla
    end

    subgraph normal["Normalización, un archivo por proveedor"]
        payNorm["lib/payments/ingest.ts<br/>+ normalize.ts<br/>lo no entendido queda unmapped"]
        ghlNorm["lib/ghl/ingest-opportunity-event.ts<br/>deriva la transición de etapa"]
        fathomProc["lib/fathom/process-call.ts<br/>cron process cada 10 min"]
        calSync["lib/calendly/sync-events.ts<br/>lib/ghl/sync-appointments.ts"]
        adSnap["lib/marketing/ad-metrics-snapshot.ts"]
        formSync["lib/forms/sync-scoring.ts"]
        contentSync["app/marketing/content/sync-actions.ts<br/>lib/marketing/sync-content-metrics.ts"]
        live["lib/vturb/stats.ts<br/>lib/hyros/attribution.ts"]
    end

    subgraph tablas["Tablas de negocio"]
        pay[("payment_orders<br/>payment_transactions")]:::tabla
        ghlT[("ghl_opportunities<br/>ghl_stage_transitions")]:::tabla
        cc[("closing_calls + sales_leads")]:::tabla
        fca[("fathom_calls asociadas<br/>call_analyses, client_timeline_entries")]:::tabla
        ads[("ad_metrics_daily")]:::tabla
        forms[("forms, form_responses")]:::tabla
        content[("content_pieces")]:::tabla
        cache[("vturb_stats_cache<br/>hyros_attribution_cache")]:::tabla
        wj[("webinarjam_registrants")]:::tabla
    end

    subgraph consumo["Consumo"]
        funnel["Embudos<br/>lib/funnels/resolve.ts: resolveFunnel<br/>lib/funnels/compute.ts: computeFunnel"]
        metrics["Métricas de ventas, Finanzas,<br/>Marketing, panel general, agente"]
        intel["Inteligencia y reportes ejecutivos<br/>lib/intelligence/collect-context.ts"]
    end

    wh -->|"Whop, Commas"| pwe --> payNorm --> pay
    wh -->|"GHL Ed25519 o secreto"| gwe --> ghlNorm --> ghlT
    wh -->|"Calendly"| calSync
    cron -->|"calendly-sync, ghl-sync"| calSync --> cc
    cron -->|"fathom/sync"| fcp
    manual -->|"Sincronizar mis llamadas"| fcp
    fcp --> fathomProc --> fca
    cron -->|"capture-ad-metrics, Zernio"| adSnap --> ads
    cron -->|"typeform y google-forms sync"| formSync --> forms
    cron -->|"sync-content-metrics, QStash"| contentSync --> content
    manual -->|"catálogos GHL, VTurb, Hyros<br/>registrantes WebinarJam"| wj
    vivo --> live --> cache

    pay --> funnel
    ghlT --> funnel
    cc --> funnel
    ads --> funnel
    forms --> funnel
    cache --> funnel
    wj --> funnel
    cc --> metrics
    content --> metrics
    cc --> intel

    fwm["/api/integrations/fathom/webhook/token<br/>FATHOM-WEBHOOK-MIEMBRO-ROTO"]:::roto
    fwl["/api/integrations/fathom/webhook<br/>legacy por org"]:::legacy
    zwh["/api/integrations/zernio/webhook<br/>503 sin ZERNIO_WEBHOOK_SECRET"]:::roto
    igpoll["cron instagram/poll y sync, Unipile,<br/>ManyChat webhook"]:::legacy
    conv[("conversations, content_assets<br/>legacy")]:::legacy
    wh -.-> fwm -.-> fcp
    wh -.-> fwl -.-> fcp
    wh -.-> zwh
    cron -.-> igpoll -.-> conv
    conv -.->|"INTELIGENCIA-FUENTES-LEGACY, EMBUDO-PANEL-DMS"| intel
    conv -.-> funnel
```

**Cómo leerlo.** Hay cuatro formas de que entre un dato: webhook, cron, sync manual y lectura en vivo (VTurb,
Hyros e inbox de Zernio, con caché y sin duplicar en la base salvo `ad_metrics_daily`). Los webhooks nuevos
(Whop, Commas, GHL) guardan el payload crudo antes de interpretarlo, y lo que no se entiende queda `unmapped`,
nunca como cero. Fathom usa `fathom_calls` como cola: el sync la llena y el cron de proceso la vacía. Todo
termina en tablas de negocio que leen Embudos, Métricas e Inteligencia. En rojo: el webhook de Fathom por
miembro no puede guardar (columnas equivocadas) y el de Zernio responde 503 en producción. En gris: el inbox
legacy sigue corriendo y alimentando `conversations` (0 filas), que todavía leen inteligencia, el panel y los
bindings por defecto del embudo DM. Detalle: [integraciones](../integraciones/README.md),
[embudos](../areas/embudos.md), [jobs, webhooks y colas](./jobs-webhooks-y-colas.md),
[APIs sin documentación](../integraciones/apis-sin-documentacion.md).

---

## 6. Modelo multi-tenant

### 6a. Entidades

```mermaid
erDiagram
    organizations ||--o{ profiles : "organization_id"
    organizations ||--o{ team_roles : "roles custom de la org"
    team_roles ||--o{ profiles : "custom_role_id"
    organizations ||--o{ holding_businesses : "holding_org_id"
    organizations ||--o{ holding_businesses : "business_org_id"
    profiles ||--o| holding_active_sessions : "profile_id"
    organizations ||--o{ DATOS_DE_NEGOCIO : "organization_id + RLS"

    organizations {
        uuid id PK
        text account_type "founder o holding"
        text_array enabled_add_ons "operaciones, producto, growth_partners..."
        text status
        text claude_api_key_encrypted "BYOK, sin lectura para authenticated"
    }
    profiles {
        uuid id PK "igual a auth.users.id"
        uuid organization_id FK "null para super admin"
        text role "founder o member, más legados"
        uuid custom_role_id FK
        boolean is_holding_admin
        boolean must_change_password
    }
    team_roles {
        uuid id PK
        uuid organization_id FK
        jsonb permissions "13 módulos: none, view o full"
    }
    holding_businesses {
        uuid holding_org_id FK
        uuid business_org_id FK
        text status
    }
    holding_active_sessions {
        uuid profile_id PK
        uuid business_org_id "lo lee el Auth Hook"
    }
    super_admin_users {
        text email "allowlist del staff"
    }
    DATOS_DE_NEGOCIO {
        uuid organization_id "clients, closing_calls, sales_leads..."
    }
```

**Cómo leerlo.** La organización es la raíz: un usuario tiene un solo perfil atado a una sola org
(`profiles.organization_id`), y todas las tablas de negocio llevan `organization_id`. Una org `holding` agrupa
negocios en `holding_businesses`; el negocio que el usuario está mirando se guarda en `holding_active_sessions`.
Los roles custom (`team_roles.permissions`) sólo deciden qué pantallas se dibujan: **ninguna policy de RLS mira
el rol** (`[PERMISOS-SERVER-ACTIONS]`). El super admin no tiene org; entra por la allowlist `super_admin_users`.
`team_invitations` sigue en la base pero ningún código crea filas (invitar crea la cuenta directo).

### 6b. Resolución de la org efectiva por request

```mermaid
flowchart TD
    classDef roto stroke-dasharray:5 5,stroke:#d33,color:#d33
    classDef legacy stroke-dasharray:5 5,stroke:#888,color:#777

    req["Request del navegador<br/>cookie de sesión Supabase<br/>+ cookie limitless_active_org si es holding"]
    mw["middleware.ts → updateSession<br/>lib/supabase/middleware.ts"]
    mwChecks["auth.getUser con anon key<br/>profiles con service role: clave temporal,<br/>must_change_password, gate de onboarding<br/>sin sesión y ruta no pública → /login<br/>lib/supabase/public-paths.ts"]
    hdr["setea headers x-pathname y x-active-org-id"]
    layout["app/platform/layout.tsx<br/>getCurrentUserPermissions<br/>permissionModuleForPath"]
    sinAcceso["módulo en none → SinAcceso<br/>sólo corta el render, no las actions"]
    rsc["page.tsx o Server Action"]
    rOrg["requireOrganizationId<br/>lib/auth/bootstrap.ts, cache por request"]
    holding["resolveEffectiveOrganizationId<br/>lib/holding/resolve-org.ts<br/>re-verifica el negocio contra holding_businesses"]
    perfilOrg["profile.organization_id directo<br/>ignora el negocio activo: AUD-SALUD-ORG-HOLDING"]:::roto
    client["createClient<br/>lib/supabase/server.ts, JWT del usuario"]
    rls["Postgres RLS<br/>organization_id = get_my_organization_id"]
    fn["get_my_organization_id<br/>1. claim JWT active_business_org_id<br/>2. si no, profiles.organization_id"]
    hook["custom_access_token_hook<br/>lee holding_active_sessions al emitir el JWT<br/>se habilita a mano en Supabase"]
    enter["enterBusinessAction<br/>app/platform/holding/actions.ts<br/>upsert holding_active_sessions + refreshSession<br/>+ cookie limitless_active_org"]

    req --> mw --> mwChecks --> hdr --> layout
    layout --> sinAcceso
    layout --> rsc
    rsc --> rOrg --> holding
    rsc -.->|"reels, Drive, workboard, team, profile"| perfilOrg
    rOrg --> client --> rls --> fn
    enter --> hook
    hook -->|"JWT con el claim"| fn
    enter -->|"cookie"| req
```

**Cómo leerlo.** Hay **dos mecanismos que tienen que coincidir** para un holding: la app sabe qué negocio mira
por la cookie `limitless_active_org` (la re-verifica `requireOrganizationId` contra `holding_businesses` en cada
request) y la base lo sabe por el claim `active_business_org_id` del JWT, que agrega el Auth Hook al refrescar la
sesión. Para una org común los dos caen en `profiles.organization_id`. El bloqueo por módulo del layout sólo
esconde pantallas; las Server Actions no lo repiten salvo guards puntuales (founder, add-on, super admin). En
rojo: las acciones que leen `profile.organization_id` en vez de `requireOrganizationId()` ignoran el negocio
activo del holding. Detalle:
[auth, organizaciones y permisos](./auth-organizaciones-y-permisos.md), [seguridad](./seguridad.md),
[base de datos](./base-de-datos.md).

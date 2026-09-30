# Discord

> Verificado contra el código el 2026-09-23 (commit 038caca). Backlog del área: `PENDIENTES.md` § Discord.
> Runbook de despliegue del bot: [`docs/operacion/discord-bot-deploy.md`](../operacion/discord-bot-deploy.md).

## Qué es

Un bot que lee los canales del servidor de Discord de un negocio (la comunidad de sus alumnos/clientes),
guarda los mensajes, los atribuye a un cliente del CRM y alimenta tres cosas: la **actividad y el
silencio** de cada cliente en su ficha, los **candidatos a win** (testimonios) y las **propuestas de
hitos** del recorrido del cliente. Lo configura el founder desde Integraciones → Discord. **No** responde
preguntas ni modera: su única escritura en el servidor es el saludo de canal nuevo y las respuestas a
`!vincular` (y ninguna, si el modo silencioso está activo).

## Pantallas y rutas

| Ruta | Archivo | Qué muestra |
|---|---|---|
| `/integrations` (tarjeta Discord) | tablero genérico (`lib/integrations/registry.ts` + `discordIssues()` en `app/integrations/actions.ts`) | Estado, conectar; avisa si no hay canales monitoreados o hay mensajes sin texto. `components/integrations/discord-channel-card.tsx` es la tarjeta de **cada canal** dentro de `/integrations/discord` |
| `/integrations/discord` | `app/(platform)/integrations/discord/page.tsx` → `components/integrations/discord-settings.tsx` | Canales monitoreados (propósito, logros, dueños), personas sin asociar con sugerencias, buzón de vinculaciones pendientes, nombre y foto del bot, modo silencioso, patrón de auto-monitoreo |
| Ficha del cliente | `components/clients/client-discord-activity.tsx` | Mensajes, última actividad, silencio |
| Lista de clientes | `components/clients/clients-list.tsx` | Actividad por cliente |
| Wins | `components/clients/wins/win-candidates.tsx` | Testimonios propuestos como win |
| `GET /api/integrations/discord/oauth/start` | `app/api/integrations/discord/oauth/start/route.ts` | Arma la URL de instalación del bot con `state` en cookie `discord_oauth` |
| `GET /api/integrations/discord/callback` | `app/api/integrations/discord/callback/route.ts` | Valida `state`, canjea el código, guarda `discord_integrations` |
| `POST /api/discord/testimonial` | `app/api/discord/testimonial/route.ts` | El bot avisa un testimonio → `requires_attention = true` |
| `POST /api/discord/pending-link` | `app/api/discord/pending-link/route.ts` | El bot manda un `!vincular` sin match → `discord_pending_links` |
| `POST /api/discord/message` | `app/api/discord/message/route.ts` | **Stub**: autentica y devuelve `ok`. El bot no lo llama |

## Arquitectura

```
Discord Gateway (WebSocket permanente)
   │
   ▼
apps/discord-bot  (Node + discord.js, Railway, Dockerfile, root dir apps/discord-bot)
   ├─ messageCreate → !vincular → link-handler      ─┐
   │                → resto    → message-handler     │ escribe directo en Supabase
   ├─ channelCreate → auto-monitoreo por patrón      │ con SERVICE ROLE
   └─ ready         → diagnóstico de clave y acceso ─┘
   │  HTTP con Bearer LIMITLESS_WEBHOOK_SECRET
   ▼
apps/web /api/discord/{testimonial,pending-link}
   ▲
apps/web  app/discord/actions.ts   (pantalla de configuración, con sesión del usuario / RLS)
          lib/discord/api.ts       (REST de Discord con DISCORD_BOT_TOKEN: listar canales, perfil del bot)
          /api/cron/daily-signals  (07:20 UTC: clasificar + proponer hitos)
```

El bot es un proceso aparte porque leer mensajes exige una conexión de Gateway abierta 24/7, que Vercel
no puede sostener. Es **standalone**: no importa paquetes del workspace (`apps/discord-bot/package.json`).

## Modelo de datos

| Tabla | Columnas clave | Notas |
|---|---|---|
| `discord_integrations` | `organization_id` (unique), `guild_id` (unique), `monitored_channels jsonb`, `auto_monitor_pattern` (default `cliente-`), `bot_name`, `bot_avatar_url`, `bot_profile_applied_at`, `bot_profile_error`, `bot_can_speak`, `last_event_at` | **Un servidor por org y una org por servidor**. Los usuarios editan sólo por columna, nunca `guild_id` ni `organization_id` (SCRUM-82): una columna nueva que la app edite con el cliente de usuario necesita su `grant update (col) to authenticated` en la migración |
| `discord_messages` | `discord_message_id` (unique), `client_id` (null = sin dueño), `attributed_by` (`person`/`channel`/null), `discord_user_id`, `channel_id`, `content`, `is_testimonial`, `ai_sentiment`, `ai_summary`, `requires_attention`, `sent_at` | Se guarda sólo lo de canales monitoreados. Sin retención: para siempre |
| `discord_client_links` | `(organization_id, discord_user_id)` unique, `client_id`, `link_method` (`email_command`, `name_fuzzy`, `manual`…), `link_confidence` | Persona de Discord → cliente |
| `discord_team_members` | `(organization_id, discord_user_id)` unique, `profile_id` (null = equipo sin cuenta) | Sus mensajes no se atribuyen ni se clasifican |
| `discord_channel_clients` | `(organization_id, channel_id, client_id)` unique | Dueños de un canal "de cliente". Varias filas = canal compartido |
| `discord_pending_links` | `(organization_id, discord_user_id)` unique, `email_attempted`, `status` | Buzón de `!vincular` sin match |

Forma de `monitored_channels` (normalizada por `lib/discord/channels.ts`):
`[{ channel_id, channel_name, purpose: "client" | "community", wins: boolean, added_at? }]`.

RLS: todas `organization_id = get_my_organization_id()` para cualquier miembro. Bucket
`discord-bot-avatars` **público**, escritura sólo bajo `{organization_id}/`.
Migraciones: `20260527100000_discord_bot`, `20260909020000_discord_bot_profile`,
`20260915130000_discord_modo_silencioso`, `20260917100000_discord_canales_por_cliente`,
`20260917110000_discord_equipo`, `20260917120000_borrar_discord_pending_channels` (todas aplicadas).

## Cómo fluye el dato

### Mensaje nuevo (`apps/discord-bot/src/handlers/message-handler.ts`)

1. Ignora bots. Busca la integración por `guild_id` y el canal en `monitored_channels`; si no está, no
   guarda nada.
2. ¿El autor está en `discord_team_members`? Entonces no se atribuye ni cuenta como testimonio.
3. Atribución (`apps/discord-bot/src/lib/attribution.ts`): autor vinculado → `person`; si no, canal con
   **un solo** dueño → `channel`; si no, sin dueño.
4. Testimonio = canal con `wins = true` + autor no es del equipo + pre-filtro de palabras/largo
   (`testimonial-handler.ts`). Se guarda `message_type = 'testimonial'` y se avisa a
   `/api/discord/testimonial`.
5. Upsert en `discord_messages` y `last_event_at`.

### `!vincular email` (`link-handler.ts`)

| Resultado | Hablando | En silencio |
|---|---|---|
| Email exacto de un cliente de la org | Vincula (`email_command`) y responde | Vincula y no responde |
| Nombre visible parecido (>0.85, un solo match) | Vincula (`name_fuzzy`) y avisa | **No** vincula: va al buzón |
| Sin match | Responde y va al buzón | Va al buzón |
| Email inválido o faltante | Responde con el formato; **no** va al buzón | Va al buzón (con `email_attempted` vacío) |

### Canal nuevo (`events/channelCreate.ts`)

Si el nombre matchea `auto_monitor_pattern`, lo agrega como `purpose: "client"` con `wins` según el nombre
(`wins-channel.ts`) y, si puede hablar, saluda pidiendo `!vincular`. No crea dueños del canal.

### Configuración (`app/discord/actions.ts`)

Todo cambio de propósito, dueños, vínculo por persona (`linkDiscordPersonAction`), equipo o la baja de un canal llama `recalcularAtribucion()` (agregar un canal o cambiar su tilde de logros no), que reescribe
`client_id`/`attributed_by` de los mensajes ya guardados en ese alcance. Las sugerencias de identidad
(`lib/discord/suggest-identity.ts`) se muestran con su nivel (`exacto`/`fuerte`/`posible`) y **nunca se
aplican solas**; ante empate gana "equipo".

### Señales diarias (`app/api/cron/daily-signals/route.ts`, `20 7 * * *`)

Por org, en serie y aislando errores: `classifyDiscordMessagesForOrg` (Haiku, hasta 100 mensajes nuevos,
salteando los del equipo; llena `ai_sentiment`/`ai_summary`/`requires_attention` y corrige `is_testimonial`) →
`proposeCheckpointsFromDiscordForOrg` → propuestas desde llamadas. Nada se registra solo: todo queda como
propuesta para que alguien acepte.

### Actividad y silencio (`lib/discord/activity.ts`, puro)

Silencio = 14 días (`SILENCE_THRESHOLD_DAYS`) sin un mensaje **del cliente**. Un mensaje atribuido por
canal cuenta como actividad pero **no** mueve el reloj del silencio.

### Perfil del bot (`lib/discord/profile.ts`)

Nombre y foto **por servidor** con `PATCH /guilds/{id}/members/@me` usando `DISCORD_BOT_TOKEN`. Límites
en `lib/discord/limits.ts`: apodo ≤ 32, PNG/JPEG/GIF (no WebP), ≤ 4 MB. El error de Discord se persiste
en `bot_profile_error` y queda visible hasta que se resuelva.

## Variables de entorno

| Dónde | Variable | Para qué |
|---|---|---|
| Bot (Railway) | `DISCORD_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Obligatorias; sin ellas el bot sale con error |
| Bot | `LIMITLESS_API_URL` (o legado `OTC_API_URL`), `LIMITLESS_WEBHOOK_SECRET` (o `OTC_WEBHOOK_SECRET`) | Obligatorias (una de cada par) |
| Web (Vercel) | `NEXT_PUBLIC_DISCORD_CLIENT_ID` (el inicio del OAuth sólo lee ésta; el callback acepta también `DISCORD_CLIENT_ID`), `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_REDIRECT_URI` | OAuth de instalación y REST del bot |
| Web | `LIMITLESS_WEBHOOK_SECRET` (o `OTC_WEBHOOK_SECRET`) | Valida las llamadas del bot (`lib/discord/webhook-auth.ts`, fail-closed, tiempo constante) |

Los nombres `OTC_*` siguen funcionando como respaldo; los vigentes son los `LIMITLESS_*`.

## Reglas de negocio y decisiones no obvias

- **Intents:** sólo `Guilds`, `GuildMessages` y `MessageContent` (privilegiado, gratis hasta 100
  servidores). Sin `MessageContent` activado en el portal, el login falla y el bot sale con el motivo.
- **El bot usa service role.** Con una clave pública, RLS devuelve cero filas sin error; `ready.ts` lo
  diagnostica al arrancar.
- **La redirect URI es una sola** (`DISCORD_REDIRECT_URI`) y es `/api/integrations/discord/callback`, sin
  `/oauth/`. El callback verifica que el `guild_id` de la query coincida con el del token.
- **Permiso "Cambiar apodo"**: las instalaciones anteriores al 2026-09-09 no lo tienen; hay que reconectar.
- **El equipo no genera logros ni se clasifica**: evita testimonios falsos ("felicitaciones, tremendo
  logro") y gasto de IA.
- **Atribuir por canal no apaga la alerta de silencio**: sólo el cliente hablando la apaga.
- **Modo silencioso** (`bot_can_speak = false`) no cambia qué se lee; sólo que no escribe y que un match
  por nombre no se auto-vincula.

## Limitaciones conocidas y deuda

- `[DISCORD-SIN-PROBAR]` Canales, equipo, sugerencias y atribución nunca se probaron a mano.
- `[DISCORD-PERFIL-SIN-PROBAR]` El PATCH del perfil del bot nunca corrió contra Discord.
- `[E-RETENCION]` Mensajes de terceros guardados para siempre y sin aviso en el servidor. Decidir antes de
  instalarlo en el servidor de un cliente.
- `[DISCORD-VINCULO-SIN-REATRIBUIR]` (nuevo) `linkDiscordClientManuallyAction` (resolver el buzón) y el
  `!vincular` del bot crean el vínculo **sin** `recalcularAtribucion`: los mensajes anteriores de esa
  persona siguen sin dueño en la ficha. `linkDiscordPersonAction` sí recalcula.
- `[DISCORD-VINCULAR-EMAIL-AJENO]` (nuevo, seguridad) `!vincular` vincula con cualquier email exacto de un
  cliente: alguien que conoce el email de otro alumno se vincula como él. Con el bot hablando, además, el
  match por nombre >0.85 auto-vincula (auditoría §3 seguridad 10).
- `[DISCORD-PERMISOS]` `discord_integrations` y el resto de las tablas son editables por cualquier miembro
  de la org (RLS sin rol, acciones sin guard de rol).
- `[DISCORD-STUB-MESSAGE]` (nuevo) `/api/discord/message` no hace nada y nadie lo llama: borrarlo.
- `[REBRAND-EXTERNO]` Borrar el respaldo `OTC_*` en `lib/discord/webhook-auth.ts`,
  `apps/discord-bot/src/lib/limitless-api.ts` y `turbo.json` cuando Vercel y Railway tengan los nombres nuevos.
- `[DISCORD-100-SERVIDORES]` Pasados 100 servidores, `MessageContent` exige verificación de la app.
- `[REPO-RENOMBRADO-DEPLOYS]` Confirmar que Railway sigue apuntando al repo renombrado.
- Un bot expulsado y re-agregado pierde nombre y foto: no hay re-aplicación automática.

## Tests

| Archivo | Cubre |
|---|---|
| `apps/web/lib/discord/__tests__/activity.test.ts` | Silencio y actividad, `person` vs `channel` |
| `apps/web/lib/discord/__tests__/channels.test.ts` | Normalización de `monitored_channels`, dueño del canal, sugerencia de logros |
| `apps/web/lib/discord/__tests__/classify-messages.test.ts` | Prompt, chunks y parseo del clasificador |
| `apps/web/lib/discord/__tests__/profile.test.ts` | Traducción de errores del PATCH (fetch mockeado) |
| `apps/web/lib/discord/__tests__/suggest-identity.test.ts` | Niveles de coincidencia |

`apps/discord-bot` no tiene tests (ni script `test`): la atribución, el pre-filtro de testimonios y
`!vincular` se prueban sólo a mano. Tampoco `app/discord/actions.ts` ni los route handlers.

## Archivos clave

- `apps/discord-bot/src/index.ts`, `client.ts`
- `apps/discord-bot/src/handlers/message-handler.ts`, `link-handler.ts`, `testimonial-handler.ts`
- `apps/discord-bot/src/events/channelCreate.ts`
- `apps/discord-bot/src/lib/supabase.ts`, `attribution.ts`
- `apps/web/app/discord/actions.ts`
- `apps/web/lib/discord/channels.ts`, `activity.ts`, `classify-run.ts`, `suggest-identity.ts`, `profile.ts`
- `apps/web/lib/discord/webhook-auth.ts`, `oauth.ts`
- `apps/web/app/api/integrations/discord/callback/route.ts`
- `apps/web/app/api/cron/daily-signals/route.ts`
- `apps/web/components/integrations/discord-settings.tsx`

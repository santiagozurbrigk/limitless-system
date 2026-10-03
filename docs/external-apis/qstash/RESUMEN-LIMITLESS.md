# QStash (Upstash) — resumen para Limitless

Bajado el 2026-10-03 de `https://upstash.com/docs/qstash/...` (`callbacks.md`, `security.md`, `signature.md`,
`retry.md`), con `curl` sobre la versión `.md` de cada página.

## Qué usamos

- `publishJSON` para encolar jobs (`apps/web/lib/queue/qstash-client.ts`, `lib/sops/enqueue-video-job.ts`,
  `app/marketing/content/reel-variation-actions.ts`).
- **`failureCallback`** (SCRUM-84): QStash llama a esa URL cuando un mensaje agotó sus reintentos (`callbacks.md` §
  "What is a Failure-Callback?"). Cuerpo JSON con `status`, `retried`, `maxRetries`, `dlqId`, `sourceMessageId`, `url`
  y `sourceBody` en base64, entre otros. Lo recibe `/api/queue/failure` y lo lee `lib/queue/failure-callback.ts`.
- **Firma:** cada request de QStash, también los callbacks, trae el JWT en `Upstash-Signature` (`security.md`). Se
  verifica con `Receiver` y las dos signing keys (`lib/queue/qstash-verify.ts`). Los headers propios del publish
  (`x-worker-secret`) **no** se reenvían al callback salvo con `Upstash-Failure-Callback-Forward-*`, por eso
  `/api/queue/failure` verifica sólo la firma.

## Cuidado

- `sourceBody` es el cuerpo original del job: puede traer un token de Google Drive (variaciones de reels) o un
  transcript (análisis de Fathom). No se guarda ni se loguea.
- La `url` del job puede llevar `?workerSecret=` (`[SEG-WORKER-SECRET-QUERY]`): se reporta sólo el `pathname`.

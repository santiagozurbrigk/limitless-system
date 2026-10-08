# ADR-006 — Trabajo asíncrono con Upstash QStash; video pesado en un worker de Fly.io con ffmpeg

- **Estado:** Aceptada con deuda
- **Fecha:**
  - 2026-07-02 — commit `f72ed362` "migrate Business Context RAG ingestion to Upstash QStash" (primer uso).
  - 2026-08-10 — `docs/historial/CHANGES-2026-07-a-08.md` "Feature: Trial Reels — generación automática de 5
    variaciones de reels" (worker en Fly.io).
  - Extensiones: 2026-08-11 "TECH-1: Fathom deep analysis vía QStash" y 2026-08-23 "Fan-out QStash para crons".

## Contexto

La app corre en Vercel (funciones serverless con tope de duración; en agosto las entradas de CHANGES hablan de
300 s como techo). La spec del MVP pedía **BullMQ + Redis** y un worker aparte en Railway
(`docs/archivo/SYSTEM_ARCHITECTURE.md`, "Queue: BullMQ", "Hosting: Vercel, Railway"); quedó reservado el paquete
`packages/queue` ("Reserved — BullMQ + Redis workers"), que sigue vacío. Los problemas concretos que aparecieron:

- Trabajo disparado con `void asyncFn()` se perdía: "el proceso Node.js muere cuando la función serverless
  retorna, por lo que el análisis profundo de Fathom se perdía silenciosamente en producción" (entrada 2026-08-11).
- Los crons que recorren todas las orgs en serie iban a tocar el tope de 300 s (entrada 2026-08-23).
- Generar variantes de video con ffmpeg tarda minutos, y Vercel "tiene límite de 300 s y no tiene FFmpeg
  instalado" (entrada 2026-08-10).

## Decisión

1. **QStash es la cola**: la app publica un mensaje HTTP y QStash lo entrega (con reintentos y firma) a un Route
   Handler `/api/queue/*` de la misma app. Se usa para ingesta RAG, análisis profundo de Fathom, fan-out de crons
   (un mensaje por org), video de SOPs, generación y publicación diferida de Trial Reels.
2. **Siempre con fallback inline** si `QSTASH_TOKEN` no está: "cero regresión en entornos sin QStash".
3. **El procesamiento de video de Trial Reels corre en un servicio aparte en Fly.io** (`apps/reel-worker`, Node +
   ffmpeg, `performance-2x`, escala a cero), que QStash llama con `timeout: 900`. El worker procesa
   **sincrónicamente** y responde 200 aunque falle (el job ya queda `failed`) para que QStash no reintente.

## Alternativas consideradas

- **BullMQ + Redis** (spec): reemplazado. Motivo escrito: "QStash como transporte, no BullMQ — ya estaba instalado
  y configurado en la plataforma" (entrada 2026-08-11). El commit `f72ed362` dice "Replace BullMQ cron-drain with
  HTTP queue", aunque BullMQ nunca figuró en un `package.json` (`git log -S bullmq`); lo que se reemplazó fue un
  drenado por cron. Lo que se infiere: sin Redis ni proceso permanente, QStash encaja con serverless.
- **ffmpeg dentro de una lambda de Vercel** vs **worker en Fly**: se eligió Fly por el tope de 300 s y la falta de
  ffmpeg (entrada 2026-08-10). Aun así quedó un endpoint de fallback en Vercel (`/api/queue/process-reel-variations`).
- **Cómo evitar que Fly apague la máquina a mitad del proceso** (entrada 2026-08-10 "reel-worker procesaba en
  background…"): (a) `min_machines_running = 1` — costo constante; (b) subir `stop_timeout` — no alcanza para
  minutos; (c) procesar sincrónicamente aprovechando el `timeout: 900` de QStash — **elegida**.

## Consecuencias

**Positivas**
- Nada que operar para la cola (sin Redis ni proceso consumidor); los crons terminan en segundos y los workers
  corren en paralelo por org.
- El video pesado no compite con las funciones de la app ni depende de su tope.

**Negativas / deuda**
- **Un worker que devuelve 200 ante un error apaga los reintentos**: la ingesta RAG, el snapshot de inteligencia y
  el tono no reintentan (`[RAG-INGESTA-SIN-REINTENTO]`, `[INTELIGENCIA-SIN-REINTENTO]`).
- Seguridad de la cola: la firma no se ata a la URL (`[AUD-SEG-4]`, `[AUDITORIA-ABIERTOS §3.4]`); en producción los
  workers aceptan un secreto compartido que viaja en la query string y queda en logs (`[SEG-WORKER-SECRET-QUERY]`,
  `[TRIAL-SECRET-EN-URL]`); el worker de Fly tiene autenticación débil (`[SEG-REEL-WORKER-AUTH]`, severidad Crítica).
- El fallback inline vuelve a la situación original (trabajo largo dentro de la request) cuando falta QStash.
- **La decisión de sacar ffmpeg de Vercel no se sostuvo en todo el sistema**: el video de SOPs (2026-09-04) procesa
  con ffmpeg dentro de una lambda (`/api/queue/process-sop-video`, `maxDuration` 800) y carga el archivo entero en
  memoria (`[OPS-SOP-VIDEO-MEMORIA]`); el fallback de reels en la lambda no acepta jobs de Drive
  (`[TRIAL-FALLBACK-ROTO]`).
- El CI revisa los tipos y el lint del reel-worker (SCRUM-261) pero no arma su imagen ni tiene tests propios;
  `cleanup-trial-reels` reprocesa los mismos jobs (`[TRIAL-CLEANUP-LOOP]`).

## Evidencia

- `apps/web/lib/queue/{qstash-client,qstash-verify,verify-queue-request}.ts`, `apps/web/app/api/queue/*`.
- `apps/reel-worker/` (`fly.toml`, `Dockerfile`, `src/index.ts`, `src/processor.ts`),
  `apps/web/app/marketing/content/reel-variation-actions.ts` (`timeout: 900`).
- `packages/queue/package.json` (reservado, vacío).
- `docs/historial/CHANGES-2026-07-a-08.md`: 2026-08-10 (Trial Reels y los fixes del worker), 2026-08-11 (TECH-1),
  2026-08-23 (fan-out); `CHANGES.md` 2026-09-04 "D · SOPS-VIDEO".
- `docs/arquitectura/jobs-webhooks-y-colas.md` § QStash; `docs/archivo/SYSTEM_ARCHITECTURE.md` (TECH STACK).

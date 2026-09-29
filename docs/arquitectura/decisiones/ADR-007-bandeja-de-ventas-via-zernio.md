# ADR-007 — Bandeja de ventas vía Zernio, en vivo y con respuesta; se abandona el inbox guardado de ManyChat/Unipile

- **Estado:** Aceptada con deuda
- **Fecha:** 2026-07-10 — commit `7febdfc8` "feat(inbox): unificar inbox Zernio, fix reloads y análisis IA
  automático" (Zernio había entrado el día anterior, `6657c700` 2026-07-09 "add Zernio messaging, comments &
  analytics"). Anterior al registro detallado de `CHANGES`; no hay entrada que lo explique.

## Contexto

La bandeja de ventas (`/sales/inbox`) pasó por tres proveedores en seis semanas:

| Fecha | Qué | Evidencia |
|---|---|---|
| 2026-05-27 | **ManyChat**: API key + webhook que guarda las conversaciones en `conversations`. El handoff de Fase 1 anota "inbox real bloqueado por verificación Meta" | commit `53a435cb`; `docs/archivo/PHASE_1_HANDOFF_PROMPT.md` |
| 2026-07-01 | **Unipile** para DMs de Instagram y WhatsApp, también guardados en `conversations`, con Realtime | commits `18ec8ce7`, `56c1e7f7`, `a9384fd3` (Hosted Auth, 2026-07-09) |
| 2026-07-03 | Una auditoría marca la bandeja como "**de solo lectura: no hay composer para responder mensajes**", impacto alto | `docs/archivo/pending-features-audit.md` (Ventas) |
| 2026-07-09 | **Zernio** como segunda pestaña "DMs en Vivo" ("DMs de Instagram, WhatsApp y más vía Zernio"), junto a "CRM de Leads" ("Conversaciones guardadas de ManyChat con análisis IA") | diff de `components/sales/sales-inbox-layout.tsx` en `7febdfc8` |
| 2026-07-10 | Se quita la pestaña guardada; la bandeja es **sólo Zernio**. El componente viejo queda con el comentario "Legacy CRM inbox — kept for reference" | `7febdfc8` |

## Decisión

- **La bandeja de ventas es Zernio**: lista de conversaciones y mensajes leídos **en vivo** de la API de Zernio con
  la API key de la org (polling de mensajes cada 30 s), **con envío de respuestas** desde Limitless.
- **No se persisten los DMs.** Lo único que se guarda es el análisis IA por conversación
  (`zernio_conversation_analysis`: tag, calificación, riesgo de ghosting, próximo mensaje sugerido).
- ManyChat, Unipile e Instagram Graph quedan como legado sin uso real (0 filas en `conversations`).

## Alternativas consideradas

- **Mantener ManyChat y/o Unipile** con el inbox guardado: estuvieron en producción y convivieron un día con
  Zernio. **El motivo del cambio no quedó escrito.** Lo que consta: la bandeja guardada no permitía responder
  (auditoría del 2026-07-03) y ManyChat dependía de la verificación de Meta (handoff de Fase 1). Lo que se infiere
  del código: Zernio además cubre contenido, comentarios y anuncios (ADR-008) con una sola API key por org.
- **Persistir los mensajes de Zernio**: la tabla `zernio_messages` existe y el webhook la escribiría, pero la
  pantalla no la lee (hoy 0 filas: el webhook responde 503 por falta de `ZERNIO_WEBHOOK_SECRET`).

## Consecuencias

**Positivas**
- Se puede contestar desde Limitless; una sola integración para DMs de varias redes.
- Nada que sincronizar ni deduplicar para los mensajes.

**Negativas / deuda**
- **Todo lo que medía DMs leyendo `conversations` quedó en cero o vacío**: embudo del panel (`[EMBUDO-PANEL-DMS]`),
  bindings por defecto del embudo DM (`[EMBUDOS-DM-DEFAULTS]`), inteligencia y reportes
  (`[INTELIGENCIA-FUENTES-LEGACY]`), Conexión con Ventas de Marketing (`[MKT-SALES-CONN-VACIA]`), health score del
  super admin (`[CLIENT-HEALTH-LEGACY]`). Sin histórico propio, métricas de DMs por período no se pueden
  reconstruir.
- **El legado sigue vivo**: ManyChat listado, crons de Instagram cada 5 min, `PlatformDataProvider` cargando
  `conversations` con Realtime en cada pantalla, ~7.600 líneas (`[LEGACY-INBOX-BORRAR]`, `[AUD-SALUD-1]`).
- El análisis de DMs confía en el texto que manda el navegador (`[ZERNIO-ANALISIS-UNTRUSTED]`) y los DMs no van
  envueltos como contenido no confiable hacia la IA (`[AUDITORIA-ABIERTOS §3.6]`).
- Dependencia fuerte de un proveedor sin documentación local ni timeouts (`[ZERNIO-DOCS]`, `[API-TIMEOUTS]`,
  `[AUDITORIA §3 confiabilidad 1]`). Una org sin Zernio ve "no conectado": no hay key global (resuelto el 2026-09-29).

## Evidencia

- `apps/web/components/sales/{sales-inbox-layout,zernio-inbox-panel,zernio-side-panel}.tsx`,
  `apps/web/app/integrations/zernio/actions.ts`, `apps/web/lib/zernio/`.
- `supabase/migrations/20260709180000_add_zernio_integrations.sql`,
  `20260710120000_zernio_conversation_analysis.sql`.
- Commits `53a435cb`, `18ec8ce7`, `6657c700`, `7febdfc8`.
- `docs/archivo/pending-features-audit.md`, `docs/archivo/PHASE_1_HANDOFF_PROMPT.md`.
- `docs/areas/ventas.md` (Pantallas, Modelo de datos, legado); `docs/integraciones/README.md` (Unipile "legacy
  (reemplazado por Zernio)").

# ADR-010 — Guardar el payload crudo antes de interpretarlo; nunca inventar un valor (`null` no es `0`)

- **Estado:** Aceptada con deuda
- **Fecha:**
  - 2026-08-29 — `docs/specs/FUNNELS_ARCHITECTURE.md` §9.1 ("`null` vs `0` — el riesgo principal del diseño") y
    `docs/historial/CHANGES-2026-07-a-08.md` "FEAT-EMBUDOS-I2: capa de pagos con Whop y Fanbasis" (crudo antes de
    interpretar; `unmapped` en vez de cero).
  - 2026-08-30 — misma fuente, "UI de conexión de pagos, I-3 y registro de APIs sin documentar": pasa a **regla
    permanente** del `CLAUDE.md` (hoy § 3) y nace el registro `docs/integraciones/apis-sin-documentacion.md`.

## Contexto

Dos problemas se juntaron al construir Embudos (ADR-009):

1. **Integraciones sin documentación legible.** En agosto "los nueve dominios de documentación probados están
   bloqueados por la política de red del entorno" (Whop, Commas, VTurb, Hyros, GHL, WebinarJam…). Había que
   implementar webhooks de cobros sin poder leer el formato real.
2. **Un cero falso es peor que un hueco.** Si un embudo muestra "0" donde en realidad falta la fuente, el
   diagnóstico marca una rotura de negocio que es un hueco de instrumentación, y "un founder que ve 'tu embudo está
   roto en Engaged' cuando lo que pasa es que WebinarJam no está conectado pierde confianza en el módulo entero"
   (spec §9.1). Ya había pasado: los bindings del DM apuntaban a una tabla con 0 filas y el embudo "habría
   renderizado todo en cero" (entrada del 2026-08-29).

## Decisión

- **Persistir el evento crudo antes de interpretarlo** (`payment_webhook_events`, `ghl_webhook_events`, columnas
  `raw` de catálogos, `vturb_stats_cache.stats`, `fathom_calls.share_payload`). "El primer dato real es la fuente de
  verdad" para corregir el mapeo, y ningún evento se pierde mientras tanto.
- **Nunca inventar un valor.** Lo que no se entiende queda `unmapped` o `null` con su motivo. "Un cobro cuyo monto
  no se lee no es un cobro de cero"; "una suscripción indefinida no tiene valor contratado"; "una fecha que no se
  parsea no es 'hoy'"; un precio vacío en el onboarding "se guarda como ausente, no como cero".
- **En embudos, `ResolvedMetric.value` es `number | null`**; el resolver nunca devuelve `0` por ausencia de datos, y
  la UI distingue etapa salteada / sin datos / bajo el piso. Una fuente con cero en el período y **sin historia**
  resuelve `null` (`lib/funnels/source-signal.ts`).
- **El mapeo de cada proveedor vive aislado en un archivo** con la advertencia en el encabezado, y cada suposición
  sin verificar se anota en `docs/integraciones/apis-sin-documentacion.md`.

## Alternativas consideradas

- **Heurísticas de mapeo** (adivinar la unidad por el sufijo `_cents`, detectar tipos de evento por regex): se usaron
  en la primera versión de pagos y se **reemplazaron** el 2026-08-30 por configuración por proveedor cuando llegó la
  documentación real: "funcionaba de casualidad". El monto de Whop estaba mal (tomaba `total`/`subtotal` en vez del
  cobrado) y el cash collected "habría quedado sistemáticamente por debajo del real" (entrada "FIX-EMBUDOS-I2").
- **Devolver `0` cuando no hay datos**: descartado explícitamente en §9.1.
- **Implementar sin registrar las suposiciones**: descartado al crear el registro (2026-08-30).

## Consecuencias

**Positivas**
- Mapeos corregibles y reprocesables sin perder eventos; el panel de pagos avisa cuántos eventos quedaron sin
  interpretar.
- Los tests de normalización usan payloads copiados de la documentación, no inventados.
- La bajada de documentación a `docs/external-apis/` (2026-08-30) convirtió varias suposiciones en hechos.

**Negativas / deuda** (lugares donde la regla todavía no se cumple)
- **Webhooks que responden 200 aunque no guardaron el crudo**: Whop, Commas y GHL no reintentan y el evento se
  pierde (`[EMBUDOS-WEBHOOK-PERDIDA]`, severidad Crítica). El índice único sin `organization_id` hace que un reintento
  legítimo tras un error se descarte como duplicado (`[AUD-CONF-5]`, Crítica).
- Fuentes de embudo que todavía devuelven `0` en una org sin historia (`[EMBUDOS-SIGNAL-INCONSISTENTE]`); la sync de
  contenido de Zernio escribe ceros cuando no reconoce el analytics (`[AUD-CONF-11]`); `ghl-sync` devuelve `ok` con
  ceros cuando falla una org (`[EMBUDOS-CRON-ERRORES]`).
- Mapeos aún sin verificar contra eventos reales (`[EMBUDOS-PAGOS-VERIFICAR]`, `[EMBUDOS-CUENTAS-REALES]`);
  Zernio no tiene documentación local ni registro de sus supuestos (`[ZERNIO-DOCS]`).
- La detección de fuente vacía es una heurística ("¿la org tuvo alguna fila alguna vez?"); el costo de equivocarse
  es mostrar "sin datos" en vez de un cero, "que es el lado seguro" (entrada del 2026-08-30).

## Evidencia

- `CLAUDE.md` § 3 "APIs externas"; `docs/integraciones/apis-sin-documentacion.md` (reemplaza a
  `docs/archivo/API_DOCS_PENDIENTES.md`).
- `apps/web/lib/payments/{ingest,normalize}.ts`, `apps/web/lib/funnels/{resolve,compute,source-signal}.ts`,
  `apps/web/lib/ghl/opportunity-event.ts`, `apps/web/lib/webinarjam/normalize-registrant.ts`.
- `supabase/migrations/20260829200000_payments_whop_fanbasis.sql` (`payment_webhook_events`).
- `docs/specs/FUNNELS_ARCHITECTURE.md` §9.1; `docs/areas/embudos.md` § Reglas 1–3.
- `docs/historial/CHANGES-2026-07-a-08.md`: 2026-08-29 (FEAT-EMBUDOS-I2), 2026-08-30 (UI de pagos y registro; FIX-
  EMBUDOS-I2; DOC-EXTERNAL-APIS y DOC-EXTERNAL-APIS-2).

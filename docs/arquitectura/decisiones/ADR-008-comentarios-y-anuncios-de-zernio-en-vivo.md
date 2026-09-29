# ADR-008 — Comentarios y anuncios de Zernio se leen en vivo, no se persisten (excepción: `ad_metrics_daily`)

- **Estado:** Aceptada
- **Fecha:** 2026-07-12 — commits `ad43eb7e` "comentarios en vivo de Zernio en detalle de pieza" y `84db5ca3`
  "submodulo Anuncios con dashboard en vivo desde Zernio". Excepción acotada el 2026-08-29
  (`docs/historial/CHANGES-2026-07-a-08.md` "FEAT-EMBUDOS-I1: captura diaria de métricas de anuncios").
  Hoy es regla del `CLAUDE.md` § 7.

## Contexto

Con Zernio conectado (ADR-007), Marketing necesitaba mostrar los comentarios de cada publicación y los anuncios de
Meta con sus métricas. Zernio ya expone ambos por API con la key de la org. El contenido publicado sí se sincroniza
a la base (`content_pieces`, con throttle de 30 min), porque sus métricas se usan en rankings, atribución y
reportes.

## Decisión

- **Comentarios y anuncios se consultan a Zernio cada vez que se abre la pantalla** (`listZernioCommentsAction`,
  `getMarketingAdsAction`); las pantallas no leen de la base.
- **No se persisten**, con dos matices que la regla admite:
  1. El webhook de Zernio guarda una **copia** de los comentarios entrantes en `zernio_comments` (y responder u
     ocultar un comentario actualiza esa copia), pero ninguna pantalla la lee.
  2. **`ad_metrics_daily`** (2026-08-29): un cron guarda cada día el agregado de spend, impresiones, alcance y clicks
     por anuncio. Es una excepción explícita: "se persiste el **agregado por período**, no la data cruda de ads"
     (`docs/specs/FUNNELS_ARCHITECTURE.md` §9.3).

## Alternativas consideradas

- **Sincronizar comentarios y anuncios a tablas propias**, como se hace con `content_pieces`: **no quedó escrito
  por qué se descartó**. La spec de embudos lo cita como "convención del repo" sin dar el motivo. Lo que se infiere
  del código: comentarios y anuncios cambian seguido y se muestran tal cual los devuelve Zernio, así que leerlos en
  vivo evita un job de sync, deduplicación y datos viejos.
- Para el histórico de spend, la alternativa a `ad_metrics_daily` era no tener serie (§9.3: "el Spend histórico no
  es reconstruible"); se eligió el snapshot diario.

## Consecuencias

**Positivas**
- Lo que se ve es lo que hay en Zernio en ese momento; no hay sync que se atrase ni se rompa.
- Menos tablas y menos datos de terceros guardados.

**Negativas / deuda**
- **Sin histórico**: lo que no se capturó no se puede reconstruir. La serie de spend arranca el día que corrió el
  cron por primera vez (2026-08-29) y Zernio devuelve una ventana limitada.
- Cada apertura de pantalla depende de la disponibilidad y la latencia de Zernio, sin timeouts
  (`[AUDITORIA §3 confiabilidad 1]`, `[API-TIMEOUTS]`).
- La copia de `zernio_comments` es un dato a medias: hoy 0 filas porque el webhook responde 503 en producción
  (`[ENV-ZERNIO-WEBHOOK-SECRET]`, `[ZERNIO-WEBHOOK-SIN-EVENTOS]`).
- El spend es de la org entera, no por embudo (`[EMBUDOS-MEDIDAS-POR-EMBUDO]`); el cron de captura recorre
  sólo integraciones activas con key propia (sin key global desde 2026-09-29).
- Lo que sí se persiste de Zernio (`content_pieces`) puede quedar con ceros cuando el analytics no se reconoce
  (`[AUD-CONF-11]`) — el mismo problema que ADR-010 prohíbe.

## Evidencia

- `apps/web/app/integrations/zernio/actions.ts` (`listZernioCommentsAction`, `replyToZernioCommentAction`,
  `hideZernioCommentAction`), `apps/web/app/marketing/content/ad-actions.ts` (`getMarketingAdsAction`),
  `apps/web/app/api/integrations/zernio/webhook/route.ts`.
- `supabase/migrations/20260709180000_add_zernio_integrations.sql` (`zernio_comments`),
  `20260829180000_ad_metrics_daily.sql`; `apps/web/lib/marketing/ad-metrics-snapshot.ts`,
  `apps/web/app/api/cron/capture-ad-metrics/route.ts`.
- `docs/specs/FUNNELS_ARCHITECTURE.md` §9.3; `docs/areas/marketing.md` § Reglas ("Comentarios y anuncios son
  live-fetch"); `CLAUDE.md` § 7.

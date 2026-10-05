-- La cola del cron de métricas ya no se traba ni se diluye con piezas sin dato (SCRUM-172, reabierta).
--
-- ⭐ El cron `sync-content-metrics` toma 50 piezas por org ordenadas por
-- `metrics_updated_at asc nulls first`. Desde SCRUM-172 una pieza cuyos
-- analytics de Zernio no se reconocen queda con `metrics` y `metrics_updated_at`
-- en null (un cero que nadie midió no es un dato), y el cron no la tocaba: las
-- historias, que Zernio trae sin analytics, quedaban siempre al frente y con 50
-- o más las piezas con métricas reales no se refrescaban nunca.
--
-- Tres columnas para la cola (las reglas están en
-- apps/web/lib/marketing/cola-de-metricas.ts):
-- - `metrics_checked_at`: último intento de medir la pieza, con o sin dato. Las
--   piezas con null (nuevas) se miden primero; las demás rotan por esta fecha.
-- - `metrics_intentos_sin_dato`: intentos seguidos en los que Zernio no mandó
--   datos reconocibles. Vuelve a 0 cuando llegan métricas.
-- - `metrics_reintentar_desde`: desde cuándo se puede volver a intentar una
--   pieza que quedó sin dato (espera de 1, 2, 4, 8 y 16 días). `infinity` en una
--   historia vencida: no se reintenta más. Null: sin espera.
-- La sync de contenido no toca ninguna: una pieza nueva entra con null y el
-- cron la mide primero. `metrics_updated_at` sigue siendo la fecha de las
-- métricas guardadas.
--
-- Backfill: las piezas ya medidas conservan su lugar en la cola. Sólo agrega
-- columnas y un índice; no borra ni transforma datos. La columna con default 0
-- no reescribe la tabla (Postgres 11+). El trigger set_updated_at deja
-- `updated_at` de las piezas del backfill con la hora de la migración: lo único
-- que lo lee es el throttle de 30 min de la sync de contenido, que se posterga
-- una vez.

alter table public.content_pieces
  add column if not exists metrics_checked_at timestamptz,
  add column if not exists metrics_intentos_sin_dato integer not null default 0,
  add column if not exists metrics_reintentar_desde timestamptz;

comment on column public.content_pieces.metrics_checked_at is
  'Último intento de medir la pieza contra el proveedor, con o sin dato. Distinto de metrics_updated_at, que es la fecha de las métricas guardadas. Ordena la cola del cron de métricas.';
comment on column public.content_pieces.metrics_intentos_sin_dato is
  'Intentos seguidos del cron de métricas sin datos reconocibles. Vuelve a 0 cuando llegan métricas.';
comment on column public.content_pieces.metrics_reintentar_desde is
  'Desde cuándo el cron puede volver a intentar una pieza que quedó sin dato. infinity: no se reintenta más (historia vencida). Null: sin espera.';

update public.content_pieces
  set metrics_checked_at = metrics_updated_at
  where metrics_checked_at is null
    and metrics_updated_at is not null;

-- Las consultas del cron: piezas de Zernio con id de plataforma de una org,
-- las nuevas (null) primero y después la que hace más tiempo que no se intenta.
-- Los filtros por métricas y espera se aplican sobre las filas de la org.
create index if not exists content_pieces_metrics_cola_idx
  on public.content_pieces (organization_id, metrics_checked_at nulls first)
  where source = 'zernio' and platform_post_id is not null;

-- La cola del cron de métricas ya no se traba con piezas sin dato (SCRUM-172, reabierta).
--
-- ⭐ El cron `sync-content-metrics` toma 50 piezas por org ordenadas por
-- `metrics_updated_at asc nulls first`. Desde SCRUM-172 una pieza cuyos
-- analytics de Zernio no se reconocen queda con `metrics` y `metrics_updated_at`
-- en null (un cero que nadie midió no es un dato), y el cron no la tocaba: las
-- historias, que Zernio trae sin analytics, quedaban siempre al frente y con 50
-- o más las piezas con métricas reales no se refrescaban nunca.
--
-- `metrics_checked_at` es el último intento de medir la pieza, con o sin dato.
-- El cron ordena por esta columna y la escribe en cada intento, así toda pieza
-- rota por la cola. `metrics_updated_at` sigue siendo la fecha de las métricas
-- guardadas. La sync de contenido no la toca: una pieza nueva entra con null y
-- el cron la mide primero.
--
-- Backfill: las piezas ya medidas conservan su lugar en la cola. Sólo agrega una
-- columna y un índice; no borra ni transforma datos. El trigger set_updated_at
-- deja `updated_at` de esas piezas con la hora de la migración: lo único que lo
-- lee es el throttle de 30 min de la sync de contenido, que se posterga una vez.

alter table public.content_pieces
  add column if not exists metrics_checked_at timestamptz;

comment on column public.content_pieces.metrics_checked_at is
  'Último intento de medir la pieza contra el proveedor, con o sin dato. Distinto de metrics_updated_at, que es la fecha de las métricas guardadas. Ordena la cola del cron de métricas.';

update public.content_pieces
  set metrics_checked_at = metrics_updated_at
  where metrics_checked_at is null
    and metrics_updated_at is not null;

-- La consulta del cron: piezas de Zernio con id de plataforma de una org, la
-- que hace más tiempo que no se mide primero.
create index if not exists content_pieces_metrics_cola_idx
  on public.content_pieces (organization_id, metrics_checked_at nulls first)
  where source = 'zernio' and platform_post_id is not null;

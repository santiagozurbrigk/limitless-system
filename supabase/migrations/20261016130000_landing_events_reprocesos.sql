-- SCRUM-528 · Limitless Webinars: estado del reproceso de landing_events en
-- columnas propias (AR pasada 1, MAYOR-3).
--
-- El cron /api/cron/reprocesar-landing reprocesa los eventos crudos de la
-- landing que quedaron en `error` o trabados en `pending`, hasta 5 veces. La
-- primera versión guardaba la cuenta y la marca del error definitivo dentro de
-- error_message (texto): frágil ante un cambio de redacción y sin índice para
-- el filtro. Esta migración las pasa a la estructura:
--   - reprocess_attempts: cuántos reprocesos arrancó el cron (el intento del
--     endpoint no cuenta). Lo suma el reclamo, un UPDATE condicionado al valor
--     leído. Nunca negativo.
--   - status 'failed': el error definitivo, después del último reproceso. El
--     cron no lo lee. Se agrega al CHECK de status; los valores de SCRUM-526
--     no cambian.
-- Sin índice nuevo: las dos lecturas del cron (status = 'error', y status =
-- 'pending' con received_at viejo) ya son una condición exacta sobre el índice
-- landing_events_status_received de SCRUM-526 (AR pasada 2, medido con el plan
-- de la consulta sobre 300.000 crudos).
-- error_message queda como texto fijo descriptivo (motivo o última falla).
--
-- Revivir un evento failed (runbook en docs/operacion/alertas.md): status =
-- 'error' y reprocess_attempts = 0, acotado por organización e id.
--
-- No borra ni transforma datos: agrega una columna con default y cambia un
-- CHECK por uno más amplio. La tabla no tiene policies (sólo
-- service role) y la columna nueva hereda los grants de la tabla. Se aplica en
-- producción en SCRUM-532, después de 20261016120000_webinars_modelo_de_datos.

alter table public.landing_events
  add column if not exists reprocess_attempts smallint not null default 0;

alter table public.landing_events
  drop constraint if exists landing_events_reprocess_attempts_check;
alter table public.landing_events
  add constraint landing_events_reprocess_attempts_check check (reprocess_attempts >= 0);

-- El CHECK de SCRUM-526 era inline en la columna: Postgres lo llamó
-- landing_events_status_check.
alter table public.landing_events
  drop constraint if exists landing_events_status_check;
alter table public.landing_events
  add constraint landing_events_status_check
  check (status in ('pending', 'processed', 'unmapped', 'error', 'failed'));

comment on column public.landing_events.reprocess_attempts is
  'Reprocesos que arrancó el cron de la landing (SCRUM-528). Hasta 5; después status = failed.';
comment on column public.landing_events.status is
  'pending, processed, unmapped (con motivo en error_message), error (se reprocesa) o failed (error definitivo, no se reprocesa).';

-- Registro de corridas de los procesos programados (SCRUM-85 · [MONITOREO-Y-ALERTAS]).
--
-- Una fila por corrida de cada cron de `apps/web/vercel.json`. La escribe
-- `conMonitorDeCron` (`lib/observability/cron-monitor.ts`), el punto por donde
-- pasan los 19 crons: abre la fila en `en_curso` al empezar y la cierra con
-- `ok`, `encolado`, `fallo` o `parcial` al terminar. El `id` lo genera el código
-- antes de abrir y el cierre es un upsert por ese `id`: una apertura que vence
-- en el cliente pero llega a escribirse cae en la misma fila que el cierre.
-- Una fila que se queda en `en_curso` es una corrida que se cortó (por
-- ejemplo, el plazo de 60 s de Vercel) o que sigue colgada: la página de
-- Infraestructura del super admin la muestra así.
--
-- `encolado`: un cron con fan-out publicó un job de QStash por cada org y
-- ninguno falló al publicarse. No dice que los workers hayan terminado bien:
-- sus fallas van a Sentry (`/api/queue/failure`). `jobs_encolados` cuenta esos
-- jobs; es nulo en los crons sin fan-out.
--
-- Columnas de organizaciones: `orgs_procesadas` y `orgs_fallidas` son nulas
-- cuando el proceso no informa sus organizaciones (hoy lo hacen los que publican
-- un job por org y las syncs de GHL, Calendly y Fathom). `organizaciones_fallidas`
-- lleva los ids de las que fallaron.
--
-- Pensada para el contrato común de procesos de fondo (ADR-015,
-- `correrPorOrganizacion()`): esa fase suma una tabla por organización con
-- `corrida_id` hacia `id` y el lock por proceso. Esta tabla no cambia.
--
-- Retención: cada cierre borra las corridas de ese proceso con más de 30 días.
-- Sólo el service role: la escribe el cron y la lee la página del super admin
-- con el cliente admin, después de `requireSuperAdmin()`.

create table if not exists public.corridas_de_procesos (
  id uuid primary key default gen_random_uuid(),
  proceso text not null check (char_length(proceso) between 1 and 200),
  inicio timestamptz not null default now(),
  fin timestamptz,
  estado text not null default 'en_curso'
    check (estado in ('en_curso', 'ok', 'encolado', 'fallo', 'parcial')),
  orgs_procesadas integer check (orgs_procesadas >= 0),
  orgs_fallidas integer check (orgs_fallidas >= 0),
  jobs_encolados integer check (jobs_encolados >= 0),
  organizaciones_fallidas uuid[] not null default '{}',
  error text check (char_length(error) <= 500),
  constraint corridas_de_procesos_fin_segun_estado
    check ((estado = 'en_curso') = (fin is null)),
  constraint corridas_de_procesos_fin_despues_del_inicio
    check (fin is null or fin >= inicio),
  constraint corridas_de_procesos_fallidas_dentro_de_procesadas
    check (orgs_fallidas is null or orgs_procesadas is null or orgs_fallidas <= orgs_procesadas),
  constraint corridas_de_procesos_ids_dentro_de_fallidas
    check (cardinality(organizaciones_fallidas) <= coalesce(orgs_fallidas, 0)),
  constraint corridas_de_procesos_encolados_dentro_de_procesadas
    check (jobs_encolados is null or jobs_encolados <= coalesce(orgs_procesadas, 0))
);

comment on table public.corridas_de_procesos is
  'Una fila por corrida de cada cron de vercel.json: inicio, fin, estado (en_curso, ok, encolado, fallo, parcial), organizaciones fallidas y jobs encolados en los crons con fan-out. Retención de 30 días.';

-- La última corrida de cada proceso y la retención por proceso.
create index if not exists corridas_de_procesos_proceso_inicio
  on public.corridas_de_procesos (proceso, inicio desc);

alter table public.corridas_de_procesos enable row level security;
revoke all on public.corridas_de_procesos from anon, authenticated;
grant select, insert, update, delete on public.corridas_de_procesos to service_role;

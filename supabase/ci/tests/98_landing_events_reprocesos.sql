-- SCRUM-528 · Estado del reproceso de landing_events en columnas propias
-- (AR pasada 1, MAYOR-3). reprocess_attempts nace en 0 y nunca es negativo;
-- status acepta 'failed' (error definitivo) además de los de SCRUM-526 y nada
-- más; el índice parcial landing_events_a_reprocesar cubre exactamente lo que
-- lee el cron ('error' y 'pending', por received_at); revivir un failed es
-- volverlo a 'error' con reprocess_attempts = 0; y la tabla sigue sin acceso
-- para usuarios con sesión ni anon (la columna nueva no abre nada).
-- Migración: 20261016130000_landing_events_reprocesos.

begin;

insert into public.organizations (id, name) values
  ('98000000-0000-0000-0000-000000000a00', 'Org A');

insert into public.landing_events (id, organization_id, kind, payload) values
  ('98000000-0000-0000-0000-0000000000e1', '98000000-0000-0000-0000-000000000a00', 'visit', '{}');

do $$
declare
  v_intentos smallint;
begin
  -- Default 0.
  select reprocess_attempts into v_intentos from public.landing_events
   where id = '98000000-0000-0000-0000-0000000000e1';
  if v_intentos is distinct from 0::smallint then
    raise exception 'FALLA: reprocess_attempts no nace en 0 (real %)', v_intentos;
  end if;

  -- NOT NULL y CHECK >= 0.
  begin
    update public.landing_events set reprocess_attempts = -1
     where id = '98000000-0000-0000-0000-0000000000e1';
    raise exception 'FALLA: se aceptó reprocess_attempts negativo';
  exception when check_violation then null;
  end;
  begin
    update public.landing_events set reprocess_attempts = null
     where id = '98000000-0000-0000-0000-0000000000e1';
    raise exception 'FALLA: se aceptó reprocess_attempts null';
  exception when not_null_violation then null;
  end;

  -- 'failed' entra; un status desconocido no; los de SCRUM-526 siguen.
  update public.landing_events set status = 'failed', reprocess_attempts = 5
   where id = '98000000-0000-0000-0000-0000000000e1';
  begin
    update public.landing_events set status = 'definitivo'
     where id = '98000000-0000-0000-0000-0000000000e1';
    raise exception 'FALLA: se aceptó un status de landing_events fuera de pending, processed, unmapped, error y failed';
  exception when check_violation then null;
  end;
  update public.landing_events set status = 'pending' where id = '98000000-0000-0000-0000-0000000000e1';
  update public.landing_events set status = 'processed' where id = '98000000-0000-0000-0000-0000000000e1';
  update public.landing_events set status = 'unmapped' where id = '98000000-0000-0000-0000-0000000000e1';

  -- Revivir (runbook de docs/operacion/alertas.md).
  update public.landing_events set status = 'failed', reprocess_attempts = 5
   where id = '98000000-0000-0000-0000-0000000000e1';
  update public.landing_events set status = 'error', reprocess_attempts = 0
   where organization_id = '98000000-0000-0000-0000-000000000a00'
     and id = '98000000-0000-0000-0000-0000000000e1'
     and status = 'failed';
  if not found then
    raise exception 'FALLA: el UPDATE del runbook no revivió el evento failed';
  end if;

  -- Un solo CHECK de status (el viejo se reemplazó, no quedó al lado).
  if (select count(*) from pg_constraint
       where conrelid = 'public.landing_events'::regclass and contype = 'c'
         and pg_get_constraintdef(oid) like '%status%') <> 1 then
    raise exception 'FALLA: landing_events no tiene exactamente un CHECK sobre status';
  end if;

  -- Índice parcial de lo que lee el cron, por catálogo.
  if not exists (
    select 1
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
     where i.indrelid = 'public.landing_events'::regclass
       and c.relname = 'landing_events_a_reprocesar'
       and i.indpred is not null
       and pg_get_indexdef(i.indexrelid) like '%(received_at)%'
       and pg_get_expr(i.indpred, i.indrelid) like '%error%'
       and pg_get_expr(i.indpred, i.indrelid) like '%pending%'
       and pg_get_expr(i.indpred, i.indrelid) not like '%failed%'
  ) then
    raise exception 'FALLA: falta el índice parcial landing_events_a_reprocesar sobre error y pending';
  end if;

  -- Sin acceso para usuarios: ni policies ni privilegios (también sobre la columna nueva).
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'landing_events') then
    raise exception 'FALLA: landing_events tiene policies';
  end if;
  if has_column_privilege('authenticated', 'public.landing_events', 'reprocess_attempts', 'SELECT')
     or has_column_privilege('authenticated', 'public.landing_events', 'reprocess_attempts', 'UPDATE')
     or has_column_privilege('anon', 'public.landing_events', 'reprocess_attempts', 'SELECT')
     or has_column_privilege('anon', 'public.landing_events', 'reprocess_attempts', 'UPDATE') then
    raise exception 'FALLA: anon o authenticated tienen privilegios sobre reprocess_attempts';
  end if;
  if not has_column_privilege('service_role', 'public.landing_events', 'reprocess_attempts', 'UPDATE') then
    raise exception 'FALLA: el service role no puede escribir reprocess_attempts';
  end if;
end $$;

rollback;

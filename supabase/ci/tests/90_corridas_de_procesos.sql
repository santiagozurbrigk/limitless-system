-- SCRUM-85 · [MONITOREO-Y-ALERTAS]
-- El registro de corridas de los crons lo escribe y lo lee sólo el sistema
-- (service role): ningún usuario, ni el founder ni el super admin con su sesión,
-- lo lee ni lo escribe desde la API. La página de Infraestructura lo lee con el
-- cliente admin después de `requireSuperAdmin()`.
-- Además, la tabla no acepta estados ni cierres inconsistentes.
-- Migración: 20261007120000_corridas_de_procesos.

begin;

insert into auth.users (id, email) values
  ('90000000-0000-0000-0000-00000000000f', 'f@test'),
  ('90000000-0000-0000-0000-00000000005a', 'staff@test');
insert into public.organizations (id, name) values ('90000000-0000-0000-0000-000000000a00', 'Org A');
insert into public.profiles (id, email, organization_id, role, full_name)
values ('90000000-0000-0000-0000-00000000000f', 'f@test', '90000000-0000-0000-0000-000000000a00', 'founder', 'F');
insert into public.super_admin_users (email) values ('staff@test');

insert into public.corridas_de_procesos
  (proceso, inicio, fin, estado, orgs_procesadas, orgs_fallidas, organizaciones_fallidas, error)
values
  ('/api/cron/ghl-sync', now() - interval '2 hours', now() - interval '2 hours' + interval '5 seconds',
   'parcial', 2, 1, array['90000000-0000-0000-0000-000000000a00'::uuid], null);

-- Founder de una org.
select ci.jwt('90000000-0000-0000-0000-00000000000f');
set local role authenticated;
select ci.rechazado(
  $$select * from public.corridas_de_procesos$$,
  'que un founder lea el registro de corridas');
select ci.rechazado(
  $$insert into public.corridas_de_procesos (proceso) values ('/api/cron/ghl-sync')$$,
  'que un founder inserte una corrida');
select ci.rechazado(
  $$update public.corridas_de_procesos set estado = 'ok'$$,
  'que un founder cambie el estado de una corrida');
select ci.rechazado(
  $$delete from public.corridas_de_procesos$$,
  'que un founder borre corridas');
reset role;

-- Super admin con su sesión: tampoco por la API (la página usa el cliente admin).
select ci.jwt('90000000-0000-0000-0000-00000000005a', '{"email": "staff@test"}'::jsonb);
set local role authenticated;
select ci.rechazado(
  $$select * from public.corridas_de_procesos$$,
  'que el super admin lea el registro con su sesión');
select ci.rechazado(
  $$delete from public.corridas_de_procesos$$,
  'que el super admin borre corridas con su sesión');
reset role;

set local role anon;
select ci.rechazado(
  $$select * from public.corridas_de_procesos$$,
  'que anon lea el registro de corridas');
select ci.rechazado(
  $$insert into public.corridas_de_procesos (proceso) values ('/api/cron/ghl-sync')$$,
  'que anon inserte una corrida');
reset role;

-- El service role abre, cierra, lee y aplica la retención. (El schema `ci` es
-- sólo para anon y authenticated: acá las afirmaciones van con `raise`.)
set local role service_role;
do $$
declare
  v_id uuid;
  v_filas bigint;
begin
  insert into public.corridas_de_procesos (proceso) values ('/api/cron/calendly-sync') returning id into v_id;
  update public.corridas_de_procesos
     set estado = 'ok', fin = inicio + interval '3 seconds', orgs_procesadas = 4, orgs_fallidas = 0
   where id = v_id;
  if (select count(*) from public.corridas_de_procesos
       where proceso = '/api/cron/calendly-sync' and estado = 'ok') <> 1 then
    raise exception 'FALLA: el service role no pudo abrir y cerrar una corrida';
  end if;

  -- Un cron con fan-out cierra como encolado, con sus jobs.
  insert into public.corridas_de_procesos (proceso, fin, estado, orgs_procesadas, orgs_fallidas, jobs_encolados)
  values ('/api/cron/intelligence-snapshot', now(), 'encolado', 3, 0, 3);

  insert into public.corridas_de_procesos (proceso, inicio, fin, estado)
  values ('/api/cron/calendly-sync', now() - interval '31 days', now() - interval '31 days', 'fallo');
  delete from public.corridas_de_procesos
   where proceso = '/api/cron/calendly-sync' and inicio < now() - interval '30 days';
  get diagnostics v_filas = row_count;
  if v_filas <> 1 then
    raise exception 'FALLA: la retención borró % corridas (esperada 1, la de más de 30 días)', v_filas;
  end if;
  if (select count(*) from public.corridas_de_procesos where proceso = '/api/cron/calendly-sync') <> 1 then
    raise exception 'FALLA: la retención borró la corrida reciente';
  end if;
end $$;
reset role;

-- Estados y cierres inconsistentes.
do $$
begin
  begin
    insert into public.corridas_de_procesos (proceso, estado) values ('/api/cron/ghl-sync', 'colgada');
    raise exception 'FALLA: se aceptó un estado fuera de en_curso, ok, fallo y parcial';
  exception when check_violation then null;
  end;
  begin
    insert into public.corridas_de_procesos (proceso, estado, fin) values ('/api/cron/ghl-sync', 'en_curso', now());
    raise exception 'FALLA: se aceptó una corrida en curso con fin';
  exception when check_violation then null;
  end;
  begin
    insert into public.corridas_de_procesos (proceso, estado) values ('/api/cron/ghl-sync', 'ok');
    raise exception 'FALLA: se aceptó una corrida cerrada sin fin';
  exception when check_violation then null;
  end;
  begin
    insert into public.corridas_de_procesos (proceso, inicio, fin, estado)
    values ('/api/cron/ghl-sync', now(), now() - interval '1 minute', 'ok');
    raise exception 'FALLA: se aceptó un fin anterior al inicio';
  exception when check_violation then null;
  end;
  begin
    insert into public.corridas_de_procesos (proceso, fin, estado, orgs_procesadas, orgs_fallidas)
    values ('/api/cron/ghl-sync', now(), 'parcial', 1, 2);
    raise exception 'FALLA: se aceptaron más orgs fallidas que procesadas';
  exception when check_violation then null;
  end;
  begin
    insert into public.corridas_de_procesos (proceso, fin, estado, organizaciones_fallidas)
    values ('/api/cron/ghl-sync', now(), 'parcial', array['90000000-0000-0000-0000-000000000a00'::uuid]);
    raise exception 'FALLA: se aceptaron ids de orgs fallidas sin la cuenta';
  exception when check_violation then null;
  end;
  begin
    insert into public.corridas_de_procesos (proceso, fin, estado, orgs_procesadas, jobs_encolados)
    values ('/api/cron/ghl-sync', now(), 'encolado', 2, 3);
    raise exception 'FALLA: se aceptaron más jobs encolados que orgs procesadas';
  exception when check_violation then null;
  end;
  begin
    insert into public.corridas_de_procesos (proceso, fin, estado, error)
    values ('/api/cron/ghl-sync', now(), 'fallo', repeat('x', 501));
    raise exception 'FALLA: se aceptó un mensaje de error de más de 500 caracteres';
  exception when check_violation then null;
  end;
end $$;

rollback;

-- SCRUM-552 · [CONSOLA-ACCESO-STAFF] El staff es founder de la org de Limitless.
-- A lo sumo una org con experience = 'limitless' (índice único). La asociación
-- pone en esa org los perfiles del staff sin organización, con la misma
-- comparación de emails que la app (fila de la lista tal cual, email de Auth
-- normalizado), sin tocar rol ni estado, sin mover perfiles de otra org, una
-- sola vez y abortando si no hay exactamente una org marcada (salvo que no haya
-- nada que asociar). La invitación deja entrar al staff sólo a la org de
-- Limitless, como founder cuando crea el perfil; a otra org (o sin org marcada)
-- sigue en cuenta_de_staff. Nadie con su JWT ni el service role llama a la
-- asociación.
-- Migración: 20261101120000_staff_en_org_de_limitless.

begin;

insert into public.organizations (id, name, experience) values
  ('98000000-0000-0000-0000-000000000100', 'Org de Limitless', 'limitless');
insert into public.organizations (id, name) values
  ('98000000-0000-0000-0000-000000000a00', 'Org A');

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('98000000-0000-0000-0000-000000000001', 's1@test',     now(), '{}'),
  ('98000000-0000-0000-0000-000000000002', 's2@test',     now(), '{}'),
  ('98000000-0000-0000-0000-000000000003', 's3@test',     now(), '{"full_name": "Staff Tres"}'),
  ('98000000-0000-0000-0000-00000000003b', 's3b@test',    now(), '{}'),
  ('98000000-0000-0000-0000-000000000004', ' S4@Test ',   now(), '{}'),
  ('98000000-0000-0000-0000-000000000005', 's5@test',     now(), '{}'),
  ('98000000-0000-0000-0000-000000000006', 's6@test',     now(), '{}'),
  ('98000000-0000-0000-0000-000000000007', 's7@test',     now(), '{}'),
  ('98000000-0000-0000-0000-0000000000f1', 'h@test',      now(), '{}'),
  ('98000000-0000-0000-0000-0000000000f2', 'n@test',      now(), '{}');

-- La lista de staff. 'S5@test' y 'S7@test' están mal cargadas (con mayúsculas):
-- la app nunca les dio el panel, así que no asocian ni dan founder.
insert into public.super_admin_users (email) values
  ('s1@test'), ('s2@test'), ('s3@test'), ('s3b@test'), ('s4@test'),
  ('S5@test'), ('s6@test'), ('S7@test');

insert into public.profiles (id, email, organization_id, role, full_name, is_active) values
  ('98000000-0000-0000-0000-000000000001', 's1@test',   null, 'founder', 'S1', true),
  ('98000000-0000-0000-0000-000000000002', 's2@test',   '98000000-0000-0000-0000-000000000a00', 'founder', 'S2', true),
  ('98000000-0000-0000-0000-000000000004', ' S4@Test ', null, 'founder', 'S4', true),
  ('98000000-0000-0000-0000-000000000005', 's5@test',   null, 'founder', 'S5', true),
  ('98000000-0000-0000-0000-000000000006', 's6@test',   null, 'member',  'S6', false),
  ('98000000-0000-0000-0000-0000000000f1', 'h@test',    null, 'founder', 'H',  true);

insert into public.team_roles (id, organization_id, name) values
  ('98000000-0000-0000-0000-0000000000e1', '98000000-0000-0000-0000-000000000100', 'Operaciones Limitless');

-- ─── 1. Índice: una sola org de Limitless ────────────────────────────────────
select ci.espera(
  (select count(*) from pg_indexes i
    join pg_class c on c.relname = i.indexname
    join pg_index x on x.indexrelid = c.oid
    where i.schemaname = 'public' and i.tablename = 'organizations'
      and i.indexname = 'organizations_una_sola_limitless'
      and x.indisunique
      and i.indexdef like '%WHERE (experience = ''limitless''::text)%'),
  1, 'existe el índice único parcial organizations_una_sola_limitless sobre experience = limitless');

do $$
begin
  begin
    insert into public.organizations (name, experience) values ('Otra de Limitless', 'limitless');
  exception when unique_violation then
    return;
  end;
  raise exception 'FALLA: se pudo marcar una segunda organización como limitless';
end $$;

-- ─── 2. Nadie de la API llama a la asociación ────────────────────────────────
select ci.espera(has_function_privilege('anon', 'public.asociar_staff_a_la_org_de_limitless()', 'EXECUTE')::int,
  0, 'anon no tiene EXECUTE sobre asociar_staff_a_la_org_de_limitless');
select ci.espera(has_function_privilege('authenticated', 'public.asociar_staff_a_la_org_de_limitless()', 'EXECUTE')::int,
  0, 'authenticated no tiene EXECUTE sobre asociar_staff_a_la_org_de_limitless');
select ci.espera(has_function_privilege('service_role', 'public.asociar_staff_a_la_org_de_limitless()', 'EXECUTE')::int,
  0, 'service_role no tiene EXECUTE sobre asociar_staff_a_la_org_de_limitless');
select ci.espera(
  (select count(*) from pg_proc
    where oid = 'public.asociar_staff_a_la_org_de_limitless()'::regprocedure
      and not prosecdef
      and 'search_path=public' = any(proconfig)),
  1, 'la asociación es security invoker con search_path = public');

select ci.jwt('98000000-0000-0000-0000-000000000001');
set local role authenticated;
select ci.rechazado($$select public.asociar_staff_a_la_org_de_limitless()$$,
  'que un usuario con sesión llame a la asociación del staff');
reset role;
set local role anon;
select ci.rechazado($$select public.asociar_staff_a_la_org_de_limitless()$$,
  'que anon llame a la asociación del staff');
reset role;

-- ─── 5. Más de una org marcada: aborta ───────────────────────────────────────
savepoint dos_marcadas;
drop index public.organizations_una_sola_limitless;
update public.organizations set experience = 'limitless' where id = '98000000-0000-0000-0000-000000000a00';
do $$
begin
  begin
    perform public.asociar_staff_a_la_org_de_limitless();
  exception when others then
    if sqlerrm like 'Hay 2 organizaciones con experience = limitless%' then
      return;
    end if;
    raise exception 'FALLA: con dos orgs marcadas la asociación falló por otro motivo: %', sqlerrm;
  end;
  raise exception 'FALLA: con dos orgs marcadas la asociación no abortó';
end $$;
rollback to savepoint dos_marcadas;
select ci.espera(
  (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'organizations_una_sola_limitless'),
  1, 'el índice vuelve después del rollback del caso de dos orgs marcadas');

-- ─── 3. Ninguna org marcada y staff pendiente: aborta sin cambios ────────────
update public.organizations set experience = 'full' where id = '98000000-0000-0000-0000-000000000100';
do $$
begin
  begin
    perform public.asociar_staff_a_la_org_de_limitless();
  exception when others then
    if sqlerrm like 'Hay 3 perfiles de staff sin organización%' then
      return;
    end if;
    raise exception 'FALLA: sin org marcada y con staff pendiente la asociación falló por otro motivo: %', sqlerrm;
  end;
  raise exception 'FALLA: sin org marcada y con staff pendiente la asociación no abortó';
end $$;
select ci.espera(
  (select count(*) from public.profiles
    where organization_id is null
      and id in ('98000000-0000-0000-0000-000000000001', '98000000-0000-0000-0000-000000000004',
                 '98000000-0000-0000-0000-000000000005', '98000000-0000-0000-0000-000000000006',
                 '98000000-0000-0000-0000-0000000000f1')),
  5, 'sin org marcada la asociación que aborta no cambia ningún perfil');
update public.organizations set experience = 'limitless' where id = '98000000-0000-0000-0000-000000000100';

-- ─── 6. Asociación ───────────────────────────────────────────────────────────
select ci.espera(public.asociar_staff_a_la_org_de_limitless(), 3,
  'la asociación pone en la org de Limitless a s1, s4 y s6');
select ci.espera(
  (select count(*) from public.profiles
    where organization_id = '98000000-0000-0000-0000-000000000100'
      and id in ('98000000-0000-0000-0000-000000000001', '98000000-0000-0000-0000-000000000004',
                 '98000000-0000-0000-0000-000000000006')),
  3, 's1, s4 (email de Auth con mayúsculas y espacios) y s6 quedan en la org de Limitless');
select ci.espera(
  (select count(*) from public.profiles
    where id = '98000000-0000-0000-0000-000000000002'
      and organization_id = '98000000-0000-0000-0000-000000000a00' and role = 'founder'),
  1, 'el staff que ya está en otra org no se mueve y conserva su rol');
select ci.espera(
  (select count(*) from public.profiles
    where organization_id is null
      and id in ('98000000-0000-0000-0000-000000000005', '98000000-0000-0000-0000-0000000000f1')),
  2, 'una fila de la lista mal cargada y un perfil que no es del staff quedan sin org');
select ci.espera(
  (select count(*) from public.profiles
    where id = '98000000-0000-0000-0000-000000000006' and role = 'member' and not is_active),
  1, 'la asociación no cambia el rol ni el estado del perfil');

-- ─── 7. Idempotencia ─────────────────────────────────────────────────────────
create temp table antes on commit drop as
  select id, organization_id, role, is_active from public.profiles;
select ci.espera(public.asociar_staff_a_la_org_de_limitless(), 0,
  'la segunda corrida de la asociación no asocia a nadie');
select ci.espera(
  (select count(*) from (
     (select * from antes except select id, organization_id, role, is_active from public.profiles)
     union all
     (select id, organization_id, role, is_active from public.profiles except select * from antes)) d),
  0, 'la segunda corrida deja los perfiles exactamente igual');
select ci.espera((select count(*) from public.profiles), (select count(*) from antes),
  'la segunda corrida no crea ni borra perfiles');

-- ─── 4. Ninguna org marcada y nada pendiente: 0 sin error ────────────────────
savepoint sin_marcar;
update public.organizations set experience = 'full' where id = '98000000-0000-0000-0000-000000000100';
select ci.espera(public.asociar_staff_a_la_org_de_limitless(), 0,
  'sin org marcada y sin staff pendiente la asociación devuelve 0 sin error');
rollback to savepoint sin_marcar;

-- ─── 8. Invitaciones del staff ───────────────────────────────────────────────
insert into public.team_invitations (organization_id, email, custom_role_id, invited_by, token, status, expires_at) values
  ('98000000-0000-0000-0000-000000000100', 's3@test',    '98000000-0000-0000-0000-0000000000e1', '98000000-0000-0000-0000-000000000001', 'tok-s3-l',  'pending', now() + interval '7 days'),
  ('98000000-0000-0000-0000-000000000a00', 's3b@test',   null, null, 'tok-s3b-a', 'pending', now() + interval '7 days'),
  ('98000000-0000-0000-0000-000000000100', 's3b@test',   null, null, 'tok-s3b-l', 'pending', now() + interval '7 days'),
  ('98000000-0000-0000-0000-000000000100', 's1@test',    null, null, 'tok-s1-l',  'pending', now() + interval '7 days'),
  ('98000000-0000-0000-0000-000000000100', 's6@test',    null, null, 'tok-s6-l',  'pending', now() + interval '7 days'),
  ('98000000-0000-0000-0000-000000000100', 's2@test',    null, null, 'tok-s2-l',  'pending', now() + interval '7 days'),
  ('98000000-0000-0000-0000-000000000a00', ' S4@TEST ',  null, null, 'tok-s4-a',  'pending', now() + interval '7 days'),
  ('98000000-0000-0000-0000-000000000a00', 's5@test',    null, null, 'tok-s5-a',  'pending', now() + interval '7 days'),
  ('98000000-0000-0000-0000-000000000100', 's7@test',    null, null, 'tok-s7-l',  'pending', now() + interval '7 days'),
  ('98000000-0000-0000-0000-000000000a00', 's7@test',    null, null, 'tok-s7-a',  'pending', now() + interval '7 days'),
  ('98000000-0000-0000-0000-000000000100', 'n@test',     null, null, 'tok-n-l',   'pending', now() + interval '7 days');

-- Como la app: service role (el grant de ci se va con el rollback).
grant usage on schema ci to service_role;
grant execute on all functions in schema ci to service_role;
set local role service_role;

create temp table r(caso text, motivo text) on commit drop;

-- El staff sin perfil entra a la org de Limitless como founder.
insert into r values ('s3 a L', public.aceptar_invitacion_de_equipo('tok-s3-l', '98000000-0000-0000-0000-000000000003'));
select ci.espera((select count(*) from r where caso = 's3 a L' and motivo = 'aceptada'), 1,
  'el staff sin perfil acepta la invitación a la org de Limitless');
select ci.espera(
  (select count(*) from public.profiles
    where id = '98000000-0000-0000-0000-000000000003'
      and organization_id = '98000000-0000-0000-0000-000000000100'
      and role = 'founder'
      and is_active
      and custom_role_id = '98000000-0000-0000-0000-0000000000e1'
      and full_name = 'Staff Tres'),
  1, 'el staff que entra por invitación a la org de Limitless queda founder, activo y con el rol de la invitación');
select ci.espera((select count(*) from public.team_invitations where token = 'tok-s3-l' and status = 'accepted'), 1,
  'la invitación del staff a la org de Limitless queda usada');

-- A otra org: cuenta_de_staff, sin tocar nada.
insert into r values ('s3b a A', public.aceptar_invitacion_de_equipo('tok-s3b-a', '98000000-0000-0000-0000-00000000003b'));
insert into r values ('s4 a A', public.aceptar_invitacion_de_equipo('tok-s4-a', '98000000-0000-0000-0000-000000000004'));
insert into r values ('s5 a A', public.aceptar_invitacion_de_equipo('tok-s5-a', '98000000-0000-0000-0000-000000000005'));
select ci.espera((select count(*) from r where caso = 's3b a A' and motivo = 'cuenta_de_staff'), 1,
  'el staff no se suma por invitación a una org que no es la de Limitless');
select ci.espera((select count(*) from r where caso = 's4 a A' and motivo = 'cuenta_de_staff'), 1,
  'el staff con mayúsculas y espacios en el email tampoco se suma a otra org');
select ci.espera((select count(*) from r where caso = 's5 a A' and motivo = 'cuenta_de_staff'), 1,
  'una fila de la lista con mayúsculas igual bloquea la invitación a otra org (regla normalizada)');
select ci.espera((select count(*) from public.team_invitations where token in ('tok-s3b-a', 'tok-s4-a', 'tok-s5-a') and status = 'pending'), 3,
  'las invitaciones del staff a otra org quedan pendientes');
select ci.espera((select count(*) from public.profiles where id = '98000000-0000-0000-0000-00000000003b'), 0,
  'al staff invitado a otra org no se le crea perfil');

-- Perfiles que ya existen: la invitación nunca les cambia el rol.
insert into r values ('s1 a L', public.aceptar_invitacion_de_equipo('tok-s1-l', '98000000-0000-0000-0000-000000000001'));
insert into r values ('s6 a L', public.aceptar_invitacion_de_equipo('tok-s6-l', '98000000-0000-0000-0000-000000000006'));
insert into r values ('s2 a L', public.aceptar_invitacion_de_equipo('tok-s2-l', '98000000-0000-0000-0000-000000000002'));
select ci.espera((select count(*) from r where caso = 's1 a L' and motivo = 'ya_era_miembro'), 1,
  'el staff que ya está en la org de Limitless la acepta como ya_era_miembro');
select ci.espera((select count(*) from public.profiles where id = '98000000-0000-0000-0000-000000000001' and role = 'founder'), 1,
  'el founder de la org de Limitless sigue founder');
select ci.espera((select count(*) from r where caso = 's6 a L' and motivo = 'ya_era_miembro'), 1,
  'el staff member de la org de Limitless la acepta como ya_era_miembro');
select ci.espera((select count(*) from public.profiles where id = '98000000-0000-0000-0000-000000000006' and role = 'member' and not is_active), 1,
  'la invitación no pasa a founder a un perfil que ya existía');
select ci.espera((select count(*) from r where caso = 's2 a L' and motivo = 'otra_org'), 1,
  'el staff que está en otra org no se mueve a la de Limitless');
select ci.espera((select count(*) from public.profiles where id = '98000000-0000-0000-0000-000000000002' and organization_id = '98000000-0000-0000-0000-000000000a00'), 1,
  'el staff de otra org sigue en su org');

-- Una fila mal cargada (S7@test) no da founder: entra como cualquiera.
savepoint s7_a_otra;
insert into r values ('s7 a A', public.aceptar_invitacion_de_equipo('tok-s7-a', '98000000-0000-0000-0000-000000000007'));
select ci.espera((select count(*) from r where caso = 's7 a A' and motivo = 'cuenta_de_staff'), 1,
  'una fila de la lista con mayúsculas bloquea la invitación a otra org');
rollback to savepoint s7_a_otra;
insert into r values ('s7 a L', public.aceptar_invitacion_de_equipo('tok-s7-l', '98000000-0000-0000-0000-000000000007'));
select ci.espera((select count(*) from r where caso = 's7 a L' and motivo = 'aceptada'), 1,
  'la cuenta de una fila mal cargada acepta la invitación a la org de Limitless');
select ci.espera((select count(*) from public.profiles where id = '98000000-0000-0000-0000-000000000007' and organization_id = '98000000-0000-0000-0000-000000000100' and role = 'member'), 1,
  'una fila de la lista que la app no reconoce no da founder: queda member');

-- Alguien que no es del staff: la regla común.
insert into r values ('n a L', public.aceptar_invitacion_de_equipo('tok-n-l', '98000000-0000-0000-0000-0000000000f2'));
select ci.espera((select count(*) from r where caso = 'n a L' and motivo = 'aceptada'), 1,
  'alguien que no es del staff acepta la invitación a la org de Limitless');
select ci.espera((select count(*) from public.profiles where id = '98000000-0000-0000-0000-0000000000f2' and organization_id = '98000000-0000-0000-0000-000000000100' and role = 'member'), 1,
  'quien no es del staff entra member a la org de Limitless');

-- Sin org marcada, el staff no entra a ninguna (fail-closed).
reset role;
savepoint sin_org_marcada;
update public.organizations set experience = 'full' where id = '98000000-0000-0000-0000-000000000100';
set local role service_role;
insert into r values ('s3b a L sin marcar', public.aceptar_invitacion_de_equipo('tok-s3b-l', '98000000-0000-0000-0000-00000000003b'));
select ci.espera((select count(*) from r where caso = 's3b a L sin marcar' and motivo = 'cuenta_de_staff'), 1,
  'sin org marcada el staff no se suma por invitación a la que era de Limitless');
select ci.espera((select count(*) from public.profiles where id = '98000000-0000-0000-0000-00000000003b'), 0,
  'sin org marcada al staff invitado no se le crea perfil');
select ci.espera((select count(*) from public.team_invitations where token = 'tok-s3b-l' and status = 'pending'), 1,
  'sin org marcada la invitación del staff queda pendiente');
reset role;
rollback to savepoint sin_org_marcada;

-- ─── 9. Atributos de aceptar_invitacion_de_equipo ────────────────────────────
select ci.espera(
  (select count(*) from pg_proc
    where oid = 'public.aceptar_invitacion_de_equipo(text, uuid)'::regprocedure
      and prosecdef
      and proconfig = '{search_path=public}'),
  1, 'aceptar_invitacion_de_equipo sigue security definer con search_path = public');
select ci.espera(has_function_privilege('authenticated', 'public.aceptar_invitacion_de_equipo(text, uuid)', 'EXECUTE')::int,
  0, 'authenticated no tiene EXECUTE sobre aceptar_invitacion_de_equipo');
select ci.espera(has_function_privilege('anon', 'public.aceptar_invitacion_de_equipo(text, uuid)', 'EXECUTE')::int,
  0, 'anon no tiene EXECUTE sobre aceptar_invitacion_de_equipo');
select ci.espera(has_function_privilege('service_role', 'public.aceptar_invitacion_de_equipo(text, uuid)', 'EXECUTE')::int,
  1, 'service_role tiene EXECUTE sobre aceptar_invitacion_de_equipo');

rollback;

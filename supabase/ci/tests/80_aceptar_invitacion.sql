-- SCRUM-495 · [AUTH-ALTA-EMAIL-AJENO] parte A
-- Aceptar una invitación de equipo: sólo la cuenta que ya existe con el email
-- de la invitación (confirmado), una sola vez, con el rol de la org; si no se
-- puede, la invitación y el perfil quedan como estaban. Nadie con su JWT puede
-- llamar a la función: la llama la app con el service role.
-- Migración: 20261005150000_aceptar_invitacion_de_equipo.

begin;

insert into public.organizations (id, name) values
  ('80000000-0000-0000-0000-000000000a00', 'Org A'),
  ('80000000-0000-0000-0000-000000000b00', 'Org B');

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('80000000-0000-0000-0000-00000000000f', 'f@test',           now(), '{}'),
  ('80000000-0000-0000-0000-0000000000a1', 'Invitado@Test',    now(), '{"full_name": "Ana Invitada"}'),
  ('80000000-0000-0000-0000-0000000000a2', 'sinconfirmar@test', null, '{}'),
  ('80000000-0000-0000-0000-0000000000a3', 'otro@test',        now(), '{}'),
  ('80000000-0000-0000-0000-0000000000a4', 'deb@test',         now(), '{}'),
  ('80000000-0000-0000-0000-0000000000a5', 'staff@test',       now(), '{}'),
  ('80000000-0000-0000-0000-0000000000a6', 'rol@test',         now(), '{}'),
  ('80000000-0000-0000-0000-0000000000a7', ' Staff2@Test',     now(), '{}'),
  ('80000000-0000-0000-0000-0000000000a8', 'huerfano@test',    now(), '{}');

-- Staff de Limitless: uno con su perfil sin org y otro recién dado de alta, todavía
-- sin perfil (docs/operacion/alta-super-admin.md). La allowlist guarda el email en
-- minúsculas (isSuperAdminEmail compara así).
insert into public.super_admin_users (email) values ('staff@test'), ('staff2@test');

insert into public.profiles (id, email, organization_id, role, full_name) values
  ('80000000-0000-0000-0000-00000000000f', 'f@test',   '80000000-0000-0000-0000-000000000a00', 'founder', 'F'),
  ('80000000-0000-0000-0000-0000000000a4', 'deb@test', '80000000-0000-0000-0000-000000000b00', 'founder', 'Deb');
-- El super admin tiene perfil sin organización (ensureUserBootstrap); un perfil
-- sin org que no es del staff también existe (datos viejos).
insert into public.profiles (id, email, organization_id, role, full_name) values
  ('80000000-0000-0000-0000-0000000000a5', 'staff@test', null, 'founder', 'Staff'),
  ('80000000-0000-0000-0000-0000000000a8', 'huerfano@test', null, 'founder', 'Huérfano');

insert into public.team_roles (id, organization_id, name) values
  ('80000000-0000-0000-0000-0000000000e1', '80000000-0000-0000-0000-000000000a00', 'Ventas A'),
  ('80000000-0000-0000-0000-0000000000e2', '80000000-0000-0000-0000-000000000a00', 'Rol que se va a B');

insert into public.team_invitations (organization_id, email, custom_role_id, invited_by, token, status, expires_at) values
  ('80000000-0000-0000-0000-000000000a00', 'invitado@test ', '80000000-0000-0000-0000-0000000000e1', '80000000-0000-0000-0000-00000000000f', 'tok-ok',       'pending', now() + interval '7 days'),
  ('80000000-0000-0000-0000-000000000a00', 'vencida@test',   null, null, 'tok-vencida',  'pending', now() - interval '1 minute'),
  ('80000000-0000-0000-0000-000000000a00', 'anulada@test',   null, null, 'tok-anulada',  'expired', now() + interval '7 days'),
  ('80000000-0000-0000-0000-000000000a00', 'sinconfirmar@test', null, null, 'tok-sinconf', 'pending', now() + interval '7 days'),
  ('80000000-0000-0000-0000-000000000a00', 'deb@test',       null, null, 'tok-otra-org', 'pending', now() + interval '7 days'),
  ('80000000-0000-0000-0000-000000000a00', 'staff@test',     null, null, 'tok-staff',    'pending', now() + interval '7 days'),
  ('80000000-0000-0000-0000-000000000a00', 'STAFF2@test',    null, null, 'tok-staff2',   'pending', now() + interval '7 days'),
  ('80000000-0000-0000-0000-000000000a00', 'huerfano@test',  null, null, 'tok-huerfano', 'pending', now() + interval '7 days'),
  ('80000000-0000-0000-0000-000000000a00', 'f@test',         null, null, 'tok-miembro',  'pending', now() + interval '7 days'),
  ('80000000-0000-0000-0000-000000000a00', 'rol@test',       '80000000-0000-0000-0000-0000000000e2', null, 'tok-rol', 'pending', now() + interval '7 days');

-- Una invitación vieja cuyo rol hoy es de otra org (el trigger de SCRUM-75 sólo
-- mira cuando cambia el rol de la invitación, no cuando se mueve el rol).
update public.team_roles set organization_id = '80000000-0000-0000-0000-000000000b00'
where id = '80000000-0000-0000-0000-0000000000e2';

-- ─── Nadie la llama con su JWT ───────────────────────────────────────────────
select ci.jwt('80000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select ci.rechazado(
  $$select public.aceptar_invitacion_de_equipo('tok-ok', '80000000-0000-0000-0000-0000000000a1')$$,
  'que un usuario con sesión acepte una invitación llamando a la función directo');
reset role;
set local role anon;
select ci.rechazado(
  $$select public.aceptar_invitacion_de_equipo('tok-ok', '80000000-0000-0000-0000-0000000000a1')$$,
  'que anon acepte una invitación');
reset role;

-- ─── Como la app: service role ───────────────────────────────────────────────
-- Las ayudas de ci/ son para anon y authenticated; acá también las usa el
-- service role (el grant se va con el rollback).
grant usage on schema ci to service_role;
grant execute on all functions in schema ci to service_role;
set local role service_role;

create temp table r(caso text, motivo text) on commit drop;

-- Rechazos: ninguno toca la invitación ni crea perfiles.
insert into r values ('inexistente', public.aceptar_invitacion_de_equipo('tok-no-existe', '80000000-0000-0000-0000-0000000000a1'));
insert into r values ('vencida', public.aceptar_invitacion_de_equipo('tok-vencida', '80000000-0000-0000-0000-0000000000a1'));
insert into r values ('anulada', public.aceptar_invitacion_de_equipo('tok-anulada', '80000000-0000-0000-0000-0000000000a1'));
insert into r values ('sin cuenta', public.aceptar_invitacion_de_equipo('tok-ok', '80000000-0000-0000-0000-0000000000ff'));
insert into r values ('sin confirmar', public.aceptar_invitacion_de_equipo('tok-sinconf', '80000000-0000-0000-0000-0000000000a2'));
insert into r values ('otro email', public.aceptar_invitacion_de_equipo('tok-ok', '80000000-0000-0000-0000-0000000000a3'));
insert into r values ('otra org', public.aceptar_invitacion_de_equipo('tok-otra-org', '80000000-0000-0000-0000-0000000000a4'));
insert into r values ('rol de otra org', public.aceptar_invitacion_de_equipo('tok-rol', '80000000-0000-0000-0000-0000000000a6'));

select ci.espera((select count(*) from r where caso = 'inexistente' and motivo = 'no_existe'), 1, 'una invitación inexistente da no_existe');
select ci.espera((select count(*) from r where caso = 'vencida' and motivo = 'vencida'), 1, 'una invitación vencida da vencida');
select ci.espera((select count(*) from r where caso = 'anulada' and motivo = 'vencida'), 1, 'una invitación anulada da vencida');
select ci.espera((select count(*) from r where caso = 'sin cuenta' and motivo = 'sin_cuenta'), 1, 'un usuario inexistente da sin_cuenta');
select ci.espera((select count(*) from r where caso = 'sin confirmar' and motivo = 'email_sin_confirmar'), 1, 'un email sin confirmar no acepta');
select ci.espera((select count(*) from r where caso = 'otro email' and motivo = 'otro_email'), 1, 'otra cuenta no acepta la invitación');
select ci.espera((select count(*) from r where caso = 'otra org' and motivo = 'otra_org'), 1, 'una cuenta de otra org no acepta');
select ci.espera((select count(*) from r where caso = 'rol de otra org' and motivo = 'rol_de_otra_org'), 1, 'una invitación con un rol de otra org no se acepta');

select ci.espera((select count(*) from public.team_invitations where status = 'pending' and token in ('tok-ok', 'tok-sinconf', 'tok-otra-org', 'tok-rol')), 4,
  'los rechazos dejan la invitación pendiente');
select ci.espera((select count(*) from public.profiles where id in (
  '80000000-0000-0000-0000-0000000000a1', '80000000-0000-0000-0000-0000000000a2',
  '80000000-0000-0000-0000-0000000000a3', '80000000-0000-0000-0000-0000000000a6')), 0,
  'los rechazos no crean perfiles');
select ci.espera((select count(*) from public.profiles
  where id = '80000000-0000-0000-0000-0000000000a4' and organization_id = '80000000-0000-0000-0000-000000000b00' and role = 'founder'), 1,
  'la cuenta de otra org sigue en su org y con su rol');

-- El staff no queda como miembro de la org, tenga perfil o no.
select ci.espera(
  (select count(*) from (select public.aceptar_invitacion_de_equipo('tok-staff', '80000000-0000-0000-0000-0000000000a5') as m) x where m = 'cuenta_de_staff'),
  1, 'el super admin con perfil sin org no se suma a una org por invitación');
select ci.espera((select count(*) from public.profiles where id = '80000000-0000-0000-0000-0000000000a5' and organization_id is null), 1,
  'el perfil del super admin queda sin org');
select ci.espera(
  (select count(*) from (select public.aceptar_invitacion_de_equipo('tok-staff2', '80000000-0000-0000-0000-0000000000a7') as m) x where m = 'cuenta_de_staff'),
  1, 'un super admin recién dado de alta (sin perfil) no se suma a una org por invitación');
select ci.espera((select count(*) from public.profiles where id = '80000000-0000-0000-0000-0000000000a7'), 0,
  'al super admin sin perfil no se le crea perfil');
select ci.espera((select count(*) from public.team_invitations where token in ('tok-staff', 'tok-staff2') and status = 'pending'), 2,
  'las invitaciones al staff quedan pendientes');

-- Un perfil sin org que no es del staff tampoco se mueve.
select ci.espera(
  (select count(*) from (select public.aceptar_invitacion_de_equipo('tok-huerfano', '80000000-0000-0000-0000-0000000000a8') as m) x where m = 'otra_org'),
  1, 'un perfil sin org no se pisa');
select ci.espera((select count(*) from public.profiles where id = '80000000-0000-0000-0000-0000000000a8' and organization_id is null and role = 'founder'), 1,
  'el perfil sin org queda como estaba');

-- Acepta: email con otra caja y espacios, rol y org de la invitación.
select ci.espera(
  (select count(*) from (select public.aceptar_invitacion_de_equipo('tok-ok', '80000000-0000-0000-0000-0000000000a1') as m) x where m = 'aceptada'),
  1, 'la cuenta del email de la invitación la acepta');
select ci.espera((select count(*) from public.profiles
  where id = '80000000-0000-0000-0000-0000000000a1'
    and organization_id = '80000000-0000-0000-0000-000000000a00'
    and role = 'member'
    and custom_role_id = '80000000-0000-0000-0000-0000000000e1'
    and invited_by = '80000000-0000-0000-0000-00000000000f'
    and is_active
    and full_name = 'Ana Invitada'
    and email = 'Invitado@Test'), 1,
  'el perfil queda en la org, como member, con el rol de la invitación');
select ci.espera((select count(*) from public.team_invitations where token = 'tok-ok' and status = 'accepted'), 1,
  'la invitación queda usada');

-- Segundo uso: rechazado y sin duplicar nada.
select ci.espera(
  (select count(*) from (select public.aceptar_invitacion_de_equipo('tok-ok', '80000000-0000-0000-0000-0000000000a1') as m) x where m = 'usada'),
  1, 'una invitación usada no se vuelve a aceptar');
select ci.espera((select count(*) from public.profiles where id = '80000000-0000-0000-0000-0000000000a1'), 1,
  'el segundo uso no duplica el perfil');

-- Ya era miembro de esa org: se marca usada y el perfil no cambia (un founder no pasa a member).
select ci.espera(
  (select count(*) from (select public.aceptar_invitacion_de_equipo('tok-miembro', '80000000-0000-0000-0000-00000000000f') as m) x where m = 'ya_era_miembro'),
  1, 'quien ya es de la org la acepta sin cambios');
select ci.espera((select count(*) from public.profiles
  where id = '80000000-0000-0000-0000-00000000000f' and role = 'founder' and custom_role_id is null), 1,
  'aceptar no le cambia el rol a quien ya era de la org');
select ci.espera((select count(*) from public.team_invitations where token = 'tok-miembro' and status = 'accepted'), 1,
  'la invitación de quien ya era de la org queda usada');

reset role;
rollback;

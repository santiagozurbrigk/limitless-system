-- SCRUM-552 · Ajustes del PR #151: la baja de alguien del staff en una sola
-- función. `dar_de_baja_staff` saca el email de la lista de staff y desactiva
-- el perfil cuyo email de Auth es ese, todo o nada: nadie de la API la
-- ejecuta; compara como la app (entrada en minúsculas y sin espacios, fila de
-- la lista tal cual, email de Auth normalizado); no mira profiles.email; sólo
-- cambia is_active; aborta sin cambios si el email no está en la lista, si es
-- dueño de un holding o si hay más de un perfil con ese email de Auth; sin
-- perfil devuelve sin_perfil, o sin_perfil_revisar si en la org de Limitless
-- queda alguien activo fuera de la lista.
-- Migración: 20261115120000_baja_de_staff.

begin;

insert into public.organizations (id, name, experience) values
  ('99000000-0000-0000-0000-000000000100', 'Org de Limitless', 'limitless');
insert into public.organizations (id, name) values
  ('99000000-0000-0000-0000-000000000a00', 'Org A');

-- b7@test y b8@test están en la lista sin usuario de Auth (se usan en S10).
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('99000000-0000-0000-0000-000000000001', 'b1@test',     now(), '{}'),
  ('99000000-0000-0000-0000-000000000002', 'b2@test',     now(), '{}'),
  ('99000000-0000-0000-0000-000000000003', ' B3@Test ',   now(), '{}'),
  ('99000000-0000-0000-0000-000000000004', 'b4@test',     now(), '{}'),
  ('99000000-0000-0000-0000-000000000005', 'b5@test',     now(), '{}'),
  ('99000000-0000-0000-0000-000000000006', 'S6@test',     now(), '{}'),
  ('99000000-0000-0000-0000-0000000000d1', 'dup@test',    now(), '{}'),
  ('99000000-0000-0000-0000-0000000000d2', ' Dup@Test ',  now(), '{}'),
  ('99000000-0000-0000-0000-0000000000f0', 'nadie@test',  now(), '{}'),
  ('99000000-0000-0000-0000-0000000000f1', 'f@test',      now(), '{}'),
  ('99000000-0000-0000-0000-0000000000f2', 'x@test',      now(), '{}');

-- La lista de staff. 'S6@test' está mal cargada (con mayúsculas): la app nunca
-- le dio el panel.
insert into public.super_admin_users (email) values
  ('b1@test'), ('b2@test'), ('b3@test'), ('b4@test'), ('b5@test'),
  ('S6@test'), ('dup@test'), ('b7@test'), ('b8@test');

-- b1 tiene profiles.email distinto de su email de Auth, y x (fuera de la lista,
-- en la org A) tiene profiles.email = 'b1@test': un señuelo para una función
-- que buscara por profiles.email. b4 no tiene perfil. Al principio, la org de
-- Limitless no tiene ningún perfil activo fuera de la lista.
insert into public.profiles (id, email, organization_id, role, full_name, is_active, must_change_password) values
  ('99000000-0000-0000-0000-000000000001', 'viejo-b1@test', '99000000-0000-0000-0000-000000000100', 'founder', 'B1',   true, false),
  ('99000000-0000-0000-0000-000000000002', 'b2@test',       '99000000-0000-0000-0000-000000000100', 'founder', 'B2',   true, false),
  ('99000000-0000-0000-0000-000000000003', ' B3@Test ',     '99000000-0000-0000-0000-000000000100', 'founder', 'B3',   true, false),
  ('99000000-0000-0000-0000-000000000005', 'b5@test',       '99000000-0000-0000-0000-000000000100', 'founder', 'B5',   true, false),
  ('99000000-0000-0000-0000-0000000000d1', 'dup@test',      '99000000-0000-0000-0000-000000000a00', 'member',  'Dup1', true, false),
  ('99000000-0000-0000-0000-0000000000d2', ' Dup@Test ',    '99000000-0000-0000-0000-000000000a00', 'member',  'Dup2', true, false),
  ('99000000-0000-0000-0000-0000000000f1', 'f@test',        '99000000-0000-0000-0000-000000000a00', 'founder', 'F',    true, false),
  ('99000000-0000-0000-0000-0000000000f2', 'b1@test',       '99000000-0000-0000-0000-000000000a00', 'member',  'X',    true, false);

insert into public.holdings (name, owner_email) values ('Holding de b5', 'b5@test');

-- La foto de antes de cualquier baja.
create temp table antes on commit drop as
  select id, organization_id, role, is_active, must_change_password, custom_role_id from public.profiles;
create temp table lista_antes on commit drop as
  select email from public.super_admin_users;

create temp table r(caso text, resultado text) on commit drop;

-- ─── S1. Nadie de la API ejecuta la función ──────────────────────────────────
select ci.espera((select count(*) from pg_proc where proname = 'dar_de_baja_staff'),
  1, 'hay una sola dar_de_baja_staff (sin sobrecargas con otra firma)');
select ci.espera(has_function_privilege('anon', 'public.dar_de_baja_staff(text)', 'EXECUTE')::int,
  0, 'anon no tiene EXECUTE sobre dar_de_baja_staff');
select ci.espera(has_function_privilege('authenticated', 'public.dar_de_baja_staff(text)', 'EXECUTE')::int,
  0, 'authenticated no tiene EXECUTE sobre dar_de_baja_staff');
select ci.espera(has_function_privilege('service_role', 'public.dar_de_baja_staff(text)', 'EXECUTE')::int,
  0, 'service_role no tiene EXECUTE sobre dar_de_baja_staff');
select ci.espera(
  (select count(*) from pg_proc
    where oid = 'public.dar_de_baja_staff(text)'::regprocedure
      and not prosecdef
      and 'search_path=public' = any(proconfig)),
  1, 'dar_de_baja_staff es security invoker con search_path = public');

select ci.jwt('99000000-0000-0000-0000-000000000001');
set local role authenticated;
select ci.rechazado($$select public.dar_de_baja_staff('b1@test')$$,
  'que un usuario con sesión dé de baja a alguien del staff');
reset role;
set local role anon;
select ci.rechazado($$select public.dar_de_baja_staff('b1@test')$$,
  'que anon dé de baja a alguien del staff');
reset role;
-- Como la app con el service role (el grant de ci se va con el rollback).
grant usage on schema ci to service_role;
grant execute on all functions in schema ci to service_role;
set local role service_role;
select ci.rechazado($$select public.dar_de_baja_staff('b1@test')$$,
  'que el service role dé de baja a alguien del staff');
reset role;

-- ─── S4. Un email que no está en la lista: aborta sin cambios ────────────────
do $$
begin
  begin
    perform public.dar_de_baja_staff('nadie@test');
  exception when others then
    if sqlerrm like 'Ese email no está en la lista de staff%' then
      return;
    end if;
    raise exception 'FALLA: con un email fuera de la lista la baja falló por otro motivo: %', sqlerrm;
  end;
  raise exception 'FALLA: con un email fuera de la lista la baja no abortó';
end $$;
select ci.espera(
  (select count(*) from (
     (select * from antes except select id, organization_id, role, is_active, must_change_password, custom_role_id from public.profiles)
     union all
     (select id, organization_id, role, is_active, must_change_password, custom_role_id from public.profiles except select * from antes)) d),
  0, 'la baja de un email fuera de la lista deja los perfiles exactamente igual');
select ci.espera(
  (select count(*) from (
     (select * from lista_antes except select email from public.super_admin_users)
     union all
     (select email from public.super_admin_users except select * from lista_antes)) d),
  0, 'la baja de un email fuera de la lista deja la lista exactamente igual');

-- ─── S5. Una fila de la lista mal cargada no coincide, como en la app ───────
do $$
begin
  begin
    perform public.dar_de_baja_staff('S6@test');
  exception when others then
    if sqlerrm like 'Ese email no está en la lista de staff%' then
      return;
    end if;
    raise exception 'FALLA: con una fila mal cargada la baja falló por otro motivo: %', sqlerrm;
  end;
  raise exception 'FALLA: con una fila mal cargada la baja no abortó';
end $$;
select ci.espera((select count(*) from public.super_admin_users where email = 'S6@test'),
  1, 'la fila mal cargada S6@test sigue en la lista');

-- ─── S2. La baja: sale de la lista y el perfil queda inactivo ────────────────
insert into r values ('S2', public.dar_de_baja_staff('b1@test'));
select ci.espera((select count(*) from r where caso = 'S2' and resultado = 'perfil_desactivado'),
  1, 'la baja de b1 devuelve perfil_desactivado');
select ci.espera((select count(*) from public.super_admin_users where email = 'b1@test'),
  0, 'b1 ya no está en la lista de staff');
select ci.espera(
  (select count(*) from public.profiles where id = '99000000-0000-0000-0000-000000000001' and not is_active),
  1, 'el perfil de b1 (por su email de Auth, no por profiles.email) queda desactivado');
select ci.espera(
  (select count(*) from public.profiles p
    join antes a on a.id = p.id
    where p.id = '99000000-0000-0000-0000-000000000001'
      and p.role = a.role
      and p.organization_id is not distinct from a.organization_id
      and p.custom_role_id is not distinct from a.custom_role_id
      and p.must_change_password is not distinct from a.must_change_password),
  1, 'la baja no cambia role, organization_id, custom_role_id ni must_change_password');
select ci.espera(
  (select count(*) from public.profiles where id = '99000000-0000-0000-0000-0000000000f2' and is_active),
  1, 'el señuelo con profiles.email = b1@test sigue activo');
do $$
begin
  begin
    perform public.dar_de_baja_staff('b1@test');
  exception when others then
    if sqlerrm like 'Ese email no está en la lista de staff%' then
      return;
    end if;
    raise exception 'FALLA: la segunda baja de b1 falló por otro motivo: %', sqlerrm;
  end;
  raise exception 'FALLA: la segunda baja de b1 no abortó';
end $$;
select ci.espera(
  (select count(*) from public.profiles where id = '99000000-0000-0000-0000-000000000001' and not is_active),
  1, 'después de la segunda baja, el perfil de b1 sigue inactivo');
select ci.espera((select count(*) from public.super_admin_users where email = 'b1@test'),
  0, 'después de la segunda baja, b1 sigue fuera de la lista');

-- ─── S3. La entrada y el email de Auth se normalizan ─────────────────────────
insert into r values ('S3', public.dar_de_baja_staff('  B3@TEST '));
select ci.espera((select count(*) from r where caso = 'S3' and resultado = 'perfil_desactivado'),
  1, 'la baja con mayúsculas y espacios devuelve perfil_desactivado');
select ci.espera((select count(*) from public.super_admin_users where email = 'b3@test'),
  0, 'b3@test sale de la lista');
select ci.espera(
  (select count(*) from public.profiles where id = '99000000-0000-0000-0000-000000000003' and not is_active),
  1, 'el perfil con email de Auth '' B3@Test '' queda desactivado');

-- ─── S6. Dueño de un holding: aborta sin cambios ─────────────────────────────
do $$
begin
  begin
    perform public.dar_de_baja_staff('b5@test');
  exception when others then
    if sqlerrm like 'Ese email es dueño de un holding%' then
      return;
    end if;
    raise exception 'FALLA: con el dueño de un holding la baja falló por otro motivo: %', sqlerrm;
  end;
  raise exception 'FALLA: con el dueño de un holding la baja no abortó';
end $$;
select ci.espera((select count(*) from public.super_admin_users where email = 'b5@test'),
  1, 'el dueño de un holding sigue en la lista');
select ci.espera(
  (select count(*) from public.profiles where id = '99000000-0000-0000-0000-000000000005' and is_active),
  1, 'el perfil del dueño de un holding sigue activo');

-- ─── S7. Si desactivar falla, el email no sale de la lista ───────────────────
savepoint falla_al_desactivar;
create function ci.falla_al_desactivar()
returns trigger
language plpgsql
as $$
begin
  raise exception 'falla simulada';
end;
$$;
create trigger falla_al_desactivar
  before update on public.profiles
  for each row
  when (old.id = '99000000-0000-0000-0000-000000000002')
  execute function ci.falla_al_desactivar();
do $$
begin
  begin
    perform public.dar_de_baja_staff('b2@test');
  exception when others then
    if sqlerrm = 'falla simulada' then
      return;
    end if;
    raise exception 'FALLA: con el update fallando la baja falló por otro motivo: %', sqlerrm;
  end;
  raise exception 'FALLA: con el update fallando la baja no lanzó (¿quedó a medias?)';
end $$;
select ci.espera((select count(*) from public.super_admin_users where email = 'b2@test'),
  1, 'si desactivar el perfil falla, b2 sigue en la lista: todo o nada');
select ci.espera(
  (select count(*) from public.profiles where id = '99000000-0000-0000-0000-000000000002' and is_active),
  1, 'si desactivar el perfil falla, el perfil de b2 sigue activo');
rollback to savepoint falla_al_desactivar;

-- ─── S8. Dos perfiles con el mismo email de Auth normalizado: aborta ────────
do $$
begin
  begin
    perform public.dar_de_baja_staff('dup@test');
  exception when others then
    if sqlerrm like 'Hay 2 perfiles%' then
      return;
    end if;
    raise exception 'FALLA: con dos perfiles la baja falló por otro motivo: %', sqlerrm;
  end;
  raise exception 'FALLA: con dos perfiles la baja no abortó';
end $$;
select ci.espera((select count(*) from public.super_admin_users where email = 'dup@test'),
  1, 'con dos perfiles, dup@test sigue en la lista');
select ci.espera(
  (select count(*) from public.profiles
    where id in ('99000000-0000-0000-0000-0000000000d1', '99000000-0000-0000-0000-0000000000d2') and is_active),
  2, 'con dos perfiles, los dos siguen activos');

-- ─── S9. En la lista sin perfil: sale de la lista, sin_perfil ────────────────
insert into r values ('S9', public.dar_de_baja_staff('b4@test'));
select ci.espera((select count(*) from r where caso = 'S9' and resultado = 'sin_perfil'),
  1, 'la baja de b4 (sin perfil) devuelve sin_perfil');
select ci.espera((select count(*) from public.super_admin_users where email = 'b4@test'),
  0, 'b4@test sale de la lista');
select ci.espera((select count(*) from public.profiles where id = '99000000-0000-0000-0000-000000000004'),
  0, 'la baja no le crea un perfil a b4');
select ci.espera(
  (select count(*) from (
     (select * from antes
       where id not in ('99000000-0000-0000-0000-000000000001', '99000000-0000-0000-0000-000000000003')
      except
      select id, organization_id, role, is_active, must_change_password, custom_role_id from public.profiles
       where id not in ('99000000-0000-0000-0000-000000000001', '99000000-0000-0000-0000-000000000003'))
     union all
     (select id, organization_id, role, is_active, must_change_password, custom_role_id from public.profiles
       where id not in ('99000000-0000-0000-0000-000000000001', '99000000-0000-0000-0000-000000000003')
      except
      select * from antes
       where id not in ('99000000-0000-0000-0000-000000000001', '99000000-0000-0000-0000-000000000003'))) d),
  0, 'fuera de b1 y b3 ningún perfil cambió');
select ci.espera((select count(*) from public.profiles), (select count(*) from antes),
  'las bajas no crean ni borran perfiles');
select ci.espera(
  (select count(*) from (
     (select * from lista_antes where email not in ('b1@test', 'b3@test', 'b4@test')
      except select email from public.super_admin_users)
     union all
     (select email from public.super_admin_users
      except select * from lista_antes where email not in ('b1@test', 'b3@test', 'b4@test'))) d),
  0, 'fuera de b1, b3 y b4 ninguna fila de la lista cambió');

-- ─── S10a. Un miembro legítimo fuera de la lista: sin_perfil_revisar ─────────
savepoint miembro_legitimo;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('99000000-0000-0000-0000-0000000000a1', 'm@test', now(), '{}');
insert into public.profiles (id, email, organization_id, role, full_name, is_active, must_change_password) values
  ('99000000-0000-0000-0000-0000000000a1', 'm@test', '99000000-0000-0000-0000-000000000100', 'member', 'M', true, false);
insert into r values ('S10a', public.dar_de_baja_staff('b8@test'));
select ci.espera((select count(*) from r where caso = 'S10a' and resultado = 'sin_perfil_revisar'),
  1, 'con un miembro activo fuera de la lista en la org de Limitless, la baja no aborta y devuelve sin_perfil_revisar');
select ci.espera((select count(*) from public.super_admin_users where email = 'b8@test'),
  0, 'b8@test sale de la lista');
select ci.espera(
  (select count(*) from public.profiles where id = '99000000-0000-0000-0000-0000000000a1' and is_active),
  1, 'el miembro legítimo sigue activo');
rollback to savepoint miembro_legitimo;

-- ─── S10b. Un staff que cambió su email de Auth: sin_perfil_revisar ──────────
-- b7nuevo es el staff b7@test después de cambiar su email de Auth; su
-- profiles.email ('b2@test') está en la lista. Una función que mirara
-- profiles.email contaría 0 y devolvería sin_perfil.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('99000000-0000-0000-0000-0000000000b7', 'b7nuevo@test', now(), '{}');
insert into public.profiles (id, email, organization_id, role, full_name, is_active, must_change_password) values
  ('99000000-0000-0000-0000-0000000000b7', 'b2@test', '99000000-0000-0000-0000-000000000100', 'founder', 'B7', true, false);
insert into r values ('S10b', public.dar_de_baja_staff('b7@test'));
select ci.espera((select count(*) from r where caso = 'S10b' and resultado = 'sin_perfil_revisar'),
  1, 'con el email de Auth cambiado, la baja devuelve sin_perfil_revisar y no sin_perfil');
select ci.espera((select count(*) from public.super_admin_users where email = 'b7@test'),
  0, 'b7@test sale de la lista');
select ci.espera(
  (select count(*) from public.profiles where id = '99000000-0000-0000-0000-0000000000b7' and is_active),
  1, 'el perfil con el email de Auth cambiado sigue activo: la función no adivina cuál desactivar');

rollback;

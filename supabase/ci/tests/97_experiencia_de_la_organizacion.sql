-- SCRUM-523 · Tipo de experiencia por organización (Limitless Webinars, Fase 0)
-- Un usuario no puede cambiar `organizations.experience`, ni siquiera el
-- founder, que sí puede cambiar la configuración de su org. La lee con su
-- sesión (el layout la necesita). Una organización nueva nace en 'webinar'
-- y la columna sólo acepta 'webinar' o 'full'.
-- Migración: 20261019120000_organizations_experience.

begin;

insert into auth.users (id, email) values
  ('97000000-0000-0000-0000-00000000000f', 'f@test'),
  ('97000000-0000-0000-0000-00000000000b', 'm@test');

-- Una org que pasó a full (como las que existían antes de Webinars) y una nueva.
insert into public.organizations (id, name, experience) values
  ('97000000-0000-0000-0000-000000000a00', 'Org completa', 'full');
insert into public.organizations (id, name) values
  ('97000000-0000-0000-0000-000000000b00', 'Org nueva');

insert into public.profiles (id, email, organization_id, role, full_name, is_active) values
  ('97000000-0000-0000-0000-00000000000f', 'f@test', '97000000-0000-0000-0000-000000000a00', 'founder', 'F', true),
  ('97000000-0000-0000-0000-00000000000b', 'm@test', '97000000-0000-0000-0000-000000000b00', 'member',  'M', true);

-- ─── La base: default, CHECK y privilegios ───────────────────────────────────
select ci.espera(
  (select count(*) from public.organizations
    where id = '97000000-0000-0000-0000-000000000b00' and experience = 'webinar'),
  1, 'una organización creada sin decir la experiencia queda en webinar');
select ci.espera(
  has_column_privilege('authenticated', 'public.organizations', 'experience', 'UPDATE')::int,
  0, 'authenticated no tiene UPDATE sobre organizations.experience');
select ci.espera(
  has_column_privilege('anon', 'public.organizations', 'experience', 'UPDATE')::int,
  0, 'anon no tiene UPDATE sobre organizations.experience');
select ci.espera(
  has_column_privilege('authenticated', 'public.organizations', 'experience', 'SELECT')::int,
  1, 'authenticated puede leer organizations.experience');

do $$
begin
  begin
    insert into public.organizations (name, experience) values ('Org rara', 'otra');
  exception when check_violation then
    return;
  end;
  raise exception 'FALLA: la columna aceptó una experiencia que no es webinar ni full';
end $$;

-- ─── Founder de la org completa: cambia el nombre, no la experiencia ─────────
select ci.jwt('97000000-0000-0000-0000-00000000000f');
set local role authenticated;

select ci.espera(
  (select count(*) from public.organizations
    where id = '97000000-0000-0000-0000-000000000a00' and experience = 'full'),
  1, 'el founder lee la experiencia de su org con su sesión');
select ci.espera(
  ci.filas($$update public.organizations set name = 'Org completa 2' where id = '97000000-0000-0000-0000-000000000a00'$$),
  1, 'el founder cambia la configuración de su org (la policy lo deja)');
select ci.rechazado(
  $$update public.organizations set experience = 'webinar' where id = '97000000-0000-0000-0000-000000000a00'$$,
  'que el founder cambie la experiencia de su org');
select ci.rechazado(
  $$update public.organizations set name = 'x', experience = 'webinar' where id = '97000000-0000-0000-0000-000000000a00'$$,
  'que el founder cambie la experiencia junto con otra columna');

reset role;

-- ─── Member de la org nueva: no se pasa a full ───────────────────────────────
select ci.jwt('97000000-0000-0000-0000-00000000000b');
set local role authenticated;

select ci.rechazado(
  $$update public.organizations set experience = 'full' where id = '97000000-0000-0000-0000-000000000b00'$$,
  'que un member pase su org a full');

reset role;

-- ─── anon tampoco ────────────────────────────────────────────────────────────
set local role anon;
select ci.rechazado(
  $$update public.organizations set experience = 'full'$$,
  'que anon cambie la experiencia de alguna org');
reset role;

select ci.espera(
  (select count(*) from public.organizations
    where (id = '97000000-0000-0000-0000-000000000a00' and experience = 'full')
       or (id = '97000000-0000-0000-0000-000000000b00' and experience = 'webinar')),
  2, 'las dos organizaciones siguen con su experiencia');

rollback;

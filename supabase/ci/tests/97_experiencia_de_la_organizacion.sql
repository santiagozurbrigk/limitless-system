-- SCRUM-523 · Tipo de experiencia por organización (Limitless Webinars, Fase 0)
-- Un usuario no puede cambiar `organizations.experience`, ni siquiera el
-- founder, que sí puede cambiar la configuración de su org. La lee con su
-- sesión (el layout la necesita). Una organización creada sin decir la
-- experiencia nace en 'full' (el default; las altas de la app mandan 'webinar'
-- explícito, AR pasada 1) y la columna sólo acepta 'webinar', 'limitless' o
-- 'full' ('limitless' la asigna el service role por SQL; ninguna alta la manda).
-- Ninguna función SQL (tampoco las de triggers) ni regla inserta en
-- organizations: las altas son las seis de la app
-- (apps/web/lib/organization/__tests__/altas-conocidas.test.ts).
-- Migración: 20261019120000_organizations_experience.

begin;

insert into auth.users (id, email) values
  ('97000000-0000-0000-0000-00000000000f', 'f@test'),
  ('97000000-0000-0000-0000-00000000000b', 'm@test');

-- Una org sin decir la experiencia (como las que existían antes de Webinars) y
-- una de Webinars, como la crean las altas de la app.
insert into public.organizations (id, name) values
  ('97000000-0000-0000-0000-000000000a00', 'Org completa');
insert into public.organizations (id, name, experience) values
  ('97000000-0000-0000-0000-000000000b00', 'Org nueva', 'webinar');
-- Una de Limitless de gestión, como la deja el SQL de la guía de SCRUM-532.
insert into public.organizations (id, name, experience) values
  ('97000000-0000-0000-0000-000000000c00', 'Org de gestión', 'limitless');

insert into public.profiles (id, email, organization_id, role, full_name, is_active) values
  ('97000000-0000-0000-0000-00000000000f', 'f@test', '97000000-0000-0000-0000-000000000a00', 'founder', 'F', true),
  ('97000000-0000-0000-0000-00000000000b', 'm@test', '97000000-0000-0000-0000-000000000b00', 'member',  'M', true);

-- ─── La base: default, CHECK y privilegios ───────────────────────────────────
select ci.espera(
  (select count(*) from public.organizations
    where id = '97000000-0000-0000-0000-000000000a00' and experience = 'full'),
  1, 'una organización creada sin decir la experiencia queda en full');
select ci.espera(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations'
      and column_name = 'experience' and column_default = '''full''::text'),
  1, 'el default de organizations.experience es full');
select ci.espera(
  (select count(*) from public.organizations
    where id = '97000000-0000-0000-0000-000000000c00' and experience = 'limitless'),
  1, 'la columna acepta limitless');

-- ─── Ninguna alta por SQL ────────────────────────────────────────────────────
-- Un INSERT o MERGE en organizations, o un COPY hacia ella, en el cuerpo de
-- una función de cualquier schema (también las de triggers) o en una regla.
-- Antes de buscar se sacan los comentarios del cuerpo (/* ... */ y -- hasta el
-- fin de la línea), para que un comentario entre `insert` e `into` no lo
-- esconda (AR pasada 2). Es un quitacomentarios de texto, no un parser de SQL,
-- así que no ve (AR pasada 3):
--   - SQL armado en tiempo de ejecución (format() y execute, o el nombre de la
--     tabla en una variable);
--   - un `--` dentro de un string que comparta la línea con el insert (se corta
--     como si fuera un comentario);
--   - un `/*` dentro de un string antes del insert y un `*/` en otro string
--     después (se borra el insert como si fuera un comentario);
--   - un comentario anidado (`/* a /* b */ c */`): Postgres los admite y el
--     quitacomentarios corta en el primer `*/`.
create temporary table sql_sin_comentarios on commit drop as
select n.nspname || '.' || p.proname as funcion,
       regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', ' ', 'g'), '--[^\n]*', ' ', 'g') as cuerpo
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname not in ('pg_catalog', 'information_schema');
select ci.espera(
  (select count(*) from sql_sin_comentarios
    where cuerpo ~* '((insert|merge)\s+into|copy)\s+("?public"?\s*\.\s*)?"?organizations"?([^a-z0-9_]|$)'),
  0, 'ninguna función SQL ni de trigger inserta en organizations');
select ci.espera(
  (select count(*) from pg_rewrite r
    where pg_get_ruledef(r.oid) ~* '(insert|merge)\s+into\s+("?public"?\s*\.\s*)?"?organizations"?([^a-z0-9_]|$)'),
  0, 'ninguna regla inserta en organizations');
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
  raise exception 'FALLA: la columna aceptó una experiencia que no es webinar, limitless ni full';
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
select ci.rechazado(
  $$update public.organizations set experience = 'limitless' where id = '97000000-0000-0000-0000-000000000a00'$$,
  'que el founder pase su org a limitless');

reset role;

-- ─── Member de la org nueva: no se pasa a full ni a limitless ────────────────
select ci.jwt('97000000-0000-0000-0000-00000000000b');
set local role authenticated;

select ci.rechazado(
  $$update public.organizations set experience = 'full' where id = '97000000-0000-0000-0000-000000000b00'$$,
  'que un member pase su org a full');
select ci.rechazado(
  $$update public.organizations set experience = 'limitless' where id = '97000000-0000-0000-0000-000000000b00'$$,
  'que un member pase su org a limitless');

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
       or (id = '97000000-0000-0000-0000-000000000b00' and experience = 'webinar')
       or (id = '97000000-0000-0000-0000-000000000c00' and experience = 'limitless')),
  3, 'las tres organizaciones siguen con su experiencia');

rollback;

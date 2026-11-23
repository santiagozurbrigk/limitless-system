-- SCRUM-526 · Limitless Webinars, modelo de datos (Fase 1)
-- Cada miembro lee sólo lo de su organización; la configuración del
-- lanzamiento la escribe founder o admin; leads, registros, visitas y eventos
-- no los escribe ningún usuario (la ingesta usa el service role); las claves de
-- ingesta y los crudos de la landing no los ve nadie con sesión. Ninguna fila
-- hija apunta a un lanzamiento o lead de otra organización, ni siquiera con el
-- service role. lead_events es append-only para los usuarios y un lanzamiento
-- con registros, visitas o eventos no se puede borrar (un borrador vacío sí;
-- borrar la organización borra todo). Las policies de escritura filtran por
-- organización aun sin WHERE, y valen para el founder de un holding que opera
-- uno de sus negocios.
-- Migración: 20261016120000_webinars_modelo_de_datos.

begin;

-- ─── Datos ───────────────────────────────────────────────────────────────────
-- Org A: founder (FA), admin (AA), member (MA). Org B: founder (FB).
-- Una fila de cada tabla en cada org (cargadas sin RLS, como la ingesta), más
-- un lead de A sin registro y un borrador vacío de A.
insert into auth.users (id, email) values
  ('97000000-0000-0000-0000-0000000000fa', 'fa@test'),
  ('97000000-0000-0000-0000-0000000000aa', 'aa@test'),
  ('97000000-0000-0000-0000-0000000000ba', 'ma@test'),
  ('97000000-0000-0000-0000-0000000000fb', 'fb@test');
insert into public.organizations (id, name) values
  ('97000000-0000-0000-0000-000000000a00', 'Org A'),
  ('97000000-0000-0000-0000-000000000b00', 'Org B');
insert into public.profiles (id, email, organization_id, role, full_name, is_active) values
  ('97000000-0000-0000-0000-0000000000fa', 'fa@test', '97000000-0000-0000-0000-000000000a00', 'founder', 'FA', true),
  ('97000000-0000-0000-0000-0000000000aa', 'aa@test', '97000000-0000-0000-0000-000000000a00', 'admin',   'AA', true),
  ('97000000-0000-0000-0000-0000000000ba', 'ma@test', '97000000-0000-0000-0000-000000000a00', 'member',  'MA', true),
  ('97000000-0000-0000-0000-0000000000fb', 'fb@test', '97000000-0000-0000-0000-000000000b00', 'founder', 'FB', true);

insert into public.webinar_launches (id, organization_id, name, variant, currency, status) values
  ('97000000-0000-0000-0000-00000000a001', '97000000-0000-0000-0000-000000000a00', 'Lanzamiento A', 'paid', 'USD', 'active'),
  -- Borrador vacío: lo que un member intenta borrar (uno con datos no se puede
  -- borrar por la FK, y el control dejaría de mirar la policy).
  ('97000000-0000-0000-0000-00000000a002', '97000000-0000-0000-0000-000000000a00', 'Borrador A', 'paid', 'USD', 'draft'),
  ('97000000-0000-0000-0000-00000000b001', '97000000-0000-0000-0000-000000000b00', 'Lanzamiento B', 'organic', 'USD', 'active');
insert into public.webinar_sessions (organization_id, launch_id, starts_at) values
  ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', now() + interval '7 days'),
  ('97000000-0000-0000-0000-000000000b00', '97000000-0000-0000-0000-00000000b001', now() + interval '7 days');
insert into public.launch_ad_campaigns (organization_id, launch_id, platform, campaign_external_id) values
  ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', 'meta', 'camp-1'),
  ('97000000-0000-0000-0000-000000000b00', '97000000-0000-0000-0000-00000000b001', 'meta', 'camp-1');
insert into public.launch_products (organization_id, launch_id, provider, product_external_id, role) values
  ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', 'whop', 'prod-1', 'main'),
  ('97000000-0000-0000-0000-000000000b00', '97000000-0000-0000-0000-00000000b001', 'whop', 'prod-1', 'main');
insert into public.leads (id, organization_id, email, email_normalized, name) values
  ('97000000-0000-0000-0000-00000000a0a1', '97000000-0000-0000-0000-000000000a00', 'Ana@Test.com', 'ana@test.com', 'Ana'),
  ('97000000-0000-0000-0000-00000000b0b1', '97000000-0000-0000-0000-000000000b00', 'ana@test.com', 'ana@test.com', 'Ana'),
  -- Sin registro: para que los inserts de prueba de un registro en A sólo
  -- choquen con los permisos.
  ('97000000-0000-0000-0000-00000000a0a3', '97000000-0000-0000-0000-000000000a00', 'dani@test.com', 'dani@test.com', 'Dani');
insert into public.landing_events (id, organization_id, kind, payload) values
  ('97000000-0000-0000-0000-00000000ae01', '97000000-0000-0000-0000-000000000a00', 'registration', '{}'),
  ('97000000-0000-0000-0000-00000000be01', '97000000-0000-0000-0000-000000000b00', 'registration', '{}');
insert into public.launch_registrations (organization_id, launch_id, lead_id, client_registration_id, raw_event_id) values
  ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', '97000000-0000-0000-0000-00000000a0a1', 'reg-1', '97000000-0000-0000-0000-00000000ae01'),
  ('97000000-0000-0000-0000-000000000b00', '97000000-0000-0000-0000-00000000b001', '97000000-0000-0000-0000-00000000b0b1', 'reg-b', '97000000-0000-0000-0000-00000000be01');
insert into public.landing_visits (organization_id, launch_id, visitor_id, day) values
  ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', 'v-1', current_date),
  ('97000000-0000-0000-0000-000000000b00', '97000000-0000-0000-0000-00000000b001', 'v-1', current_date);
insert into public.lead_events (id, organization_id, lead_id, launch_id, kind, occurred_at, source, source_ref) values
  ('97000000-0000-0000-0000-00000000ee01', '97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a0a1', '97000000-0000-0000-0000-00000000a001', 'registered', now(), 'landing', 'reg-1'),
  ('97000000-0000-0000-0000-00000000ee02', '97000000-0000-0000-0000-000000000b00', '97000000-0000-0000-0000-00000000b0b1', '97000000-0000-0000-0000-00000000b001', 'registered', now(), 'landing', 'reg-b');
insert into public.ingest_keys (organization_id, key_hash, label) values
  ('97000000-0000-0000-0000-000000000a00', repeat('a', 64), 'Landing A'),
  ('97000000-0000-0000-0000-000000000b00', repeat('b', 64), 'Landing B');

-- ─── Member de A: lee lo suyo, no escribe nada ───────────────────────────────
select ci.jwt('97000000-0000-0000-0000-0000000000ba');
set local role authenticated;

select ci.espera((select count(*) from public.webinar_launches), 2, 'un member lee sólo los lanzamientos de su org');
select ci.espera((select count(*) from public.webinar_sessions), 1, 'un member lee sólo las sesiones de su org');
select ci.espera((select count(*) from public.launch_ad_campaigns), 1, 'un member lee sólo las campañas de su org');
select ci.espera((select count(*) from public.launch_products), 1, 'un member lee sólo los productos de su org');
select ci.espera((select count(*) from public.leads), 2, 'un member lee sólo los leads de su org');
select ci.espera((select count(*) from public.launch_registrations), 1, 'un member lee sólo los registros de su org');
select ci.espera((select count(*) from public.landing_visits), 1, 'un member lee sólo las visitas de su org');
select ci.espera((select count(*) from public.lead_events), 1, 'un member lee sólo los eventos de su org');

select ci.rechazado($$select * from public.ingest_keys$$, 'que un member lea ingest_keys');
select ci.rechazado($$select * from public.landing_events$$, 'que un member lea landing_events');

select ci.rechazado(
  $$insert into public.webinar_launches (organization_id, name, variant, currency) values ('97000000-0000-0000-0000-000000000a00', 'hack', 'paid', 'USD')$$,
  'que un member cree un lanzamiento');
select ci.espera(ci.filas($$update public.webinar_launches set name = 'hack' where id = '97000000-0000-0000-0000-00000000a001'$$),
  0, 'un member no cambia un lanzamiento');
select ci.espera(ci.filas($$delete from public.webinar_launches where id = '97000000-0000-0000-0000-00000000a002'$$),
  0, 'un member no borra un lanzamiento');
select ci.rechazado(
  $$insert into public.webinar_sessions (organization_id, launch_id, starts_at) values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', now())$$,
  'que un member cree una sesión');
select ci.rechazado(
  $$insert into public.launch_ad_campaigns (organization_id, launch_id, platform, campaign_external_id) values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', 'meta', 'camp-x')$$,
  'que un member asocie una campaña');
select ci.rechazado(
  $$insert into public.launch_products (organization_id, launch_id, provider, product_external_id, role) values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', 'whop', 'prod-x', 'vip')$$,
  'que un member asocie un producto');

select ci.rechazado(
  $$update public.lead_events set kind = 'purchased' where id = '97000000-0000-0000-0000-00000000ee01'$$,
  'que un member cambie un evento de lead');
select ci.rechazado(
  $$delete from public.lead_events where id = '97000000-0000-0000-0000-00000000ee01'$$,
  'que un member borre un evento de lead');

reset role;

-- ─── Founder de A: configura el lanzamiento, nada más ────────────────────────
select ci.jwt('97000000-0000-0000-0000-0000000000fa');
set local role authenticated;

select ci.espera(ci.filas($$insert into public.webinar_launches (organization_id, name, variant, currency) values ('97000000-0000-0000-0000-000000000a00', 'Nuevo', 'paid_plus', 'USD')$$),
  1, 'el founder crea un lanzamiento');
select ci.espera((select count(*) from public.webinar_launches where name = 'Nuevo' and public_id ~ '^[0-9a-f]{32}$'),
  1, 'el lanzamiento nuevo trae un public_id aleatorio');
select ci.espera(ci.filas($$update public.webinar_launches set goal_sales = 50, goal_revenue = 50000 where id = '97000000-0000-0000-0000-00000000a001'$$),
  1, 'el founder cambia las metas de un lanzamiento');
select ci.espera(ci.filas($$insert into public.webinar_sessions (organization_id, launch_id, starts_at) values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', now() + interval '8 days')$$),
  1, 'el founder crea una sesión');
select ci.espera(ci.filas($$insert into public.launch_ad_campaigns (organization_id, launch_id, platform, campaign_external_id) values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', 'meta', 'camp-2')$$),
  1, 'el founder asocia una campaña');
select ci.espera(ci.filas($$insert into public.launch_products (organization_id, launch_id, provider, product_external_id, role) values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', 'whop', 'prod-2', 'vip')$$),
  1, 'el founder asocia un producto');
select ci.espera(ci.filas($$delete from public.webinar_launches where name = 'Nuevo'$$),
  1, 'el founder borra un lanzamiento');

select ci.rechazado(
  $$update public.webinar_launches set public_id = 'ffffffffffffffffffffffffffffffff' where id = '97000000-0000-0000-0000-00000000a001'$$,
  'que el founder cambie el public_id');
select ci.rechazado(
  $$insert into public.webinar_launches (organization_id, name, variant, currency, public_id) values ('97000000-0000-0000-0000-000000000a00', 'Elegido', 'paid', 'USD', '00000000000000000000000000000000')$$,
  'que el founder elija el public_id');
select ci.rechazado(
  $$insert into public.webinar_launches (organization_id, name, variant, currency) values ('97000000-0000-0000-0000-000000000b00', 'En B', 'paid', 'USD')$$,
  'que el founder cree un lanzamiento en otra org');
select ci.espera(ci.filas($$update public.webinar_launches set name = 'hack' where id = '97000000-0000-0000-0000-00000000b001'$$),
  0, 'el founder no cambia un lanzamiento de otra org');
select ci.espera(ci.filas($$delete from public.webinar_sessions where organization_id = '97000000-0000-0000-0000-000000000b00'$$),
  0, 'el founder no borra sesiones de otra org');

-- Insertar configuración en otra org, colgada de un lanzamiento de esa org (la
-- FK compuesta no lo impide: lo impide la policy).
select ci.rechazado(
  $$insert into public.webinar_sessions (organization_id, launch_id, starts_at) values ('97000000-0000-0000-0000-000000000b00', '97000000-0000-0000-0000-00000000b001', now())$$,
  'que el founder cree una sesión en otra org');
select ci.rechazado(
  $$insert into public.launch_ad_campaigns (organization_id, launch_id, platform, campaign_external_id) values ('97000000-0000-0000-0000-000000000b00', '97000000-0000-0000-0000-00000000b001', 'meta', 'camp-en-b')$$,
  'que el founder asocie una campaña en otra org');
select ci.rechazado(
  $$insert into public.launch_products (organization_id, launch_id, provider, product_external_id, role) values ('97000000-0000-0000-0000-000000000b00', '97000000-0000-0000-0000-00000000b001', 'whop', 'prod-en-b', 'vip')$$,
  'que el founder asocie un producto en otra org');

-- UPDATE y DELETE sin WHERE: sólo miran la policy de escritura (con WHERE,
-- Postgres aplica también la de lectura y eso tapaba una policy de escritura
-- sin filtro de org). Tocan exactamente las filas de A: 2 lanzamientos (el de
-- los datos y el borrador) y 2 sesiones, campañas y productos (la de los datos
-- y la que creó el founder).
-- Todo en un savepoint que se deshace.
savepoint sin_where;
select ci.espera(ci.filas($$update public.webinar_launches set name = 'pisado'$$),
  2, 'el founder actualiza sin WHERE sólo los lanzamientos de su org');
select ci.espera(ci.filas($$update public.webinar_sessions set zoom_webinar_id = 'pisado'$$),
  2, 'el founder actualiza sin WHERE sólo las sesiones de su org');
select ci.espera(ci.filas($$update public.launch_ad_campaigns set platform = 'pisado'$$),
  2, 'el founder actualiza sin WHERE sólo las campañas de su org');
select ci.espera(ci.filas($$update public.launch_products set provider = 'pisado'$$),
  2, 'el founder actualiza sin WHERE sólo los productos de su org');
select ci.espera(ci.filas($$delete from public.webinar_sessions$$),
  2, 'el founder borra sin WHERE sólo las sesiones de su org');
select ci.espera(ci.filas($$delete from public.launch_ad_campaigns$$),
  2, 'el founder borra sin WHERE sólo las campañas de su org');
select ci.espera(ci.filas($$delete from public.launch_products$$),
  2, 'el founder borra sin WHERE sólo los productos de su org');
reset role;
-- Sin registros, visitas ni eventos (en ninguna org), los lanzamientos se
-- pueden borrar: así un DELETE sin filtro de org llegaría también al de B.
delete from public.launch_registrations;
delete from public.landing_visits;
delete from public.lead_events;
set local role authenticated;
select ci.espera(ci.filas($$delete from public.webinar_launches$$),
  2, 'el founder borra sin WHERE sólo los lanzamientos de su org');
reset role;
-- Lo de B quedó igual (visto sin RLS).
select ci.espera((select count(*) from public.webinar_launches where organization_id = '97000000-0000-0000-0000-000000000b00' and name = 'Lanzamiento B'),
  1, 'el lanzamiento de B sigue igual después de la escritura sin WHERE de A');
select ci.espera((select count(*) from public.webinar_sessions where organization_id = '97000000-0000-0000-0000-000000000b00' and zoom_webinar_id is null),
  1, 'la sesión de B sigue igual después de la escritura sin WHERE de A');
select ci.espera((select count(*) from public.launch_ad_campaigns where organization_id = '97000000-0000-0000-0000-000000000b00' and platform = 'meta'),
  1, 'la campaña de B sigue igual después de la escritura sin WHERE de A');
select ci.espera((select count(*) from public.launch_products where organization_id = '97000000-0000-0000-0000-000000000b00' and provider = 'whop'),
  1, 'el producto de B sigue igual después de la escritura sin WHERE de A');
rollback to savepoint sin_where;
select ci.jwt('97000000-0000-0000-0000-0000000000fa');
set local role authenticated;

-- Una sesión de su org colgada de un lanzamiento de otra org: la RLS la deja
-- pasar (la fila es de A); la FK compuesta no.
do $$
begin
  begin
    insert into public.webinar_sessions (organization_id, launch_id, starts_at)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000b001', now());
    raise exception 'FALLA: se permitió una sesión de A en un lanzamiento de B';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Ni el founder escribe los datos que trae la ingesta.
select ci.rechazado(
  $$insert into public.leads (organization_id, email, email_normalized) values ('97000000-0000-0000-0000-000000000a00', 'x@test.com', 'x@test.com')$$,
  'que el founder inserte un lead');
select ci.rechazado(
  $$update public.leads set name = 'hack' where id = '97000000-0000-0000-0000-00000000a0a1'$$,
  'que el founder cambie un lead');
select ci.rechazado(
  $$insert into public.launch_registrations (organization_id, launch_id, lead_id, client_registration_id) values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', '97000000-0000-0000-0000-00000000a0a3', 'reg-x')$$,
  'que el founder inserte un registro');
select ci.rechazado(
  $$delete from public.launch_registrations where organization_id = '97000000-0000-0000-0000-000000000a00'$$,
  'que el founder borre registros');
select ci.rechazado(
  $$insert into public.landing_visits (organization_id, launch_id, visitor_id, day) values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', 'v-x', current_date)$$,
  'que el founder inserte una visita');
select ci.rechazado(
  $$insert into public.lead_events (organization_id, lead_id, launch_id, kind, occurred_at, source, source_ref) values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a0a1', '97000000-0000-0000-0000-00000000a001', 'note', now(), 'manual', 'n-1')$$,
  'que el founder inserte un evento de lead');
select ci.rechazado(
  $$update public.lead_events set kind = 'purchased' where id = '97000000-0000-0000-0000-00000000ee01'$$,
  'que el founder cambie un evento de lead');
select ci.rechazado(
  $$delete from public.lead_events where id = '97000000-0000-0000-0000-00000000ee01'$$,
  'que el founder borre un evento de lead');
select ci.rechazado($$select * from public.ingest_keys$$, 'que el founder lea ingest_keys');
select ci.rechazado(
  $$insert into public.ingest_keys (organization_id, key_hash, label) values ('97000000-0000-0000-0000-000000000a00', 'h', 'x')$$,
  'que el founder cree una clave de ingesta por la API');
select ci.rechazado($$select * from public.landing_events$$, 'que el founder lea landing_events');

reset role;

-- ─── Admin de A: configura, pero no borra historial ──────────────────────────
-- Un lanzamiento con sólo registros, otro con sólo visitas y otro con sólo
-- eventos (cada FK se prueba sola), y un borrador vacío.
insert into public.webinar_launches (id, organization_id, name, variant, currency) values
  ('97000000-0000-0000-0000-00000000a011', '97000000-0000-0000-0000-000000000a00', 'Con registros', 'paid', 'USD'),
  ('97000000-0000-0000-0000-00000000a012', '97000000-0000-0000-0000-000000000a00', 'Con visitas', 'paid', 'USD'),
  ('97000000-0000-0000-0000-00000000a013', '97000000-0000-0000-0000-000000000a00', 'Con eventos', 'paid', 'USD'),
  ('97000000-0000-0000-0000-00000000a014', '97000000-0000-0000-0000-000000000a00', 'Borrador vacío', 'paid', 'USD');
insert into public.webinar_sessions (organization_id, launch_id, starts_at) values
  ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a014', now());
insert into public.launch_registrations (organization_id, launch_id, lead_id, client_registration_id) values
  ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a011', '97000000-0000-0000-0000-00000000a0a1', 'reg-a011');
insert into public.landing_visits (organization_id, launch_id, visitor_id, day) values
  ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a012', 'v-a012', current_date);
insert into public.lead_events (organization_id, lead_id, launch_id, kind, occurred_at, source, source_ref) values
  ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a0a1', '97000000-0000-0000-0000-00000000a013', 'purchased', now(), 'whop', 'pay-a013');

select ci.jwt('97000000-0000-0000-0000-0000000000aa');
set local role authenticated;
select ci.espera(ci.filas($$insert into public.webinar_launches (organization_id, name, variant, currency) values ('97000000-0000-0000-0000-000000000a00', 'Del admin', 'organic', 'EUR')$$),
  1, 'un admin crea un lanzamiento');
do $$
begin
  begin
    delete from public.webinar_launches where id = '97000000-0000-0000-0000-00000000a011';
    raise exception 'FALLA: un admin borró un lanzamiento con registros';
  exception when foreign_key_violation then null;
  end;
  begin
    delete from public.webinar_launches where id = '97000000-0000-0000-0000-00000000a012';
    raise exception 'FALLA: un admin borró un lanzamiento con visitas';
  exception when foreign_key_violation then null;
  end;
  begin
    delete from public.webinar_launches where id = '97000000-0000-0000-0000-00000000a013';
    raise exception 'FALLA: un admin borró un lanzamiento con eventos';
  exception when foreign_key_violation then null;
  end;
end $$;
select ci.espera(ci.filas($$delete from public.webinar_launches where id = '97000000-0000-0000-0000-00000000a014'$$),
  1, 'un admin borra un borrador vacío');
select ci.espera((select count(*) from public.webinar_sessions where launch_id = '97000000-0000-0000-0000-00000000a014'),
  0, 'las sesiones del borrador borrado se van con él');
reset role;
select ci.espera((select count(*) from public.launch_registrations where launch_id = '97000000-0000-0000-0000-00000000a011')
               + (select count(*) from public.landing_visits where launch_id = '97000000-0000-0000-0000-00000000a012')
               + (select count(*) from public.lead_events where launch_id = '97000000-0000-0000-0000-00000000a013'),
  3, 'los registros, visitas y eventos siguen después de los intentos de borrado');

-- ─── Founder de B: lee sólo lo suyo ──────────────────────────────────────────
select ci.jwt('97000000-0000-0000-0000-0000000000fb');
set local role authenticated;
select ci.espera((select count(*) from public.webinar_launches where organization_id = '97000000-0000-0000-0000-000000000a00'),
  0, 'el founder de B no ve los lanzamientos de A');
select ci.espera((select count(*) from public.leads), 1, 'el founder de B lee sólo sus leads');
select ci.espera((select count(*) from public.launch_registrations), 1, 'el founder de B lee sólo sus registros');
reset role;

-- ─── anon: nada ──────────────────────────────────────────────────────────────
set local role anon;
select ci.rechazado($$select * from public.webinar_launches$$, 'que anon lea lanzamientos');
select ci.rechazado($$select * from public.leads$$, 'que anon lea leads');
select ci.rechazado(
  $$insert into public.landing_events (organization_id, kind, payload) values ('97000000-0000-0000-0000-000000000a00', 'visit', '{}')$$,
  'que anon inserte un crudo de la landing');
reset role;

-- ─── Service role (la ingesta): llaves y organizaciones ──────────────────────
-- El schema `ci` es sólo para anon y authenticated: acá las afirmaciones van
-- con `raise`.
set local role service_role;
do $$
begin
  -- El mismo client_registration_id en otra org se acepta (reg-1 ya está en
  -- A). El lead de B ya tiene registro en su lanzamiento: va con un lead nuevo.
  insert into public.leads (id, organization_id, email, email_normalized)
  values ('97000000-0000-0000-0000-00000000b0b2', '97000000-0000-0000-0000-000000000b00', 'beto@test.com', 'beto@test.com');
  insert into public.launch_registrations (organization_id, launch_id, lead_id, client_registration_id)
  values ('97000000-0000-0000-0000-000000000b00', '97000000-0000-0000-0000-00000000b001', '97000000-0000-0000-0000-00000000b0b2', 'reg-1');
  if (select count(*) from public.launch_registrations where client_registration_id = 'reg-1') <> 2 then
    raise exception 'FALLA: el mismo client_registration_id en dos organizaciones no quedó en las dos';
  end if;

  -- Repetido en la misma org: falla.
  insert into public.leads (id, organization_id, email, email_normalized)
  values ('97000000-0000-0000-0000-00000000a0a2', '97000000-0000-0000-0000-000000000a00', 'carla@test.com', 'carla@test.com');
  begin
    insert into public.launch_registrations (organization_id, launch_id, lead_id, client_registration_id)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', '97000000-0000-0000-0000-00000000a0a2', 'reg-1');
    raise exception 'FALLA: se aceptó el mismo client_registration_id repetido en la misma organización';
  exception when unique_violation then null;
  end;

  -- Un lead se registra una vez por lanzamiento.
  begin
    insert into public.launch_registrations (organization_id, launch_id, lead_id, client_registration_id)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', '97000000-0000-0000-0000-00000000a0a1', 'reg-otro');
    raise exception 'FALLA: se aceptaron dos registros del mismo lead en el mismo lanzamiento';
  exception when unique_violation then null;
  end;

  -- Un lead por email normalizado y organización.
  begin
    insert into public.leads (organization_id, email, email_normalized)
    values ('97000000-0000-0000-0000-000000000a00', 'ANA@test.com', 'ana@test.com');
    raise exception 'FALLA: se aceptaron dos leads con el mismo email en la misma organización';
  exception when unique_violation then null;
  end;

  -- La llave natural de lead_events: por organización.
  insert into public.lead_events (organization_id, lead_id, launch_id, kind, occurred_at, source, source_ref)
  values ('97000000-0000-0000-0000-000000000b00', '97000000-0000-0000-0000-00000000b0b1', '97000000-0000-0000-0000-00000000b001', 'registered', now(), 'landing', 'reg-1');
  begin
    insert into public.lead_events (organization_id, lead_id, launch_id, kind, occurred_at, source, source_ref)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a0a1', '97000000-0000-0000-0000-00000000a001', 'registered', now(), 'landing', 'reg-1');
    raise exception 'FALLA: se aceptó el mismo evento externo dos veces en la misma organización';
  exception when unique_violation then null;
  end;

  -- Una visita por visitante, lanzamiento y día.
  begin
    insert into public.landing_visits (organization_id, launch_id, visitor_id, day)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', 'v-1', current_date);
    raise exception 'FALLA: se aceptó la misma visita dos veces en el día';
  exception when unique_violation then null;
  end;

  -- La misma campaña y el mismo producto, una vez por lanzamiento.
  begin
    insert into public.launch_ad_campaigns (organization_id, launch_id, platform, campaign_external_id)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', 'meta', 'camp-1');
    raise exception 'FALLA: se aceptó la misma campaña dos veces en un lanzamiento';
  exception when unique_violation then null;
  end;
  begin
    insert into public.launch_products (organization_id, launch_id, provider, product_external_id, role)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', 'whop', 'prod-1', 'vip');
    raise exception 'FALLA: se aceptó el mismo producto dos veces en un lanzamiento';
  exception when unique_violation then null;
  end;

  -- La clave de ingesta es única por hash.
  begin
    insert into public.ingest_keys (organization_id, key_hash, label)
    values ('97000000-0000-0000-0000-000000000b00', repeat('a', 64), 'Copia');
    raise exception 'FALLA: se aceptó el mismo key_hash dos veces';
  exception when unique_violation then null;
  end;

  -- El public_id es único en toda la base.
  begin
    update public.webinar_launches
       set public_id = (select public_id from public.webinar_launches where id = '97000000-0000-0000-0000-00000000a001')
     where id = '97000000-0000-0000-0000-00000000b001';
    raise exception 'FALLA: se aceptó el mismo public_id en dos lanzamientos';
  exception when unique_violation then null;
  end;
end $$;

-- Ninguna fila hija de A apunta a algo de B, aunque escriba el service role.
do $$
begin
  begin
    insert into public.launch_registrations (organization_id, launch_id, lead_id, client_registration_id)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000b001', '97000000-0000-0000-0000-00000000a0a1', 'reg-cruzado-1');
    raise exception 'FALLA: se permitió un registro de A en un lanzamiento de B';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.launch_registrations (organization_id, launch_id, lead_id, client_registration_id)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', '97000000-0000-0000-0000-00000000b0b2', 'reg-cruzado-2');
    raise exception 'FALLA: se permitió un registro de A con un lead de B';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.launch_registrations (organization_id, launch_id, lead_id, client_registration_id, raw_event_id)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', '97000000-0000-0000-0000-00000000a0a2', 'reg-cruzado-3', '97000000-0000-0000-0000-00000000be01');
    raise exception 'FALLA: se permitió un registro de A con el crudo de B';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.lead_events (organization_id, lead_id, launch_id, kind, occurred_at, source, source_ref)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000b0b1', '97000000-0000-0000-0000-00000000a001', 'note', now(), 'manual', 'cruzado-1');
    raise exception 'FALLA: se permitió un evento de A con un lead de B';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.lead_events (organization_id, lead_id, launch_id, kind, occurred_at, source, source_ref)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a0a1', '97000000-0000-0000-0000-00000000b001', 'note', now(), 'manual', 'cruzado-2');
    raise exception 'FALLA: se permitió un evento de A en un lanzamiento de B';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.landing_visits (organization_id, launch_id, visitor_id, day)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000b001', 'v-cruzado', current_date);
    raise exception 'FALLA: se permitió una visita de A en un lanzamiento de B';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.webinar_sessions (organization_id, launch_id, starts_at)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000b001', now());
    raise exception 'FALLA: se permitió una sesión de A en un lanzamiento de B (service role)';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.launch_ad_campaigns (organization_id, launch_id, platform, campaign_external_id)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000b001', 'meta', 'camp-cruzada');
    raise exception 'FALLA: se permitió una campaña de A en un lanzamiento de B';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.launch_products (organization_id, launch_id, provider, product_external_id, role)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000b001', 'whop', 'prod-cruzado', 'main');
    raise exception 'FALLA: se permitió un producto de A en un lanzamiento de B';
  exception when foreign_key_violation then null;
  end;
  begin
    update public.webinar_launches set organization_id = '97000000-0000-0000-0000-000000000b00'
     where id = '97000000-0000-0000-0000-00000000a001';
    raise exception 'FALLA: se permitió mover a otra org un lanzamiento con filas hijas';
  exception when foreign_key_violation then null;
  end;
end $$;
reset role;

-- ─── Valores fuera de los permitidos ─────────────────────────────────────────
do $$
begin
  begin
    insert into public.webinar_launches (organization_id, name, variant, currency)
    values ('97000000-0000-0000-0000-000000000a00', 'X', 'viral', 'USD');
    raise exception 'FALLA: se aceptó un variant fuera de organic, paid y paid_plus';
  exception when check_violation then null;
  end;
  begin
    insert into public.webinar_launches (organization_id, name, variant, currency, status)
    values ('97000000-0000-0000-0000-000000000a00', 'X', 'paid', 'USD', 'paused');
    raise exception 'FALLA: se aceptó un status de lanzamiento fuera de draft, active y closed';
  exception when check_violation then null;
  end;
  begin
    insert into public.webinar_launches (organization_id, name, variant, currency)
    values ('97000000-0000-0000-0000-000000000a00', 'X', 'paid', 'usd');
    raise exception 'FALLA: se aceptó una moneda que no son 3 letras mayúsculas';
  exception when check_violation then null;
  end;
  begin
    insert into public.webinar_launches (organization_id, name, variant, currency, status)
    values ('97000000-0000-0000-0000-000000000a00', 'X', 'paid', 'USD', 'closed');
    raise exception 'FALLA: se aceptó un lanzamiento cerrado sin closed_at';
  exception when check_violation then null;
  end;
  begin
    insert into public.launch_products (organization_id, launch_id, provider, product_external_id, role)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a001', 'whop', 'prod-r', 'upsell');
    raise exception 'FALLA: se aceptó un role de producto fuera de main y vip';
  exception when check_violation then null;
  end;
  begin
    insert into public.lead_events (organization_id, lead_id, launch_id, kind, occurred_at, source, source_ref)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a0a1', '97000000-0000-0000-0000-00000000a001', 'clicked', now(), 'landing', 'k-1');
    raise exception 'FALLA: se aceptó un kind de evento de lead desconocido';
  exception when check_violation then null;
  end;
  begin
    insert into public.lead_events (organization_id, lead_id, launch_id, kind, occurred_at, source, source_ref)
    values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a0a1', '97000000-0000-0000-0000-00000000a001', 'note', now(), 'hubspot', 's-1');
    raise exception 'FALLA: se aceptó un source de evento de lead desconocido';
  exception when check_violation then null;
  end;
  begin
    insert into public.landing_events (organization_id, kind, payload)
    values ('97000000-0000-0000-0000-000000000a00', 'click', '{}');
    raise exception 'FALLA: se aceptó un kind de landing_events fuera de registration y visit';
  exception when check_violation then null;
  end;
  begin
    insert into public.landing_events (organization_id, kind, payload, status)
    values ('97000000-0000-0000-0000-000000000a00', 'visit', '{}', 'done');
    raise exception 'FALLA: se aceptó un status de landing_events fuera de pending, processed, unmapped y error';
  exception when check_violation then null;
  end;
  begin
    insert into public.leads (organization_id, email, email_normalized)
    values ('97000000-0000-0000-0000-000000000a00', 'Mayus@test.com', 'Mayus@test.com');
    raise exception 'FALLA: se aceptó un email_normalized sin normalizar';
  exception when check_violation then null;
  end;
  begin
    insert into public.leads (organization_id, email, email_normalized)
    values ('97000000-0000-0000-0000-000000000a00', ' borde@test.com', ' borde@test.com');
    raise exception 'FALLA: se aceptó un email_normalized con espacios en el borde';
  exception when check_violation then null;
  end;
  -- El CHECK no depende de la collation de la base (AR de SCRUM-528): sólo
  -- juzga A-Z. Una mayúscula fuera de ASCII la normaliza la ingesta; si el
  -- CHECK usara la collation de la base (en el CI, en_US o C.UTF-8, que pasan
  -- 'Á' a 'á'; con tr-TR, además 'I' a 'ı'), este valor se rechazaría.
  begin
    insert into public.leads (organization_id, email, email_normalized)
    values ('97000000-0000-0000-0000-000000000a00', 'Ángel@test.com', 'Ángel@test.com');
  exception when check_violation then
    raise exception 'FALLA: el CHECK de email_normalized depende de la collation de la base';
  end;
end $$;

-- Las metas son opcionales, pero nunca cero (sin meta es null).
do $$
begin
  insert into public.webinar_launches (organization_id, name, variant, currency, goal_sales, goal_revenue)
  values ('97000000-0000-0000-0000-000000000a00', 'Sin metas', 'organic', 'USD', null, null);
  begin
    insert into public.webinar_launches (organization_id, name, variant, currency, goal_sales)
    values ('97000000-0000-0000-0000-000000000a00', 'Meta cero', 'organic', 'USD', 0);
    raise exception 'FALLA: se aceptó una meta de ventas en cero';
  exception when check_violation then null;
  end;
  begin
    insert into public.webinar_launches (organization_id, name, variant, currency, goal_revenue)
    values ('97000000-0000-0000-0000-000000000a00', 'Meta cero', 'organic', 'USD', 0);
    raise exception 'FALLA: se aceptó una meta de facturación en cero';
  exception when check_violation then null;
  end;
  -- Fanbasis es proveedor de pagos del repo (payments_whop_fanbasis).
  insert into public.lead_events (organization_id, lead_id, launch_id, kind, occurred_at, source, source_ref)
  values ('97000000-0000-0000-0000-000000000a00', '97000000-0000-0000-0000-00000000a0a1', '97000000-0000-0000-0000-00000000a001', 'purchased', now(), 'fanbasis', 'fb-1');
end $$;

-- ─── Catálogo: realtime, índices, RLS y grants ───────────────────────────────
do $$
declare
  v_tablas constant text[] := array[
    'webinar_launches', 'webinar_sessions', 'launch_ad_campaigns', 'launch_products', 'leads',
    'launch_registrations', 'landing_visits', 'lead_events', 'ingest_keys', 'landing_events'];
  v_tabla text;
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public'
                    and tablename = 'launch_registrations') then
    raise exception 'FALLA: launch_registrations no está en la publicación supabase_realtime';
  end if;

  -- Por catálogo y no por el texto de pg_indexes: ese texto cambia según el
  -- search_path (con `extensions` en el path, el opclass sale sin calificar).
  if not exists (select 1 from pg_index i
                   join pg_class ix on ix.oid = i.indexrelid
                   join pg_am am on am.oid = ix.relam
                   join pg_opclass oc on oc.oid = i.indclass[0]
                   join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
                  where i.indrelid = 'public.leads'::regclass and i.indnatts = 1 and am.amname = 'gin'
                    and oc.opcname = 'gin_trgm_ops' and oc.opcnamespace = 'extensions'::regnamespace
                    and a.attname = 'name') then
    raise exception 'FALLA: falta el índice trigram sobre leads.name';
  end if;
  if not exists (select 1 from pg_index i
                   join pg_class ix on ix.oid = i.indexrelid
                   join pg_am am on am.oid = ix.relam
                   join pg_opclass oc on oc.oid = i.indclass[0]
                   join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
                  where i.indrelid = 'public.leads'::regclass and i.indnatts = 1 and am.amname = 'gin'
                    and oc.opcname = 'gin_trgm_ops' and oc.opcnamespace = 'extensions'::regnamespace
                    and a.attname = 'email_normalized') then
    raise exception 'FALLA: falta el índice trigram sobre leads.email_normalized';
  end if;

  -- landing_events con las columnas del patrón de lib/webhooks/reclamar.ts y
  -- reprocesar.ts (las que usa para reclamar y cerrar un evento).
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'landing_events'
         and column_name in ('status', 'error_message', 'processed_at', 'received_at', 'payload')) <> 5 then
    raise exception 'FALLA: landing_events no tiene las columnas de reclamar.ts (status, error_message, processed_at, received_at, payload)';
  end if;

  foreach v_tabla in array v_tablas loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_tabla)::regclass) then
      raise exception 'FALLA: % sin RLS', v_tabla;
    end if;
    if has_table_privilege('anon', 'public.' || v_tabla, 'SELECT')
       or has_any_column_privilege('anon', 'public.' || v_tabla, 'INSERT')
       or has_any_column_privilege('anon', 'public.' || v_tabla, 'UPDATE')
       or has_table_privilege('anon', 'public.' || v_tabla, 'DELETE')
       or has_table_privilege('anon', 'public.' || v_tabla, 'TRUNCATE') then
      raise exception 'FALLA: anon tiene algún grant sobre %', v_tabla;
    end if;
    if has_table_privilege('authenticated', 'public.' || v_tabla, 'TRUNCATE') then
      raise exception 'FALLA: authenticated puede vaciar %', v_tabla;
    end if;
  end loop;

  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename in ('ingest_keys', 'landing_events')) then
    raise exception 'FALLA: ingest_keys o landing_events tienen policies (deben ser sólo del service role)';
  end if;

  -- Ninguna policy de escritura sin chequeo de rol (se suman con OR).
  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename in ('webinar_launches', 'webinar_sessions', 'launch_ad_campaigns', 'launch_products')
              and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
              and coalesce(qual, '') || coalesce(with_check, '') not like '%current_user_has_org_role%') then
    raise exception 'FALLA: queda una policy de escritura de la configuración del lanzamiento sin chequeo de rol';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename in ('leads', 'launch_registrations', 'landing_visits', 'lead_events')
              and cmd <> 'SELECT') then
    raise exception 'FALLA: leads, registros, visitas o eventos tienen una policy de escritura';
  end if;
end $$;

-- ─── Holding: el founder del holding operando uno de sus negocios ────────────
-- Holding H con el negocio C; D es un negocio ajeno. FH es founder del holding
-- y MH member del holding.
insert into auth.users (id, email) values
  ('97000000-0000-0000-0000-0000000000f1', 'fh@test'),
  ('97000000-0000-0000-0000-0000000000f2', 'mh@test');
insert into public.organizations (id, name, account_type) values
  ('97000000-0000-0000-0000-000000000100', 'Holding H', 'holding');
insert into public.organizations (id, name) values
  ('97000000-0000-0000-0000-000000000c00', 'Negocio C'),
  ('97000000-0000-0000-0000-000000000d00', 'Negocio D ajeno');
insert into public.holding_businesses (holding_org_id, business_org_id, business_name, status) values
  ('97000000-0000-0000-0000-000000000100', '97000000-0000-0000-0000-000000000c00', 'Negocio C', 'active');
insert into public.profiles (id, email, organization_id, role, full_name, is_active) values
  ('97000000-0000-0000-0000-0000000000f1', 'fh@test', '97000000-0000-0000-0000-000000000100', 'founder', 'FH', true),
  ('97000000-0000-0000-0000-0000000000f2', 'mh@test', '97000000-0000-0000-0000-000000000100', 'member',  'MH', true);
insert into public.webinar_launches (organization_id, name, variant, currency) values
  ('97000000-0000-0000-0000-000000000c00', 'De C', 'paid', 'USD'),
  ('97000000-0000-0000-0000-000000000d00', 'De D', 'paid', 'USD');

select ci.jwt('97000000-0000-0000-0000-0000000000f1', '{"active_business_org_id": "97000000-0000-0000-0000-000000000c00"}');
set local role authenticated;
select ci.espera((select count(*) from public.webinar_launches), 1, 'el founder del holding lee sólo los lanzamientos del negocio que opera');
select ci.espera(ci.filas($$insert into public.webinar_launches (organization_id, name, variant, currency) values ('97000000-0000-0000-0000-000000000c00', 'Nuevo en C', 'paid', 'USD')$$),
  1, 'el founder del holding crea un lanzamiento en su negocio');
select ci.espera(ci.filas($$update public.webinar_launches set name = 'C editado'$$),
  2, 'el founder del holding edita sin WHERE sólo los lanzamientos de su negocio');
reset role;

-- Un claim hacia un negocio que no es del holding (el hook no lo emitiría): el
-- rol no vale ahí.
select ci.jwt('97000000-0000-0000-0000-0000000000f1', '{"active_business_org_id": "97000000-0000-0000-0000-000000000d00"}');
set local role authenticated;
select ci.rechazado(
  $$insert into public.webinar_launches (organization_id, name, variant, currency) values ('97000000-0000-0000-0000-000000000d00', 'En D', 'paid', 'USD')$$,
  'que el founder del holding cree un lanzamiento en un negocio ajeno');
reset role;

select ci.jwt('97000000-0000-0000-0000-0000000000f2', '{"active_business_org_id": "97000000-0000-0000-0000-000000000c00"}');
set local role authenticated;
select ci.espera((select count(*) from public.webinar_launches), 2, 'un member del holding lee los lanzamientos del negocio que opera');
select ci.rechazado(
  $$insert into public.webinar_launches (organization_id, name, variant, currency) values ('97000000-0000-0000-0000-000000000c00', 'De MH', 'paid', 'USD')$$,
  'que un member del holding cree un lanzamiento');
reset role;

-- ─── Borrar la organización sigue borrando todo ──────────────────────────────
-- Las FK de datos hacia el lanzamiento son NO ACTION: se chequean al final de
-- la sentencia, cuando los registros, visitas y eventos ya se fueron por su
-- propia FK a organizations.
delete from public.organizations where id = '97000000-0000-0000-0000-000000000a00';
select ci.espera(
  (select count(*) from public.webinar_launches where organization_id = '97000000-0000-0000-0000-000000000a00')
  + (select count(*) from public.webinar_sessions where organization_id = '97000000-0000-0000-0000-000000000a00')
  + (select count(*) from public.launch_ad_campaigns where organization_id = '97000000-0000-0000-0000-000000000a00')
  + (select count(*) from public.launch_products where organization_id = '97000000-0000-0000-0000-000000000a00')
  + (select count(*) from public.leads where organization_id = '97000000-0000-0000-0000-000000000a00')
  + (select count(*) from public.launch_registrations where organization_id = '97000000-0000-0000-0000-000000000a00')
  + (select count(*) from public.landing_visits where organization_id = '97000000-0000-0000-0000-000000000a00')
  + (select count(*) from public.lead_events where organization_id = '97000000-0000-0000-0000-000000000a00')
  + (select count(*) from public.ingest_keys where organization_id = '97000000-0000-0000-0000-000000000a00')
  + (select count(*) from public.landing_events where organization_id = '97000000-0000-0000-0000-000000000a00'),
  0, 'borrar la organización borra sus filas de las 10 tablas');
select ci.espera((select count(*) from public.webinar_launches where id = '97000000-0000-0000-0000-00000000b001'),
  1, 'borrar una organización no toca a otra');

rollback;

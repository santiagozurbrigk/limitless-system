-- SCRUM-1 parte A · [PERMISOS-SERVER-ACTIONS]
-- Equipo y configuración de la org, sólo founder; borrar clientes, founder o
-- admin; asignar rol y activar o desactivar miembros, sólo founder. Vale para
-- el founder de un holding que opera uno de sus negocios; un perfil
-- desactivado no puede nada.
-- Migración: 20260929100000_roles_equipo_y_config_en_la_base.

begin;

-- ─── Datos ───────────────────────────────────────────────────────────────────
-- Org A: founder (F), admin (AD), member (M), founder desactivado (FI).
-- Holding H con el negocio B: founder del holding (FH) y un member de B (MB).
insert into auth.users (id, email) values
  ('30000000-0000-0000-0000-00000000000f', 'f@test'),
  ('30000000-0000-0000-0000-00000000000a', 'ad@test'),
  ('30000000-0000-0000-0000-00000000000b', 'm@test'),
  ('30000000-0000-0000-0000-00000000000c', 'fi@test'),
  ('30000000-0000-0000-0000-0000000000f1', 'fh@test'),
  ('30000000-0000-0000-0000-0000000000b1', 'mb@test');

insert into public.organizations (id, name) values
  ('30000000-0000-0000-0000-000000000a00', 'Org A'),
  ('30000000-0000-0000-0000-000000000b00', 'Negocio B');
insert into public.organizations (id, name, account_type) values
  ('30000000-0000-0000-0000-000000000c00', 'Holding H', 'holding');
insert into public.holding_businesses (holding_org_id, business_org_id, business_name, status)
values ('30000000-0000-0000-0000-000000000c00', '30000000-0000-0000-0000-000000000b00', 'Negocio B', 'active');

insert into public.profiles (id, email, organization_id, role, full_name, is_active) values
  ('30000000-0000-0000-0000-00000000000f', 'f@test',  '30000000-0000-0000-0000-000000000a00', 'founder', 'F',  true),
  ('30000000-0000-0000-0000-00000000000a', 'ad@test', '30000000-0000-0000-0000-000000000a00', 'admin',   'AD', true),
  ('30000000-0000-0000-0000-00000000000b', 'm@test',  '30000000-0000-0000-0000-000000000a00', 'member',  'M',  true),
  ('30000000-0000-0000-0000-00000000000c', 'fi@test', '30000000-0000-0000-0000-000000000a00', 'founder', 'FI', false),
  ('30000000-0000-0000-0000-0000000000f1', 'fh@test', '30000000-0000-0000-0000-000000000c00', 'founder', 'FH', true),
  ('30000000-0000-0000-0000-0000000000b1', 'mb@test', '30000000-0000-0000-0000-000000000b00', 'member',  'MB', true);

insert into public.team_roles (id, organization_id, name) values
  ('30000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-000000000a00', 'Setter'),
  ('30000000-0000-0000-0000-0000000000e2', '30000000-0000-0000-0000-000000000a00', 'Todo'),
  ('30000000-0000-0000-0000-0000000000e3', '30000000-0000-0000-0000-000000000b00', 'Todo B');
insert into public.team_invitations (organization_id, email)
values ('30000000-0000-0000-0000-000000000a00', 'pendiente@test');
insert into public.clients (id, organization_id, name, payment_type, platform) values
  ('30000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-000000000a00', 'Cliente 1', 'upfront', 'other'),
  ('30000000-0000-0000-0000-0000000000c2', '30000000-0000-0000-0000-000000000a00', 'Cliente 2', 'upfront', 'other'),
  ('30000000-0000-0000-0000-0000000000c3', '30000000-0000-0000-0000-000000000a00', 'Cliente 3', 'upfront', 'other'),
  ('30000000-0000-0000-0000-0000000000cb', '30000000-0000-0000-0000-000000000b00', 'Cliente B', 'upfront', 'other');

-- ─── Member de A: no administra nada ─────────────────────────────────────────
select ci.jwt('30000000-0000-0000-0000-00000000000b');
set local role authenticated;

select ci.rechazado(
  $$insert into public.team_roles (organization_id, name) values ('30000000-0000-0000-0000-000000000a00', 'hack')$$,
  'que un member cree un rol');
select ci.espera(ci.filas($$update public.team_roles set name = 'hack' where id = '30000000-0000-0000-0000-0000000000e1'$$),
  0, 'un member no cambia un rol');
select ci.espera(ci.filas($$delete from public.team_roles where id = '30000000-0000-0000-0000-0000000000e1'$$),
  0, 'un member no borra un rol');
select ci.espera((select count(*) from public.team_roles), 2, 'un member sigue leyendo los roles de su org');
select ci.espera((select count(*) from public.team_invitations), 0, 'un member no ve las invitaciones (ni su token)');
select ci.rechazado(
  $$insert into public.team_invitations (organization_id, email) values ('30000000-0000-0000-0000-000000000a00', 'yo@test')$$,
  'que un member cree una invitación');
select ci.espera(ci.filas($$update public.organizations set name = 'hack' where id = '30000000-0000-0000-0000-000000000a00'$$),
  0, 'un member no cambia la configuración de la org');
select ci.espera(ci.filas($$delete from public.clients where organization_id = '30000000-0000-0000-0000-000000000a00'$$),
  0, 'un member no borra clientes');
select ci.rechazado(
  $$update public.profiles set custom_role_id = '30000000-0000-0000-0000-0000000000e2' where id = '30000000-0000-0000-0000-00000000000b'$$,
  'que un member se asigne un rol');
select ci.espera(ci.filas($$update public.profiles set full_name = 'Nuevo nombre' where id = '30000000-0000-0000-0000-00000000000b'$$),
  1, 'un member edita su nombre');

reset role;

-- ─── Admin de A: sólo borra clientes (y tarifas) ─────────────────────────────
select ci.jwt('30000000-0000-0000-0000-00000000000a');
set local role authenticated;

select ci.rechazado(
  $$insert into public.team_roles (organization_id, name) values ('30000000-0000-0000-0000-000000000a00', 'hack')$$,
  'que un admin cree un rol');
select ci.espera((select count(*) from public.team_invitations), 0, 'un admin no ve las invitaciones');
select ci.espera(ci.filas($$update public.organizations set name = 'hack' where id = '30000000-0000-0000-0000-000000000a00'$$),
  0, 'un admin no cambia la configuración de la org');
select ci.espera(ci.filas($$delete from public.clients where id = '30000000-0000-0000-0000-0000000000c1'$$),
  1, 'un admin borra un cliente');
select ci.rechazado(
  $$update public.profiles set custom_role_id = '30000000-0000-0000-0000-0000000000e2' where id = '30000000-0000-0000-0000-00000000000a'$$,
  'que un admin se asigne el rol con todos los módulos');
select ci.rechazado(
  $$update public.profiles set is_active = false where id = '30000000-0000-0000-0000-00000000000f'$$,
  'que un admin desactive al founder');
select ci.espera(ci.filas($$update public.profiles set hourly_rate = 10 where id = '30000000-0000-0000-0000-00000000000b'$$),
  1, 'un admin cambia la tarifa de un member');

reset role;

-- ─── Founder desactivado de A: nada ──────────────────────────────────────────
select ci.jwt('30000000-0000-0000-0000-00000000000c');
set local role authenticated;

select ci.rechazado(
  $$insert into public.team_roles (organization_id, name) values ('30000000-0000-0000-0000-000000000a00', 'hack')$$,
  'que un founder desactivado cree un rol');
select ci.espera(ci.filas($$update public.organizations set name = 'hack' where id = '30000000-0000-0000-0000-000000000a00'$$),
  0, 'un founder desactivado no cambia la configuración');
select ci.espera(ci.filas($$delete from public.clients where id = '30000000-0000-0000-0000-0000000000c2'$$),
  0, 'un founder desactivado no borra clientes');

reset role;

-- ─── Founder de A: todo, menos desactivarse ──────────────────────────────────
select ci.jwt('30000000-0000-0000-0000-00000000000f');
set local role authenticated;

select ci.espera(ci.filas($$insert into public.team_roles (organization_id, name) values ('30000000-0000-0000-0000-000000000a00', 'Nuevo')$$),
  1, 'el founder crea un rol');
select ci.espera((select count(*) from public.team_invitations), 1, 'el founder ve las invitaciones');
select ci.espera(ci.filas($$insert into public.team_invitations (organization_id, email) values ('30000000-0000-0000-0000-000000000a00', 'nuevo@test')$$),
  1, 'el founder crea una invitación');
select ci.espera(ci.filas($$update public.organizations set name = 'Org A2' where id = '30000000-0000-0000-0000-000000000a00'$$),
  1, 'el founder cambia la configuración de la org');
select ci.espera(ci.filas($$delete from public.clients where id = '30000000-0000-0000-0000-0000000000c2'$$),
  1, 'el founder borra un cliente');
select ci.espera(ci.filas($$update public.profiles set custom_role_id = '30000000-0000-0000-0000-0000000000e1' where id = '30000000-0000-0000-0000-00000000000b'$$),
  1, 'el founder asigna un rol a un member');
select ci.espera(ci.filas($$update public.profiles set is_active = false where id = '30000000-0000-0000-0000-00000000000b'$$),
  1, 'el founder desactiva a un member');
select ci.rechazado(
  $$update public.profiles set is_active = false where id = '30000000-0000-0000-0000-00000000000f'$$,
  'que el founder se desactive a sí mismo');

reset role;

-- ─── Founder del holding operando el negocio B ───────────────────────────────
select ci.jwt('30000000-0000-0000-0000-0000000000f1', '{"active_business_org_id": "30000000-0000-0000-0000-000000000b00"}');
set local role authenticated;

select ci.espera(ci.filas($$insert into public.team_roles (organization_id, name) values ('30000000-0000-0000-0000-000000000b00', 'Nuevo B')$$),
  1, 'el founder del holding crea un rol en su negocio');
select ci.espera(ci.filas($$update public.organizations set name = 'Negocio B2' where id = '30000000-0000-0000-0000-000000000b00'$$),
  1, 'el founder del holding cambia la configuración de su negocio');
select ci.espera(ci.filas($$delete from public.clients where id = '30000000-0000-0000-0000-0000000000cb'$$),
  1, 'el founder del holding borra un cliente de su negocio');
select ci.espera(ci.filas($$update public.profiles set custom_role_id = '30000000-0000-0000-0000-0000000000e3' where id = '30000000-0000-0000-0000-0000000000b1'$$),
  1, 'el founder del holding asigna un rol en su negocio');
select ci.espera(ci.filas($$delete from public.clients where id = '30000000-0000-0000-0000-0000000000c3'$$),
  0, 'el founder del holding no toca clientes de una org que no es suya');

reset role;

rollback;

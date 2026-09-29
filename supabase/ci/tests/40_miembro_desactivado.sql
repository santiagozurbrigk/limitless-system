-- SCRUM-8 · [EQUIPO-DESACTIVAR-NO-BLOQUEA]
-- Un perfil desactivado no ve ni escribe nada con su JWT, tampoco un miembro
-- de holding operando un negocio; al reactivarlo vuelve a ver lo suyo.
-- Migración: 20260929110000_miembro_desactivado_sin_acceso.

begin;

insert into auth.users (id, email) values
  ('40000000-0000-0000-0000-00000000000f', 'f@test'),
  ('40000000-0000-0000-0000-00000000000b', 'm@test'),
  ('40000000-0000-0000-0000-00000000000a', 'ad@test'),
  ('40000000-0000-0000-0000-0000000000f1', 'fh@test');

insert into public.organizations (id, name) values
  ('40000000-0000-0000-0000-000000000a00', 'Org A'),
  ('40000000-0000-0000-0000-000000000b00', 'Negocio B');
insert into public.organizations (id, name, account_type) values
  ('40000000-0000-0000-0000-000000000c00', 'Holding H', 'holding');
insert into public.holding_businesses (holding_org_id, business_org_id, business_name, status)
values ('40000000-0000-0000-0000-000000000c00', '40000000-0000-0000-0000-000000000b00', 'Negocio B', 'active');

insert into public.profiles (id, email, organization_id, role, full_name, is_active) values
  ('40000000-0000-0000-0000-00000000000f', 'f@test',  '40000000-0000-0000-0000-000000000a00', 'founder', 'F',  true),
  ('40000000-0000-0000-0000-00000000000b', 'm@test',  '40000000-0000-0000-0000-000000000a00', 'member',  'M',  false),
  ('40000000-0000-0000-0000-00000000000a', 'ad@test', '40000000-0000-0000-0000-000000000a00', 'admin',   'AD', false),
  ('40000000-0000-0000-0000-0000000000f1', 'fh@test', '40000000-0000-0000-0000-000000000c00', 'founder', 'FH', false);

insert into public.clients (id, organization_id, name, payment_type, platform) values
  ('40000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-000000000a00', 'Cliente A', 'upfront', 'other'),
  ('40000000-0000-0000-0000-0000000000cb', '40000000-0000-0000-0000-000000000b00', 'Cliente B', 'upfront', 'other');

-- ─── Member desactivado de A ─────────────────────────────────────────────────
select ci.jwt('40000000-0000-0000-0000-00000000000b');
set local role authenticated;

select ci.espera((select count(*) from public.clients), 0, 'un member desactivado no ve clientes');
select ci.espera((select count(*) from public.organizations), 0, 'un member desactivado no ve su organización');
select ci.rechazado(
  $$insert into public.clients (organization_id, name, payment_type, platform) values ('40000000-0000-0000-0000-000000000a00', 'X', 'upfront', 'other')$$,
  'que un member desactivado cree un cliente');
select ci.espera(ci.filas($$update public.clients set name = 'hack' where id = '40000000-0000-0000-0000-0000000000c1'$$),
  0, 'un member desactivado no edita clientes');
select ci.espera(ci.filas($$update public.profiles set is_active = true where id = '40000000-0000-0000-0000-00000000000b'$$),
  0, 'un member desactivado no se reactiva a sí mismo');
select ci.espera(ci.filas($$update public.profiles set full_name = 'hack' where id = '40000000-0000-0000-0000-00000000000b'$$),
  0, 'un member desactivado no edita su propio perfil');

reset role;

-- ─── Admin desactivado de A ──────────────────────────────────────────────────
select ci.jwt('40000000-0000-0000-0000-00000000000a');
set local role authenticated;

select ci.espera(ci.filas($$update public.profiles set hourly_rate = 999 where id = '40000000-0000-0000-0000-00000000000a'$$),
  0, 'un admin desactivado no se cambia la tarifa');
select ci.espera(ci.filas($$update public.profiles set hourly_rate = 999 where id = '40000000-0000-0000-0000-00000000000f'$$),
  0, 'un admin desactivado no cambia la tarifa de otro');

reset role;

-- ─── Founder de holding desactivado, con el claim del negocio B ──────────────
select ci.jwt('40000000-0000-0000-0000-0000000000f1', '{"active_business_org_id": "40000000-0000-0000-0000-000000000b00"}');
set local role authenticated;

select ci.espera((select count(*) from public.clients), 0, 'un founder de holding desactivado no ve clientes de su negocio');
select ci.espera((select count(*) from (select public.get_my_holding_business_org_ids()) x), 0,
  'un founder de holding desactivado no tiene negocios');
select ci.espera((select count(*) from public.holding_businesses), 0,
  'un founder de holding desactivado no ve los negocios del holding');

reset role;

-- ─── El founder activo de A sigue viendo lo suyo ─────────────────────────────
select ci.jwt('40000000-0000-0000-0000-00000000000f');
set local role authenticated;

select ci.espera((select count(*) from public.clients), 1, 'el founder activo ve los clientes de su org');
select ci.espera(ci.filas($$update public.profiles set is_active = true where id = '40000000-0000-0000-0000-00000000000b'$$),
  1, 'el founder reactiva al member');

reset role;

-- ─── El member reactivado vuelve a ver lo suyo ───────────────────────────────
select ci.jwt('40000000-0000-0000-0000-00000000000b');
set local role authenticated;

select ci.espera((select count(*) from public.clients), 1, 'el member reactivado vuelve a ver los clientes de su org');

reset role;

rollback;

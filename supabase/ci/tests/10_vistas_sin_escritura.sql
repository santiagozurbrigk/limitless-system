-- SCRUM-9 · [DB-VISTA-CLAUDE-STATUS-ESCRIBIBLE]
-- Un miembro no puede borrar su organización (ni cambiar el estado de la
-- clave de Claude) a través de la vista organization_claude_status, y sigue
-- leyendo el estado de su propia org.
-- Migración: 20260928200000_vistas_sin_escritura.

begin;

insert into auth.users (id, email) values ('10000000-0000-0000-0000-0000000000a1', 'member@test');
insert into public.organizations (id, name) values
  ('10000000-0000-0000-0000-0000000000b1', 'Org del member'),
  ('10000000-0000-0000-0000-0000000000b2', 'Otra org');
insert into public.profiles (id, email, organization_id, role, full_name)
values ('10000000-0000-0000-0000-0000000000a1', 'member@test', '10000000-0000-0000-0000-0000000000b1', 'member', 'Member');

select ci.jwt('10000000-0000-0000-0000-0000000000a1');
set local role authenticated;

select ci.espera(
  (select count(*) from public.organization_claude_status),
  1,
  'el member ve sólo su organización en organization_claude_status'
);
select ci.espera(
  (select count(*) from public.organization_claude_status where id = '10000000-0000-0000-0000-0000000000b1'),
  1,
  'el member ve el estado de la clave de su organización'
);
select ci.rechazado(
  $$delete from public.organization_claude_status where id = '10000000-0000-0000-0000-0000000000b1'$$,
  'que un member borre su organización por la vista'
);
select ci.rechazado(
  $$update public.organization_claude_status set claude_api_key_status = 'valid'$$,
  'que un member cambie el estado de la clave por la vista'
);
-- workboard_time_by_member es un join: Postgres la rechaza por no ser
-- actualizable antes de mirar permisos, así que se afirma el permiso directo.
select ci.espera(
  has_table_privilege('authenticated', 'public.workboard_time_by_member', 'DELETE')::int,
  0,
  'authenticated no tiene DELETE sobre workboard_time_by_member'
);

reset role;

select ci.espera(
  (select count(*) from public.organizations where id = '10000000-0000-0000-0000-0000000000b1'),
  1,
  'la organización del member sigue existiendo'
);

rollback;

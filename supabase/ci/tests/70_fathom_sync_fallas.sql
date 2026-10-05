-- SCRUM-36 · [FATHOM-SYNC-CURSOR]
-- El registro de fallas de la sync de Fathom lo escribe sólo el sistema (service
-- role): ningún usuario, ni el founder, lo lee ni lo escribe. Y una misma reunión
-- tiene un solo registro por conexión (la de la org y la de cada miembro).
-- Migración: 20261005120000_fathom_sync_fallas.

begin;

insert into auth.users (id, email) values ('70000000-0000-0000-0000-00000000000f', 'f@test');
insert into public.organizations (id, name) values ('70000000-0000-0000-0000-000000000a00', 'Org A');
insert into public.profiles (id, email, organization_id, role, full_name)
values ('70000000-0000-0000-0000-00000000000f', 'f@test', '70000000-0000-0000-0000-000000000a00', 'founder', 'F');

insert into public.fathom_sync_fallas (organization_id, user_id, fathom_call_id) values
  ('70000000-0000-0000-0000-000000000a00', null, '101'),
  ('70000000-0000-0000-0000-000000000a00', '70000000-0000-0000-0000-00000000000f', '101');

select ci.jwt('70000000-0000-0000-0000-00000000000f');
set local role authenticated;

select ci.rechazado(
  $$select * from public.fathom_sync_fallas$$,
  'que un usuario lea el registro de fallas de la sync de Fathom');
select ci.rechazado(
  $$insert into public.fathom_sync_fallas (organization_id, fathom_call_id) values ('70000000-0000-0000-0000-000000000a00', '102')$$,
  'que un usuario inserte en el registro de fallas');
select ci.rechazado(
  $$update public.fathom_sync_fallas set descartada_at = now()$$,
  'que un usuario marque una reunión como descartada');
select ci.rechazado(
  $$delete from public.fathom_sync_fallas$$,
  'que un usuario borre el registro de fallas');

reset role;
set local role anon;
select ci.rechazado(
  $$select * from public.fathom_sync_fallas$$,
  'que anon lea el registro de fallas');
reset role;

-- Un registro por reunión y por conexión.
do $$
begin
  begin
    insert into public.fathom_sync_fallas (organization_id, user_id, fathom_call_id)
    values ('70000000-0000-0000-0000-000000000a00', null, '101');
    raise exception 'FALLA: se permitió un segundo registro de la misma reunión para la conexión de la org';
  exception when unique_violation then null;
  end;
  begin
    insert into public.fathom_sync_fallas (organization_id, user_id, fathom_call_id)
    values ('70000000-0000-0000-0000-000000000a00', '70000000-0000-0000-0000-00000000000f', '101');
    raise exception 'FALLA: se permitió un segundo registro de la misma reunión para la conexión del miembro';
  exception when unique_violation then null;
  end;
end $$;

rollback;

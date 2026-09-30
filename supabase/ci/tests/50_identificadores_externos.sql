-- SCRUM-82 · [SEG-RLS-IDENTIFICADORES-EXTERNOS]
-- Ningún usuario escribe el identificador de la cuenta externa que decide a
-- qué organización va cada evento (servidor de Discord, cuenta de Unipile,
-- location de GHL). Lo que la app sí edita de Discord sigue funcionando, y
-- una misma cuenta de Unipile conectada no puede estar en dos organizaciones.
-- Migración: 20260930110000_identificadores_externos.

begin;

insert into auth.users (id, email) values ('50000000-0000-0000-0000-00000000000f', 'f@test');
insert into public.organizations (id, name) values
  ('50000000-0000-0000-0000-000000000a00', 'Org A'),
  ('50000000-0000-0000-0000-000000000b00', 'Org B');
insert into public.profiles (id, email, organization_id, role, full_name)
values ('50000000-0000-0000-0000-00000000000f', 'f@test', '50000000-0000-0000-0000-000000000a00', 'founder', 'F');

insert into public.discord_integrations (organization_id, guild_id) values
  ('50000000-0000-0000-0000-000000000a00', 'guild-a');
insert into public.unipile_integrations (organization_id, unipile_account_id, provider, status) values
  ('50000000-0000-0000-0000-000000000a00', 'acc-a', 'instagram', 'connected'),
  ('50000000-0000-0000-0000-000000000b00', 'acc-b', 'instagram', 'connected');
insert into public.ghl_integrations (organization_id, api_key_encrypted, location_id) values
  ('50000000-0000-0000-0000-000000000a00', 'x', 'loc-a'),
  ('50000000-0000-0000-0000-000000000b00', 'x', 'loc-b');

-- Hasta el founder (el rol con más permisos) queda afuera: el identificador
-- sólo lo escribe el sistema al conectar.
select ci.jwt('50000000-0000-0000-0000-00000000000f');
set local role authenticated;

select ci.rechazado(
  $$update public.discord_integrations set guild_id = 'guild-b' where organization_id = '50000000-0000-0000-0000-000000000a00'$$,
  'que un usuario cambie el servidor de Discord de su integración');
select ci.rechazado(
  $$insert into public.discord_integrations (organization_id, guild_id) values ('50000000-0000-0000-0000-000000000a00', 'guild-x')$$,
  'que un usuario inserte una integración de Discord');
select ci.espera(ci.filas($$update public.discord_integrations set bot_name = 'Nuevo', monitored_channels = '[]'::jsonb where organization_id = '50000000-0000-0000-0000-000000000a00'$$),
  1, 'un usuario sigue editando nombre del bot y canales');

select ci.rechazado(
  $$update public.unipile_integrations set unipile_account_id = 'acc-b' where organization_id = '50000000-0000-0000-0000-000000000a00'$$,
  'que un usuario cambie la cuenta de Unipile');
select ci.rechazado(
  $$update public.unipile_integrations set status = 'connected' where organization_id = '50000000-0000-0000-0000-000000000a00'$$,
  'que un usuario cambie el estado de Unipile');
select ci.rechazado(
  $$insert into public.unipile_integrations (organization_id, unipile_account_id, provider, status) values ('50000000-0000-0000-0000-000000000a00', 'acc-b', 'instagram', 'connected')$$,
  'que un usuario inserte una integración de Unipile');

select ci.rechazado(
  $$update public.ghl_integrations set location_id = 'loc-b' where organization_id = '50000000-0000-0000-0000-000000000a00'$$,
  'que un usuario cambie la location de GHL');
select ci.rechazado(
  $$insert into public.ghl_integrations (organization_id, api_key_encrypted, location_id) values ('50000000-0000-0000-0000-000000000a00', 'x', 'loc-b')$$,
  'que un usuario inserte una integración de GHL');

reset role;

-- Aunque escriba el sistema, una misma cuenta de Unipile conectada no queda en
-- dos orgs. GHL sí puede compartir location entre orgs (caso real en prod).
do $$
begin
  begin
    insert into public.unipile_integrations (organization_id, unipile_account_id, provider, status)
    values ('50000000-0000-0000-0000-000000000a00', 'acc-b', 'whatsapp', 'connected');
    raise exception 'FALLA: se permitió la misma cuenta de Unipile conectada en dos organizaciones';
  exception when unique_violation then null;
  end;
end $$;

rollback;

-- SCRUM-12 · [SEG-BUCKET-IMPORT-FILES]
-- Nadie logueado puede listar, descargar, subir ni borrar en el bucket
-- import-files, y no queda ninguna policy de storage.objects que lo nombre.
-- Migración: 20260928210000_import_files_sin_policies.
--
-- El bucket ya no existe en producción; acá se recrea con sus archivos para
-- probar que, si volviera, las policies no lo abren.
--
-- El archivo está en la carpeta de la org del usuario (`<org>/imports/...`):
-- es la forma que habilitan las policies de DELETE de otros buckets
-- (`foldername(name)[1] = get_my_organization_id()`), así que una de ellas sin
-- su chequeo de `bucket_id` lo dejaría borrar (SCRUM-539).
--
-- En el Supabase local, el storage real bloquea todo DELETE directo con el
-- trigger `storage.protect_delete` (42501) salvo con
-- `set storage.allow_delete_query = 'true'`: ver docs/operacion/testing.md.

begin;

-- En Supabase, `authenticated` tiene estos grants sobre storage.objects y la
-- RLS decide; los stubs del CI no los traen.
grant select, insert, update, delete on storage.objects to authenticated;

insert into public.organizations (id, name) values
  ('20000000-0000-0000-0000-000000000a00', 'Org A');
insert into auth.users (id, email) values ('20000000-0000-0000-0000-0000000000a1', 'cualquiera@test');
insert into public.profiles (id, email, organization_id, role, full_name, is_active) values
  ('20000000-0000-0000-0000-0000000000a1', 'cualquiera@test', '20000000-0000-0000-0000-000000000a00', 'founder', 'A', true);

insert into storage.buckets (id, name, public) values ('import-files', 'import-files', false);
insert into storage.objects (bucket_id, name) values
  ('import-files', '20000000-0000-0000-0000-000000000a00/imports/metricas.xlsx');

select ci.espera(
  (select count(*) from pg_policies
   where schemaname = 'storage'
     and coalesce(qual, '') || coalesce(with_check, '') like '%import-files%'),
  0,
  'ninguna policy de storage nombra al bucket import-files'
);

select ci.jwt('20000000-0000-0000-0000-0000000000a1');
set local role authenticated;

select ci.espera(
  (select count(*) from storage.objects where bucket_id = 'import-files'),
  0,
  'un usuario logueado no ve los archivos de import-files'
);
select ci.rechazado(
  $$insert into storage.objects (bucket_id, name) values ('import-files', '20000000-0000-0000-0000-000000000a00/imports/nuevo.xlsx')$$,
  'que un usuario logueado suba a import-files'
);

-- Borrar. En Postgres un DELETE con WHERE sólo alcanza filas visibles por una
-- policy de SELECT: sin ver el archivo, la afirmación de borrado quedaría
-- tapada por la de lectura. Por eso, sólo dentro de este test, una policy de
-- lectura lo hace visible; el borrado tiene que seguir sin tocar nada porque
-- ninguna policy de DELETE lo cubre.
reset role;
create policy ci_lectura_import_files on storage.objects
  for select to authenticated using (bucket_id = 'import-files');
set local role authenticated;

select ci.espera(
  (select count(*) from storage.objects where bucket_id = 'import-files'),
  1,
  'precondición: con la policy de lectura del test, el usuario ve el archivo'
);
select ci.espera(
  ci.filas($$delete from storage.objects where bucket_id = 'import-files'$$),
  0,
  'un usuario logueado no borra archivos de import-files'
);

reset role;

select ci.espera(
  (select count(*) from storage.objects where bucket_id = 'import-files'),
  1,
  'el archivo sigue en el bucket'
);

rollback;

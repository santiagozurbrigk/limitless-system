-- SCRUM-12 · [SEG-BUCKET-IMPORT-FILES]
-- Nadie logueado puede listar, descargar, subir ni borrar en el bucket
-- import-files, y no queda ninguna policy de storage.objects que lo nombre.
-- Migración: 20260928210000_import_files_sin_policies.
--
-- El bucket ya no existe en producción; acá se recrea con sus archivos para
-- probar que, si volviera, las policies no lo abren.

begin;

-- En Supabase, `authenticated` tiene estos grants sobre storage.objects y la
-- RLS decide; los stubs del CI no los traen.
grant select, insert, update, delete on storage.objects to authenticated;

insert into storage.buckets (id, name, public) values ('import-files', 'import-files', false);
insert into storage.objects (bucket_id, name) values ('import-files', 'imports/metricas.xlsx');

select ci.espera(
  (select count(*) from pg_policies
   where schemaname = 'storage'
     and coalesce(qual, '') || coalesce(with_check, '') like '%import-files%'),
  0,
  'ninguna policy de storage nombra al bucket import-files'
);

insert into auth.users (id, email) values ('20000000-0000-0000-0000-0000000000a1', 'cualquiera@test');
select ci.jwt('20000000-0000-0000-0000-0000000000a1');
set local role authenticated;

select ci.espera(
  (select count(*) from storage.objects where bucket_id = 'import-files'),
  0,
  'un usuario logueado no ve los archivos de import-files'
);
select ci.rechazado(
  $$insert into storage.objects (bucket_id, name) values ('import-files', 'imports/nuevo.xlsx')$$,
  'que un usuario logueado suba a import-files'
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

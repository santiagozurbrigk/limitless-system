-- [SEG-BUCKET-IMPORT-FILES] (SCRUM-12): cerrar el bucket `import-files`.
--
-- El bucket es del importador viejo (se eliminó en 4ee95c17) y ninguna
-- migración lo creó. En producción tiene tres policies sobre storage.objects,
-- hechas a mano, cuya única condición es `bucket_id = 'import-files'`: cualquier
-- usuario logueado de cualquier organización listaba, descargaba y borraba los
-- archivos de las otras, y podía subir hasta 50 MB por archivo.
--
-- Se borran las tres. Sin policies, storage.objects (con RLS) no deja a
-- `anon` ni `authenticated` tocar el bucket; el service role sigue pudiendo.
-- El bucket y sus 2 archivos (al 2026-09-28) no se tocan acá: se borran desde
-- el panel de Storage después de descargarlos, el mismo día. Un enlace firmado
-- emitido mientras las policies estaban abiertas no pasa por la RLS y sigue
-- sirviendo el archivo hasta que el objeto se borra.
drop policy if exists "Users can read import files" on storage.objects;
drop policy if exists "Users can upload import files" on storage.objects;
drop policy if exists "Users can delete import files" on storage.objects;

-- Si en producción hubiera otra policy (con otro nombre) sobre el bucket, o una
-- policy genérica que abra todos los buckets sin filtrar por `bucket_id`, la
-- migración falla en vez de dejar el hueco abierto sin avisar.
do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') like '%import-files%'
        or coalesce(with_check, '') like '%import-files%')
  ) then
    raise exception 'Queda alguna policy de storage.objects sobre el bucket import-files';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and roles && array['public', 'anon', 'authenticated']::name[]
      and coalesce(qual, '') || coalesce(with_check, '') not like '%bucket_id%'
  ) then
    raise exception 'Hay una policy de storage.objects para anon/authenticated que no filtra por bucket_id';
  end if;
end $$;

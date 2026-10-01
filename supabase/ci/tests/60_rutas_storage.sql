-- SCRUM-81 · [STORAGE-RUTA-DESDE-FILA]
-- Una fila no puede guardar la ruta de Storage de un archivo de otra
-- organización (ni rutas con `..` o segmentos vacíos), escriba quien escriba.
-- Migración: 20261001100000_rutas_storage_de_la_org.
--
-- Las restricciones son CHECK: valen igual para un miembro con su JWT que para
-- el service role. Para no armar todos los padres de cada tabla (tareas,
-- clientes, SOPs, wins), las FK se apagan con `session_replication_role`; los
-- CHECK siguen activos.

begin;

set local session_replication_role = replica;

-- Falla por la restricción de la ruta (23514 con una de las restricciones de
-- la migración), no por otra restricción de la tabla.
create function pg_temp.viola_ruta(p_sql text, p_que text)
returns void
language plpgsql
as $$
declare
  v_restriccion text;
begin
  begin
    execute p_sql;
  exception when check_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion like '%ruta%de_la_org' or v_restriccion like '%reel_music_de_la_org' then
      return;
    end if;
    raise exception 'FALLA: % falló por otra restricción (%), no por la ruta', p_que, v_restriccion;
  end;
  raise exception 'FALLA: se permitió %', p_que;
end;
$$;

insert into public.organizations (id, name) values
  ('60000000-0000-0000-0000-000000000a00', 'Org A'),
  ('60000000-0000-0000-0000-000000000b00', 'Org B');

-- Rutas: propia, de otra org, con .. y con segmento vacío.
create temp table rutas (que text, ruta text) on commit drop;
insert into rutas values
  ('de otra org', '60000000-0000-0000-0000-000000000b00/archivo.pdf'),
  ('con ..', '60000000-0000-0000-0000-000000000a00/../60000000-0000-0000-0000-000000000b00/archivo.pdf'),
  ('con segmento vacío', '60000000-0000-0000-0000-000000000a00//archivo.pdf'),
  ('sin carpeta de org', 'archivo.pdf'),
  -- Disfrazadas: pasan como texto, pero la URL las convierte en `..` y `/`.
  ('con %2e%2e', '60000000-0000-0000-0000-000000000a00/%2e%2e/60000000-0000-0000-0000-000000000b00/archivo.pdf'),
  ('con barra invertida', '60000000-0000-0000-0000-000000000a00/..\60000000-0000-0000-0000-000000000b00/archivo.pdf'),
  ('con ?', '60000000-0000-0000-0000-000000000a00/archivo.pdf?x=1');

do $$
declare
  a constant text := '60000000-0000-0000-0000-000000000a00';
  r record;
begin
  for r in select * from rutas loop
    perform pg_temp.viola_ruta(format(
      'insert into public.workboard_task_attachments (organization_id, task_id, file_name, storage_path) values (%L, gen_random_uuid(), ''f'', %L)', a, r.ruta),
      'un adjunto de tarea con ruta ' || r.que);
    perform pg_temp.viola_ruta(format(
      'insert into public.client_payments (organization_id, client_id, amount, storage_path) values (%L, gen_random_uuid(), 1, %L)', a, r.ruta),
      'un comprobante de pago con ruta ' || r.que);
    perform pg_temp.viola_ruta(format(
      'insert into public.business_context_documents (organization_id, title, category, storage_path) values (%L, ''t'', ''other'', %L)', a, r.ruta),
      'un documento de contexto con ruta ' || r.que);
    perform pg_temp.viola_ruta(format(
      'insert into public.sop_attachments (organization_id, file_name, storage_path, mime_type) values (%L, ''f'', %L, ''application/pdf'')', a, r.ruta),
      'un adjunto de SOP con ruta ' || r.que);
    perform pg_temp.viola_ruta(format(
      'insert into public.win_attachments (organization_id, win_id, file_name, storage_path) values (%L, gen_random_uuid(), ''f'', %L)', a, r.ruta),
      'una captura de win con ruta ' || r.que);
    perform pg_temp.viola_ruta(format(
      'insert into public.sop_generation_jobs (organization_id, video_path) values (%L, %L)', a, r.ruta),
      'un video de SOP con ruta ' || r.que);
    perform pg_temp.viola_ruta(format(
      'insert into public.reel_variation_jobs (organization_id, source_piece_id, variations) values (%L, gen_random_uuid(), %L::jsonb)',
      a, jsonb_build_array(jsonb_build_object('storage_path', r.ruta))::text),
      'una variante de reel con ruta ' || r.que);
    perform pg_temp.viola_ruta(format(
      'update public.organizations set reel_music_path = %L where id = %L', r.ruta, a),
      'la música de reels con ruta ' || r.que);
  end loop;
end $$;

-- Las rutas propias, y los vacíos permitidos, siguen funcionando.
do $$
declare
  a constant text := '60000000-0000-0000-0000-000000000a00';
  propia constant text := '60000000-0000-0000-0000-000000000a00/carpeta/archivo.pdf';
begin
  insert into public.workboard_task_attachments (organization_id, task_id, file_name, storage_path)
    values (a::uuid, gen_random_uuid(), 'f', propia);
  insert into public.client_payments (organization_id, client_id, amount, storage_path)
    values (a::uuid, gen_random_uuid(), 1, propia), (a::uuid, gen_random_uuid(), 1, null);
  insert into public.business_context_documents (organization_id, title, category, storage_path)
    values (a::uuid, 't', 'other', propia), (a::uuid, 't', 'other', null);
  insert into public.sop_attachments (organization_id, file_name, storage_path, mime_type)
    values (a::uuid, 'f', propia, 'application/pdf');
  insert into public.win_attachments (organization_id, win_id, file_name, storage_path)
    values (a::uuid, gen_random_uuid(), 'f', propia);
  insert into public.sop_generation_jobs (organization_id, video_path) values (a::uuid, propia);
  insert into public.reel_variation_jobs (organization_id, source_piece_id, variations)
    values (a::uuid, gen_random_uuid(), jsonb_build_array(
      jsonb_build_object('storage_path', ''),
      jsonb_build_object('storage_path', propia)
    ));
  update public.organizations set reel_music_path = a || '/music/background.mp3' where id = a::uuid;
  update public.organizations set reel_music_path = null where id = a::uuid;
end $$;

rollback;

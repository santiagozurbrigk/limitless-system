-- [STORAGE-RUTA-DESDE-FILA] (SCRUM-81): una ruta de Storage guardada en una fila
-- tiene que estar dentro de la carpeta de la organización dueña de la fila.
--
-- Las acciones firman, descargan y borran esas rutas con service role. Un
-- miembro podía escribir por PostgREST, en una fila de su org, la ruta de un
-- archivo de otra org y obtener una URL firmada, una transcripción, una
-- publicación en sus redes o el borrado del archivo ajeno. La app ya valida la
-- ruta antes de usarla (`lib/storage/org-path.ts`); esto la cierra también en
-- la base, para cualquiera que escriba (usuario o service role).
--
-- La regla es la misma que `isOrgStoragePath`: empieza con `<org>/` y ningún
-- segmento después es vacío, `.` ni `..`.

create or replace function public.es_ruta_de_la_org(ruta text, org uuid)
returns boolean
language sql
immutable
parallel safe
as $$
  select ruta is not null
    and org is not null
    and left(ruta, 37) = org::text || '/'
    and substr(ruta, 38) !~ '(^|/)(\.{1,2})?(/|$)'
$$;

comment on function public.es_ruta_de_la_org(text, uuid) is
  'SCRUM-81: la ruta está dentro de la carpeta de la org (<org>/...) y no tiene segmentos vacíos, . ni ... Misma regla que isOrgStoragePath en apps/web/lib/storage/org-path.ts.';

-- `variations` de Trial Reels: cada variante con archivo tiene que ser de la org.
-- `storage_path` vacío es el estado inicial de una variante en proceso.
create or replace function public.variaciones_de_la_org(variaciones jsonb, org uuid)
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(bool_and(
    coalesce(v ->> 'storage_path', '') = ''
    or public.es_ruta_de_la_org(v ->> 'storage_path', org)
  ), true)
  from jsonb_array_elements(
    case when jsonb_typeof(variaciones) = 'array' then variaciones else '[]'::jsonb end
  ) as v
$$;

alter table public.workboard_task_attachments
  drop constraint if exists workboard_task_attachments_ruta_de_la_org,
  add constraint workboard_task_attachments_ruta_de_la_org
    check (public.es_ruta_de_la_org(storage_path, organization_id));

alter table public.client_payments
  drop constraint if exists client_payments_ruta_de_la_org,
  add constraint client_payments_ruta_de_la_org
    check (storage_path is null or public.es_ruta_de_la_org(storage_path, organization_id));

alter table public.business_context_documents
  drop constraint if exists business_context_documents_ruta_de_la_org,
  add constraint business_context_documents_ruta_de_la_org
    check (storage_path is null or public.es_ruta_de_la_org(storage_path, organization_id));

alter table public.sop_attachments
  drop constraint if exists sop_attachments_ruta_de_la_org,
  add constraint sop_attachments_ruta_de_la_org
    check (public.es_ruta_de_la_org(storage_path, organization_id));

alter table public.win_attachments
  drop constraint if exists win_attachments_ruta_de_la_org,
  add constraint win_attachments_ruta_de_la_org
    check (public.es_ruta_de_la_org(storage_path, organization_id));

alter table public.sop_generation_jobs
  drop constraint if exists sop_generation_jobs_ruta_de_la_org,
  add constraint sop_generation_jobs_ruta_de_la_org
    check (public.es_ruta_de_la_org(video_path, organization_id));

alter table public.reel_variation_jobs
  drop constraint if exists reel_variation_jobs_rutas_de_la_org,
  add constraint reel_variation_jobs_rutas_de_la_org
    check (public.variaciones_de_la_org(variations, organization_id));

-- La música de Trial Reels la escribe el founder y la descargan el worker y la
-- acción de borrado con service role.
alter table public.organizations
  drop constraint if exists organizations_reel_music_de_la_org,
  add constraint organizations_reel_music_de_la_org
    check (reel_music_path is null or public.es_ruta_de_la_org(reel_music_path, id));

-- ─── Autoverificación ────────────────────────────────────────────────────────
do $$
declare
  org constant uuid := '0000000a-0000-0000-0000-000000000000';
begin
  if not public.es_ruta_de_la_org(org::text || '/a/b.pdf', org)
     or public.es_ruta_de_la_org('0000000b-0000-0000-0000-000000000000/a.pdf', org)
     or public.es_ruta_de_la_org(org::text || '/../x/a.pdf', org)
     or public.es_ruta_de_la_org(org::text || '//a.pdf', org)
     or public.es_ruta_de_la_org(org::text || '/', org)
     or public.es_ruta_de_la_org(org::text || 'x/a.pdf', org)
     or not public.variaciones_de_la_org('[{"storage_path": ""}, {"storage_path": "0000000a-0000-0000-0000-000000000000/v/1.mp4"}]', org)
     or public.variaciones_de_la_org('[{"storage_path": "0000000b-0000-0000-0000-000000000000/v/1.mp4"}]', org)
  then
    raise exception 'es_ruta_de_la_org no aplica la regla esperada';
  end if;
end $$;

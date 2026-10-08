-- SCRUM-503 · Crear un sprint cierra el activo y crea el nuevo en una sola transacción.
--
-- Antes `createSprintAction` lo hacía en dos llamadas: completaba el sprint
-- activo y después insertaba el nuevo. Si el insert fallaba, la organización
-- se quedaba sin sprint activo; dos altas a la vez (dos pestañas) dejaban dos
-- activos, porque nada en la base lo impedía.
--
-- 1. Normaliza: si una organización ya tiene más de un sprint activo, deja
--    activo el que la app muestra como activo (el de `start_date` más reciente;
--    a igual fecha, el creado último) y completa los demás. Sin duplicados no
--    toca nada.
-- 2. Índice único parcial: a lo sumo un sprint activo por organización.
-- 3. `crear_sprint`: completa el activo e inserta el nuevo en la transacción de
--    la llamada. SECURITY INVOKER: corre con los permisos de quien llama, así
--    que la RLS de `sprints` (`organization_id = get_my_organization_id()`)
--    sigue decidiendo: con otra organización no completa nada (0 filas) y el
--    insert se rechaza (42501). Un lock por organización hace que dos altas a
--    la vez se pongan en fila: la segunda completa el sprint que creó la
--    primera, en vez de chocar con el índice.

-- ─── 1. Normalización ────────────────────────────────────────────────────────
with ordenados as (
  select id,
         row_number() over (
           partition by organization_id
           order by start_date desc, created_at desc, id desc
         ) as orden
  from public.sprints
  where status = 'active'
)
update public.sprints s
   set status = 'completed', updated_at = now()
  from ordenados o
 where s.id = o.id
   and o.orden > 1;

-- ─── 2. Un solo sprint activo por organización ───────────────────────────────
create unique index if not exists sprints_un_activo_por_org
  on public.sprints (organization_id)
  where status = 'active';

-- ─── 3. Alta atómica ─────────────────────────────────────────────────────────
create or replace function public.crear_sprint(
  p_organization_id uuid,
  p_name text,
  p_goal text,
  p_area_focus text,
  p_start_date date,
  p_end_date date,
  p_created_by uuid
)
returns public.sprints
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sprint public.sprints;
begin
  -- Dos altas a la vez para la misma organización: la segunda espera a que la
  -- primera termine y después completa el sprint que ésta creó.
  perform pg_advisory_xact_lock(hashtextextended('crear_sprint:' || p_organization_id::text, 0));

  update public.sprints
     set status = 'completed', updated_at = now()
   where organization_id = p_organization_id
     and status = 'active';

  insert into public.sprints
    (organization_id, name, goal, area_focus, start_date, end_date, status, created_by)
  values
    (p_organization_id, p_name, p_goal, p_area_focus, p_start_date, p_end_date, 'active', p_created_by)
  returning * into v_sprint;

  return v_sprint;
end;
$$;

revoke all on function public.crear_sprint(uuid, text, text, text, date, date, uuid) from public, anon;
grant execute on function public.crear_sprint(uuid, text, text, text, date, date, uuid) to authenticated, service_role;

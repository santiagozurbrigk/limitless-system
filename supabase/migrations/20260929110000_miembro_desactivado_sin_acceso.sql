-- [EQUIPO-DESACTIVAR-NO-BLOQUEA] (SCRUM-8): un perfil desactivado no ve ni
-- toca nada de ninguna organización.
--
-- Desactivar a un miembro sólo ponía `profiles.is_active = false`, y nada lo
-- leía: la persona seguía entrando con su sesión o su contraseña y veía y
-- editaba todo lo que su rol permitía.
--
-- Acá se corta en la base: las dos funciones de las que cuelga casi toda la
-- RLS devuelven vacío para un perfil desactivado, y las policies que no pasan
-- por ellas (editar el propio perfil, ver los negocios del holding) exigen
-- `is_active`. Con su JWT sólo puede leer su propia fila de profiles. La app,
-- además, cierra la sesión (middleware) y banea el usuario en Auth al
-- desactivarlo (app/team/actions.ts).
-- `current_user_has_org_role` (20260929100000) ya exigía `is_active`.

-- ─── 1. get_my_organization_id(): null para un perfil desactivado ────────────
-- Misma lógica que 20260620100000 (claim del negocio activo del holding, si
-- no la org del perfil), pero null si el perfil está desactivado. Un usuario
-- sin fila en `profiles` sigue como antes (sólo el claim).
create or replace function public.get_my_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  -- Una sola lectura de profiles (se evalúa en casi todas las policies).
  select case
    when p.id is null then c.claim
    when p.is_active then coalesce(c.claim, p.organization_id)
  end
  from (
    select (auth.jwt() ->> 'active_business_org_id')::uuid as claim
    where nullif(auth.jwt() ->> 'active_business_org_id', '') is not null
    union all
    select null::uuid
    limit 1
  ) c
  left join public.profiles p on p.id = auth.uid()
$$;

revoke all on function public.get_my_organization_id() from public;
grant execute on function public.get_my_organization_id() to authenticated;

-- ─── 2. get_my_holding_business_org_ids(): vacío para un perfil desactivado ──
create or replace function public.get_my_holding_business_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select hb.business_org_id
  from public.holding_businesses hb
  inner join public.profiles p on p.id = auth.uid()
  inner join public.organizations ho on ho.id = p.organization_id
  where hb.holding_org_id = p.organization_id
    and p.is_active
    and ho.account_type = 'holding'
    and hb.status = 'active';
$$;

revoke all on function public.get_my_holding_business_org_ids() from public;
grant execute on function public.get_my_holding_business_org_ids() to authenticated;

-- ─── 3. Policies que no pasan por esas funciones ─────────────────────────────
-- Editar perfiles: un admin desactivado podía cambiarse tarifa y comisión
-- (alimentan costos y comisiones de la org).
--
-- ⚠️ Deriva: el repo tiene dos policies de UPDATE ("Users update own profile",
-- 20260606100000, y "Founders update org profiles", 20260616100000) y
-- producción las tiene unificadas a mano en "Users update own or founders
-- update org profiles", con `current_user_is_founder_or_admin()` (que no está
-- en el repo). Se borran las tres variantes y queda una sola, con el nombre de
-- producción, igual en los dos lados:
--   - la propia fila, si el perfil está activo;
--   - cualquier perfil de la org activa, si quien edita es founder o admin
--     activo (`current_user_has_org_role`, 20260929100000).
-- Qué columnas puede cambiar cada uno lo sigue decidiendo protect_profile_columns.
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Founders update org profiles" on public.profiles;
drop policy if exists "Users update own or founders update org profiles" on public.profiles;
create policy "Users update own or founders update org profiles"
  on public.profiles for update
  to authenticated
  using (
    (id = auth.uid() and is_active)
    or (
      organization_id = public.get_my_organization_id()
      and public.current_user_has_org_role(array['founder', 'admin'])
    )
  )
  with check (
    (id = auth.uid() and is_active)
    or (
      organization_id = public.get_my_organization_id()
      and public.current_user_has_org_role(array['founder', 'admin'])
    )
  );

-- Ver los negocios del holding (con su revenue share y fee).
alter policy "holding_can_see_businesses" on public.holding_businesses
  using (
    holding_org_id in (
      select p.organization_id from public.profiles p
      where p.id = auth.uid() and p.is_active
    )
  );

-- ─── 4. protect_profile_columns: un founder/admin desactivado no cuenta ──────
-- Igual que en 20260929100000, con `p.is_active` en la lectura del rol.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
-- SECURITY INVOKER a propósito: dentro de una función SECURITY DEFINER
-- `current_user` es el dueño de la función y la regla no vería nunca al usuario.
security invoker
set search_path = public
as $$
declare
  v_caller_role text;
  v_self_editable constant text[] := array['full_name', 'email', 'avatar_url', 'updated_at'];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.role is distinct from old.role
     or new.must_change_password is distinct from old.must_change_password
     or new.temp_password_expires_at is distinct from old.temp_password_expires_at
     or new.is_holding_admin is distinct from old.is_holding_admin
  then
    raise exception 'profiles: columna protegida (id, organization_id, role, is_holding_admin o contraseña temporal)'
      using errcode = '42501';
  end if;

  if new.custom_role_id is distinct from old.custom_role_id
     or new.is_active is distinct from old.is_active
  then
    if current_user = 'anon'
       or old.organization_id is distinct from public.get_my_organization_id()
       or not public.current_user_has_org_role(array['founder'])
    then
      raise exception 'profiles: sólo el founder asigna roles o activa y desactiva miembros'
        using errcode = '42501';
    end if;
    if old.role = 'founder' and new.is_active is not true then
      raise exception 'profiles: un founder no se puede desactivar desde la app'
        using errcode = '42501';
    end if;
    return new;
  end if;

  select p.role into v_caller_role
  from public.profiles p
  where p.id = auth.uid()
    and p.organization_id = old.organization_id
    and p.is_active;

  if v_caller_role in ('founder', 'admin') then
    return new;
  end if;

  if (to_jsonb(new) - v_self_editable) is distinct from (to_jsonb(old) - v_self_editable) then
    raise exception 'profiles: sólo podés editar tu nombre, email y avatar'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ─── 5. Autoverificación ─────────────────────────────────────────────────────
-- Si en producción hubiera otra policy de UPDATE sobre profiles (hecha a mano,
-- con otro nombre), un desactivado podría seguir editando. Falla en ese caso.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and permissive = 'PERMISSIVE' and cmd in ('UPDATE', 'ALL')
      and policyname <> 'Users update own or founders update org profiles'
  ) then
    raise exception 'Queda otra policy de UPDATE sobre profiles';
  end if;
end $$;

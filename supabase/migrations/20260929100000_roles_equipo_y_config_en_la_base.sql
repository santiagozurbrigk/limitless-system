-- [PERMISOS-SERVER-ACTIONS/infra] parte A (SCRUM-1): el rol se hace cumplir en
-- la base para el equipo, la configuración de la organización y el borrado de
-- clientes.
--
-- Hasta acá todas estas policies miraban sólo la organización. Con su JWT,
-- cualquier miembro (también uno de sólo lectura) podía por PostgREST:
--   - darse todos los módulos editando `team_roles`;
--   - crear una invitación con el rol que quisiera, leer su `token` y aceptarla
--     con otro mail (segunda cuenta con acceso total, que además sobrevive a
--     que lo desactiven);
--   - cambiar nombre, moneda o zona horaria de la organización;
--   - borrar todos los clientes, cada uno con 14 tablas en cascada.
--
-- Reglas (decididas con el PO el 29-sep):
--   - equipo (roles e invitaciones) y configuración de la org: sólo founder,
--     igual que `canManageTeam` en app/team/actions.ts;
--   - borrar clientes: founder o admin.
-- Leer `team_roles` sigue abierto a la org: la app lo necesita para calcular
-- los permisos de cada miembro. Las invitaciones, no: tienen el token.

-- ─── 1. ¿Tengo alguno de estos roles en la organización activa? ─────────────
-- La org activa es la de `get_my_organization_id()`. El founder de un holding
-- que opera un negocio tiene su perfil en el holding: vale si el negocio es
-- uno de los suyos (`get_my_holding_business_org_ids()`).
create or replace function public.current_user_has_org_role(roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.role = any (roles)
      and (
        p.organization_id = public.get_my_organization_id()
        or public.get_my_organization_id() in (select public.get_my_holding_business_org_ids())
      )
  )
$$;

revoke all on function public.current_user_has_org_role(text[]) from public, anon;
grant execute on function public.current_user_has_org_role(text[]) to authenticated;

-- ─── 2. team_roles: escribir, sólo founder ───────────────────────────────────
drop policy if exists "Users insert org team_roles" on public.team_roles;
create policy "Users insert org team_roles"
  on public.team_roles for insert
  with check (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder'])
  );

drop policy if exists "Users update org team_roles" on public.team_roles;
create policy "Users update org team_roles"
  on public.team_roles for update
  using (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder'])
  )
  with check (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder'])
  );

drop policy if exists "Users delete org team_roles" on public.team_roles;
create policy "Users delete org team_roles"
  on public.team_roles for delete
  using (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder'])
  );

-- ─── 3. team_invitations: todo, sólo founder ─────────────────────────────────
-- Aceptar una invitación (`/invite`, acceptInvitationAction) va con el service
-- role, así que no depende de estas policies.
drop policy if exists "Users read org team_invitations" on public.team_invitations;
create policy "Users read org team_invitations"
  on public.team_invitations for select
  using (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder'])
  );

drop policy if exists "Users insert org team_invitations" on public.team_invitations;
create policy "Users insert org team_invitations"
  on public.team_invitations for insert
  with check (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder'])
  );

drop policy if exists "Users update org team_invitations" on public.team_invitations;
create policy "Users update org team_invitations"
  on public.team_invitations for update
  using (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder'])
  )
  with check (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder'])
  );

drop policy if exists "Users delete org team_invitations" on public.team_invitations;
create policy "Users delete org team_invitations"
  on public.team_invitations for delete
  using (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder'])
  );

-- ─── 4. organizations: cambiar la configuración, sólo founder ────────────────
-- Las columnas que se pueden tocar siguen limitadas por los grants de
-- 20260922110000 (name, industry, website_url, timezone, currency, language,
-- country).
drop policy if exists "Users update own org" on public.organizations;
create policy "Users update own org"
  on public.organizations for update
  using (
    id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder'])
  )
  with check (
    id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder'])
  );

-- ─── 5. clients: borrar, founder o admin ─────────────────────────────────────
drop policy if exists "Users delete org clients" on public.clients;
create policy "Users delete org clients"
  on public.clients for delete
  using (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder', 'admin'])
  );

-- ─── 6. profiles: asignar rol y activar/desactivar, sólo founder ────────────
-- La policy "Founders update org profiles" y `protect_profile_columns`
-- (20260922100000) dejaban a un admin cambiar `custom_role_id` e `is_active` de
-- cualquier perfil de la org: podía darse el rol con todos los módulos o
-- desactivar al founder, y con la función de arriba eso le quitaba al founder
-- sus permisos en la base. Asignar rol y dar de baja es "equipo": sólo founder
-- (igual que la app), y a un founder no se lo puede desactivar desde la API.
-- Tarifas y comisión siguen siendo de founder o admin
-- (sales/closer-actions.ts, workboard/actions.ts). El resto de la regla no
-- cambia.
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
    -- Es founder de la org activa (también el de un holding operando uno de
    -- sus negocios, cuyo perfil no está en esa org): puede lo mismo que un
    -- founder de la org.
    return new;
  end if;

  select p.role into v_caller_role
  from public.profiles p
  where p.id = auth.uid()
    and p.organization_id = old.organization_id;

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

-- ─── 7. Autoverificación ─────────────────────────────────────────────────────
-- Las policies permisivas se suman con OR: si en producción hubiera otra
-- (hecha a mano o con otro nombre) para las mismas operaciones y sin chequeo
-- de rol, el hueco seguiría abierto. En ese caso la migración falla.
do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and permissive = 'PERMISSIVE'
      and (
        (tablename = 'team_roles' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL'))
        or (tablename = 'team_invitations')
        or (tablename = 'organizations' and cmd in ('UPDATE', 'ALL'))
        or (tablename = 'clients' and cmd in ('DELETE', 'ALL'))
      )
      and roles && array['public', 'anon', 'authenticated']::name[]
      and coalesce(qual, '') || coalesce(with_check, '') not like '%current_user_has_org_role%'
  ) then
    raise exception 'Queda una policy sin chequeo de rol en team_roles, team_invitations, organizations o clients';
  end if;
end $$;

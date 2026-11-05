-- SCRUM-552 · [CONSOLA-ACCESO-STAFF] El staff de Limitless es founder de la
-- organización de Limitless.
--
-- Hasta acá el staff (emails en `super_admin_users`) tenía un perfil sin
-- organización y la invitación de equipo le prohibía sumarse a cualquier org.
-- Desde esta migración la organización de Limitless es la única con
-- `organizations.experience = 'limitless'` y el staff es founder de ella:
--   1. un índice único parcial impide marcar una segunda org como limitless;
--   2. `asociar_staff_a_la_org_de_limitless()` pone en esa org los perfiles del
--      staff que no tienen org (sólo cambia `organization_id`; no toca `role`,
--      `is_active`, `custom_role_id` ni `must_change_password`), y se llama acá;
--   3. `aceptar_invitacion_de_equipo` deja que una cuenta del staff acepte una
--      invitación a la org de Limitless (y entra founder); a cualquier otra org
--      sigue devolviendo `cuenta_de_staff`.
-- Estar en la org de Limitless no da el panel interno: lo decide sólo la lista
-- de staff (`apps/web/lib/auth/require-staff.ts`).
--
-- Depende de 20261019120000_organizations_experience (SCRUM-523): sin la
-- columna `experience` o sin el valor 'limitless' en su CHECK, aborta. Esta
-- migración no crea ni altera esa columna ni su CHECK.
--
-- Idempotente: `if not exists`, `create or replace`, y la asociación sólo mira
-- perfiles sin org (una segunda corrida no cambia nada).
--
-- Fail-closed: si hay más de una org marcada, o si hay perfiles del staff para
-- asociar y ninguna org marcada, aborta y no deja nada aplicado (corre en una
-- transacción). Sin org marcada y sin staff pendiente (base vacía de CI o
-- local) termina con un notice, sin cambios.
--
-- Se aplica en producción en la ventana de SCRUM-532, después de marcar la org;
-- el paso a paso y el precheck están en docs/operacion/staff-en-org-de-limitless.md.

set local lock_timeout = '5s';

-- ─── Contrato con SCRUM-523 ──────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organizations'
      and column_name = 'experience'
  ) or not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.organizations'::regclass
      and c.conname = 'organizations_experience_check'
      and pg_get_constraintdef(c.oid) like '%''limitless''%'
  ) then
    raise exception 'SCRUM-552 necesita 20261019120000_organizations_experience (SCRUM-523) aplicada antes';
  end if;
end $$;

-- ─── A lo sumo una org de Limitless ──────────────────────────────────────────
do $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.organizations where experience = 'limitless';
  if v_n > 1 then
    raise exception 'Hay % organizaciones con experience = limitless; tiene que haber una sola', v_n;
  end if;
end $$;

create unique index if not exists organizations_una_sola_limitless
  on public.organizations (experience)
  where experience = 'limitless';

comment on index public.organizations_una_sola_limitless is
  'A lo sumo una organización con experience = limitless: es la org de Limitless, donde está el staff (SCRUM-552, decisión del humano DT-2). Si algún día limitless pasa a ser un producto para varias organizaciones, este índice se revisa junto con asociar_staff_a_la_org_de_limitless y el bootstrap del staff.';

-- ─── Asociación del staff ────────────────────────────────────────────────────
-- Un perfil es del staff si el email de su usuario de Auth, normalizado, es
-- igual a una fila de la lista tal como está guardada: la misma comparación que
-- `isStaffEmail` de la app. Una fila de la lista con mayúsculas o espacios
-- nunca dio el panel y tampoco asocia.
create or replace function public.asociar_staff_a_la_org_de_limitless()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_n integer;
  v_pend integer;
  v_org uuid;
  v_filas integer;
  v_en_otra integer;
begin
  select count(*) into v_n from public.organizations where experience = 'limitless';
  if v_n > 1 then
    raise exception 'Hay % organizaciones con experience = limitless; tiene que haber una sola', v_n;
  end if;

  select count(*) into v_pend
  from public.profiles p
  where p.organization_id is null
    and exists (
      select 1 from auth.users u
      join public.super_admin_users s on s.email = lower(btrim(u.email))
      where u.id = p.id
    );

  if v_n = 0 then
    if v_pend > 0 then
      raise exception 'Hay % perfiles de staff sin organización y ninguna organización con experience = limitless. Marcala antes (docs/operacion/staff-en-org-de-limitless.md)', v_pend;
    end if;
    raise notice 'Ninguna organización con experience = limitless y ningún perfil de staff sin organización: nada que asociar';
    return 0;
  end if;

  select id into strict v_org
  from public.organizations
  where experience = 'limitless'
  for share;

  update public.profiles p
  set organization_id = v_org
  where p.organization_id is null
    and exists (
      select 1 from auth.users u
      join public.super_admin_users s on s.email = lower(btrim(u.email))
      where u.id = p.id
    );
  get diagnostics v_filas = row_count;

  select count(*) into v_en_otra
  from public.profiles p
  where p.organization_id is not null
    and p.organization_id <> v_org
    and exists (
      select 1 from auth.users u
      join public.super_admin_users s on s.email = lower(btrim(u.email))
      where u.id = p.id
    );

  raise notice 'Perfiles de staff asociados a la org de Limitless: %. Perfiles de staff en otra organización (no se mueven, revisar a mano): %', v_filas, v_en_otra;
  return v_filas;
end;
$$;

revoke all on function public.asociar_staff_a_la_org_de_limitless() from public, anon, authenticated, service_role;

comment on function public.asociar_staff_a_la_org_de_limitless() is
  'SCRUM-552: pone en la org de Limitless (experience = limitless) los perfiles sin organización cuyo usuario de Auth tiene un email de super_admin_users (misma comparación que la app). Sólo cambia organization_id; nunca mueve un perfil que ya tiene org. Aborta si hay más de una org marcada, o si hay staff pendiente y ninguna marcada. Devuelve cuántos perfiles asoció. Re-ejecutable por el operador con el rol de migraciones: ningún rol de la API tiene EXECUTE.';

select public.asociar_staff_a_la_org_de_limitless();

-- ─── Invitación: el staff sólo se suma a la org de Limitless, como founder ───
-- Regla nueva (decisión del humano, 2026-11-01): una cuenta del staff acepta una
-- invitación de equipo sólo si es a la org de Limitless (experience =
-- 'limitless'); a cualquier otra org sigue devolviendo `cuenta_de_staff`, con
-- el email de la lista comparado normalizado de los dos lados, como antes.
-- Es segura porque sólo abre la org marcada: sin org marcada ninguna invitación
-- es a la org de Limitless y el staff queda en `cuenta_de_staff` (fail-closed).
-- Si la invitación crea el perfil, nace founder sólo cuando el email coincide
-- con la lista con la misma comparación que `isStaffEmail` (fila tal cual,
-- email de Auth normalizado): una fila mal cargada nunca dio el panel y
-- tampoco da founder; entra member, como cualquiera. Un perfil que ya existe
-- nunca cambia de rol (`ya_era_miembro` y `otra_org` quedan igual).
-- El resto del cuerpo es el de 20261005150000_aceptar_invitacion_de_equipo.
create or replace function public.aceptar_invitacion_de_equipo(p_token text, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.team_invitations%rowtype;
  v_email text;
  v_confirmado_at timestamptz;
  v_meta jsonb;
  v_org_actual uuid;
  v_insertados integer;
  v_es_staff boolean;
  v_org_es_limitless boolean;
begin
  select * into v_inv
  from public.team_invitations
  where token = p_token
  for update;

  if not found then
    return 'no_existe';
  end if;
  if v_inv.status = 'accepted' then
    return 'usada';
  end if;
  -- 'expired' lo pone también la revocación desde Equipo y la baja de quien invitó.
  if v_inv.status <> 'pending' or v_inv.expires_at <= now() then
    return 'vencida';
  end if;

  select u.email, u.email_confirmed_at, u.raw_user_meta_data
    into v_email, v_confirmado_at, v_meta
  from auth.users u
  where u.id = p_user_id;

  if not found then
    return 'sin_cuenta';
  end if;
  if v_confirmado_at is null then
    return 'email_sin_confirmar';
  end if;
  if v_email is null or lower(btrim(v_email)) <> lower(btrim(v_inv.email)) then
    return 'otro_email';
  end if;

  v_org_es_limitless := exists (
    select 1 from public.organizations o
    where o.id = v_inv.organization_id
      and o.experience = 'limitless'
  );
  if exists (
    select 1 from public.super_admin_users s
    where lower(btrim(s.email)) = lower(btrim(v_email))
  ) and not v_org_es_limitless then
    return 'cuenta_de_staff';
  end if;
  v_es_staff := v_org_es_limitless and exists (
    select 1 from public.super_admin_users s
    where s.email = lower(btrim(v_email))
  );

  select p.organization_id into v_org_actual
  from public.profiles p
  where p.id = p_user_id
  for update;

  if found then
    if v_org_actual is not distinct from v_inv.organization_id then
      update public.team_invitations set status = 'accepted' where id = v_inv.id;
      return 'ya_era_miembro';
    end if;
    return 'otra_org';
  end if;

  -- SCRUM-75: el rol de la invitación tiene que ser de su organización (la misma
  -- regla que `assertRolDeLaOrg` y el trigger `validar_rol_de_la_org`).
  if v_inv.custom_role_id is not null and not exists (
    select 1 from public.team_roles r
    where r.id = v_inv.custom_role_id
      and r.organization_id = v_inv.organization_id
  ) then
    return 'rol_de_otra_org';
  end if;

  insert into public.profiles (
    id, organization_id, email, full_name, role, custom_role_id, invited_by, is_active
  ) values (
    p_user_id,
    v_inv.organization_id,
    v_email,
    coalesce(
      nullif(btrim(v_meta ->> 'full_name'), ''),
      nullif(btrim(v_meta ->> 'name'), ''),
      split_part(v_email, '@', 1)
    ),
    case when v_es_staff then 'founder' else 'member' end,
    v_inv.custom_role_id,
    v_inv.invited_by,
    true
  )
  -- Otra invitación para la misma cuenta, aceptada a la vez, ganó y ya creó el
  -- perfil: se decide como si el perfil hubiera estado desde el principio.
  on conflict (id) do nothing;

  get diagnostics v_insertados = row_count;
  if v_insertados = 0 then
    select p.organization_id into v_org_actual
    from public.profiles p
    where p.id = p_user_id;
    if v_org_actual is not distinct from v_inv.organization_id then
      update public.team_invitations set status = 'accepted' where id = v_inv.id;
      return 'ya_era_miembro';
    end if;
    return 'otra_org';
  end if;

  update public.team_invitations set status = 'accepted' where id = v_inv.id;
  return 'aceptada';
end;
$$;

revoke all on function public.aceptar_invitacion_de_equipo(text, uuid) from public, anon, authenticated;
grant execute on function public.aceptar_invitacion_de_equipo(text, uuid) to service_role;

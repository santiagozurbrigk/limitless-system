-- SCRUM-495 · [AUTH-ALTA-EMAIL-AJENO] parte A: aceptar una invitación de equipo
-- ya no crea cuentas, y se acepta de una sola vez.
--
-- Antes, `/invite` creaba en Auth una cuenta confirmada con el email de la
-- invitación y la contraseña que eligiera quien tuviera el link. Ahora sólo la
-- acepta una cuenta que ya existe, con sesión iniciada, con ese mismo email y
-- confirmado. La app (`aceptarInvitacionAction`) pasa el id del usuario de la
-- sesión; el email y su confirmación se leen acá, de `auth.users`, no de la
-- request.
--
-- Todo pasa en una transacción con la fila de la invitación bloqueada
-- (`for update`): dos aceptaciones a la vez (dos pestañas, dos clics) se
-- ordenan, y la segunda ya la ve usada. Leer, insertar el perfil y marcar la
-- invitación en pasos separados desde la app dejaba ventanas entre un paso y
-- otro (perfil sin invitación marcada, o invitación marcada sin perfil).
--
-- Un usuario pertenece a una sola organización (`profiles.id` = usuario). Si la
-- cuenta ya tiene perfil en otra org (o un perfil sin org), no se toca nada:
-- mover a alguien de org rompería sus datos.
--
-- Una cuenta del staff (email en `super_admin_users`) nunca se suma a una org por
-- invitación, tenga perfil o no: un super admin recién dado de alta todavía no
-- tiene perfil (`docs/operacion/alta-super-admin.md`), y como member de la org de
-- un founder ese founder podría desactivarlo y banearlo en Auth (SCRUM-8). El
-- email de la allowlist se compara normalizado, igual que `isSuperAdminEmail`.
--
-- Que el email esté confirmado sólo prueba que la persona es su dueña si en
-- Supabase Auth está activo "Confirm email" (precondición documentada en
-- `docs/arquitectura/auth-organizaciones-y-permisos.md`).
--
-- Devuelve un motivo en texto; la app lo traduce a un mensaje:
--   aceptada, ya_era_miembro           la cuenta queda en la org (la invitación, usada)
--   no_existe, usada, vencida          la invitación no sirve
--   sin_cuenta, email_sin_confirmar,
--   otro_email, cuenta_de_staff,
--   otra_org, rol_de_otra_org          no se acepta y la invitación queda como estaba
--
-- Sólo la llama el service role: no hay grant para anon ni authenticated.

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
  if exists (
    select 1 from public.super_admin_users s
    where lower(btrim(s.email)) = lower(btrim(v_email))
  ) then
    return 'cuenta_de_staff';
  end if;

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
    'member',
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

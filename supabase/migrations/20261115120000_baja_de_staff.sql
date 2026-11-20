-- SCRUM-552 · Ajustes del PR #151: la baja de alguien del staff de Limitless en
-- una sola función.
--
-- `dar_de_baja_staff(p_email)` saca el email de la lista de staff
-- (`super_admin_users`) y desactiva el perfil cuyo usuario de Auth tiene ese
-- email (`profiles.is_active = false`). Reemplaza los dos pasos manuales de
-- "Dar de baja a un super admin" en docs/operacion/alta-super-admin.md.
--
-- No toca Auth: no borra, no banea y no corta sesiones (el guard y el
-- middleware rechazan un perfil desactivado). Del perfil sólo cambia
-- `is_active`; no toca `role`, `organization_id`, `custom_role_id` ni
-- `must_change_password`. No mira `profiles.email`: lo edita el usuario.
--
-- Todo o nada: una llamada es una sola sentencia y la función no atrapa
-- errores. Si cualquier paso lanza, no queda nada aplicado.
--
-- Normaliza los dos lados de cada comparación con `lower(btrim(...))`: el email
-- recibido y lo guardado (la fila de `super_admin_users`,
-- `holdings.owner_email` y el email de Auth). A diferencia de la app
-- (`isStaffEmail`, que compara la fila de la lista tal cual), una fila guardada
-- con mayúsculas o espacios también se encuentra y sale de la lista, aunque
-- nunca haya dado el panel (decisión del humano, 2026-11-20).
--
-- Devuelve:
--   - 'perfil_desactivado': el email salió de la lista y el perfil cuyo email de
--     Auth es ese quedó con is_active = false (aunque ya estuviera inactivo).
--   - 'sin_perfil': el email salió de la lista, ningún perfil tiene hoy ese
--     email de Auth, y en la org de Limitless no queda ningún perfil activo cuyo
--     email de Auth esté fuera de la lista.
--   - 'sin_perfil_revisar': el email salió de la lista, ningún perfil tiene hoy
--     ese email de Auth, y en la org de Limitless queda al menos un perfil
--     activo cuyo email de Auth no está en la lista (puede ser la misma persona
--     con otro email de Auth, o un miembro legítimo). No desactiva a ninguno: el
--     operador los revisa con la guía.
-- Aborta, sin cambiar nada (SQLSTATE P0001):
--   - M1: el email vino vacío.
--   - M2: el email no está en la lista, ni normalizando la fila guardada.
--   - Dos o más filas de la lista quedan iguales a ese email al normalizar:
--     hay que revisar la lista a mano.
--   - M3: el email es dueño de un holding (holdings.owner_email).
--   - M4: más de un perfil tiene ese email de Auth.
--
-- Se aplica en producción en la ventana de SCRUM-532, después de
-- 20261101120000_staff_en_org_de_limitless.sql (paso 5b de
-- docs/operacion/staff-en-org-de-limitless.md).
--
-- Idempotente: `create or replace`.
create or replace function public.dar_de_baja_staff(p_email text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_email text;
  v_fila text;
  v_n integer;
  v_perfil uuid;
  v_fuera integer;
begin
  -- 1. La entrada, normalizada como en la app.
  v_email := lower(btrim(p_email));
  if v_email is null or v_email = '' then
    raise exception 'dar_de_baja_staff: falta el email. No se cambió nada';
  end if;

  -- 2. La fila de la lista, normalizada contra la entrada normalizada. Se
  -- bloquean todas las que coinciden y tiene que ser exactamente una.
  select count(*) into v_n
  from (
    select 1 from public.super_admin_users s
    where lower(btrim(s.email)) = v_email
    for update
  ) f;
  if v_n = 0 then
    raise exception 'Ese email no está en la lista de staff (super_admin_users) como lo compara la app, en minúsculas y sin espacios. No se cambió nada';
  end if;
  if v_n > 1 then
    raise exception 'Hay % filas en la lista de staff (super_admin_users) que quedan iguales a ese email en minúsculas y sin espacios: revisá la lista a mano y dejá una sola antes de la baja. No se cambió nada', v_n;
  end if;
  select s.email into strict v_fila
  from public.super_admin_users s
  where lower(btrim(s.email)) = v_email;

  -- 3. Dueño de un holding: la FK abortaría igual, con un texto crudo.
  if exists (select 1 from public.holdings h where lower(btrim(h.owner_email)) = v_email) then
    raise exception 'Ese email es dueño de un holding (holdings.owner_email): pasalo a otro super admin antes (docs/operacion/alta-super-admin.md). No se cambió nada';
  end if;

  -- 4. El perfil cuyo email de Auth es ese.
  select count(*) into v_n
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(btrim(u.email)) = v_email;
  if v_n > 1 then
    raise exception 'Hay % perfiles cuyo email de Auth coincide con ese email: revisalos a mano antes de la baja. No se cambió nada', v_n;
  end if;
  if v_n = 1 then
    select p.id into v_perfil
    from public.profiles p
    join auth.users u on u.id = p.id
    where lower(btrim(u.email)) = v_email
    for update of p;
  end if;

  -- 5. Sale de la lista: la fila encontrada en el paso 2, por su valor guardado.
  delete from public.super_admin_users where email = v_fila;

  -- 6. Se desactiva el perfil.
  if v_perfil is not null then
    update public.profiles set is_active = false where id = v_perfil;
    return 'perfil_desactivado';
  end if;

  -- 7. Sin perfil con ese email de Auth: ¿queda alguien activo en la org de
  -- Limitless fuera de la lista? Se cuenta después del paso 5.
  select count(*) into v_fuera
  from public.profiles p
  join public.organizations o on o.id = p.organization_id and o.experience = 'limitless'
  join auth.users u on u.id = p.id
  where p.is_active
    and not exists (
      select 1 from public.super_admin_users s
      where lower(btrim(s.email)) = lower(btrim(u.email))
    );
  if v_fuera > 0 then
    return 'sin_perfil_revisar';
  end if;
  return 'sin_perfil';
end;
$$;

revoke all on function public.dar_de_baja_staff(text) from public, anon, authenticated, service_role;

comment on function public.dar_de_baja_staff(text) is
  'SCRUM-552: baja de alguien del staff. Saca el email de super_admin_users y desactiva (is_active = false) el perfil cuyo usuario de Auth tiene ese email, en una sola sentencia: todo o nada. Compara normalizando (lower(btrim)) la entrada y lo guardado (fila de la lista, holdings.owner_email, email de Auth), a diferencia de la app: una fila con mayúsculas o espacios también sale. No toca Auth ni otras columnas. Devuelve perfil_desactivado, sin_perfil o sin_perfil_revisar; aborta sin cambios si falta el email, si no está en la lista, si dos filas de la lista quedan iguales al normalizar, si es dueño de un holding o si hay más de un perfil con ese email de Auth. Ningún rol de la API tiene EXECUTE: la ejecuta el operador con el rol de migraciones (SQL Editor).';

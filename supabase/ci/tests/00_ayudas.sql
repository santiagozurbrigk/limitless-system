-- Ayudas para los tests de RLS de supabase/ci/tests/.
--
-- Cada test arma sus datos dentro de una transacción que termina en
-- `rollback`, actúa como un usuario con `set local role authenticated` y usa
-- estas funciones para afirmar qué pasa. Si una afirmación no se cumple, la
-- función lanza 'FALLA: ...' y check-migrations.sh corta el CI.
--
-- Este archivo no va en transacción: las funciones quedan en la base del CI,
-- que se descarta al terminar.

create schema if not exists ci;
grant usage on schema ci to anon, authenticated;

-- Deja el JWT de `p_sub` para el resto de la transacción. `auth.uid()` lee
-- `request.jwt.claim.sub` y `auth.jwt()` lee `request.jwt.claims` (ver
-- supabase-stubs.sql). `p_extra` suma claims, p. ej. `active_business_org_id`.
create or replace function ci.jwt(p_sub uuid, p_extra jsonb default '{}'::jsonb)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_sub::text, true);
  perform set_config(
    'request.jwt.claims',
    (jsonb_build_object('sub', p_sub, 'role', 'authenticated') || p_extra)::text,
    true
  );
end;
$$;

-- La sentencia tiene que fallar por permisos (42501: RLS, grant o trigger).
create or replace function ci.rechazado(p_sql text, p_que text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'FALLA: se permitió %', p_que;
end;
$$;

-- Ejecuta la sentencia y devuelve cuántas filas tocó (RLS en UPDATE/DELETE
-- no da error: afecta 0 filas).
create or replace function ci.filas(p_sql text)
returns bigint
language plpgsql
as $$
declare
  v_filas bigint;
begin
  execute p_sql;
  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;

create or replace function ci.espera(p_real bigint, p_esperado bigint, p_que text)
returns void
language plpgsql
as $$
begin
  if p_real is distinct from p_esperado then
    raise exception 'FALLA: % (esperado %, real %)', p_que, p_esperado, p_real;
  end if;
end;
$$;

grant execute on all functions in schema ci to anon, authenticated;

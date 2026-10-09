-- SCRUM-503 · Crear un sprint es atómico y deja un solo sprint activo por organización.
-- `crear_sprint` corre con los permisos de quien llama (SECURITY INVOKER): un
-- miembro crea en su organización y la RLS de `sprints` le impide tocar otra.
-- El índice único parcial impide dos activos aunque se escriba directo.
-- Migración: 20261008120000_crear_sprint_atomico.

begin;

insert into auth.users (id, email) values
  ('95000000-0000-0000-0000-00000000000a', 'a@test'),
  ('95000000-0000-0000-0000-00000000000b', 'b@test');
insert into public.organizations (id, name) values
  ('95000000-0000-0000-0000-000000000a00', 'Org A'),
  ('95000000-0000-0000-0000-000000000b00', 'Org B');
insert into public.profiles (id, email, organization_id, role, full_name, is_active) values
  ('95000000-0000-0000-0000-00000000000a', 'a@test', '95000000-0000-0000-0000-000000000a00', 'member', 'A', true),
  ('95000000-0000-0000-0000-00000000000b', 'b@test', '95000000-0000-0000-0000-000000000b00', 'founder', 'B', true);
insert into public.sprints (id, organization_id, name, start_date, end_date, status) values
  ('95000000-0000-0000-0000-0000000005a1', '95000000-0000-0000-0000-000000000a00', 'Sprint A1', '2026-10-01', '2026-10-14', 'active'),
  ('95000000-0000-0000-0000-0000000005b1', '95000000-0000-0000-0000-000000000b00', 'Sprint B1', '2026-10-01', '2026-10-14', 'active');

-- ─── Un miembro de A crea un sprint en A ─────────────────────────────────────
select ci.jwt('95000000-0000-0000-0000-00000000000a');
set local role authenticated;

select ci.espera(
  (select count(*) from public.crear_sprint(
     '95000000-0000-0000-0000-000000000a00', 'Sprint A2', 'Meta', 'ventas',
     '2026-10-15', '2026-10-28', '95000000-0000-0000-0000-00000000000a')
   where name = 'Sprint A2' and status = 'active'
     and organization_id = '95000000-0000-0000-0000-000000000a00'),
  1, 'crear_sprint devuelve el sprint nuevo, activo, en la organización pedida');
select ci.espera(
  (select count(*) from public.sprints where status = 'active'),
  1, 'después del alta, la organización tiene un solo sprint activo');
select ci.espera(
  (select count(*) from public.sprints
    where id = '95000000-0000-0000-0000-0000000005a1' and status = 'completed'),
  1, 'el sprint activo anterior quedó completado');

-- ─── Con otra organización no toca nada ──────────────────────────────────────
select ci.rechazado(
  $$select public.crear_sprint('95000000-0000-0000-0000-000000000b00', 'Ajeno', null, null,
      '2026-10-15', '2026-10-28', null)$$,
  'que un miembro de A cree un sprint en la organización B');

-- ─── Escribir directo tampoco deja dos activos ───────────────────────────────
do $$
begin
  begin
    insert into public.sprints (organization_id, name, start_date, end_date, status)
    values ('95000000-0000-0000-0000-000000000a00', 'Otro activo', '2026-10-15', '2026-10-28', 'active');
  exception when unique_violation then
    return;
  end;
  raise exception 'FALLA: se permitió un segundo sprint activo en la misma organización';
end;
$$;
reset role;

-- El sprint activo de B quedó como estaba.
select ci.espera(
  (select count(*) from public.sprints
    where id = '95000000-0000-0000-0000-0000000005b1' and status = 'active'),
  1, 'el sprint activo de la organización B no se tocó');
select ci.espera(
  (select count(*) from public.sprints where name = 'Ajeno'),
  0, 'no se creó ningún sprint en la organización B');

-- ─── anon no puede llamar a la función ───────────────────────────────────────
set local role anon;
select ci.rechazado(
  $$select public.crear_sprint('95000000-0000-0000-0000-000000000a00', 'X', null, null,
      '2026-10-15', '2026-10-28', null)$$,
  'que anon llame a crear_sprint');
reset role;

rollback;

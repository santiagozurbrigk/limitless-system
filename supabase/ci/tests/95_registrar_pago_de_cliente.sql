-- SCRUM-504 · [PAGO-SIN-IDEMPOTENCIA]
-- Registrar un pago y marcar su cuota es una sola transacción, con la RLS y la
-- organización de la sesión; un reintento con la misma clave no duplica el
-- cobro; anon no la puede llamar.
-- Migración: 20261008150000_registrar_pago_de_cliente.

begin;

insert into public.organizations (id, name) values
  ('95000000-0000-0000-0000-000000000a00', 'Org A'),
  ('95000000-0000-0000-0000-000000000b00', 'Org B');

insert into auth.users (id, email) values
  ('95000000-0000-0000-0000-0000000000a1', 'a@test'),
  ('95000000-0000-0000-0000-0000000000a2', 'baja@test');

insert into public.profiles (id, email, organization_id, role, full_name, is_active) values
  ('95000000-0000-0000-0000-0000000000a1', 'a@test',    '95000000-0000-0000-0000-000000000a00', 'member', 'A',    true),
  ('95000000-0000-0000-0000-0000000000a2', 'baja@test', '95000000-0000-0000-0000-000000000a00', 'member', 'Baja', false);

insert into public.clients (id, organization_id, name, payment_type, platform, installments) values
  ('95000000-0000-0000-0000-0000000000c1', '95000000-0000-0000-0000-000000000a00', 'Cliente A', 'installments', 'other',
   '[{"id":"i1","label":"1/2","amount":100,"status":"pending"},{"id":"i2","label":"2/2","amount":100,"status":"pending"}]'),
  ('95000000-0000-0000-0000-0000000000cb', '95000000-0000-0000-0000-000000000b00', 'Cliente B', 'installments', 'other',
   '[{"id":"j1","label":"1/1","amount":100,"status":"pending"}]');

-- ─── anon no la llama ────────────────────────────────────────────────────────
set local role anon;
select ci.rechazado(
  $$select public.registrar_pago_de_cliente('95000000-0000-0000-0000-0000000000c1', 100, current_date)$$,
  'que anon registre un pago');
reset role;

-- ─── Un miembro de la org A ──────────────────────────────────────────────────
select ci.jwt('95000000-0000-0000-0000-0000000000a1');
set local role authenticated;

select ci.espera(
  (select count(*) from (select public.registrar_pago_de_cliente(
     '95000000-0000-0000-0000-0000000000c1', 100, '2026-10-08', null, null, 1, null, null, 'clave-1')) x),
  1, 'registra el pago de la cuota 1');
select ci.espera((select count(*) from public.client_payments
  where client_id = '95000000-0000-0000-0000-0000000000c1'
    and organization_id = '95000000-0000-0000-0000-000000000a00'
    and installment_number = 1 and uploaded_by = '95000000-0000-0000-0000-0000000000a1'), 1,
  'el pago queda en la org de la sesión, con quien lo cargó');
select ci.espera((select count(*) from public.clients
  where id = '95000000-0000-0000-0000-0000000000c1'
    and installments -> 0 ->> 'status' = 'paid'
    and installments -> 0 ->> 'paidAt' = '2026-10-08'
    and installments -> 0 ->> 'label' = '1/2'
    and installments -> 1 ->> 'status' = 'pending'), 1,
  'la cuota 1 queda pagada en la misma transacción y la 2 sigue pendiente');

-- Reintento con la misma clave: devuelve el mismo pago, no duplica.
select ci.espera(
  (select count(*) from (select public.registrar_pago_de_cliente(
     '95000000-0000-0000-0000-0000000000c1', 100, '2026-10-08', null, null, 1, null, null, 'clave-1')) x),
  1, 'el reintento devuelve el pago');
select ci.espera((select count(*) from public.client_payments where clave_idempotencia = 'clave-1'), 1,
  'un reintento con la misma clave no duplica el cobro');

-- Una cuota fuera de rango registra el pago sin tocar las cuotas.
select ci.espera(
  (select count(*) from (select public.registrar_pago_de_cliente(
     '95000000-0000-0000-0000-0000000000c1', 50, '2026-10-08', null, null, 9, null, null, null)) x),
  1, 'una cuota que no existe registra el pago');
select ci.espera((select count(*) from public.clients
  where id = '95000000-0000-0000-0000-0000000000c1' and installments -> 1 ->> 'status' = 'pending'), 1,
  'una cuota que no existe no marca ninguna');

-- Un cliente de otra org: no existe para esta sesión.
do $$
begin
  perform public.registrar_pago_de_cliente('95000000-0000-0000-0000-0000000000cb', 100, '2026-10-08');
  raise exception 'FALLA: se registró un pago de un cliente de otra org';
exception when sqlstate 'P0002' then
  null;
end;
$$;
select ci.espera((select count(*) from public.client_payments where client_id = '95000000-0000-0000-0000-0000000000cb'), 0,
  'el cliente de otra org no recibe pagos');

reset role;

-- ─── Si la cuota no se puede marcar, no queda el pago ───────────────────────
-- Un trigger que rechaza el update de clientes simula la falla.
create function pg_temp.rechaza_update() returns trigger language plpgsql as $$
begin
  raise exception 'falla simulada al marcar la cuota';
end;
$$;
create trigger ci_rechaza_update before update on public.clients
  for each row execute function pg_temp.rechaza_update();

select ci.jwt('95000000-0000-0000-0000-0000000000a1');
set local role authenticated;
do $$
begin
  perform public.registrar_pago_de_cliente(
    '95000000-0000-0000-0000-0000000000c1', 100, '2026-10-09', null, null, 2, null, null, 'clave-2');
  raise exception 'FALLA: se registró el pago aunque la cuota no se pudo marcar';
exception when others then
  if sqlerrm like 'FALLA:%' then raise; end if;
end;
$$;
select ci.espera((select count(*) from public.client_payments where clave_idempotencia = 'clave-2'), 0,
  'si la cuota no se puede marcar, el pago tampoco queda');
reset role;
drop trigger ci_rechaza_update on public.clients;

-- ─── Un miembro desactivado no registra pagos ───────────────────────────────
select ci.jwt('95000000-0000-0000-0000-0000000000a2');
set local role authenticated;
select ci.rechazado(
  $$select public.registrar_pago_de_cliente('95000000-0000-0000-0000-0000000000c1', 100, current_date)$$,
  'que un miembro desactivado registre un pago');
reset role;

rollback;

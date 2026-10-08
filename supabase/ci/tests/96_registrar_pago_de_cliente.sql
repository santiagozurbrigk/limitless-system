-- SCRUM-504 · [PAGO-SIN-IDEMPOTENCIA]
-- Registrar un pago y marcar su cuota es una sola transacción, con la RLS y la
-- organización de la sesión; un reintento con la misma clave no duplica el
-- cobro y la misma clave con otros datos se rechaza; ni anon ni public tienen
-- EXECUTE.
-- Migración: 20261008150000_registrar_pago_de_cliente. (96_ porque SCRUM-503
-- trae 95_crear_sprint.sql.)

begin;

insert into public.organizations (id, name) values
  ('96000000-0000-0000-0000-000000000a00', 'Org A'),
  ('96000000-0000-0000-0000-000000000b00', 'Org B');

insert into auth.users (id, email) values
  ('96000000-0000-0000-0000-0000000000a1', 'a@test'),
  ('96000000-0000-0000-0000-0000000000a2', 'baja@test');

insert into public.profiles (id, email, organization_id, role, full_name, is_active) values
  ('96000000-0000-0000-0000-0000000000a1', 'a@test',    '96000000-0000-0000-0000-000000000a00', 'member', 'A',    true),
  ('96000000-0000-0000-0000-0000000000a2', 'baja@test', '96000000-0000-0000-0000-000000000a00', 'member', 'Baja', false);

insert into public.clients (id, organization_id, name, payment_type, platform, installments) values
  ('96000000-0000-0000-0000-0000000000c1', '96000000-0000-0000-0000-000000000a00', 'Cliente A', 'installments', 'other',
   '[{"id":"i1","label":"1/2","amount":100,"status":"pending"},{"id":"i2","label":"2/2","amount":100,"status":"pending"}]'),
  ('96000000-0000-0000-0000-0000000000c2', '96000000-0000-0000-0000-000000000a00', 'Otro cliente A', 'upfront', 'other', '[]'),
  ('96000000-0000-0000-0000-0000000000cb', '96000000-0000-0000-0000-000000000b00', 'Cliente B', 'installments', 'other',
   '[{"id":"j1","label":"1/1","amount":100,"status":"pending"}]');

-- ─── Permisos: ni anon ni public tienen EXECUTE ──────────────────────────────
-- Se mira el grant, no sólo que la llamada falle: para anon la función ya
-- lanzaría 42501 por dentro (sin organización), aunque tuviera el grant.
select ci.espera(
  (select count(*) from (select 1 where has_function_privilege('anon',
     'public.registrar_pago_de_cliente(uuid, numeric, date, text, text, integer, text, uuid, text)', 'execute')) x),
  0, 'anon sin EXECUTE sobre registrar_pago_de_cliente');
select ci.espera(
  (select count(*) from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where p.oid = 'public.registrar_pago_de_cliente(uuid, numeric, date, text, text, integer, text, uuid, text)'::regprocedure
     and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  0, 'public sin EXECUTE sobre registrar_pago_de_cliente');
select ci.espera(
  (select count(*) from (select 1 where has_function_privilege('authenticated',
     'public.registrar_pago_de_cliente(uuid, numeric, date, text, text, integer, text, uuid, text)', 'execute')) x),
  1, 'authenticated con EXECUTE sobre registrar_pago_de_cliente');

-- ─── La policy de UPDATE y los grants de client_payments ────────────────────
-- Se mira la definición, no sólo el efecto: con la org fuera de la USING, un
-- UPDATE sin WHERE (que no pasa por la policy de SELECT) alcanzaría pagos de
-- otra org; un WITH CHECK sin la org o un grant de más no se ven con una
-- llamada (los frenan el grant por columna y el CHECK de la ruta).
select ci.espera(
  (select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'client_payments' and cmd = 'UPDATE'
     and policyname = 'Org members add receipt to client_payments'
     and qual ilike '%storage_path IS NULL%'
     and qual ilike '%organization_id = get_my_organization_id()%'
     and with_check ilike '%organization_id = get_my_organization_id()%'),
  1, 'la policy de UPDATE exige la org en la USING y en el WITH CHECK, y que no haya comprobante');
select ci.espera(
  (select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'client_payments' and cmd in ('UPDATE', 'ALL')),
  1, 'una sola policy de UPDATE sobre client_payments');
select ci.espera(
  (select count(*) from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'client_payments'
     and has_column_privilege('authenticated', 'public.client_payments', c.column_name, 'UPDATE')),
  2, 'authenticated edita exactamente dos columnas de client_payments (storage_path y mime_type)');

-- Un pago de la org B sin comprobante (para ver que un miembro de A no lo toca).
insert into public.client_payments (id, client_id, organization_id, amount) values
  ('96000000-0000-0000-0000-0000000000f1', '96000000-0000-0000-0000-0000000000cb', '96000000-0000-0000-0000-000000000b00', 10);

-- ─── anon no la llama ni edita pagos ─────────────────────────────────────────
set local role anon;
select ci.rechazado(
  $$update public.client_payments set storage_path = null$$,
  'que anon edite pagos');
select ci.rechazado(
  $$select public.registrar_pago_de_cliente('96000000-0000-0000-0000-0000000000c1', 100, current_date)$$,
  'que anon registre un pago');
reset role;

-- ─── Un miembro de la org A ──────────────────────────────────────────────────
select ci.jwt('96000000-0000-0000-0000-0000000000a1');
set local role authenticated;

select ci.espera(
  (select count(*) from (select public.registrar_pago_de_cliente(
     '96000000-0000-0000-0000-0000000000c1', 100, '2026-10-08', null, null, 1, null, null, 'clave-1')) x),
  1, 'registra el pago de la cuota 1');
select ci.espera((select count(*) from public.client_payments
  where client_id = '96000000-0000-0000-0000-0000000000c1'
    and organization_id = '96000000-0000-0000-0000-000000000a00'
    and installment_number = 1 and uploaded_by = '96000000-0000-0000-0000-0000000000a1'), 1,
  'el pago queda en la org de la sesión, con quien lo cargó');
select ci.espera((select count(*) from public.clients
  where id = '96000000-0000-0000-0000-0000000000c1'
    and installments -> 0 ->> 'status' = 'paid'
    and installments -> 0 ->> 'paidAt' = '2026-10-08'
    and installments -> 0 ->> 'label' = '1/2'
    and installments -> 1 ->> 'status' = 'pending'), 1,
  'la cuota 1 queda pagada en la misma transacción y la 2 sigue pendiente');

-- Reintento con la misma clave: devuelve el mismo pago, no duplica.
select ci.espera(
  (select count(*) from (select public.registrar_pago_de_cliente(
     '96000000-0000-0000-0000-0000000000c1', 100, '2026-10-08', null, null, 1, null, null, 'clave-1')) x),
  1, 'el reintento devuelve el pago');
select ci.espera((select count(*) from public.client_payments where clave_idempotencia = 'clave-1'), 1,
  'un reintento con la misma clave no duplica el cobro');

-- La misma clave con otros datos no es un reintento: IDM01 y no se registra nada.
do $$
begin
  perform public.registrar_pago_de_cliente(
    '96000000-0000-0000-0000-0000000000c1', 999, '2026-10-08', null, null, 1, null, null, 'clave-1');
  raise exception 'FALLA: la misma clave con otro monto devolvió el pago anterior';
exception when sqlstate 'IDM01' then
  null;
end;
$$;
do $$
begin
  perform public.registrar_pago_de_cliente(
    '96000000-0000-0000-0000-0000000000c1', 100, '2026-10-09', null, null, 1, null, null, 'clave-1');
  raise exception 'FALLA: la misma clave con otra fecha devolvió el pago anterior';
exception when sqlstate 'IDM01' then
  null;
end;
$$;
do $$
begin
  perform public.registrar_pago_de_cliente(
    '96000000-0000-0000-0000-0000000000c2', 100, '2026-10-08', null, null, null, null, null, 'clave-1');
  raise exception 'FALLA: la misma clave con otro cliente devolvió el pago del primero';
exception when sqlstate 'IDM01' then
  null;
end;
$$;
do $$
begin
  perform public.registrar_pago_de_cliente(
    '96000000-0000-0000-0000-0000000000c1', 100, '2026-10-08', null, null, 2, null, null, 'clave-1');
  raise exception 'FALLA: la misma clave con otra cuota devolvió el pago anterior';
exception when sqlstate 'IDM01' then
  null;
end;
$$;
select ci.espera((select count(*) from public.client_payments where clave_idempotencia = 'clave-1'), 1,
  'la misma clave con otros datos no registra otro pago');
select ci.espera((select count(*) from public.client_payments where client_id = '96000000-0000-0000-0000-0000000000c2'), 0,
  'el otro cliente no recibe el pago de la clave ajena');
select ci.espera((select count(*) from public.clients
  where id = '96000000-0000-0000-0000-0000000000c1' and installments -> 1 ->> 'status' = 'pending'), 1,
  'la otra cuota no se marca');

-- Un monto con más de dos decimales se guarda redondeado y su reintento no es "otros datos".
select ci.espera(
  (select count(*) from (select public.registrar_pago_de_cliente(
     '96000000-0000-0000-0000-0000000000c2', 333.333, '2026-10-08', null, null, null, null, null, 'clave-redondeo')) x),
  1, 'registra 333.333');
select ci.espera(
  (select count(*) from (select public.registrar_pago_de_cliente(
     '96000000-0000-0000-0000-0000000000c2', 333.333, '2026-10-08', null, null, null, null, null, 'clave-redondeo')) x),
  1, 'el reintento con 333.333 devuelve el pago, sin IDM01');
select ci.espera((select count(*) from public.client_payments where clave_idempotencia = 'clave-redondeo' and amount = 333.33), 1,
  'un solo pago, guardado como 333.33');

-- El reintento trae el comprobante que el primer guardado no tenía: se le suma al pago.
select ci.espera(
  (select count(*) from (select public.registrar_pago_de_cliente(
     '96000000-0000-0000-0000-0000000000c2', 50, '2026-10-08', null, null, null, null, null, 'clave-comprobante')) x),
  1, 'registra el pago sin comprobante');
select ci.espera(
  (select count(*) from (select p.storage_path from public.registrar_pago_de_cliente(
     '96000000-0000-0000-0000-0000000000c2', 50, '2026-10-08',
     '96000000-0000-0000-0000-000000000a00/96000000-0000-0000-0000-0000000000c2/uno.pdf', 'application/pdf',
     null, null, null, 'clave-comprobante') p) x
   where storage_path = '96000000-0000-0000-0000-000000000a00/96000000-0000-0000-0000-0000000000c2/uno.pdf'),
  1, 'el reintento con comprobante lo suma al pago');
select ci.espera((select count(*) from public.client_payments
  where clave_idempotencia = 'clave-comprobante' and mime_type = 'application/pdf'), 1,
  'sigue habiendo un solo pago, ahora con comprobante');
-- Si ya tenía comprobante, se devuelve el que tenía (la app borra el archivo nuevo).
select ci.espera(
  (select count(*) from (select p.storage_path from public.registrar_pago_de_cliente(
     '96000000-0000-0000-0000-0000000000c2', 50, '2026-10-08',
     '96000000-0000-0000-0000-000000000a00/96000000-0000-0000-0000-0000000000c2/dos.pdf', 'application/pdf',
     null, null, null, 'clave-comprobante') p) x
   where storage_path = '96000000-0000-0000-0000-000000000a00/96000000-0000-0000-0000-0000000000c2/uno.pdf'),
  1, 'un segundo comprobante no reemplaza al primero');

-- Lo único que un miembro puede editar de un pago es sumarle el comprobante si no lo tiene.
select ci.rechazado(
  $$update public.client_payments set amount = 1 where clave_idempotencia = 'clave-redondeo'$$,
  'que un miembro edite el monto de un pago');
select ci.espera(ci.filas($$update public.client_payments set storage_path = '96000000-0000-0000-0000-000000000a00/x/tres.pdf'
  where clave_idempotencia = 'clave-comprobante'$$), 0,
  'un miembro no reemplaza un comprobante que ya está');
select ci.espera(ci.filas($$update public.client_payments set storage_path = '96000000-0000-0000-0000-000000000b00/x.pdf'
  where id = '96000000-0000-0000-0000-0000000000f1'$$), 0,
  'un miembro de A no le pone comprobante a un pago de la org B');
select ci.espera((select count(*) from public.client_payments where client_id = '96000000-0000-0000-0000-0000000000c1' and amount = 999), 0,
  'el monto corregido no queda guardado con la clave vieja');

-- Una cuota fuera de rango registra el pago sin tocar las cuotas.
select ci.espera(
  (select count(*) from (select public.registrar_pago_de_cliente(
     '96000000-0000-0000-0000-0000000000c1', 50, '2026-10-08', null, null, 9, null, null, null)) x),
  1, 'una cuota que no existe registra el pago');
select ci.espera((select count(*) from public.clients
  where id = '96000000-0000-0000-0000-0000000000c1' and installments -> 1 ->> 'status' = 'pending'), 1,
  'una cuota que no existe no marca ninguna');

-- Un cliente de otra org: no existe para esta sesión.
do $$
begin
  perform public.registrar_pago_de_cliente('96000000-0000-0000-0000-0000000000cb', 100, '2026-10-08');
  raise exception 'FALLA: se registró un pago de un cliente de otra org';
exception when sqlstate 'P0002' then
  null;
end;
$$;
select ci.espera((select count(*) from public.client_payments where client_id = '96000000-0000-0000-0000-0000000000cb'), 0,
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

select ci.jwt('96000000-0000-0000-0000-0000000000a1');
set local role authenticated;
do $$
begin
  perform public.registrar_pago_de_cliente(
    '96000000-0000-0000-0000-0000000000c1', 100, '2026-10-09', null, null, 2, null, null, 'clave-2');
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
select ci.jwt('96000000-0000-0000-0000-0000000000a2');
set local role authenticated;
select ci.rechazado(
  $$select public.registrar_pago_de_cliente('96000000-0000-0000-0000-0000000000c1', 100, current_date)$$,
  'que un miembro desactivado registre un pago');
reset role;

rollback;

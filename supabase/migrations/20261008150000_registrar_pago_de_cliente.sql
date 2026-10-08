-- SCRUM-504 (AR pasada 2, MENOR-2) · [PAGO-SIN-IDEMPOTENCIA]
--
-- Registrar un pago de un cliente y marcar su cuota en una sola transacción.
--
-- Antes la app insertaba en `client_payments` y después reescribía
-- `clients.installments` en otra llamada: si la segunda fallaba, el pago
-- existía y la cuota seguía "Pendiente" (la revisión semanal marcaba "pago
-- atrasado" a un cliente que había pagado). Dos pagos simultáneos del mismo
-- cliente podían pisarse la lista de cuotas, y un reintento tras perder la
-- respuesta duplicaba el cobro.
--
-- `registrar_pago_de_cliente`:
--   - corre con los permisos de quien llama (SECURITY INVOKER): la RLS de
--     `clients` y `client_payments` sigue valiendo, y la organización es la de
--     la sesión (`get_my_organization_id()`), nunca un parámetro;
--   - bloquea la fila del cliente (`for update`): dos pagos del mismo cliente
--     se registran uno después del otro;
--   - con `p_clave_idempotencia`, un reintento con la misma clave devuelve el
--     pago ya registrado en vez de duplicarlo (índice único por organización);
--     si el pago no tenía comprobante y el reintento lo trae, se le suma;
--   - si la cuota no se puede marcar, no queda nada (la transacción se
--     deshace).
-- Errores: 'P0002' si el cliente no es de la org (o no existe); 'IDM01' si la
-- clave ya se usó con otro cliente, monto, fecha o cuota; 42501 sin
-- organización o si la RLS no deja marcar la cuota.

alter table public.client_payments
  add column if not exists clave_idempotencia text;

comment on column public.client_payments.clave_idempotencia is
  'Clave que genera la pantalla al abrir el formulario de un pago: un reintento con la misma clave no duplica el cobro (registrar_pago_de_cliente).';

create unique index if not exists client_payments_clave_idempotencia_key
  on public.client_payments (organization_id, clave_idempotencia)
  where clave_idempotencia is not null;

-- Sumar el comprobante a un pago que no lo tiene: la única escritura de
-- UPDATE sobre client_payments. Sólo las columnas del comprobante (grant por
-- columna) y sólo filas de la org sin comprobante (policy). Antes no había
-- policy de UPDATE: nadie podía editar un pago.
drop policy if exists "Org members add receipt to client_payments" on public.client_payments;
create policy "Org members add receipt to client_payments"
  on public.client_payments for update
  using (organization_id = public.get_my_organization_id() and storage_path is null)
  with check (organization_id = public.get_my_organization_id());

revoke update on public.client_payments from anon, authenticated;
grant update (storage_path, mime_type) on public.client_payments to authenticated;

create or replace function public.registrar_pago_de_cliente(
  p_client_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_storage_path text default null,
  p_mime_type text default null,
  p_installment_number integer default null,
  p_payment_received_from text default null,
  p_payment_destination_platform_id uuid default null,
  p_clave_idempotencia text default null
)
returns public.client_payments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid := public.get_my_organization_id();
  v_cliente public.clients;
  v_pago public.client_payments;
  v_indice integer;
  v_filas integer;
begin
  if v_org is null then
    raise exception 'registrar_pago_de_cliente: sin organización' using errcode = '42501';
  end if;

  select * into v_cliente
  from public.clients
  where id = p_client_id and organization_id = v_org
  for update;

  if not found then
    raise exception 'registrar_pago_de_cliente: cliente no encontrado' using errcode = 'P0002';
  end if;

  if p_clave_idempotencia is not null then
    select * into v_pago
    from public.client_payments
    where organization_id = v_org and clave_idempotencia = p_clave_idempotencia;
    if found then
      -- Una clave ya usada con otros datos no es un reintento: el usuario
      -- corrigió el formulario después de perder la respuesta. No se devuelve
      -- el pago viejo como si fuera el nuevo.
      -- El monto se compara con el redondeo de la columna (numeric(12,2)):
      -- 333.333 se guardó como 333.33 y su reintento no es "otros datos".
      if v_pago.client_id <> p_client_id
         or v_pago.amount <> round(p_amount, 2)
         or v_pago.payment_date <> p_payment_date
         or (p_installment_number is not null
             and v_pago.installment_number is distinct from p_installment_number)
      then
        raise exception 'registrar_pago_de_cliente: la clave ya se usó con otros datos' using errcode = 'IDM01';
      end if;
      -- El reintento trae el comprobante que el primer guardado no tenía: se
      -- le suma al pago (cada subida tiene otra ruta, así que no se compara la
      -- ruta). Si el pago ya tenía comprobante, se devuelve como está y la app
      -- borra el archivo nuevo para no dejarlo huérfano.
      if v_pago.storage_path is null and p_storage_path is not null then
        update public.client_payments
        set storage_path = p_storage_path, mime_type = p_mime_type
        where id = v_pago.id and organization_id = v_org and storage_path is null
        returning * into v_pago;
        if not found then
          raise exception 'registrar_pago_de_cliente: no se pudo sumar el comprobante' using errcode = '42501';
        end if;
      end if;
      return v_pago;
    end if;
  end if;

  insert into public.client_payments (
    client_id, organization_id, amount, payment_date, storage_path, mime_type,
    installment_number, payment_received_from, payment_destination_platform_id,
    uploaded_by, clave_idempotencia
  ) values (
    p_client_id, v_org, p_amount, p_payment_date, p_storage_path, p_mime_type,
    p_installment_number, p_payment_received_from, p_payment_destination_platform_id,
    auth.uid(), p_clave_idempotencia
  )
  returning * into v_pago;

  v_indice := p_installment_number - 1;
  if p_installment_number is not null
     and v_cliente.payment_type = 'installments'
     and jsonb_typeof(v_cliente.installments) = 'array'
     and v_indice between 0 and jsonb_array_length(v_cliente.installments) - 1
  then
    update public.clients
    set installments = jsonb_set(
          installments,
          array[v_indice::text],
          (installments -> v_indice)
            || jsonb_build_object('status', 'paid', 'paidAt', p_payment_date::text)
        ),
        updated_at = now()
    where id = p_client_id and organization_id = v_org;

    get diagnostics v_filas = row_count;
    if v_filas = 0 then
      raise exception 'registrar_pago_de_cliente: no se pudo marcar la cuota' using errcode = '42501';
    end if;
  end if;

  return v_pago;
end;
$$;

revoke all on function public.registrar_pago_de_cliente(uuid, numeric, date, text, text, integer, text, uuid, text) from public;
revoke all on function public.registrar_pago_de_cliente(uuid, numeric, date, text, text, integer, text, uuid, text) from anon;
grant execute on function public.registrar_pago_de_cliente(uuid, numeric, date, text, text, integer, text, uuid, text) to authenticated;

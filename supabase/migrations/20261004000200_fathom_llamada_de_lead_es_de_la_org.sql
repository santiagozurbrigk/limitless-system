-- Una grabación vinculada a un lead o a un turno es del negocio (SCRUM-157).
--
-- ⭐ Decisión de Santiago (2026-10-03): el founder tiene que poder ver una venta
-- grabada por un closer con su propia cuenta de Fathom y vinculada a un lead.
-- Antes la policy sólo abría la fila con `client_id`; una llamada cruzada con un
-- lead (`counterparty_lead_id`) o con un turno de Closing (`closing_call_id`)
-- quedaba privada de quien la grabó. Ahora cualquier vínculo la hace de la org.
-- Lo que no quedó vinculado a nada sigue siendo sólo de quien lo grabó.

alter policy "Fathom calls: linked are the org's, unlinked are the recorder's"
  on public.fathom_calls
  using (
    organization_id = public.get_my_organization_id()
    and (
      -- Vinculada a un cliente, a un lead o a un turno: es del negocio.
      client_id is not null
      or counterparty_lead_id is not null
      or closing_call_id is not null
      -- La grabó quien pregunta.
      or user_id = auth.uid()
      -- Sin dueño registrado (las viejas, de la key de la organización).
      or user_id is null
    )
  );

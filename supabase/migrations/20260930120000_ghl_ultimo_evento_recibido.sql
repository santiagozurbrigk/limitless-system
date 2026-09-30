-- [EMBUDOS-WEBHOOK-PERDIDA] (SCRUM-6): cuándo llegó el último evento de GHL
-- aplicado a cada oportunidad.
--
-- Un evento que se reprocesa (reintento de GHL o `scripts/reprocesar-webhooks.ts`)
-- puede ser más viejo que el estado actual de la oportunidad. Si se aplicara,
-- volvería la oportunidad a una etapa anterior y registraría una transición que
-- no pasó. `updated_at` no sirve para decidirlo: es cuándo se procesó, no
-- cuándo llegó, y al reprocesar un lote el primero que se procesa quedaría como
-- "el más nuevo".
--
-- El webhook aplica un evento sólo si llegó después (o al mismo tiempo) que el
-- último aplicado. `null` = sin dato: se aplica.

alter table public.ghl_opportunities
  add column if not exists last_event_received_at timestamptz;

comment on column public.ghl_opportunities.last_event_received_at is
  'Cuándo llegó el último evento de GHL aplicado a esta oportunidad (SCRUM-6). Un evento que llegó antes no se aplica.';

-- Filas existentes: se procesaron al llegar, así que `updated_at` es una buena
-- aproximación de la llegada del último evento aplicado.
update public.ghl_opportunities
set last_event_received_at = updated_at
where last_event_received_at is null;

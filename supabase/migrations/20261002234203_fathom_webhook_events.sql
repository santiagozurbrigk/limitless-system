-- El crudo de cada webhook de Fathom por miembro (SCRUM-37).
--
-- ⭐ Regla de APIs externas (CLAUDE.md §3): el payload se guarda **antes** de
-- interpretarlo. El cuerpo de `new-meeting-content-ready` no está detallado en la
-- doc de Fathom: si el mapeo no entiende algo, la entrega queda acá con el motivo
-- en `error` y se puede reprocesar, en vez de perderse.
--
-- `webhook_message_id` es el header `webhook-id`: Fathom lo repite en los
-- reintentos, así que la misma entrega no se guarda dos veces.

create table if not exists public.fathom_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  integration_id uuid not null references public.team_member_integrations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  webhook_message_id text not null,
  payload jsonb not null,
  fathom_call_id text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique (integration_id, webhook_message_id)
);

create index if not exists fathom_webhook_events_org_received_idx
  on public.fathom_webhook_events (organization_id, received_at desc);

-- Sólo el service role: lo escribe la ruta del webhook y nadie lo lee desde el
-- navegador (trae el transcript completo de la llamada).
alter table public.fathom_webhook_events enable row level security;
revoke all on public.fathom_webhook_events from anon, authenticated;

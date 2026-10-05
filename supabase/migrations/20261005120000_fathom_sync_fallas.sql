-- Reuniones de Fathom que la sincronización no pudo guardar (SCRUM-36).
--
-- Una reunión que falla al guardarse frena el cursor de la sync (`last_sync_at`)
-- y se vuelve a pedir en cada corrida. Para no trabar la sync para siempre con un
-- dato corrupto, se deja de reintentar cuando pasaron 24 h desde su PRIMERA falla
-- y falló por lo menos 6 veces (`lib/fathom/cursor.ts`). Esta tabla guarda esa
-- cuenta: medirlo desde el `created_at` de la reunión descartaba, después de una
-- caída de más de un día, reuniones que se podían recuperar.
--
-- Una fila por reunión y por conexión: `user_id` nulo es la conexión de la
-- organización; con `user_id`, la de ese miembro. Cuando la reunión se guarda, la
-- fila se borra. Una descartada queda con `descartada_at` para poder rastrearla y
-- recuperarla rebobinando el cursor (docs/areas/ventas.md).

create table if not exists public.fathom_sync_fallas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  fathom_call_id text not null,
  fathom_created_at timestamptz,
  primera_falla_at timestamptz not null default now(),
  ultima_falla_at timestamptz not null default now(),
  intentos integer not null default 1 check (intentos >= 1),
  descartada_at timestamptz
);

comment on table public.fathom_sync_fallas is
  'Reuniones de Fathom que la sync no pudo guardar: cuenta de intentos desde la primera falla. user_id nulo = conexión de la organización.';

create unique index if not exists fathom_sync_fallas_org_unica
  on public.fathom_sync_fallas (organization_id, fathom_call_id)
  where user_id is null;

create unique index if not exists fathom_sync_fallas_miembro_unica
  on public.fathom_sync_fallas (organization_id, user_id, fathom_call_id)
  where user_id is not null;

-- Sólo el service role: la escriben la sync de la organización y la del miembro
-- (cron y botón, con el cliente admin). Nadie la lee desde el navegador.
alter table public.fathom_sync_fallas enable row level security;
revoke all on public.fathom_sync_fallas from anon, authenticated;

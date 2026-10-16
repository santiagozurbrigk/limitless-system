-- SCRUM-526 · Limitless Webinars, Fase 1: modelo de datos (épica SCRUM-521).
--
-- Tablas del lanzamiento de un webinar y de sus leads, según la sección 4 de
-- los requerimientos técnicos y las decisiones del sprint 2:
--   - configuración del lanzamiento (la edita founder o admin):
--     webinar_launches, webinar_sessions, launch_ad_campaigns, launch_products;
--   - datos de la landing y del lead (los escribe la ingesta con el service
--     role, SCRUM-527 y SCRUM-528; los miembros sólo leen):
--     leads, launch_registrations, landing_visits, lead_events;
--   - credenciales y crudos (sólo service role, sin policies):
--     ingest_keys, landing_events.
-- Fuera de esta migración: organizations.experience (SCRUM-523), lead_sales_state
-- y lead_notes (Fase 3), Zoom y Vercel (Fases 2 y 4), snapshots (Fase 5) y el id
-- de campaña en ad_metrics_daily (SCRUM-535). Las tablas viejas `launches` y
-- `launch_metrics` (módulo apagado, sin filas en producción) quedan como están.
--
-- Reglas que la base hace cumplir:
--   - Toda fila lleva organization_id. Una fila hija no puede apuntar a un
--     lanzamiento, a un lead ni a un evento crudo de otra organización: las FK
--     hacia webinar_launches, leads y landing_events son compuestas con
--     organization_id (contra un único (id, organization_id) del padre). Vale
--     también para el service role, que no pasa por RLS.
--   - Toda llave única de datos externos incluye la organización (convención
--     del repo, como payment_*, ghl_*, ad_metrics_daily): client_registration_id
--     y la llave natural de lead_events son únicas por organización. Las que
--     empiezan por launch_id ya quedan dentro de una organización.
--   - webinar_launches.public_id va en la landing: único en toda la base y
--     aleatorio (122 bits de gen_random_uuid(), en hexadecimal). Ningún usuario
--     lo elige ni lo cambia (grants por columna).
--   - lead_events es append-only para los usuarios: authenticated no tiene
--     UPDATE ni DELETE (ni policy ni grant). El estado actual de venta va a ser
--     una proyección aparte (lead_sales_state, Fase 3).
--   - RLS en todas: lectura para los miembros de la organización
--     (get_my_organization_id()), salvo ingest_keys y landing_events, que no
--     tienen policies. La escritura de la configuración del lanzamiento es de
--     founder o admin (current_user_has_org_role, patrón de SCRUM-1; SCRUM-533
--     la pasa a permisos por módulo). anon no tiene ningún grant.
--
-- No borra ni transforma datos: sólo crea tablas, índices, policies, la
-- extensión pg_trgm (en producción está disponible pero no instalada) y suma
-- launch_registrations a la publicación de realtime.

-- ─── 0. Extensión para la búsqueda de leads ──────────────────────────────────
create extension if not exists pg_trgm with schema extensions;

-- ─── 1. webinar_launches ─────────────────────────────────────────────────────
create table if not exists public.webinar_launches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  variant text not null check (variant in ('organic', 'paid', 'paid_plus')),
  offer_price numeric(12, 2) check (offer_price >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  capture_starts_on date,
  closes_on date,
  -- Metas opcionales: sin meta no hay "porcentaje de la meta" (nunca cero).
  goal_sales integer check (goal_sales >= 0),
  goal_revenue numeric(14, 2) check (goal_revenue >= 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  public_id text not null default replace(gen_random_uuid()::text, '-', '')
    check (public_id ~ '^[0-9a-f]{32}$'),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webinar_launches_public_id_key unique (public_id),
  -- Destino de las FK compuestas de las tablas hijas.
  constraint webinar_launches_id_org_key unique (id, organization_id),
  constraint webinar_launches_fechas_en_orden
    check (capture_starts_on is null or closes_on is null or closes_on >= capture_starts_on),
  constraint webinar_launches_closed_at_segun_status
    check ((status = 'closed') = (closed_at is not null))
);

comment on table public.webinar_launches is
  'Lanzamiento de un webinar (Limitless Webinars, SCRUM-526). public_id es el identificador que va en la landing: aleatorio, único y no editable por usuarios.';

create index if not exists webinar_launches_org_status
  on public.webinar_launches (organization_id, status);

-- ─── 2. webinar_sessions ─────────────────────────────────────────────────────
create table if not exists public.webinar_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  launch_id uuid not null,
  starts_at timestamptz not null,
  zoom_webinar_id text,
  offer_offset_seconds integer check (offer_offset_seconds >= 0),
  -- Estado del reporte de Zoom: sus valores se definen con la integración de
  -- Zoom (Fase 2).
  report_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webinar_sessions_launch_fkey foreign key (launch_id, organization_id)
    references public.webinar_launches (id, organization_id) on delete cascade
);

create index if not exists webinar_sessions_launch_starts
  on public.webinar_sessions (launch_id, starts_at);

-- ─── 3. launch_ad_campaigns ──────────────────────────────────────────────────
create table if not exists public.launch_ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  launch_id uuid not null,
  platform text not null check (char_length(btrim(platform)) between 1 and 50),
  campaign_external_id text not null check (char_length(btrim(campaign_external_id)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint launch_ad_campaigns_launch_fkey foreign key (launch_id, organization_id)
    references public.webinar_launches (id, organization_id) on delete cascade,
  constraint launch_ad_campaigns_launch_platform_campaign_key
    unique (launch_id, platform, campaign_external_id)
);

-- ─── 4. launch_products ──────────────────────────────────────────────────────
create table if not exists public.launch_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  launch_id uuid not null,
  provider text not null check (char_length(btrim(provider)) between 1 and 50),
  product_external_id text not null check (char_length(btrim(product_external_id)) between 1 and 200),
  role text not null check (role in ('main', 'vip')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint launch_products_launch_fkey foreign key (launch_id, organization_id)
    references public.webinar_launches (id, organization_id) on delete cascade,
  constraint launch_products_launch_provider_product_key
    unique (launch_id, provider, product_external_id)
);

-- ─── 5. leads ────────────────────────────────────────────────────────────────
-- La persona es la unidad de dato: un lead por email normalizado y organización.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (char_length(btrim(email)) between 3 and 320),
  email_normalized text not null
    check (email_normalized = lower(btrim(email_normalized)) and char_length(email_normalized) between 3 and 320),
  name text,
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  first_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_org_email_normalized_key unique (organization_id, email_normalized),
  constraint leads_id_org_key unique (id, organization_id)
);

comment on table public.leads is
  'Persona que se registró en un lanzamiento (SCRUM-526). Única por (organization_id, email_normalized). Datos personales: no van a logs ni a Sentry.';

-- Búsqueda por nombre o email (ilike '%texto%').
create index if not exists leads_name_trgm
  on public.leads using gin (name extensions.gin_trgm_ops);
create index if not exists leads_email_normalized_trgm
  on public.leads using gin (email_normalized extensions.gin_trgm_ops);

-- ─── 6. landing_events (crudo) ───────────────────────────────────────────────
-- Todo lo que manda la landing se guarda tal cual antes de normalizarlo; si la
-- normalización falla, queda con su estado y se reprocesa.
create table if not exists public.landing_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('registration', 'visit')),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'processed', 'unmapped', 'error')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint landing_events_id_org_key unique (id, organization_id)
);

create index if not exists landing_events_status_received
  on public.landing_events (status, received_at);

-- ─── 7. launch_registrations ─────────────────────────────────────────────────
create table if not exists public.launch_registrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  launch_id uuid not null,
  lead_id uuid not null,
  client_registration_id text not null check (char_length(btrim(client_registration_id)) between 1 and 200),
  registered_at timestamptz not null default now(),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  sl text,
  ab_variant text,
  qualification text,
  zoom_join_url text,
  raw_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint launch_registrations_launch_fkey foreign key (launch_id, organization_id)
    references public.webinar_launches (id, organization_id) on delete cascade,
  constraint launch_registrations_lead_fkey foreign key (lead_id, organization_id)
    references public.leads (id, organization_id) on delete cascade,
  -- Si se borra el crudo, el registro queda (sólo se limpia raw_event_id).
  constraint launch_registrations_raw_event_fkey foreign key (raw_event_id, organization_id)
    references public.landing_events (id, organization_id) on delete set null (raw_event_id),
  -- Un reintento de la landing no duplica el registro.
  constraint launch_registrations_org_client_registration_key
    unique (organization_id, client_registration_id),
  -- Un lead se registra una vez por lanzamiento (la ingesta se queda con el primero).
  constraint launch_registrations_launch_lead_key unique (launch_id, lead_id)
);

create index if not exists launch_registrations_launch_registered
  on public.launch_registrations (launch_id, registered_at);
-- Para el borrado en cascada de un lead.
create index if not exists launch_registrations_lead
  on public.launch_registrations (lead_id);

-- ─── 8. landing_visits ───────────────────────────────────────────────────────
create table if not exists public.landing_visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  launch_id uuid not null,
  visitor_id text not null check (char_length(btrim(visitor_id)) between 1 and 200),
  day date not null,
  created_at timestamptz not null default now(),
  constraint landing_visits_launch_fkey foreign key (launch_id, organization_id)
    references public.webinar_launches (id, organization_id) on delete cascade,
  constraint landing_visits_launch_visitor_day_key unique (launch_id, visitor_id, day)
);

-- ─── 9. lead_events ──────────────────────────────────────────────────────────
-- Append-only. Los números del lanzamiento salen de contar leads distintos por
-- kind y lanzamiento. launch_id es obligatorio (todo evento cuenta para un
-- lanzamiento); si una fase posterior necesita eventos sin lanzamiento, se
-- relaja en otra migración.
create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null,
  launch_id uuid not null,
  kind text not null check (kind in (
    'registered', 'zoom_link_created', 'email_confirmed', 'vip_purchased',
    'attended', 'stayed_to_offer', 'raised_hand', 'contacted', 'qualified',
    'disqualified', 'call_booked', 'call_attended', 'call_no_show',
    'purchased', 'refunded', 'note'
  )),
  occurred_at timestamptz not null,
  source text not null check (source in ('landing', 'zoom', 'ghl', 'calendly', 'whop', 'commas', 'manual')),
  source_ref text not null check (char_length(btrim(source_ref)) between 1 and 200),
  actor_user_id uuid references auth.users(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lead_events_lead_fkey foreign key (lead_id, organization_id)
    references public.leads (id, organization_id) on delete cascade,
  constraint lead_events_launch_fkey foreign key (launch_id, organization_id)
    references public.webinar_launches (id, organization_id) on delete cascade,
  -- Llave natural: un reintento del mismo evento externo no lo duplica.
  constraint lead_events_org_source_ref_kind_key unique (organization_id, source, source_ref, kind)
);

create index if not exists lead_events_launch_kind_lead
  on public.lead_events (launch_id, kind, lead_id);
create index if not exists lead_events_lead_occurred
  on public.lead_events (lead_id, occurred_at);

-- ─── 10. ingest_keys ─────────────────────────────────────────────────────────
-- Clave de ingesta de la landing: se guarda sólo el hash (sha256); la clave se
-- muestra una vez al crearla (SCRUM-527).
create table if not exists public.ingest_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key_hash text not null check (char_length(key_hash) between 1 and 200),
  label text not null check (char_length(btrim(label)) between 1 and 100),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingest_keys_key_hash_key unique (key_hash)
);

create index if not exists ingest_keys_org
  on public.ingest_keys (organization_id);

-- ─── 11. updated_at ──────────────────────────────────────────────────────────
-- public.set_updated_at() existe desde 20260903080000_field_definitions.
drop trigger if exists webinar_launches_updated_at on public.webinar_launches;
create trigger webinar_launches_updated_at
  before update on public.webinar_launches
  for each row execute function public.set_updated_at();

drop trigger if exists webinar_sessions_updated_at on public.webinar_sessions;
create trigger webinar_sessions_updated_at
  before update on public.webinar_sessions
  for each row execute function public.set_updated_at();

drop trigger if exists launch_ad_campaigns_updated_at on public.launch_ad_campaigns;
create trigger launch_ad_campaigns_updated_at
  before update on public.launch_ad_campaigns
  for each row execute function public.set_updated_at();

drop trigger if exists launch_products_updated_at on public.launch_products;
create trigger launch_products_updated_at
  before update on public.launch_products
  for each row execute function public.set_updated_at();

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

drop trigger if exists landing_events_updated_at on public.landing_events;
create trigger landing_events_updated_at
  before update on public.landing_events
  for each row execute function public.set_updated_at();

drop trigger if exists launch_registrations_updated_at on public.launch_registrations;
create trigger launch_registrations_updated_at
  before update on public.launch_registrations
  for each row execute function public.set_updated_at();

drop trigger if exists ingest_keys_updated_at on public.ingest_keys;
create trigger ingest_keys_updated_at
  before update on public.ingest_keys
  for each row execute function public.set_updated_at();

-- ─── 12. RLS ─────────────────────────────────────────────────────────────────
alter table public.webinar_launches enable row level security;
alter table public.webinar_sessions enable row level security;
alter table public.launch_ad_campaigns enable row level security;
alter table public.launch_products enable row level security;
alter table public.leads enable row level security;
alter table public.launch_registrations enable row level security;
alter table public.landing_visits enable row level security;
alter table public.lead_events enable row level security;
alter table public.ingest_keys enable row level security;
alter table public.landing_events enable row level security;

-- Lectura para los miembros de la organización (no ingest_keys ni landing_events).
drop policy if exists "Org members read webinar_launches" on public.webinar_launches;
create policy "Org members read webinar_launches"
  on public.webinar_launches for select to authenticated
  using (organization_id = public.get_my_organization_id());

drop policy if exists "Org members read webinar_sessions" on public.webinar_sessions;
create policy "Org members read webinar_sessions"
  on public.webinar_sessions for select to authenticated
  using (organization_id = public.get_my_organization_id());

drop policy if exists "Org members read launch_ad_campaigns" on public.launch_ad_campaigns;
create policy "Org members read launch_ad_campaigns"
  on public.launch_ad_campaigns for select to authenticated
  using (organization_id = public.get_my_organization_id());

drop policy if exists "Org members read launch_products" on public.launch_products;
create policy "Org members read launch_products"
  on public.launch_products for select to authenticated
  using (organization_id = public.get_my_organization_id());

drop policy if exists "Org members read leads" on public.leads;
create policy "Org members read leads"
  on public.leads for select to authenticated
  using (organization_id = public.get_my_organization_id());

drop policy if exists "Org members read launch_registrations" on public.launch_registrations;
create policy "Org members read launch_registrations"
  on public.launch_registrations for select to authenticated
  using (organization_id = public.get_my_organization_id());

drop policy if exists "Org members read landing_visits" on public.landing_visits;
create policy "Org members read landing_visits"
  on public.landing_visits for select to authenticated
  using (organization_id = public.get_my_organization_id());

drop policy if exists "Org members read lead_events" on public.lead_events;
create policy "Org members read lead_events"
  on public.lead_events for select to authenticated
  using (organization_id = public.get_my_organization_id());

-- Escritura de la configuración del lanzamiento: founder o admin.
drop policy if exists "Founders and admins insert webinar_launches" on public.webinar_launches;
create policy "Founders and admins insert webinar_launches"
  on public.webinar_launches for insert to authenticated
  with check (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder', 'admin'])
  );
drop policy if exists "Founders and admins update webinar_launches" on public.webinar_launches;
create policy "Founders and admins update webinar_launches"
  on public.webinar_launches for update to authenticated
  using (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder', 'admin'])
  )
  with check (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder', 'admin'])
  );
drop policy if exists "Founders and admins delete webinar_launches" on public.webinar_launches;
create policy "Founders and admins delete webinar_launches"
  on public.webinar_launches for delete to authenticated
  using (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder', 'admin'])
  );

drop policy if exists "Founders and admins insert webinar_sessions" on public.webinar_sessions;
create policy "Founders and admins insert webinar_sessions"
  on public.webinar_sessions for insert to authenticated
  with check (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder', 'admin'])
  );
drop policy if exists "Founders and admins update webinar_sessions" on public.webinar_sessions;
create policy "Founders and admins update webinar_sessions"
  on public.webinar_sessions for update to authenticated
  using (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder', 'admin'])
  )
  with check (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder', 'admin'])
  );
drop policy if exists "Founders and admins delete webinar_sessions" on public.webinar_sessions;
create policy "Founders and admins delete webinar_sessions"
  on public.webinar_sessions for delete to authenticated
  using (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder', 'admin'])
  );

drop policy if exists "Founders and admins insert launch_ad_campaigns" on public.launch_ad_campaigns;
create policy "Founders and admins insert launch_ad_campaigns"
  on public.launch_ad_campaigns for insert to authenticated
  with check (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder', 'admin'])
  );
drop policy if exists "Founders and admins update launch_ad_campaigns" on public.launch_ad_campaigns;
create policy "Founders and admins update launch_ad_campaigns"
  on public.launch_ad_campaigns for update to authenticated
  using (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder', 'admin'])
  )
  with check (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder', 'admin'])
  );
drop policy if exists "Founders and admins delete launch_ad_campaigns" on public.launch_ad_campaigns;
create policy "Founders and admins delete launch_ad_campaigns"
  on public.launch_ad_campaigns for delete to authenticated
  using (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder', 'admin'])
  );

drop policy if exists "Founders and admins insert launch_products" on public.launch_products;
create policy "Founders and admins insert launch_products"
  on public.launch_products for insert to authenticated
  with check (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder', 'admin'])
  );
drop policy if exists "Founders and admins update launch_products" on public.launch_products;
create policy "Founders and admins update launch_products"
  on public.launch_products for update to authenticated
  using (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder', 'admin'])
  )
  with check (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder', 'admin'])
  );
drop policy if exists "Founders and admins delete launch_products" on public.launch_products;
create policy "Founders and admins delete launch_products"
  on public.launch_products for delete to authenticated
  using (
    organization_id = public.get_my_organization_id()
    and public.current_user_has_org_role(array['founder', 'admin'])
  );

-- ─── 13. Grants ──────────────────────────────────────────────────────────────
-- En Supabase las tablas nuevas nacen con GRANT ALL a anon y authenticated
-- (default privileges): se revoca todo y se da sólo lo que cada tabla necesita.
revoke all on
  public.webinar_launches, public.webinar_sessions, public.launch_ad_campaigns,
  public.launch_products, public.leads, public.launch_registrations,
  public.landing_visits, public.lead_events, public.ingest_keys, public.landing_events
  from anon, authenticated;

grant select, insert, update, delete on
  public.webinar_launches, public.webinar_sessions, public.launch_ad_campaigns,
  public.launch_products, public.leads, public.launch_registrations,
  public.landing_visits, public.lead_events, public.ingest_keys, public.landing_events
  to service_role;

-- Lectura (la policy filtra por organización).
grant select on
  public.webinar_launches, public.webinar_sessions, public.launch_ad_campaigns,
  public.launch_products, public.leads, public.launch_registrations,
  public.landing_visits, public.lead_events
  to authenticated;

-- Configuración del lanzamiento (la policy exige founder o admin). En
-- webinar_launches, id, public_id y created_at los pone la base y nadie los
-- cambia; organization_id se da al crear y no se mueve.
grant insert (organization_id, name, variant, offer_price, currency, capture_starts_on,
              closes_on, goal_sales, goal_revenue, status, closed_at)
  on public.webinar_launches to authenticated;
grant update (name, variant, offer_price, currency, capture_starts_on,
              closes_on, goal_sales, goal_revenue, status, closed_at)
  on public.webinar_launches to authenticated;
grant delete on public.webinar_launches to authenticated;
grant insert, update, delete on
  public.webinar_sessions, public.launch_ad_campaigns, public.launch_products
  to authenticated;

-- ─── 14. Realtime ────────────────────────────────────────────────────────────
-- La pantalla del lanzamiento muestra los registros a medida que llegan.
-- Mismo patrón que 20260711100000_business_context_realtime.sql.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'launch_registrations'
  ) then
    alter publication supabase_realtime add table public.launch_registrations;
  end if;
end $$;

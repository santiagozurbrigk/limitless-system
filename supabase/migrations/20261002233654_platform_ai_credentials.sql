-- Clave de Claude de la plataforma, para el trabajo de super-admin (SCRUM-7 / SCRUM-71).
--
-- ⭐ Regla: sin clave propia, no hay IA. Cada organización usa sólo la clave que
-- cargó en Ajustes → IA, y el trabajo de plataforma (resúmenes del cerebro global
-- en super-admin) usa ésta. Antes caía a `ANTHROPIC_API_KEY` (nunca cargada en
-- producción) y, si faltaba, a la clave de una organización cliente.
--
-- Una sola fila (id = 1). El valor va cifrado con `ENCRYPTION_MASTER_KEY`
-- (`lib/security/encryption.ts`, campo `platform_ai_credentials.claude_api_key_encrypted`).

create table if not exists public.platform_ai_credentials (
  id smallint primary key default 1 check (id = 1),
  claude_api_key_encrypted text,
  claude_api_key_status text not null default 'none'
    check (claude_api_key_status in ('none', 'valid', 'valid_no_credits', 'invalid')),
  claude_api_key_last_validated_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- Sólo el service role. Ni la sesión del navegador del super admin lo lee: se
-- carga y se consulta desde el servidor, después de `requireSuperAdmin()`.
alter table public.platform_ai_credentials enable row level security;
revoke all on public.platform_ai_credentials from anon, authenticated;

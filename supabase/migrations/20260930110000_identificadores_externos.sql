-- [SEG-RLS-IDENTIFICADORES-EXTERNOS] (SCRUM-82): el identificador de la cuenta
-- externa que decide a qué organización va cada evento entrante sólo lo
-- escribe el sistema.
--
-- Con service role, el sistema elige la org de cada evento por:
--   - `discord_integrations.guild_id` (bot de Discord, `getOrgByGuildId`);
--   - `unipile_integrations.unipile_account_id` + `status` (DMs de Unipile);
--   - `ghl_integrations.location_id` (eventos de GoHighLevel).
-- Las policies de esas tablas son por organización y `authenticated` tenía
-- INSERT/UPDATE: cualquier miembro, con su JWT, podía escribir el
-- identificador de una cuenta de otra org y desviarle (o hacerle perder) los
-- mensajes. La app escribe esas columnas sólo con service role, al conectar.
--
-- Qué escribe la app con el cliente de usuario (y por eso se conserva):
--   - Discord: nombre y foto del bot, canales monitoreados, patrón de
--     monitoreo, `bot_can_speak`, `status` al desconectar (app/discord/actions.ts).
--   - Unipile y GHL: nada; todo va con service role.

-- ─── 1. Unipile y GHL: los usuarios no insertan ni modifican ─────────────────
revoke insert, update on public.unipile_integrations from anon, authenticated;
revoke insert, update on public.ghl_integrations from anon, authenticated;

-- ─── 2. Discord: todo menos el servidor y la organización ────────────────────
-- Revocar a nivel tabla también saca los grants por columna. Después se
-- devuelve UPDATE columna por columna, con las que existan al aplicar (así
-- vale aunque producción tenga columnas que el repo no conoce).
revoke insert, update on public.discord_integrations from anon, authenticated;

do $$
declare
  v_col text;
begin
  for v_col in
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'discord_integrations'
      and column_name not in ('id', 'organization_id', 'guild_id', 'created_at')
  loop
    execute format('grant update (%I) on public.discord_integrations to authenticated', v_col);
  end loop;
end $$;

-- ─── 3. Una cuenta externa conectada, en una sola organización ───────────────
-- `guild_id` ya es único global. `unipile_account_id` sólo era único por org, y
-- `location_id` de GHL no tenía índice: dos filas con el mismo valor hacían
-- fallar el `maybeSingle` que elige la org y los eventos se perdían.
create unique index if not exists unipile_integrations_cuenta_conectada_unica
  on public.unipile_integrations (unipile_account_id)
  where status = 'connected';

create unique index if not exists ghl_integrations_location_unica
  on public.ghl_integrations (location_id)
  where location_id is not null;

-- ─── 4. Autoverificación ─────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1
    from (values
      ('discord_integrations', 'guild_id'),
      ('discord_integrations', 'organization_id'),
      ('unipile_integrations', 'unipile_account_id'),
      ('unipile_integrations', 'status'),
      ('unipile_integrations', 'organization_id'),
      ('ghl_integrations', 'location_id'),
      ('ghl_integrations', 'organization_id')
    ) as c(tabla, columna)
    cross join (values ('anon'), ('authenticated')) as r(rol)
    cross join (values ('INSERT'), ('UPDATE')) as p(priv)
    where has_column_privilege(r.rol, format('public.%I', c.tabla), c.columna, p.priv)
  ) then
    raise exception 'Queda escritura de usuarios sobre un identificador de cuenta externa';
  end if;
end $$;

-- SCRUM-523 · Limitless Webinars (Fase 0): tipo de experiencia por organización.
--
-- `organizations.experience` dice qué producto ve la organización:
--   - 'full': Limitless completo, todos los módulos de siempre. Las
--     organizaciones que existen al aplicar esta migración quedan acá y no
--     cambia nada para ellas.
--   - 'webinar': Limitless Webinars. Toda organización nueva nace así por el
--     default de la columna (decisión del PO, 19-oct-2026: no lo elige el
--     cliente). La excepción la pone la app: un negocio que un holding crea
--     dentro de su cuenta hereda la experiencia del holding, para que un
--     founder con Limitless completo no pierda el menú al sumar un negocio.
-- Qué cambia en el menú y las rutas con cada valor es SCRUM-524; esta
-- migración sólo guarda el dato.
--
-- Las filas existentes quedan en 'full' porque la columna se agrega con ese
-- default (Postgres lo guarda como valor de las filas actuales sin reescribir
-- la tabla) y, en la misma migración, el default pasa a 'webinar' para las
-- filas nuevas.
--
-- Nadie la cambia desde la app de usuario, igual que `enabled_add_ons`
-- (20260811130000): desde 20260922110000 organizations tiene grants por
-- columna y authenticated sólo puede hacer UPDATE de name, industry,
-- website_url, timezone, currency, language y country. Una columna nueva no
-- entra en esa lista, y no hay policy de INSERT para usuarios. authenticated
-- puede leerla (la necesita el layout de la plataforma, con el cliente de
-- usuario); anon no. El service role la escribe.
--
-- Idempotente: `if not exists`, `drop constraint if exists` y un default que
-- se puede volver a fijar. Se aplica en producción en SCRUM-532.

set local lock_timeout = '5s';

alter table public.organizations
  add column if not exists experience text not null default 'full';

alter table public.organizations
  alter column experience set default 'webinar';

alter table public.organizations
  drop constraint if exists organizations_experience_check;
alter table public.organizations
  add constraint organizations_experience_check
  check (experience in ('webinar', 'full'));

comment on column public.organizations.experience is
  'Producto que ve la organización (SCRUM-523). full: Limitless completo, todos los módulos; las organizaciones que existían antes de Limitless Webinars quedaron en full. webinar: Limitless Webinars; es el default porque toda organización nueva nace en Webinars (decisión del PO, no la elige el cliente), salvo el negocio que un holding crea dentro de su cuenta, que hereda la experiencia del holding (lo pone la app). Sólo la cambia el service role.';

grant select (experience) on public.organizations to authenticated;
revoke update (experience) on public.organizations from anon, authenticated;

-- Si un grant de tabla (o uno por columna de otra migración) le dejara a un
-- usuario cambiar la experiencia, la migración no se aplica.
do $$
begin
  if has_column_privilege('authenticated', 'public.organizations', 'experience', 'UPDATE')
     or has_column_privilege('anon', 'public.organizations', 'experience', 'UPDATE') then
    raise exception 'organizations.experience quedó con UPDATE para anon o authenticated';
  end if;
end $$;

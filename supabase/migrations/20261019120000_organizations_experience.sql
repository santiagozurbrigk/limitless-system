-- SCRUM-523 · Limitless Webinars (Fase 0): tipo de experiencia por organización.
--
-- `organizations.experience` dice qué producto ve la organización:
--   - 'full': Limitless completo, todos los módulos de siempre. Es el default
--     de la columna: las organizaciones que existen al aplicar esta migración
--     quedan acá y no cambia nada para ellas, y un alta que no diga nada
--     también nace así (el lado seguro: nadie pierde módulos por un alta que
--     nadie revisó).
--   - 'webinar': Limitless Webinars. Toda organización nueva nace así
--     (decisión del PO, 19-oct-2026: no lo elige el cliente), pero lo pone la
--     app: cada alta manda el valor explícito. La excepción es un negocio que
--     un holding crea dentro de su cuenta, que hereda la experiencia del
--     holding, para que un founder con Limitless completo no pierda el menú al
--     sumar un negocio.
--   - 'limitless': Limitless de gestión (Clientes, Tablero de trabajo, Ventas y
--     Administración; decisión del PO, 28-oct-2026). Ninguna alta la manda y
--     ninguna organización queda así al aplicar esta migración: se asigna a
--     mano, por SQL con el service role, según la guía de SCRUM-532.
-- Qué cambia en el menú y las rutas con cada valor es SCRUM-524; esta
-- migración sólo guarda el dato. Aplicada sola, no cambia nada para nadie: las
-- altas siguen naciendo en 'full' hasta que se despliegue el código de 523.
--
-- Postgres guarda el default 'full' como valor de las filas actuales sin
-- reescribir la tabla.
--
-- Nadie la cambia desde la app de usuario, igual que `enabled_add_ons`
-- (20260811130000): desde 20260922110000 organizations tiene grants por
-- columna y authenticated sólo puede hacer UPDATE de name, industry,
-- website_url, timezone, currency, language y country. Una columna nueva no
-- entra en esa lista, y no hay policy de INSERT para usuarios. authenticated
-- puede leerla (la necesita el layout de la plataforma, con el cliente de
-- usuario). anon tiene SELECT de toda la tabla desde antes (20260619100000
-- sólo se lo sacó a authenticated), pero las policies de SELECT filtran por
-- get_my_organization_id(), que para anon es null: no ve ninguna fila. El
-- service role la escribe.
--
-- Idempotente: `if not exists` y `drop constraint if exists`. Se aplica en
-- producción en SCRUM-532, en la misma ventana que el deploy del código.

set local lock_timeout = '5s';

alter table public.organizations
  add column if not exists experience text not null default 'full';

alter table public.organizations
  drop constraint if exists organizations_experience_check;
alter table public.organizations
  add constraint organizations_experience_check
  check (experience in ('webinar', 'limitless', 'full'));

comment on column public.organizations.experience is
  'Producto que ve la organización (SCRUM-523). full: Limitless completo, todos los módulos; es el default, así que las organizaciones que existían antes de Limitless Webinars quedaron en full y un alta que no diga nada nace full. webinar: Limitless Webinars; toda organización nueva nace así (decisión del PO, no la elige el cliente) porque cada alta de la app lo manda explícito, salvo el negocio que un holding crea dentro de su cuenta, que hereda la experiencia del holding. limitless: Limitless de gestión (Clientes, Tablero de trabajo, Ventas y Administración); ninguna alta la manda, se asigna por SQL. Sólo la cambia el service role.';

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

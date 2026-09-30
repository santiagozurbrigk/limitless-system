-- [EQUIPO-CUSTOM-ROLE-ORG] (SCRUM-75): un rol custom sólo se asigna dentro de
-- su organización, lo escriba quien lo escriba.
--
-- `profiles.custom_role_id` y `team_invitations.custom_role_id` referencian
-- `team_roles(id)` sin mirar la org. La app ya valida en sus cuatro escrituras
-- (`lib/team/rol-de-la-org.ts`), pero un founder, con su JWT, podía escribir
-- por PostgREST el id de un rol de otra org: el miembro quedaba con un rol que
-- no puede leer (`hasRoleConfigured` en false, sin bloqueo por módulo).
--
-- El trigger corre también para el service role. Sólo mira la fila cuando el
-- rol cambia (o al insertar), así que una fila vieja con un rol ajeno no
-- bloquea otras ediciones.

create or replace function public.validar_rol_de_la_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.custom_role_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.custom_role_id is not distinct from old.custom_role_id then
    return new;
  end if;
  if not exists (
    select 1 from public.team_roles r
    where r.id = new.custom_role_id
      and r.organization_id = new.organization_id
  ) then
    raise exception 'El rol elegido no es de esta organización.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.validar_rol_de_la_org() from public, anon, authenticated;

drop trigger if exists validar_rol_de_la_org on public.profiles;
create trigger validar_rol_de_la_org
  before insert or update of custom_role_id, organization_id on public.profiles
  for each row execute function public.validar_rol_de_la_org();

drop trigger if exists validar_rol_de_la_org on public.team_invitations;
create trigger validar_rol_de_la_org
  before insert or update of custom_role_id, organization_id on public.team_invitations
  for each row execute function public.validar_rol_de_la_org();

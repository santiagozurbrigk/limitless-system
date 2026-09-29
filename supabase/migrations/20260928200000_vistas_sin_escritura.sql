-- [DB-VISTA-CLAUDE-STATUS-ESCRIBIBLE] (SCRUM-9): ninguna vista de public se
-- puede escribir desde la API.
--
-- ⚠️ Los default privileges del proyecto le dan GRANT ALL a `anon` y
-- `authenticated` sobre todo lo que se crea en public, vistas incluidas.
-- `organization_claude_status` corre con los permisos de su dueño (no puede
-- pasar a security_invoker, ver 20260922110000) y es actualizable: con su JWT,
-- cualquier miembro podía hacer DELETE sobre la vista, que borraba la fila de
-- `organizations` sin RLS y, en cascada, todos los datos de su organización.
--
-- Se revoca todo sobre todas las vistas de public (hoy también
-- `workboard_time_by_member`, que no es actualizable pero tenía el grant) y se
-- devuelve la lectura a quien la tenía. `supabase/ci/check-migrations.sh`
-- falla si una vista nueva vuelve a quedar con escritura.
do $$
declare
  v record;
  r text;
  can_read boolean;
begin
  for v in
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    -- REVOKE ALL y se devuelve sólo la lectura a quien la tenía: además de la
    -- escritura saca MAINTAIN (Postgres 17), REFERENCES y TRIGGER, y no depende
    -- de la versión.
    foreach r in array array['anon', 'authenticated'] loop
      can_read := has_table_privilege(r, v.oid, 'SELECT');
      execute format('revoke all on public.%I from %I', v.relname, r);
      if can_read then
        execute format('grant select on public.%I to %I', v.relname, r);
      end if;
    end loop;
  end loop;

  -- Si quien corre la migración no es dueño de una vista (o el grant lo dio
  -- otro rol), el revoke sólo avisa con un WARNING y el hueco queda abierto.
  -- Acá se comprueba el resultado para que la migración falle en ese caso.
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) r(rolname)
    where n.nspname = 'public' and c.relkind in ('v', 'm')
      and (has_table_privilege(r.rolname, c.oid, 'DELETE')
        or has_table_privilege(r.rolname, c.oid, 'TRUNCATE')
        or has_any_column_privilege(r.rolname, c.oid, 'INSERT')
        or has_any_column_privilege(r.rolname, c.oid, 'UPDATE'))
  ) then
    raise exception 'Queda alguna vista de public con escritura para anon/authenticated: revisar dueño y grantor';
  end if;
end $$;

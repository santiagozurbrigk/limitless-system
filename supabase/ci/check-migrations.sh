#!/usr/bin/env bash
# Arma una base desde cero con todas las migraciones de supabase/migrations.
#
# Lo corre el job `migrations` del CI y se puede correr a mano contra cualquier
# Postgres con pgvector:
#
#   PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres supabase/ci/check-migrations.sh
#
# Falla si:
#   - un archivo no sigue el formato <14 dígitos>_<nombre>.sql
#   - dos archivos comparten versión (la CLI de Supabase las registra por versión)
#   - alguna migración no corre, cada una en su propia transacción como hace
#     `supabase db push`
#   - alguna vista de public queda con INSERT/UPDATE/DELETE/TRUNCATE para
#     anon o authenticated
#
# Existe porque el 2026-09-22 tres migraciones del repo no corrían desde cero y
# nadie se había enterado: producción se había armado en parte a mano.
set -euo pipefail

cd "$(dirname "$0")/.."
MIGRATIONS_DIR="migrations"
DB_NAME="${CHECK_DB_NAME:-migrations_check}"

fail() { echo "::error::$*" >&2; exit 1; }

# ─── 1. Nombres y versiones ──────────────────────────────────────────────────
bad_names=$(ls "$MIGRATIONS_DIR" | grep -Ev '^[0-9]{14}_[a-z0-9_]+\.sql$' || true)
[ -z "$bad_names" ] || fail "Archivos con nombre inválido en $MIGRATIONS_DIR (formato: <14 dígitos>_<nombre_snake>.sql): $bad_names"

dup_versions=$(ls "$MIGRATIONS_DIR" | cut -d_ -f1 | sort | uniq -d)
[ -z "$dup_versions" ] || fail "Versiones repetidas en $MIGRATIONS_DIR: $dup_versions"

total=$(ls "$MIGRATIONS_DIR" | wc -l | tr -d ' ')
echo "Nombres OK: $total migraciones, versiones únicas."

# ─── 2. Base limpia ──────────────────────────────────────────────────────────
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB_NAME" -c "create database $DB_NAME"
psql -v ON_ERROR_STOP=1 -q -d "$DB_NAME" -f ci/supabase-stubs.sql
echo "Base $DB_NAME creada con los stubs de Supabase."

# ─── 3. Migraciones, en orden, una transacción cada una ──────────────────────
applied=0
for file in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  if ! output=$(psql -v ON_ERROR_STOP=1 -q --single-transaction -d "$DB_NAME" -f "$file" 2>&1); then
    echo "$output" >&2
    fail "La migración $(basename "$file") no corre sobre una base armada desde cero (aplicadas antes: $applied)."
  fi
  applied=$((applied + 1))
done

echo "OK: las $applied migraciones arman la base desde cero."

# ─── 4. Vistas sin escritura para la API ─────────────────────────────────────
# Los default privileges dan GRANT ALL a anon y authenticated sobre las vistas
# nuevas. Una vista que corre con los permisos de su dueño y es actualizable
# deja escribir la tabla de abajo sin RLS ([DB-VISTA-CLAUDE-STATUS-ESCRIBIBLE]).
writable_views=$(psql -v ON_ERROR_STOP=1 -At -d "$DB_NAME" -c "
  select c.relname || ' (' || r.rolname || ': ' || p.priv || ')'
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) r(rolname)
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
  where n.nspname = 'public' and c.relkind in ('v', 'm')
    and (has_table_privilege(r.rolname, c.oid, p.priv)
      or (p.priv in ('INSERT', 'UPDATE') and has_any_column_privilege(r.rolname, c.oid, p.priv)))
  order by 1")
[ -z "$writable_views" ] || fail "Vistas de public con escritura para anon/authenticated (revocarla en la migración que crea la vista): $writable_views"

echo "OK: ninguna vista de public tiene escritura para anon ni authenticated."

#!/usr/bin/env bash
# Dump de la base de producción, cifrado. Lo corre .github/workflows/backup-produccion.yml.
#
# Variables:
#   SUPABASE_DB_URL    connection string del Session pooler (Supabase → Connect)
#   BACKUP_PASSPHRASE  clave del cifrado (gpg simétrico); sin ella no se puede abrir
set -euo pipefail

: "${SUPABASE_DB_URL:?Falta el secreto SUPABASE_DB_URL}"
: "${BACKUP_PASSPHRASE:?Falta el secreto BACKUP_PASSPHRASE}"

fecha="$(date -u +%Y%m%dT%H%MZ)"
trabajo="$(mktemp -d)"
trap 'rm -rf "$trabajo"' EXIT
mkdir -p salida

supabase db dump --db-url "$SUPABASE_DB_URL" -f "$trabajo/roles.sql" --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$trabajo/schema.sql"
# Las exclusiones son las de la guía oficial (guides/platform/migrating-within-supabase/backup-restore).
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$trabajo/data.sql" --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes"

# Un dump vacío o cortado no es un backup: que falle el job.
for f in roles schema data; do
  if [ ! -s "$trabajo/$f.sql" ]; then
    echo "El dump $f.sql salió vacío" >&2
    exit 1
  fi
done
grep -Eq 'COPY "?public"?\."?organizations"?' "$trabajo/data.sql" || {
  echo "data.sql no tiene la tabla organizations: dump incompleto" >&2
  exit 1
}

tar -C "$trabajo" -czf "$trabajo/base-$fecha.tar.gz" roles.sql schema.sql data.sql
gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 \
  --symmetric --cipher-algo AES256 \
  -o "salida/base-$fecha.tar.gz.gpg" "$trabajo/base-$fecha.tar.gz" 3<<<"$BACKUP_PASSPHRASE"

ls -lh salida

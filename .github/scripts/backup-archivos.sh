#!/usr/bin/env bash
# Copia cifrada de los buckets de Storage que no se pueden reconstruir.
# Lo corre .github/workflows/backup-produccion.yml.
#
# Los backups de Supabase (aun en plan pago) nunca incluyen Storage. `trial-reels`,
# `content-thumbnails` y `avatars` no van: se regeneran desde Drive/Zernio o son triviales.
#
# Variables:
#   SUPABASE_URL               https://<ref>.supabase.co
#   SUPABASE_DB_URL            para listar los objetos (storage.objects)
#   SUPABASE_SERVICE_ROLE_KEY  para bajarlos (los buckets son privados)
#   BACKUP_PASSPHRASE          clave del cifrado
set -euo pipefail

: "${SUPABASE_URL:?Falta SUPABASE_URL}"
: "${SUPABASE_DB_URL:?Falta el secreto SUPABASE_DB_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Falta el secreto SUPABASE_SERVICE_ROLE_KEY}"
: "${BACKUP_PASSPHRASE:?Falta el secreto BACKUP_PASSPHRASE}"

BUCKETS="'ai-brain-documents','business-context-documents','sop-videos','client-payment-receipts','client-wins','agent-documents'"

fecha="$(date -u +%Y%m%dT%H%MZ)"
trabajo="$(mktemp -d)"
trap 'rm -rf "$trabajo"' EXIT
mkdir -p salida "$trabajo/archivos"

psql "$SUPABASE_DB_URL" -At -F $'\t' -c \
  "select bucket_id, name from storage.objects where bucket_id in ($BUCKETS) order by 1, 2" \
  > "$trabajo/lista.tsv"

total=$(wc -l < "$trabajo/lista.tsv")
echo "Objetos a copiar: $total"
fallidos=0

while IFS=$'\t' read -r bucket nombre; do
  [ -n "$nombre" ] || continue
  ruta=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe="/"))' "$nombre")
  destino="$trabajo/archivos/$bucket/$nombre"
  mkdir -p "$(dirname "$destino")"
  if ! curl -sS --fail --retry 2 --max-time 300 \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -o "$destino" "$SUPABASE_URL/storage/v1/object/$bucket/$ruta"; then
    echo "No se pudo bajar: $bucket/$nombre" >&2
    fallidos=$((fallidos + 1))
  fi
done < "$trabajo/lista.tsv"

cp "$trabajo/lista.tsv" "$trabajo/archivos/LISTA.tsv"

# Una copia con huecos se sube igual (sirve más que nada), pero el job queda en rojo.
tar -C "$trabajo/archivos" -cf "$trabajo/archivos-$fecha.tar" .
gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 \
  --symmetric --cipher-algo AES256 --compress-algo none \
  -o "salida/archivos-$fecha.tar.gpg" "$trabajo/archivos-$fecha.tar" 3<<<"$BACKUP_PASSPHRASE"

ls -lh salida
if [ "$fallidos" -gt 0 ]; then
  echo "$fallidos de $total objetos no se pudieron bajar" >&2
  exit 1
fi

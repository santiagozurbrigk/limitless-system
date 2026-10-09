#!/usr/bin/env bash
# Manda un aviso al canal de alertas de Discord, si DISCORD_WEBHOOK_ALERTAS existe.
set -euo pipefail
mensaje="$1"
if [ -z "${DISCORD_WEBHOOK_ALERTAS:-}" ]; then
  echo "DISCORD_WEBHOOK_ALERTAS no está configurado: el aviso queda sólo en GitHub."
  exit 0
fi
jq -n --arg texto "$mensaje" '{content: $texto}' |
  curl -sS --fail --max-time 15 -H 'Content-Type: application/json' -d @- \
    "$DISCORD_WEBHOOK_ALERTAS" >/dev/null

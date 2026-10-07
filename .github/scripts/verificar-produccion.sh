#!/usr/bin/env bash
# Verifica que producción tenga desplegado el commit esperado de `main`
# (SCRUM-85 · [MONITOREO-Y-ALERTAS]). Lo corre .github/workflows/produccion-al-dia.yml.
#
# Del 3 al 5 de octubre de 2026 Vercel perdió el acceso al repo, no desplegó 7 PRs
# en 36 horas y nadie se enteró: el CI daba verde porque no mira el deploy. Este
# script consulta GET /api/health, que devuelve el commit desplegado
# (`version.commit`, 7 caracteres), y espera hasta PLAZO_SEGUNDOS a que coincida
# con SHA_ESPERADO. Si producción tiene un commit posterior (otro merge llegó
# antes), también está al día. Si no coincide a tiempo, sale con 1 y un mensaje
# claro; si además existe DISCORD_WEBHOOK_ALERTAS, avisa en ese canal.
#
# Variables:
#   URL_SALUD           URL completa de /api/health (obligatoria)
#   SHA_ESPERADO        commit de main que tiene que estar desplegado (obligatoria)
#   PLAZO_SEGUNDOS      cuánto esperar el deploy (por defecto 1200 = 20 min)
#   INTERVALO_SEGUNDOS  cada cuánto volver a consultar (por defecto 30)
#   DISCORD_WEBHOOK_ALERTAS  webhook de Discord (opcional)
#
# Sin tokens de Vercel: sólo mira lo que responde producción.
set -euo pipefail

URL_SALUD="${URL_SALUD:?Falta URL_SALUD}"
SHA_ESPERADO="${SHA_ESPERADO:?Falta SHA_ESPERADO}"
PLAZO_SEGUNDOS="${PLAZO_SEGUNDOS:-1200}"
INTERVALO_SEGUNDOS="${INTERVALO_SEGUNDOS:-30}"

if ! printf '%s' "$SHA_ESPERADO" | grep -Eq '^[0-9a-fA-F]{7,40}$'; then
  echo "::error::SHA_ESPERADO no es un commit (7 a 40 caracteres hexadecimales)."
  exit 2
fi
if ! printf '%s' "$PLAZO_SEGUNDOS$INTERVALO_SEGUNDOS" | grep -Eq '^[0-9]+$'; then
  echo "::error::PLAZO_SEGUNDOS e INTERVALO_SEGUNDOS tienen que ser números de segundos."
  exit 2
fi

esperado="$(printf '%s' "$SHA_ESPERADO" | tr 'A-F' 'a-f' | cut -c1-7)"
inicio="$(date +%s)"
ultimo="sin respuesta todavía"

# ¿El commit desplegado es posterior al esperado? Sólo se puede saber con la
# historia de git disponible (el workflow hace checkout); si no, se asume que no.
es_posterior() {
  local desplegado="$1"
  git rev-parse --verify --quiet "${desplegado}^{commit}" >/dev/null 2>&1 &&
    git merge-base --is-ancestor "$SHA_ESPERADO" "$desplegado" 2>/dev/null
}

avisar_en_discord() {
  local mensaje="$1"
  if [ -z "${DISCORD_WEBHOOK_ALERTAS:-}" ]; then
    echo "DISCORD_WEBHOOK_ALERTAS no está configurado: el aviso queda sólo en GitHub."
    return 0
  fi
  if jq -n --arg texto "$mensaje" '{content: $texto}' |
    curl -sS --fail --max-time 15 -H 'Content-Type: application/json' -d @- \
      "$DISCORD_WEBHOOK_ALERTAS" >/dev/null; then
    echo "Aviso enviado a Discord."
  else
    echo "::warning::No se pudo avisar en Discord (revisar el secreto DISCORD_WEBHOOK_ALERTAS)."
  fi
}

while true; do
  cuerpo="$(mktemp)"
  # El parámetro `t` evita cualquier caché intermedia.
  estado_http="$(curl -sS --max-time 15 -o "$cuerpo" -w '%{http_code}' \
    -H 'Cache-Control: no-cache' "${URL_SALUD}?t=$(date +%s)" 2>/dev/null || true)"
  desplegado="$(jq -r '.version.commit // empty' "$cuerpo" 2>/dev/null || true)"
  salud="$(jq -r '.status // empty' "$cuerpo" 2>/dev/null || true)"
  rm -f "$cuerpo"

  if [ -n "$desplegado" ]; then
    ultimo="commit ${desplegado} (estado ${salud:-desconocido}, HTTP ${estado_http})"
    if [ "$desplegado" = "$esperado" ]; then
      echo "Producción está al día: tiene ${esperado} (estado ${salud:-desconocido})."
      exit 0
    fi
    if es_posterior "$desplegado"; then
      echo "Producción está al día: tiene ${desplegado}, posterior a ${esperado}."
      exit 0
    fi
  else
    ultimo="sin versión en la respuesta (HTTP ${estado_http:-000})"
  fi

  transcurrido=$(( $(date +%s) - inicio ))
  if [ "$transcurrido" -ge "$PLAZO_SEGUNDOS" ]; then
    break
  fi
  echo "Esperando el deploy de ${esperado}: producción responde ${ultimo} (${transcurrido} s de ${PLAZO_SEGUNDOS} s)."
  sleep "$INTERVALO_SEGUNDOS"
done

if [ "$PLAZO_SEGUNDOS" -ge 60 ]; then espera="$(( PLAZO_SEGUNDOS / 60 )) min"; else espera="${PLAZO_SEGUNDOS} s"; fi
mensaje="Producción no está al día: main está en ${esperado} y después de ${espera} ${URL_SALUD} responde ${ultimo}. Revisar en Vercel > Deployments que el proyecto siga conectado al repo y que el último deploy de main esté READY (docs/operacion/alertas.md)."
echo "::error title=Producción desactualizada::${mensaje}"
avisar_en_discord "$mensaje"
exit 1

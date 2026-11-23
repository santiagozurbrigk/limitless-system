#!/usr/bin/env bash
# Vuelve a bajar y regenerar docs/external-apis/ desde las fuentes públicas.
#
#   ./docs/external-apis/tools/regenerar.sh            # todos los proveedores
#   ./docs/external-apis/tools/regenerar.sh whop hyros # sólo algunos
#
# Proveedores: gohighlevel vturb whop commas hyros webinarjam zoom
#
# Requiere: python3 con beautifulsoup4, lxml, pyyaml y playwright
#   python3 -m pip install beautifulsoup4 lxml pyyaml playwright
# Chromium ya está en la imagen (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers);
# no correr "playwright install".
#
# Deja el HTML crudo cacheado en $WORK (por defecto tools/.work), así que una
# segunda corrida no vuelve a pegarle a los servidores.
set -euo pipefail

TOOLS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$TOOLS/.." && pwd)"
export WORK="${WORK:-$TOOLS/.work}"
FECHA="${FECHA:-$(date +%F)}"
mkdir -p "$WORK/raw" "$WORK/hyros-ai" "$WORK/whop-specs" "$WORK/zoom-specs"

TODOS="gohighlevel vturb whop commas hyros webinarjam zoom"
QUE="${*:-$TODOS}"
quiere() { [[ " $QUE " == *" $1 "* ]]; }

# ─────────────────────────────────────────────────────────── GoHighLevel
if quiere gohighlevel; then
  echo "==> GoHighLevel: sitemap"
  curl -sSL --max-time 60 "https://marketplace.gohighlevel.com/docs/sitemap.xml" \
    | grep -o '<loc>[^<]*</loc>' | sed 's|<loc>||;s|</loc>||;s|/$||' \
    | grep -vE '/docs/(2021-04-15|2021-07-28|2023-02-21|tags|blog|markdown-page)(/|$)' \
    | sort -u > "$WORK/ghl-urls.new.txt"
  if ! diff -q "$TOOLS/ghl-urls.txt" "$WORK/ghl-urls.new.txt" >/dev/null; then
    echo "    el sitemap cambió; se actualiza ghl-urls.txt"
    diff "$TOOLS/ghl-urls.txt" "$WORK/ghl-urls.new.txt" || true
    cp "$WORK/ghl-urls.new.txt" "$TOOLS/ghl-urls.txt"
  fi
  echo "==> GoHighLevel: descarga y conversión"
  python3 "$TOOLS/fetch.py" "$TOOLS/ghl-urls.txt"
  rm -rf "$ROOT"/gohighlevel/{ghl,webhook,oauth,Authorization,other,marketplace-modules,MarketplacePolicies,sdk,category}
  python3 "$TOOLS/build_ghl.py" "$ROOT/gohighlevel" "$FECHA"
  python3 "$TOOLS/index_ghl.py" "$ROOT/gohighlevel"
fi

# ───────────────────────────────────────────────────────────────── VTurb
if quiere vturb; then
  echo "==> VTurb: GitBook sirve markdown agregando .md a la URL"
  for p in bem-vindo-a-api-do-analytics-do-vturb autenticacao-da-api analytics release-notes; do
    curl -sSL --max-time 60 "https://vturb.gitbook.io/analytics-api/pt/$p.md" -o "$WORK/raw/vturb-pt-$p.md"
  done
  for p in "" api-authentication analytics release-notes; do
    curl -sSL --max-time 60 "https://vturb.gitbook.io/analytics-api/$p.md" -o "$WORK/raw/vturb-en-${p:-index}.md"
  done
  curl -sSL --max-time 60 "https://vturb.gitbook.io/analytics-api/llms.txt" -o "$WORK/raw/vturb-llms.txt"
  python3 "$TOOLS/merge_vturb.py" "$WORK/raw/vturb-en-analytics.md" "$WORK/vturb-openapi.json"
  python3 "$TOOLS/build_vturb.py" "$ROOT/vturb" "$FECHA"
fi

# ────────────────────────────────────────────────────────────────── Whop
if quiere whop; then
  echo "==> Whop: sitemap + specs OpenAPI oficiales"
  curl -sSL --max-time 60 "https://docs.whop.com/sitemap.xml" \
    | grep -o '<loc>[^<]*</loc>' | sed 's|<loc>||;s|</loc>||' \
    | sed 's|$|.md|;s|/\.md$|/index.md|' | sort -u > "$WORK/whop-urls.new.txt"
  if ! diff -q "$TOOLS/whop-urls.txt" "$WORK/whop-urls.new.txt" >/dev/null; then
    echo "    el sitemap cambió; se actualiza whop-urls.txt"
    cp "$WORK/whop-urls.new.txt" "$TOOLS/whop-urls.txt"
  fi
  for f in api-v1-native.json api-v1-stable.json ledger-stats.yaml; do
    curl -sSL --max-time 120 "https://docs.whop.com/openapi/$f" -o "$WORK/whop-specs/$f"
  done
  python3 "$TOOLS/fetch_plain.py" "$TOOLS/whop-urls.txt" cache-whop
  rm -rf "$ROOT"/whop/{api-reference,developer,elements,sdk,manage-your-business,payments-and-billing,supported-business-models,apps,pay-users,accounts}
  python3 "$TOOLS/build_whop.py" "$ROOT/whop" "$FECHA"
fi

# ──────────────────────────────────────────────────────────────── Commas
if quiere commas; then
  echo "==> Commas: SPA de una sola página, se renderiza con Chromium"
  printf '/\n' > "$WORK/commas-home.txt"
  rm -rf "$WORK/cache-commas"
  python3 "$TOOLS/render.py" "https://commasdocs.com" "$WORK/commas-home.txt" cache-commas "body"
  python3 "$TOOLS/build_commas.py" "$ROOT/commas" "$FECHA"
fi

# ───────────────────────────────────────────────────────────────── Hyros
if quiere hyros; then
  echo "==> Hyros: specs OpenAPI + guías renderizadas"
  for f in rest-api webhooks mcp; do
    curl -sSL --max-time 90 "https://api-docs.hyros.com/ai-context/$f.txt" -o "$WORK/hyros-ai/$f.txt"
  done
  curl -sSL --max-time 90 "https://hyros.docs.apiary.io/api-description-document" -o "$WORK/hyros-apiary.raw"
  python3 "$TOOLS/render.py" "https://docs.hyros.com" "$TOOLS/hyros-routes.txt" cache-hyros "main"
  # las tarjetas "View guide" enlazan páginas que no están en ninguna lista: se
  # crawlean hasta que no aparezcan nuevas
  ( cd "$WORK" && python3 "$TOOLS/crawl_hyros.py" )
  python3 - "$TOOLS/hyros-routes.txt" <<'PY'
import glob, os, sys
rutas = set()
for f in glob.glob(os.path.join(os.environ["WORK"], "cache-hyros", "*.html")):
    u = "https://" + os.path.basename(f)[:-5].replace("__", "/")
    rutas.add(u.split("docs.hyros.com", 1)[1])
open(sys.argv[1], "w").write("\n".join(sorted(rutas)) + "\n")
print("    rutas conocidas:", len(rutas))
PY
  rm -rf "$ROOT/hyros/docs"
  python3 "$TOOLS/build_hyros.py" "$ROOT/hyros" "$FECHA"
fi

# ──────────────────────────────────────────────────────────── WebinarJam
if quiere webinarjam; then
  echo "==> WebinarJam / EverWebinar: artículos del centro de ayuda"
  python3 "$TOOLS/fetch_plain.py" "$TOOLS/webinarjam-urls.txt" cache-wj
  python3 "$TOOLS/build_webinarjam.py" "$ROOT/webinarjam" "$FECHA"
fi

# ────────────────────────────────────────────────────────────────── Zoom
if quiere zoom; then
  echo "==> Zoom: specs OpenAPI oficiales (anunciados en /.well-known/api-catalog.json) + guías .md"
  for prod in meetings marketplace; do
    for tipo in methods events; do
      curl -sSL --max-time 120 "https://developers.zoom.us/api/zoap/$prod/$tipo/" \
        -o "$WORK/zoom-specs/$prod-$tipo.json"
    done
  done
  # las guías se sirven en markdown agregando .md; la lista es a mano (sólo lo que
  # usa Limitless: OAuth, distribución de apps, webhooks, rate limits)
  rm -rf "$WORK/cache-zoom"
  python3 "$TOOLS/fetch_plain.py" "$TOOLS/zoom-urls.txt" cache-zoom
  python3 "$TOOLS/build_zoom.py" "$ROOT/zoom" "$FECHA"
fi

echo "==> índices"
python3 "$TOOLS/make_indexes.py" "$ROOT" "$FECHA"

echo
echo "Listo. Revisar 'git diff' y actualizar la fecha de captura en $ROOT/README.md"

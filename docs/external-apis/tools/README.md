# Herramientas de captura de documentación externa

Scripts que generan todo lo que hay en `docs/external-apis/`. Están acá para que la
copia se pueda **volver a bajar** cuando el proveedor cambie su documentación, sin
tener que reconstruir el proceso de cero.

## Uso

```bash
python3 -m pip install beautifulsoup4 lxml pyyaml playwright
./docs/external-apis/tools/regenerar.sh              # todos los proveedores
./docs/external-apis/tools/regenerar.sh whop hyros   # sólo algunos
git diff docs/external-apis                          # revisar qué cambió del lado del proveedor
```

Proveedores: `gohighlevel` `vturb` `whop` `commas` `hyros` `webinarjam` `zoom`.

El HTML crudo queda cacheado en `tools/.work/` (ignorado por git). Una segunda
corrida no vuelve a pegarle a los servidores salvo por los sitemaps.

**Chromium ya está en la imagen** (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`). No
correr `playwright install`.

## Qué hace cada script

| Script | Qué hace |
|---|---|
| `regenerar.sh` | Orquesta todo. Es el único que hace falta correr. |
| `fetch.py` | Descarga las URLs de una lista, 8 hilos, reintentos con backoff, caché en disco. Guarda con extensión `.html`. |
| `fetch_plain.py` | Igual, pero sin agregar extensión — para URLs que ya terminan en `.md`. |
| `render.py` | Renderiza rutas de una SPA con Chromium y guarda el HTML **ya hidratado**. Necesario para Commas y Hyros, que no sirven HTML. |
| `crawl_hyros.py` | Crawlea docs.hyros.com hasta converger: las tarjetas "View guide" enlazan páginas que no aparecen en ninguna lista. |
| `convert.py` | HTML → Markdown. Entiende Docusaurus, el plugin `docusaurus-plugin-openapi-docs`, los `endpoint-badge` de Commas y HTML genérico. |
| `openapi_md.py` | OpenAPI 3.x → Markdown: índice, parámetros, request body, respuestas, schemas anidados con resolución de `$ref`, y la sección `webhooks:` de 3.1. |
| `build_ghl.py` · `index_ghl.py` | GoHighLevel: páginas + `INDEX.md` + `ENDPOINTS.md`. |
| `merge_vturb.py` · `build_vturb.py` | VTurb: une los 28 documentos OpenAPI embebidos en un solo spec y genera la referencia. |
| `build_whop.py` | Whop: copia los 3 specs oficiales, genera su referencia, y escribe las 897 páginas reemplazando el bloque OpenAPI repetido por un link. |
| `build_commas.py` | Commas: parte el DOM renderizado de la única página en un archivo por `<section id>`. |
| `build_hyros.py` | Hyros: 3 specs + blueprint de Apiary + las guías, reconstruyendo los links de las tarjetas. |
| `build_webinarjam.py` | WebinarJam: los 17 artículos del centro de ayuda, con los links `/*/articles/<id>` reescritos al slug real. |
| `build_zoom.py` | Zoom: copia los 4 specs oficiales (Meetings y Marketplace, métodos y eventos), genera la referencia recortada a webinars/reportes/eventos y agrega front-matter a las guías de `zoom-urls.txt`. |
| `make_indexes.py` | Genera los `INDEX.md` de Whop, Commas, Hyros y WebinarJam. |
| `*-urls.txt`, `hyros-routes.txt` | Listas de URLs por proveedor. `regenerar.sh` las actualiza desde el sitemap (o desde el crawl, en Hyros) y avisa por diff si cambiaron. `zoom-urls.txt` es a mano: el sitio de Zoom tiene más de 1.100 páginas y sólo se bajan las que tocan a Limitless. |

## Decisiones que conviene conocer antes de tocarlos

- **De GoHighLevel se captura sólo la versión *current* (v3).** El sitemap expone
  además `2021-04-15`, `2021-07-28` y `2023-02-21`, pero se verificó que esas tres
  copias son idénticas entre sí y a la current salvo por el valor del header
  `Version`. Capturar las cuatro cuadruplicaría el repo sin agregar información.
- **De VTurb, la fuente de verdad es el `openapi.json`, no el markdown.** GitBook
  sirve cada página como markdown agregando `.md` a la URL, y dentro de la página de
  Analytics cada endpoint viene como un documento OpenAPI 3.0.2 completo. Eso se une
  en un solo spec y de ahí se genera la referencia legible.
- **De Whop, también el spec.** Cada página de `api-reference` re-embebe el spec
  entero: 18 de los 22 MB crudos son ese bloque repetido 548 veces. Whop publica los
  specs en `docs.whop.com/openapi/*`, así que se guardan una sola vez y en cada página
  queda un link a la operación correspondiente.
- **Commas y Hyros necesitan navegador.** Los dos son SPAs que no sirven HTML: Commas
  devuelve el mismo bundle para toda URL y Hyros carga el contenido en chunks. Se
  renderizan con el Chromium de la imagen.
- **Chromium necesita el proxy y TLS 1.2.** `render.py` lo lanza con
  `proxy={"server": $HTTPS_PROXY}` y con
  `--disable-features=EncryptedClientHello,PostQuantumKyber --ssl-version-max=tls1.2`.
  Sin esos flags el handshake TLS con el proxy del entorno se corta
  (`ERR_CONNECTION_RESET`). **No es desactivar la verificación de certificados** —
  la verificación sigue activa contra el CA bundle del entorno.
- **Los links de las tarjetas de Hyros se reconstruyen por título.** Los botones
  "View guide" son handlers de React sin `href`. El build matchea el título de la
  tarjeta contra el título y el slug de las páginas capturadas; **lo que no matchea
  queda como texto, sin link inventado**.
- **Ningún conversor inventa nada.** Si un schema no está expandido en la fuente
  (GoHighLevel deja muchas respuestas como `object`), el markdown también lo deja así.
  Ver la advertencia en `../README.md`.

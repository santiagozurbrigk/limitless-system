# Documentación de APIs externas — copia local

Copia completa y navegable de la documentación pública de las APIs externas contra
las que Limitless integra. Existe porque el entorno remoto de desarrollo **no siempre
alcanza los dominios de documentación**: cuando se escribió
[`apis-sin-documentacion.md`](../integraciones/apis-sin-documentacion.md) los nueve dominios probados
estaban bloqueados, y varias integraciones se construyeron a ciegas por eso.

Teniendo la documentación acá adentro, cualquier sesión de Claude Code o cualquier
desarrollador puede leerla sin depender de la red.

**Fecha de captura: 2026-08-30** (Fathom: 2026-09-01). La fuente viva siempre manda: si algo no cierra,
la URL de origen está en el front-matter de cada archivo.

---

## Qué hay

| Proveedor | Carpeta | Contenido | Unidad de Limitless |
|---|---|---|---|
| **GoHighLevel** (Marketplace / API v3) | [`gohighlevel/`](./gohighlevel/) | 948 páginas · 634 endpoints · 77 webhooks | I-4 oportunidades y pipelines |
| **VTurb Analytics** | [`vturb/`](./vturb/) | 8 páginas · **`openapi.json`** con 28 endpoints | I-6 VSL |
| **Whop** | [`whop/`](./whop/) | 897 páginas · **3 specs OpenAPI oficiales** · 450 endpoints | I-2 pagos |
| **Commas** (ex Fanbasis) | [`commas/`](./commas/) | 42 secciones · 36 endpoints | I-2 pagos |
| **Hyros** | [`hyros/`](./hyros/) | 482 guías · **3 specs OpenAPI** · 51 endpoints · 10 webhooks | I-8 atribución |
| **WebinarJam / EverWebinar** | [`webinarjam/`](./webinarjam/) | 17 artículos · 10 endpoints | I-5 webinar |
| **Fathom** | [`fathom/`](./fathom/) | 39 archivos markdown de `developers.fathom.ai` (referencia de API, webhooks, OAuth) | Llamadas (no es de las olas de embudos) |
| **QStash** (Upstash) | [`qstash/`](./qstash/) | 4 páginas: callbacks y failure callbacks, firma, reintentos (2026-10-03) | Colas de jobs (SCRUM-84) |

**Los seis proveedores de las tres olas de integración están cubiertos**, más Fathom (bajado después, sin script en `regenerar.sh`: se reproduce con `tools/fathom-urls.txt`).

### Por dónde empezar

Cada carpeta tiene un **`RESUMEN-LIMITLESS.md`** que responde, una por una, las preguntas que
[`apis-sin-documentacion.md`](../integraciones/apis-sin-documentacion.md) dejó abiertas para ese proveedor,
y dice qué cambia en el diseño de su unidad. **Son lectura obligatoria antes de
construir o corregir cualquiera de las integraciones.**

| Si querés… | Abrí |
|---|---|
| Corregir el mapeo de pagos ya escrito (I-2) | [`whop/RESUMEN-LIMITLESS.md`](./whop/RESUMEN-LIMITLESS.md) · [`commas/RESUMEN-LIMITLESS.md`](./commas/RESUMEN-LIMITLESS.md) |
| Arrancar GHL opportunities (I-4) | [`gohighlevel/RESUMEN-LIMITLESS.md`](./gohighlevel/RESUMEN-LIMITLESS.md) |
| Arrancar el webinar (I-5) | [`webinarjam/RESUMEN-LIMITLESS.md`](./webinarjam/RESUMEN-LIMITLESS.md) |
| Arrancar VTurb (I-6) | [`vturb/RESUMEN-LIMITLESS.md`](./vturb/RESUMEN-LIMITLESS.md) |
| Arrancar Hyros (I-8) | [`hyros/RESUMEN-LIMITLESS.md`](./hyros/RESUMEN-LIMITLESS.md) |
| Buscar un endpoint por path | el `ENDPOINTS*.md` del proveedor |
| Generar tipos o un cliente | los `openapi/*.json` y `*.yaml` |
| Volver a bajar todo | [`tools/README.md`](./tools/README.md) |

---

## Cómo se armó

Cada proveedor publica su documentación de una forma distinta, y la captura se adapta
a eso en vez de rasparlo todo igual:

| Proveedor | Cómo se capturó |
|---|---|
| **GoHighLevel** | HTML pre-renderizado de Docusaurus + `docusaurus-plugin-openapi-docs`. 948 URLs del sitemap, convertidas con un conversor que entiende ese DOM. |
| **VTurb** | GitBook sirve markdown agregando `.md` a la URL. Además, **cada endpoint viene embebido como un documento OpenAPI 3.0.2 completo**: se extrajeron los 28 y se unieron en un solo spec. |
| **Whop** | Mintlify, también con markdown por `.md`. Y publica los specs en `docs.whop.com/openapi/*`: se guardan esos y en cada página queda el link a la operación, en vez de repetir el spec 548 veces. |
| **Commas** | SPA de **una sola página**: toda URL devuelve el mismo bundle y el router hace scroll. Se renderiza con Chromium una vez y se parte por `<section id>`. |
| **Hyros** | Dos fuentes: la **referencia** son los specs OpenAPI 3.1 de `api-docs.hyros.com/ai-context/`, y las **guías** son la SPA de docs.hyros.com, renderizada con Chromium y crawleada hasta converger (482 páginas, de las cuales sólo 283 estaban en el bundle). |
| **WebinarJam** | Centro de ayuda de Intercom, server-rendered. 17 artículos, con los links internos `/*/articles/<id>` reescritos al slug real. |

Todo el proceso es reproducible: `./tools/regenerar.sh`.

---

## Límites de esta copia — leer antes de confiar en ella

Nada de lo que hay acá está inventado ni completado por inferencia. Pero la copia
hereda los agujeros de la fuente:

1. **GoHighLevel no expande muchos schemas de respuesta.** `GET /opportunities/:id`
   documenta su respuesta como `opportunity: object`, sin detallar campos. **Es así en
   la documentación oficial**, no se perdió en la conversión.

2. **De GoHighLevel no se capturaron los code samples** (los snippets curl / Node /
   Python del panel derecho): ese panel lo arma JavaScript y no existe en el HTML
   servido. Sí están el request, el schema de respuesta y el ejemplo JSON.

3. **De GoHighLevel se capturó sólo la versión *current* (v3).** Las tres versiones
   fechadas del sitemap son idénticas salvo por el valor permitido del header
   `Version`.

4. **VTurb declara dos versiones distintas.** La página de autenticación dice que
   `X-Api-Version` sólo acepta `v1`; el spec embebido declara `info.version: v3`.

5. **Whop tiene dos superficies de API.** La versionada (`/api-reference/beta`,
   `ENDPOINTS-api-v1-native.md`) es la de integraciones nuevas; la legacy
   (`ENDPOINTS-api-v1-stable.md`) sigue soportada y es la que tiene los objetos
   `Payment` y `Refund` completos. No mezclarlas sin mirar cuál define cada campo.

6. **Commas se sirve desde el dominio de Fanbasis.** La marca y la documentación
   cambiaron; el host de la API sigue siendo `https://www.fanbasis.com` — **con
   `www`**, porque el apex responde un `301` que descarta los bodies de `POST`.

7. **De Hyros hay dos referencias y una está vieja.** La vigente son los specs
   OpenAPI (`rest-api` v1.40). El `apiary-blueprint.md` es el documento de Apiary
   v1.37 al que apunta la propia UI de Hyros: se conserva por su prosa y sus ejemplos,
   pero **si los dos difieren, manda el spec**.

8. **Los links entre guías de Hyros están reconstruidos, no capturados.** Las tarjetas
   "View guide" son botones de React sin `href`; se rearmó el destino matcheando el
   título contra las páginas capturadas. Lo que no matcheó quedó como texto.

9. **WebinarJam no documenta todo lo que devuelve.** Varios campos se declaran
   `string` o `integer` sin decir la unidad ni los valores posibles (`time_live`,
   `attended_live` en la respuesta, `revenue_live`). Están anotados en su
   `RESUMEN-LIMITLESS.md`.

---

## Peso

La copia ocupa unos **27 MB**, casi todo texto. El grueso es Whop (18 MB): 7,4 MB de
specs oficiales, 3,6 MB de referencia generada y 6,5 MB de guías. Es contenido real,
no ruido — el bloque OpenAPI repetido ya se eliminó, y sin esa poda serían 40 MB.

Si alguna vez hace falta adelgazarlo, lo primero que sobra es
`whop/ENDPOINTS-api-v1-stable.md` + `whop/openapi/api-v1-stable.json`, que son la API
legacy. **No borrar los specs sin borrar también la referencia generada**, o queda una
referencia que no se puede regenerar.

---

## Regla para Claude Code

Antes de implementar contra cualquiera de estos siete proveedores, **leer de acá**, no
de memoria ni de una búsqueda web. Si un campo no está documentado en esta copia,
tampoco está documentado en el proveedor: aplica la regla 3 de `CLAUDE.md` —persistir
el payload crudo, no inventar el valor, y dejar la entrada en
`apis-sin-documentacion.md`.

Si la fuente cambió, correr `./tools/regenerar.sh` y commitear el diff; no editar los
archivos generados a mano.

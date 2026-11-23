# -*- coding: utf-8 -*-
"""Zoom: specs OpenAPI oficiales (Meetings y Marketplace) + guías en markdown.

developers.zoom.us publica cada spec en /api/zoap/<producto>/<methods|events>/ (lo
anuncia en /.well-known/api-catalog.json) y sirve cada guía como markdown agregando
`.md` a la URL. Se guardan los specs completos y se genera una referencia legible
sólo de lo que Limitless usa (webinars, registrantes, reportes de participantes,
eventos de webinar y suscripciones de eventos): el spec de Meetings entero en
markdown pesa más de 1 MB y es casi todo ajeno al producto.
"""
import json
import os
import re
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from openapi_md import render_spec  # noqa: E402

SCRATCH = os.environ.get("WORK") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), ".work")
TOOLS = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(SCRATCH, "cache-zoom")
SPECS = os.path.join(SCRATCH, "zoom-specs")
OUT = sys.argv[1]
FECHA = sys.argv[2]

SPEC_URL = "https://developers.zoom.us/api/zoap/%s/%s/"

# ---------- 1. specs oficiales, tal cual se bajaron ------------------------
os.makedirs(os.path.join(OUT, "openapi"), exist_ok=True)
specs = {}
for producto in ("meetings", "marketplace"):
    for tipo in ("methods", "events"):
        nombre = "%s-%s.json" % (producto, tipo)
        shutil.copy(os.path.join(SPECS, nombre), os.path.join(OUT, "openapi", nombre))
        specs[(producto, tipo)] = json.load(open(os.path.join(SPECS, nombre), encoding="utf-8"))


def fm(titulo, fuente):
    return {"title": titulo, "source": fuente, "capturado": FECHA}


def filtrar_paths(spec, quiere):
    out = dict(spec)
    out["paths"] = {p: v for p, v in spec["paths"].items() if quiere(p)}
    out["tags"] = []
    return out


def como_webhooks(spec, quiere):
    """El spec de eventos de Zoom (OpenAPI 3.0) pone cada evento como un `path`
    con nombre de evento. Se pasa a `webhooks:` para que el renderer lo trate como
    evento saliente y no como endpoint."""
    out = dict(spec)
    out["webhooks"] = {p: v for p, v in spec["paths"].items() if quiere(p)}
    out["paths"] = {}
    out["tags"] = []
    return out


# ---------- 2. referencia de endpoints (sólo lo que usa Limitless) ---------
FUERA = ("/branding", "/livestream", "/jointoken", "/sip_dialing", "/polls", "/survey",
         "/panelists", "/invite_links", "/token", "/qa", "/chat/", "/archive_files")


def endpoint_util(p):
    if any(x in p for x in FUERA):
        return False
    return (p.startswith(("/webinars", "/users/{userId}/webinars", "/past_webinars",
                          "/report/webinars"))
            or p in ("/past_meetings/{meetingId}/participants",
                     "/past_meetings/{meetingId}/instances",
                     "/report/meetings/{meetingId}/participants",
                     "/meetings/{meetingId}/registrants",
                     "/meetings/{meetingId}/batch_registrants"))


md = render_spec(
    filtrar_paths(specs[("meetings", "methods")], endpoint_util),
    "Zoom Meetings API — webinars, registrantes y reportes de participantes",
    front_matter=fm("Zoom Meetings API (recorte para Limitless)", SPEC_URL % ("meetings", "methods")),
    intro=("Recorte del spec oficial [`openapi/meetings-methods.json`](./openapi/meetings-methods.json): "
           "sólo webinars, registrantes, participantes pasados y reportes (y sus equivalentes de "
           "reunión). Cada descripción trae, tal como la publica Zoom, el plan requerido, los "
           "**scopes**, los **granular scopes** y el **Rate Limit Label**. Para el resto de la API, "
           "el spec completo."),
    spec_link=SPEC_URL % ("meetings", "methods"))
open(os.path.join(OUT, "ENDPOINTS-webinars-y-reportes.md"), "w", encoding="utf-8").write(md)


def evento_util(e):
    return (e.startswith("webinar.")
            or e in ("meeting.ended", "meeting.started", "meeting.participant_joined",
                     "meeting.participant_left", "meeting.registration_created",
                     "meeting.registration_cancelled", "meeting.registration_approved"))


md = render_spec(
    como_webhooks(specs[("meetings", "events")], evento_util),
    "Zoom Meetings — eventos de webhook de webinars (y de reunión equivalentes)",
    front_matter=fm("Zoom Meetings webhooks (recorte para Limitless)", SPEC_URL % ("meetings", "events")),
    intro=("Recorte del spec oficial de eventos [`openapi/meetings-events.json`](./openapi/meetings-events.json): "
           "todos los `webinar.*` y los `meeting.*` de inicio, fin, participantes y registro. "
           "Verificación de firma y validación del endpoint: [`guias/api/webhooks.md`](./guias/api/webhooks.md)."),
    spec_link=SPEC_URL % ("meetings", "events"))
open(os.path.join(OUT, "WEBHOOKS-webinars.md"), "w", encoding="utf-8").write(md)

mk = render_spec(
    filtrar_paths(specs[("marketplace", "methods")],
                  lambda p: "event_subscription" in p or "webhook_logs" in p or "/subscription" in p),
    "Zoom Marketplace API — suscripciones de eventos y logs de webhooks",
    front_matter=fm("Zoom Marketplace API (recorte para Limitless)", SPEC_URL % ("marketplace", "methods")),
    intro=("Recorte de [`openapi/marketplace-methods.json`](./openapi/marketplace-methods.json): "
           "alta, baja y consulta de suscripciones de eventos por API (webhooks por usuario o cuenta "
           "sin tocar el build flow) y logs de entrega."),
    spec_link=SPEC_URL % ("marketplace", "methods"))
mk_ev = render_spec(
    como_webhooks(specs[("marketplace", "events")], lambda e: True),
    "Zoom Marketplace — eventos de la app (desautorización, pedidos de autorización)",
    front_matter=fm("Zoom Marketplace webhooks", SPEC_URL % ("marketplace", "events")),
    spec_link=SPEC_URL % ("marketplace", "events"))
open(os.path.join(OUT, "MARKETPLACE-suscripciones-y-eventos.md"), "w", encoding="utf-8").write(
    mk + "\n\n" + re.sub(r"^---\n.*?\n---\n\n", "", mk_ev, flags=re.S))

# ---------- 3. guías: el markdown que sirve el sitio, con front-matter -----
guias = os.path.join(OUT, "guias")
if os.path.isdir(guias):
    shutil.rmtree(guias)
n = 0
for url in [l.strip() for l in open(os.path.join(TOOLS, "zoom-urls.txt")) if l.strip()]:
    src = os.path.join(CACHE, url.split("://", 1)[1].replace("/", "__"))
    if not os.path.exists(src):
        print("    falta", url)
        continue
    body = open(src, encoding="utf-8").read()
    body = body.replace("<!-- WARNING: THIS FILE WAS AUTOGENERATED! DO NOT EDIT! -->\n\n", "")
    m = re.search(r"^# (.+)$", body, flags=re.M)
    titulo = m.group(1).strip() if m else url
    rel = url.split("/docs/", 1)[1]
    dest = os.path.join(guias, rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    cab = "---\ntitle: %s\nsource: %s\ncapturado: %s\n---\n\n" % (
        json.dumps(titulo, ensure_ascii=False), json.dumps(url[:-3] + "/"), json.dumps(FECHA))
    open(dest, "w", encoding="utf-8").write(cab + body)
    n += 1
print("    guías:", n)

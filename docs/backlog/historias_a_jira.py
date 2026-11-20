#!/usr/bin/env python3
"""Valida docs/backlog/historias.md y genera docs/backlog/historias-jira.csv.

Las historias de usuario salen de docs/FUNCIONAL.md (una por cada funcionalidad que no está en
"Funciona") y agrupan las tareas técnicas de PENDIENTES.md. La prioridad y la severidad de una
historia NO se escriben a mano: se calculan a partir de sus tareas técnicas (la más urgente manda).
La columna "Octubre" se lee de FUNCIONAL.md, donde la completa Agustín.

Uso (desde la raíz del repo):

    python3 docs/backlog/historias_a_jira.py           # valida y escribe el CSV
    python3 docs/backlog/historias_a_jira.py --check   # sólo valida, no escribe

--check también falla si historias-jira.csv no es el que generaría el script (alguien cambió
PENDIENTES.md, historias.md o FUNCIONAL.md y no lo regeneró) o si FUNCIONAL.md cita una tarea
técnica que ya no está en PENDIENTES.md.

Sólo usa la biblioteca estándar.
"""

import csv
import io
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # no dejar __pycache__ en docs/backlog/
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pendientes_a_jira as pendientes  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "docs" / "backlog" / "historias.md"
FUNCIONAL = ROOT / "docs" / "FUNCIONAL.md"
OUT = ROOT / "docs" / "backlog" / "historias-jira.csv"

ORDEN_PRIORIDAD = ["P0", "P1", "P2", "P3"]
ORDEN_SEVERIDAD = ["Crítica", "Alta", "Media", "Baja"]
CAMPOS = ["Funcionalidad", "Historia", "Criterios de aceptación", "Tareas técnicas", "Para confirmar"]


def leer_funcional():
    """{F-ID: {area, estado, octubre, funcionalidad}} desde las tablas de FUNCIONAL.md."""
    filas, area = {}, None
    for linea in FUNCIONAL.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^## (.+)$", linea)
        if m:
            area = m.group(1).strip()
            continue
        if re.match(r"^\| F-[A-Z]+-\d+ \|", linea):
            cols = [c.strip() for c in linea.split("|")[1:-1]]
            filas[cols[0]] = {"area": area, "funcionalidad": cols[1], "estado": cols[2],
                              "tareas": re.findall(r"`([A-Z0-9][A-Z0-9-]*)`", cols[3]),
                              "octubre": cols[5] if len(cols) > 5 else ""}
    return filas


def parsear():
    historias, area, h, campo = [], None, None, None

    def cerrar():
        if h:
            historias.append(h)

    en_ejemplo = False
    for linea in SRC.read_text(encoding="utf-8").splitlines():
        if linea.startswith("```"):  # los bloques de ejemplo del encabezado no son historias
            en_ejemplo = not en_ejemplo
            continue
        if en_ejemplo:
            continue
        if linea.startswith("## "):
            cerrar()
            h, campo, area = None, None, linea[3:].strip()
            continue
        m = re.match(r"^### \[(H-[A-Z]+-\d+)\]\s*(.*)$", linea)
        if m:
            cerrar()
            h = {"id": m.group(1), "titulo": m.group(2).strip(), "area": area, "campos": {}}
            campo = None
            continue
        if h is None:
            continue
        m = re.match(r"^- \*\*([^*]+):\*\*\s*(.*)$", linea)
        if m and m.group(1) in CAMPOS:
            campo = m.group(1)
            h["campos"][campo] = [m.group(2).strip()] if m.group(2).strip() else []
        elif campo and re.match(r"^\s+- ", linea):
            h["campos"][campo].append(linea.strip()[2:].strip())
        elif campo and linea.strip() and not linea.startswith("#"):
            h["campos"][campo].append(linea.strip())
    cerrar()
    return historias


def ids_tareas(texto):
    return re.findall(r"`\[([^\]`]+)\]`", texto)


def validar(historias, funcional, tareas):
    errores = []
    esperadas = {f for f, d in funcional.items() if d["estado"] != "Funciona"}
    vistas = {}
    for h in historias:
        c = h["campos"]
        for campo in ("Funcionalidad", "Historia", "Criterios de aceptación", "Tareas técnicas"):
            if not c.get(campo):
                errores.append(f"{h['id']}: falta {campo}")
        fid = re.match(r"(F-[A-Z]+-\d+)", " ".join(c.get("Funcionalidad", [])))
        if not fid:
            errores.append(f"{h['id']}: Funcionalidad sin F-ID")
            continue
        fid = fid.group(1)
        if h["id"] != "H-" + fid[2:]:
            errores.append(f"{h['id']}: el ID no corresponde a {fid}")
        if fid in vistas:
            errores.append(f"{fid}: tiene dos historias ({vistas[fid]} y {h['id']})")
        vistas[fid] = h["id"]
        if fid not in funcional:
            errores.append(f"{h['id']}: {fid} no existe en FUNCIONAL.md")
        elif funcional[fid]["estado"] == "Funciona":
            errores.append(f"{h['id']}: {fid} figura como Funciona en FUNCIONAL.md")
        historia = " ".join(c.get("Historia", []))
        if not re.match(r"^Como .+, quiero .+, para .+", historia):
            errores.append(f"{h['id']}: la historia no sigue 'Como …, quiero …, para …'")
        for tid in ids_tareas(" ".join(c.get("Tareas técnicas", []))):
            if tid not in tareas:
                errores.append(f"{h['id']}: la tarea [{tid}] no existe en PENDIENTES.md")
    for fid, d in sorted(funcional.items()):
        for tid in d["tareas"]:
            if tid not in tareas:
                errores.append(f"{fid}: FUNCIONAL.md cita la tarea {tid}, que no está en PENDIENTES.md (¿se cerró?)")
    for fid in sorted(esperadas - set(vistas)):
        errores.append(f"{fid} ({funcional[fid]['estado']}) no tiene historia")
    return errores


def calcular(h, tareas, funcional):
    tids = [t for t in ids_tareas(" ".join(h["campos"].get("Tareas técnicas", []))) if t in tareas]
    prios = [tareas[t]["prioridad"] for t in tids]
    sevs = [tareas[t]["campos"].get("Severidad") for t in tids if tareas[t]["campos"].get("Severidad")]
    fid = re.match(r"(F-[A-Z]+-\d+)", " ".join(h["campos"]["Funcionalidad"])).group(1)
    return {
        "tareas": tids,
        "prioridad": min(prios, key=ORDEN_PRIORIDAD.index) if prios else "",
        "severidad": min(sevs, key=ORDEN_SEVERIDAD.index) if sevs else "",
        "fid": fid,
        "octubre": funcional.get(fid, {}).get("octubre", ""),
    }


def fila(h, calc, tareas):
    c = h["campos"]
    area_slug = pendientes.slug(h["area"] or "")
    etiquetas = ["historia", area_slug]
    etiquetas.append(calc["prioridad"].lower() if calc["prioridad"] else "prioridad-a-definir")
    if calc["severidad"]:
        etiquetas.append("sev-" + pendientes.slug(calc["severidad"]))
    if calc["octubre"]:
        etiquetas.append("octubre-" + pendientes.slug(calc["octubre"]))
    para_confirmar = [x for x in c.get("Para confirmar", []) if x not in ("—", "-")]
    if para_confirmar:
        etiquetas.append("para-confirmar")
    etiquetas = (etiquetas + [""] * 6)[:6]

    partes = [f"*Historia:* {pendientes.md_a_jira(' '.join(c['Historia']))}"]
    partes.append("*Criterios de aceptación:*\n" + "\n".join(f"* {pendientes.md_a_jira(x)}" for x in c["Criterios de aceptación"]))
    if calc["tareas"]:
        lineas = [f"* [{t}] {tareas[t]['titulo'].replace('`', '')} ({tareas[t]['prioridad']})" for t in calc["tareas"]]
        partes.append("*Tareas técnicas (PENDIENTES.md):*\n" + "\n".join(lineas))
    else:
        partes.append("*Tareas técnicas:* " + pendientes.md_a_jira(" ".join(c["Tareas técnicas"])))
    if para_confirmar:
        partes.append("*Para confirmar:*\n" + "\n".join(f"* {pendientes.md_a_jira(x)}" for x in para_confirmar))
    partes.append(f"Funcionalidad: {' '.join(c['Funcionalidad'])} · docs/FUNCIONAL.md · Fuente: docs/backlog/historias.md [{h['id']}]")

    prioridad_jira = pendientes.PRIORIDAD_JIRA.get(calc["prioridad"], "Medium")
    return [f"[{h['id']}] {h['titulo']}"[:250], "Story", prioridad_jira, *etiquetas, "\n\n".join(partes),
            h["id"], h["area"], calc["prioridad"] or "a definir", calc["severidad"], " ".join(calc["tareas"]),
            calc["octubre"]]


def generar_csv(historias, funcional, tareas):
    """El contenido de historias-jira.csv, y el conteo por prioridad calculada."""
    calcs = {h["id"]: calcular(h, tareas, funcional) for h in historias}
    orden = lambda h: (ORDEN_PRIORIDAD.index(calcs[h["id"]]["prioridad"]) if calcs[h["id"]]["prioridad"] else 9, h["id"])
    f = io.StringIO(newline="")
    w = csv.writer(f)
    w.writerow(["Summary", "Issue Type", "Priority", "Labels", "Labels", "Labels", "Labels", "Labels", "Labels",
                "Description", "ID Historia", "Épica (área)", "Prioridad calculada", "Severidad calculada",
                "Tareas técnicas", "Octubre"])
    for h in sorted(historias, key=orden):
        w.writerow(fila(h, calcs[h["id"]], tareas))
    conteo = {}
    for c in calcs.values():
        conteo[c["prioridad"] or "a definir"] = conteo.get(c["prioridad"] or "a definir", 0) + 1
    return f.getvalue(), conteo


def main():
    historias = parsear()
    funcional = leer_funcional()
    tareas = {t["id"]: t for t in pendientes.parsear()}
    errores = validar(historias, funcional, tareas)
    print(f"{len(historias)} historias · {sum(1 for d in funcional.values() if d['estado'] != 'Funciona')} "
          f"funcionalidades que no están en 'Funciona'")
    if errores:
        print("\n".join(errores), file=sys.stderr)
        sys.exit(1)

    contenido, conteo = generar_csv(historias, funcional, tareas)
    if "--check" in sys.argv:
        # El CSV se versiona: si una tarea técnica cambia (se cierra, cambia de prioridad o de título)
        # y nadie regenera, el CSV queda con el estado viejo sin que nada avise (QA de SCRUM-540).
        # newline="": el CSV termina las líneas en \r\n y read_text las convertiría.
        actual = OUT.open(encoding="utf-8", newline="").read() if OUT.exists() else ""
        if actual != contenido:
            print(f"{OUT.relative_to(ROOT)} está desactualizado: regenéralo con "
                  "python3 docs/backlog/historias_a_jira.py", file=sys.stderr)
            sys.exit(1)
        return

    with OUT.open("w", encoding="utf-8", newline="") as f:
        f.write(contenido)
    print("Prioridad calculada: " + " · ".join(f"{k}: {v}" for k, v in sorted(conteo.items())))
    print(f"Escrito {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

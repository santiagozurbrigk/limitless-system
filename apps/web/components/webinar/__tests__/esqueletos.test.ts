/**
 * SCRUM-546 · Estados de carga de Limitless Webinars: cada pantalla nueva
 * tiene su `loading.tsx` (ninguna queda en blanco al navegar) y el esqueleto
 * avisa que está cargando.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EsqueletoDeFichaDelLead, EsqueletoDeInicio, EsqueletoDeLeads } from "../esqueletos";

const PLATAFORMA = join(__dirname, "..", "..", "..", "app", "(platform)");

/** Las pantallas de Webinars con lectura propia y el esqueleto que usa cada una. */
const PANTALLAS: [ruta: string, esqueleto: string][] = [
  ["inicio", "EsqueletoDeInicio"],
  ["leads", "EsqueletoDeLeads"],
  ["leads/[id]", "EsqueletoDeFichaDelLead"],
];

describe("⭐ cada pantalla de Webinars tiene su loading.tsx con su esqueleto", () => {
  it.each(PANTALLAS)("app/(platform)/%s/loading.tsx usa %s", (ruta, esqueleto) => {
    const archivo = join(PLATAFORMA, ruta, "loading.tsx");
    expect(existsSync(archivo)).toBe(true);
    expect(readFileSync(archivo, "utf8")).toContain(`<${esqueleto} />`);
  });
});

describe("los esqueletos", () => {
  it.each([
    ["Inicio", EsqueletoDeInicio],
    ["Leads", EsqueletoDeLeads],
    ["la ficha del lead", EsqueletoDeFichaDelLead],
  ] as const)("%s: role=status, aria-busy y el texto para lectores de pantalla", (que, Esqueleto) => {
    const html = renderToStaticMarkup(createElement(Esqueleto));
    expect(html).toMatch(/role="status" aria-busy="true"/);
    expect(html).toContain(`Cargando ${que}…`);
  });
});

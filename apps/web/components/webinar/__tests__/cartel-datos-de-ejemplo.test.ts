/** SCRUM-542: el cartel fijo "Datos de ejemplo". */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CartelDatosDeEjemplo } from "../cartel-datos-de-ejemplo";

describe("CartelDatosDeEjemplo", () => {
  it("con una vista de ejemplo dice 'Datos de ejemplo' y queda fijo arriba", () => {
    const html = renderToStaticMarkup(createElement(CartelDatosDeEjemplo, { visible: true }));
    expect(html).toContain("Datos de ejemplo.");
    expect(html).toContain('role="status"');
    expect(html).toContain("sticky top-0");
  });

  it("con una vista real no dibuja nada", () => {
    expect(renderToStaticMarkup(createElement(CartelDatosDeEjemplo, { visible: false }))).toBe("");
  });
});

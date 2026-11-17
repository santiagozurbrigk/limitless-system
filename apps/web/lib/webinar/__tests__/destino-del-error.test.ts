/** SCRUM-546 · Adónde sale el error de Leads (2.ª revisión de #153). */
import { describe, expect, it } from "vitest";
import { destinoDelErrorDeLeads } from "../destino-del-error";

describe("⭐ destinoDelErrorDeLeads", () => {
  it("a la pantalla de inicio de quien mira", () => {
    expect(destinoDelErrorDeLeads("/inicio")).toEqual({ href: "/inicio", texto: "Ir al inicio" });
    expect(destinoDelErrorDeLeads("/dashboard")).toEqual({ href: "/dashboard", texto: "Ir al inicio" });
  });

  it("si su inicio es Leads (la que falló), a Ajustes", () => {
    expect(destinoDelErrorDeLeads("/leads")).toEqual({ href: "/settings", texto: "Ir a Ajustes" });
  });
});

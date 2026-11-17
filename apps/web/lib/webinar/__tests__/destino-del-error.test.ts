/** SCRUM-546 · Adónde sale el error de Leads (revisiones de #153). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { puedeEntrarAlModulo } from "@/lib/auth/acceso-a-modulo";
import { destinoDelErrorDeLeads, puedeAbrirModulo } from "../destino-del-error";

describe("⭐ destinoDelErrorDeLeads", () => {
  it("a la pantalla de inicio de quien mira", () => {
    expect(destinoDelErrorDeLeads("/inicio", true)).toEqual({ href: "/inicio", texto: "Ir al inicio" });
    expect(destinoDelErrorDeLeads("/dashboard", false)).toEqual({ href: "/dashboard", texto: "Ir al inicio" });
  });

  it("si su inicio es Leads (la que falló), a Ajustes si la puede abrir", () => {
    expect(destinoDelErrorDeLeads("/leads", true)).toEqual({ href: "/settings", texto: "Ir a Ajustes" });
  });

  it("⭐ si tampoco puede abrir Ajustes, sin enlace (no lo manda a otro bloqueo)", () => {
    expect(destinoDelErrorDeLeads("/leads", false)).toBeNull();
  });
});

describe("puedeAbrirModulo es la misma regla que el layout", () => {
  const casos = [
    { isFounder: true, hasRoleConfigured: true, modules: { settings: "none" } },
    { isFounder: false, hasRoleConfigured: false, modules: { settings: "none" } },
    { isFounder: false, hasRoleConfigured: true, modules: { settings: "none" } },
    { isFounder: false, hasRoleConfigured: true, modules: { settings: "read" } },
    { isFounder: false, hasRoleConfigured: true, modules: {} },
  ];
  it.each(casos)("%o", (permisos) => {
    expect(puedeAbrirModulo(permisos, "settings")).toBe(
      puedeEntrarAlModulo(permisos as Parameters<typeof puedeEntrarAlModulo>[0], "settings")
    );
  });
});

it("leads/error.tsx usa destinoDelErrorDeLeads con los permisos de quien mira", () => {
  const codigo = readFileSync(join(__dirname, "../../../app/(platform)/leads/error.tsx"), "utf8");
  expect(codigo).toMatch(/destinoDelErrorDeLeads\(\s*usePantallaDeInicio\(\),\s*puedeAbrirModulo\(usePermissions\(\), "settings"\)\s*\)/);
});

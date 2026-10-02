import { describe, expect, it } from "vitest";
import { avisoClaveIa } from "../aviso-clave-ia";

const base = { hasApiKey: true, apiKeyStatus: "valid" as const, keyUnreadable: false };

describe("avisoClaveIa (SCRUM-7: sin clave propia, no hay IA)", () => {
  it("no avisa nada si la clave anda", () => {
    expect(avisoClaveIa(base)).toBeNull();
  });

  it("avisa que la IA está desactivada si la org nunca cargó su clave", () => {
    const aviso = avisoClaveIa({ hasApiKey: false, apiKeyStatus: "none", keyUnreadable: false });
    expect(aviso).toMatchObject({ tono: "advertencia", accion: "Cargar la clave" });
    expect(aviso?.titulo).toMatch(/desactivadas/);
  });

  it("avisa en rojo si Anthropic rechazó la clave", () => {
    expect(avisoClaveIa({ ...base, apiKeyStatus: "invalid" })).toMatchObject({
      tono: "error",
      accion: "Actualizar la clave",
    });
  });

  it("avisa en rojo si la clave guardada no se puede leer", () => {
    expect(avisoClaveIa({ ...base, keyUnreadable: true })).toMatchObject({ tono: "error" });
  });

  it("avisa que no hay créditos", () => {
    expect(avisoClaveIa({ ...base, apiKeyStatus: "valid_no_credits" })?.titulo).toMatch(/créditos/);
  });
});

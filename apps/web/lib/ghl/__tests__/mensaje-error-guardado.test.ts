import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { mensajeErrorGuardadoGHL } from "../integration";

describe("mensajeErrorGuardadoGHL (SCRUM-82)", () => {
  it("⭐ la location ya conectada en otra org se explica sin el texto de Postgres", () => {
    expect(
      mensajeErrorGuardadoGHL({
        code: "23505",
        message: 'duplicate key value violates unique constraint "ghl_integrations_location_unica"',
      })
    ).toBe("Esa cuenta de GHL ya está conectada en otra organización.");
  });

  it("otros errores pasan tal cual", () => {
    expect(mensajeErrorGuardadoGHL({ code: "23505", message: "otra unicidad" })).toBe("otra unicidad");
    expect(mensajeErrorGuardadoGHL({ message: "falló" })).toBe("falló");
  });
});

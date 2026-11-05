import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { EXPERIENCIAS } from "@/lib/organization/experience";
import {
  EXPERIENCIAS_ELEGIBLES,
  EXPERIENCIAS_GUARDADAS,
  MOTIVO_NO_ELEGIBLE,
  MOTIVO_ORG_DE_LIMITLESS,
  experienciaDeUnNegocioNuevo,
  motivoParaNoCambiarLaExperiencia,
} from "../experiencia";

describe("SCRUM-551 · experiencia desde Administración", () => {
  it("⭐ el selector ofrece sólo webinar y full, nunca limitless", () => {
    expect(EXPERIENCIAS_ELEGIBLES).toEqual(["webinar", "full"]);
  });

  it("se puede pasar entre webinar y full", () => {
    expect(motivoParaNoCambiarLaExperiencia("full", "webinar")).toBeNull();
    expect(motivoParaNoCambiarLaExperiencia("webinar", "full")).toBeNull();
  });

  it("⭐ nadie pasa a limitless, y un valor cualquiera se rechaza", () => {
    expect(motivoParaNoCambiarLaExperiencia("full", "limitless")).toBe(MOTIVO_NO_ELEGIBLE);
    expect(motivoParaNoCambiarLaExperiencia("webinar", "otra")).toBe(MOTIVO_NO_ELEGIBLE);
    expect(motivoParaNoCambiarLaExperiencia("webinar", undefined)).toBe(MOTIVO_NO_ELEGIBLE);
  });

  it("⭐ la org de Limitless no cambia desde la consola", () => {
    expect(motivoParaNoCambiarLaExperiencia("limitless", "full")).toBe(MOTIVO_ORG_DE_LIMITLESS);
  });

  it("⭐ un negocio nuevo de un holding nunca hereda limitless: nace full", () => {
    expect(experienciaDeUnNegocioNuevo("limitless")).toBe("full");
    expect(experienciaDeUnNegocioNuevo("webinar")).toBe("webinar");
    expect(experienciaDeUnNegocioNuevo("full")).toBe("full");
  });

  it("los valores guardados son los de lib/organization/experience", () => {
    expect([...EXPERIENCIAS_GUARDADAS].sort()).toEqual([...EXPERIENCIAS].sort());
  });
});

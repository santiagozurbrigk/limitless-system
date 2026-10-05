import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";

/**
 * SCRUM-18 · [PERMISOS-FOUNDER-AREA]: la regla de acceso por módulo, que usan
 * el layout de la plataforma (pantallas) y las Server Actions de lectura.
 */

const sim = vi.hoisted(() => ({ permisos: null as UserPermissions | null }));

vi.mock("@/lib/auth/get-current-permissions", () => ({
  getCurrentUserPermissions: async () => sim.permisos,
}));

import {
  exigirAccesoAlModulo,
  moduloBloqueadoParaRuta,
  puedeEntrarAlModulo,
} from "../acceso-a-modulo";

function member(modulos: Partial<UserPermissions["modules"]>): UserPermissions {
  return {
    role: "member",
    isFounder: false,
    modules: { ...emptyPermissions(), ...modulos },
    hasRoleConfigured: true,
    enabledAddOns: [],
  };
}

const sinOperaciones = member({ dashboard: "full", finance: "view" });
const conOperaciones = member({ operations: "view" });
const sinRol: UserPermissions = {
  role: "member",
  isFounder: false,
  modules: emptyPermissions(),
  hasRoleConfigured: false,
  enabledAddOns: [],
};
const founder: UserPermissions = {
  role: "founder",
  isFounder: true,
  modules: emptyPermissions(),
  hasRoleConfigured: true,
  enabledAddOns: [],
};

describe("moduloBloqueadoParaRuta en /founder", () => {
  it("⭐ un member sin Operaciones queda bloqueado por Operaciones", () => {
    expect(moduloBloqueadoParaRuta("/founder", sinOperaciones)).toBe("operations");
  });

  it("un member con Operaciones (aunque sea sólo ver) entra", () => {
    expect(moduloBloqueadoParaRuta("/founder", conOperaciones)).toBeNull();
    expect(
      moduloBloqueadoParaRuta("/founder", member({ operations: "full" }))
    ).toBeNull();
  });

  it("el founder entra siempre, aunque su mapa de módulos viniera vacío", () => {
    expect(moduloBloqueadoParaRuta("/founder", founder)).toBeNull();
  });

  it("sin rol configurado no se bloquea, igual que en el resto de la plataforma", () => {
    expect(moduloBloqueadoParaRuta("/founder", sinRol)).toBeNull();
    expect(moduloBloqueadoParaRuta("/finance", sinRol)).toBeNull();
  });
});

describe("moduloBloqueadoParaRuta en el resto de la plataforma", () => {
  it("bloquea por el módulo de la ruta, no por otro", () => {
    expect(moduloBloqueadoParaRuta("/finance/expenses", conOperaciones)).toBe(
      "finance"
    );
    expect(moduloBloqueadoParaRuta("/intelligence", sinOperaciones)).toBe(
      "operations"
    );
    expect(moduloBloqueadoParaRuta("/finance", sinOperaciones)).toBeNull();
  });

  it("las rutas libres, las desconocidas y un pathname vacío no se bloquean", () => {
    expect(moduloBloqueadoParaRuta("/onboarding", sinOperaciones)).toBeNull();
    expect(moduloBloqueadoParaRuta("/holding", sinOperaciones)).toBeNull();
    expect(moduloBloqueadoParaRuta("/ruta-que-no-existe", sinOperaciones)).toBeNull();
    expect(moduloBloqueadoParaRuta("", sinOperaciones)).toBeNull();
  });

  it("un nivel desconocido o faltante cuenta como sin acceso", () => {
    const incompleto = member({});
    delete (incompleto.modules as Partial<UserPermissions["modules"]>).operations;
    expect(puedeEntrarAlModulo(incompleto, "operations")).toBe(false);
  });
});

describe("exigirAccesoAlModulo", () => {
  beforeEach(() => {
    sim.permisos = null;
  });

  it("⭐ corta a un member sin Operaciones con el mensaje de la pantalla", async () => {
    sim.permisos = sinOperaciones;
    await expect(exigirAccesoAlModulo("operations")).rejects.toThrow(
      "No tenés acceso a Operaciones."
    );
  });

  it("deja pasar al founder, a un member con Operaciones y a alguien sin rol", async () => {
    for (const permisos of [founder, conOperaciones, sinRol]) {
      sim.permisos = permisos;
      await expect(exigirAccesoAlModulo("operations")).resolves.toBeUndefined();
    }
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";

/**
 * SCRUM-18 · [PERMISOS-FOUNDER-AREA]: la regla de acceso por módulo, que usan
 * el layout de la plataforma (pantallas) y las Server Actions de lectura.
 */

const sim = vi.hoisted(() => ({
  permisos: null as UserPermissions | null,
  falla: null as Error | null,
  lecturas: 0,
}));

vi.mock("@/lib/auth/get-current-permissions", () => ({
  getCurrentUserPermissions: async () => {
    sim.lecturas += 1;
    if (sim.falla) throw sim.falla;
    return sim.permisos;
  },
}));

import { renderToStaticMarkup } from "react-dom/server";
import { FallaDeLaBase } from "@/lib/server/action-result";
import {
  exigirModuloDeLaPagina,
  moduloBloqueadoParaRuta,
  puedeEntrarAlModulo,
  rechazoPorModulo,
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

describe("rechazoPorModulo", () => {
  beforeEach(() => {
    sim.permisos = null;
  });

  it("⭐ a un member sin Operaciones le devuelve el rechazo como valor, sin lanzar", async () => {
    sim.permisos = sinOperaciones;
    await expect(rechazoPorModulo("operations")).resolves.toEqual({
      success: false,
      error: "No tenés acceso a Operaciones.",
      motivo: "sin-acceso",
      moduleId: "operations",
    });
  });

  it("deja pasar al founder, a un member con Operaciones y a alguien sin rol", async () => {
    for (const permisos of [founder, conOperaciones, sinRol]) {
      sim.permisos = permisos;
      await expect(rechazoPorModulo("operations")).resolves.toBeNull();
    }
  });
});

describe("exigirModuloDeLaPagina (SCRUM-540)", () => {
  beforeEach(() => {
    sim.permisos = null;
    sim.falla = null;
    sim.lecturas = 0;
  });

  it("⭐ a un member sin el módulo le devuelve «No tenés acceso» con el nombre del módulo", async () => {
    sim.permisos = sinOperaciones;
    const sinAcceso = await exigirModuloDeLaPagina("operations");
    expect(sinAcceso).not.toBeNull();
    const html = renderToStaticMarkup(sinAcceso!);
    expect(html).toContain("No tenés acceso a Operaciones");
    expect(html).toContain("Equipo → Roles");
  });

  it("bloquea por el módulo pedido, no por otro", async () => {
    sim.permisos = sinOperaciones;
    await expect(exigirModuloDeLaPagina("finance")).resolves.toBeNull();
    sim.permisos = conOperaciones;
    const sinAcceso = await exigirModuloDeLaPagina("finance");
    expect(renderToStaticMarkup(sinAcceso!)).toContain("No tenés acceso a Finanzas");
  });

  it("deja pasar a un member con el módulo, aunque sea sólo para ver", async () => {
    sim.permisos = conOperaciones;
    await expect(exigirModuloDeLaPagina("operations")).resolves.toBeNull();
  });

  it("el founder pasa siempre, aunque su mapa de módulos viniera vacío", async () => {
    sim.permisos = founder;
    await expect(exigirModuloDeLaPagina("operations")).resolves.toBeNull();
  });

  it("sin rol configurado no bloquea, igual que el layout de la plataforma", async () => {
    sim.permisos = sinRol;
    await expect(exigirModuloDeLaPagina("operations")).resolves.toBeNull();
  });

  it("⭐ si la lectura de permisos falla, relanza la falla: nunca abre ni dibuja la pantalla", async () => {
    sim.falla = new FallaDeLaBase({ message: "connection refused", code: "08006" });
    await expect(exigirModuloDeLaPagina("operations")).rejects.toBeInstanceOf(
      FallaDeLaBase
    );
  });

  it("lee los permisos una vez por llamada, con la misma función que el layout", async () => {
    sim.permisos = conOperaciones;
    await exigirModuloDeLaPagina("operations");
    expect(sim.lecturas).toBe(1);
  });
});

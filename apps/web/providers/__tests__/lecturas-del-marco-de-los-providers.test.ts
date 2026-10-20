/**
 * SCRUM-540 · Los providers del marco piden cada dato sólo si la persona tiene
 * alguno de los módulos que lo usan.
 *
 * El entorno de tests es Node, sin DOM: los efectos de los providers no
 * corren. Lo que se prueba son las lecturas que esos efectos llaman
 * (`lecturasDeLaPlataforma`, `lecturasDeFinanzas`, `leerInstagramDelMarco`),
 * con las actions simuladas para contar cuántas veces se piden. Que los
 * providers, la barra y el menú del celular no pidan una lectura del marco por
 * otro camino lo exige `lecturas-por-modulo.test.ts`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";

const sim = vi.hoisted(() => ({
  pedidos: [] as string[],
  rechazar: false,
}));

function accion<T>(nombre: string, dato: T) {
  return async () => {
    sim.pedidos.push(nombre);
    if (sim.rechazar) {
      return { success: false, error: "No tenés acceso.", motivo: "sin-acceso", moduleId: "clients" };
    }
    return dato;
  };
}

vi.mock("server-only", () => ({}));
vi.mock("@/app/clients/actions", async (o) => ({
  ...(await o<typeof import("@/app/clients/actions")>()),
  listClientsAction: accion("clientes", [{ id: "c1", name: "MARCA-CLIENTE" }]),
}));
vi.mock("@/app/closing/actions", async (o) => ({
  ...(await o<typeof import("@/app/closing/actions")>()),
  listClosingCallsAction: accion("llamadas", [{ id: "l1" }]),
}));
vi.mock("@/app/conversations/actions", async (o) => ({
  ...(await o<typeof import("@/app/conversations/actions")>()),
  listConversationsAction: accion("conversaciones", [{ id: "v1" }]),
  getConnectedUnipileAccountsAction: accion("unipile", [{ accountId: "u1" }]),
}));
vi.mock("@/app/finance/actions", async (o) => ({
  ...(await o<typeof import("@/app/finance/actions")>()),
  getResumenFinancieroAction: accion("resumen", { success: true, data: { pagosSinLeer: false } }),
  loadFinanceConfigAction: accion("finanzas", {
    fixedExpenses: [{ id: "MARCA-GASTO" }],
    subscriptions: [],
    teamCompensation: [],
    paymentPlatforms: [],
    pagosSinLeer: false,
  }),
}));
vi.mock("@/app/sales/payment-actions", async (o) => ({
  ...(await o<typeof import("@/app/sales/payment-actions")>()),
  listOrganizationPaymentsAction: accion("cobros", { success: true, data: [{ id: "p1" }] }),
}));
vi.mock("@/app/sales/metrics-actions", async (o) => ({
  ...(await o<typeof import("@/app/sales/metrics-actions")>()),
  getSalesMetricsSnapshotsAction: accion("metricas", { success: true, data: [{ id: "m1" }] }),
}));
vi.mock("@/app/marketing/actions", async (o) => ({
  ...(await o<typeof import("@/app/marketing/actions")>()),
  getInstagramIntegrationStatusAction: accion("instagram", { success: true, data: { status: "active" } }),
}));

import { lecturasDeLaPlataforma } from "@/providers/platform-data-provider";
import { lecturasDeFinanzas, usaElDetalleDeFinanzas } from "@/providers/finance-data-provider";
import { leerInstagramDelMarco } from "@/providers/marketing-data-provider";

function member(modulos: Partial<UserPermissions["modules"]>): UserPermissions {
  return {
    role: "member",
    isFounder: false,
    modules: { ...emptyPermissions(), ...modulos },
    hasRoleConfigured: true,
    enabledAddOns: [],
  };
}
const sinModulos = member({ team: "full", settings: "view" });
const founder: UserPermissions = { ...member({}), role: "founder", isFounder: true };

beforeEach(() => {
  sim.pedidos = [];
  sim.rechazar = false;
});

describe("PlatformDataProvider", () => {
  it("⭐ sin Clientes, Ventas ni Finanzas (aunque tenga el Panel): no pide nada y todo queda vacío", async () => {
    for (const p of [sinModulos, member({ dashboard: "full" })]) {
      await lecturasDeLaPlataforma.clientes(p);
      await lecturasDeLaPlataforma.llamadasDeCierre(p);
      await lecturasDeLaPlataforma.conversaciones(p);
    }
    expect(sim.pedidos).toEqual([]);
    await expect(lecturasDeLaPlataforma.clientes(sinModulos)).resolves.toEqual([]);
    await expect(lecturasDeLaPlataforma.llamadasDeCierre(sinModulos)).resolves.toEqual([]);
    await expect(lecturasDeLaPlataforma.conversaciones(sinModulos)).resolves.toEqual([]);
    await expect(lecturasDeLaPlataforma.cuentasDeUnipile(sinModulos)).resolves.toEqual([]);
    expect(sim.pedidos).toEqual([]);
  });

  it("con sólo Clientes pide los clientes y no las llamadas ni las conversaciones", async () => {
    const p = member({ clients: "view" });
    await expect(lecturasDeLaPlataforma.clientes(p)).resolves.toHaveLength(1);
    await lecturasDeLaPlataforma.llamadasDeCierre(p);
    await lecturasDeLaPlataforma.conversaciones(p);
    expect(sim.pedidos).toEqual(["clientes"]);
  });

  it("con Ventas o el founder pide todo, igual que antes", async () => {
    for (const p of [member({ sales: "full" }), founder]) {
      sim.pedidos = [];
      await lecturasDeLaPlataforma.clientes(p);
      await lecturasDeLaPlataforma.llamadasDeCierre(p);
      await lecturasDeLaPlataforma.conversaciones(p);
      await lecturasDeLaPlataforma.cuentasDeUnipile(p);
      expect(sim.pedidos).toEqual(["clientes", "llamadas", "conversaciones", "unipile"]);
    }
  });

  it("si el servidor rechaza, queda vacío sin error", async () => {
    sim.rechazar = true;
    await expect(lecturasDeLaPlataforma.clientes(founder)).resolves.toEqual([]);
  });
});

describe("FinanceDataProvider", () => {
  it("⭐ sin Finanzas, Ventas ni Ajustes (con el Panel o nada): no pide la configuración, los cobros, el resumen ni las métricas", async () => {
    for (const p of [member({ team: "full" }), member({ dashboard: "full" })]) {
      sim.pedidos = [];
      await expect(lecturasDeFinanzas.configuracion(p)).resolves.toBeNull();
      await expect(lecturasDeFinanzas.cobros(p)).resolves.toEqual({ success: true, data: [] });
      await expect(lecturasDeFinanzas.resumen(p)).resolves.toBeNull();
      await expect(lecturasDeFinanzas.metricasImportadas(p)).resolves.toEqual({ success: true, data: [] });
      expect(sim.pedidos).toEqual([]);
    }
  });

  it("con sólo Ajustes pide la configuración (el servidor manda sólo las plataformas) y nada más", async () => {
    await lecturasDeFinanzas.configuracion(sinModulos);
    await lecturasDeFinanzas.cobros(sinModulos);
    await lecturasDeFinanzas.resumen(sinModulos);
    await lecturasDeFinanzas.metricasImportadas(sinModulos);
    expect(sim.pedidos).toEqual(["finanzas"]);
  });

  it("⭐ con sólo Ventas pide la configuración, el resumen y las métricas, no los cobros", async () => {
    const p = member({ sales: "full" });
    await lecturasDeFinanzas.configuracion(p);
    await lecturasDeFinanzas.cobros(p);
    await lecturasDeFinanzas.resumen(p);
    await lecturasDeFinanzas.metricasImportadas(p);
    expect(sim.pedidos).toEqual(["finanzas", "resumen", "metricas"]);
  });

  it("con Finanzas pide todo, como antes", async () => {
    const p = member({ finance: "view" });
    await expect(lecturasDeFinanzas.configuracion(p)).resolves.toMatchObject({ fixedExpenses: [{ id: "MARCA-GASTO" }] });
    await lecturasDeFinanzas.cobros(p);
    await lecturasDeFinanzas.metricasImportadas(p);
    expect(sim.pedidos).toEqual(["finanzas", "cobros", "metricas"]);
  });

  it("el founder pide todo, igual que antes", async () => {
    await lecturasDeFinanzas.configuracion(founder);
    await lecturasDeFinanzas.cobros(founder);
    await lecturasDeFinanzas.metricasImportadas(founder);
    expect(sim.pedidos).toEqual(["finanzas", "cobros", "metricas"]);
  });
});

describe("FinanceDataProvider: filas o resumen (AR 2, Y4)", () => {
  it("⭐ sólo con Finanzas (o founder o sin rol) trabaja con las filas; con Ventas, con el resumen del servidor", () => {
    expect(usaElDetalleDeFinanzas(member({ finance: "view" }))).toBe(true);
    expect(usaElDetalleDeFinanzas(founder)).toBe(true);
    expect(usaElDetalleDeFinanzas({ ...member({}), hasRoleConfigured: false })).toBe(true);
    expect(usaElDetalleDeFinanzas(member({ sales: "full" }))).toBe(false);
    expect(usaElDetalleDeFinanzas(member({ settings: "view", dashboard: "full" }))).toBe(false);
  });
});

describe("MarketingDataProvider", () => {
  it("⭐ sin Marketing ni Integraciones no pide el estado de Instagram y queda en false", async () => {
    await expect(leerInstagramDelMarco(sinModulos)).resolves.toBe(false);
    expect(sim.pedidos).toEqual([]);
  });

  it("con Integraciones lo pide, como antes", async () => {
    await expect(leerInstagramDelMarco(member({ integrations: "view" }))).resolves.toBe(true);
    expect(sim.pedidos).toEqual(["instagram"]);
  });
});

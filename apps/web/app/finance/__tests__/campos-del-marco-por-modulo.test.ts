/**
 * SCRUM-540 · AR pasada 1 (BLOQUEANTE-1 y MAYOR-1): qué campos de Finanzas
 * viajan a cada módulo. Mínimo privilegio: cada módulo recibe sólo lo que sus
 * pantallas muestran.
 *
 * Se llaman las actions reales del marco (configuración, resumen y cobros) con
 * la regla de permisos real y una base falsa con datos marcados, y se busca en
 * la respuesta cada marca: el nombre de un sueldo, un gasto, una suscripción,
 * una plataforma, un cliente, el monto de un cobro y su fecha. El Panel se
 * prueba con su cálculo de servidor (`calcularDatosDelPanel`): a su navegador
 * sólo llegan totales.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";
import type { Client } from "@/types/clients";
import type { ClosingCall } from "@/types/closing";

type Fila = Record<string, unknown>;

const MES = new Date().toISOString().slice(0, 7);

const sim = vi.hoisted(() => ({
  permisos: null as unknown as UserPermissions,
  tablas: {} as Record<string, Fila[]>,
  leidas: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/get-current-permissions", () => ({
  getCurrentUserPermissions: async () => sim.permisos,
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/observability/reportar-falla", () => ({ reportarFalla: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/bootstrap", () => ({
  requireOrganizationId: async () => "org-1",
  tryRequireOrganizationId: async () => "org-1",
  getCurrentProfile: async () => ({ id: "yo", role: "member" }),
  isMissingTableError: () => false,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(tabla: string) {
      sim.leidas.push(tabla);
      const filtros: Array<[string, unknown]> = [];
      const leer = () => ({
        data: (sim.tablas[tabla] ?? []).filter((f) => filtros.every(([c, v]) => f[c] === v)),
        error: null,
      });
      const builder = {
        select: () => builder,
        order: () => builder,
        eq(c: string, v: unknown) {
          filtros.push([c, v]);
          return builder;
        },
        maybeSingle: async () => ({ data: leer().data[0] ?? null, error: null }),
        then(resolver: (r: unknown) => void) {
          resolver(leer());
        },
      };
      return builder;
    },
  }),
}));

const CLIENTE = {
  id: "c1",
  name: "MARCA-CLIENTE-540",
  status: "active",
  joinDate: `${MES}-01`,
  paymentType: "upfront",
  totalAmount: 1000,
  installments: [],
} as unknown as Client;
const LLAMADA = {
  id: "l1",
  leadName: "MARCA-LEAD-540",
  scheduledAt: `${MES}-02T15:00:00Z`,
  status: "closed",
  formAnswers: [],
  closedByName: "Closer Uno",
  outcome: { revenue: 2000 },
} as unknown as ClosingCall;

vi.mock("@/lib/marco/lecturas-de-servidor", async (o) => ({
  ...(await o<typeof import("@/lib/marco/lecturas-de-servidor")>()),
  leerClientes: async () => [CLIENTE],
  leerLlamadasDeCierre: async () => [LLAMADA],
}));

import { getResumenFinancieroAction, loadFinanceConfigAction } from "@/app/finance/actions";
import { listOrganizationPaymentsAction } from "@/app/sales/payment-actions";
import { calcularDatosDelPanel } from "@/lib/dashboard/datos-del-panel";
import { leerEntradasDelResumen } from "@/lib/finance/leer-configuracion";

const MARCAS_DE_DETALLE = [
  "MARCA-SUELDO-540",
  "MARCA-GASTO-540",
  "MARCA-SUSCRIPCION-540",
  // cada cobro, y su fecha
  "54054.54",
  "1234.56",
  "2026-10-07",
  "2026-10-09",
  // los gastos por separado (fijos 300, suscripciones 20, sueldos 1500)
  '"fixedMonthly":300',
  '"subscriptionsMonthly":20',
  '"teamFixedMonthly":1500',
];

function member(modulos: Partial<UserPermissions["modules"]>): UserPermissions {
  return {
    role: "member",
    isFounder: false,
    modules: { ...emptyPermissions(), ...modulos },
    hasRoleConfigured: true,
    enabledAddOns: [],
  };
}

beforeEach(() => {
  sim.leidas = [];
  sim.tablas = {
    fixed_expenses: [
      { id: "g1", organization_id: "org-1", name: "MARCA-GASTO-540", category: "other", amount: 300, currency: "USD", frequency: "monthly", status: "active" },
    ],
    subscriptions: [
      { id: "s1", organization_id: "org-1", name: "MARCA-SUSCRIPCION-540", status: "active", amount: 20, currency: "USD", billing_cycle: "monthly" },
    ],
    team_compensation: [
      { id: "t1", organization_id: "org-1", member_name: "MARCA-SUELDO-540", role_label: "Closer", has_fixed_salary: true, fixed_amount: 1500, has_commission: false, estimated_this_month: 0 },
    ],
    payment_platforms: [{ id: "p1", organization_id: "org-1", name: "MARCA-PLATAFORMA-540", currency: "USD" }],
    client_payments: [
      { id: "pago", organization_id: "org-1", client_id: "c1", amount: 54054.54, payment_date: "2026-10-07", payment_destination_platform_id: "p1" },
      // Un segundo cobro, para que un total no coincida con el monto de un cobro.
      { id: "pago2", organization_id: "org-1", client_id: "c1", amount: 1234.56, payment_date: "2026-10-09", payment_destination_platform_id: "p1" },
    ],
    organizations: [{ id: "org-1", timezone: "America/Argentina/Buenos_Aires" }],
  };
});

async function loQueViaja() {
  const [config, resumen, cobros] = await Promise.all([
    loadFinanceConfigAction(),
    getResumenFinancieroAction(),
    listOrganizationPaymentsAction(),
  ]);
  return { config: JSON.stringify(config), resumen: JSON.stringify(resumen), cobros: JSON.stringify(cobros) };
}

const rechazado = (json: string) => json.includes('"motivo":"sin-acceso"');

describe("qué campos de Finanzas viajan a cada módulo", () => {
  it("⭐ con Finanzas: todo el detalle, como siempre (sueldos, gastos, suscripciones, lo cobrado y cada cobro)", async () => {
    sim.permisos = member({ finance: "view" });
    const v = await loQueViaja();
    for (const m of ["MARCA-SUELDO-540", "MARCA-GASTO-540", "MARCA-SUSCRIPCION-540", "MARCA-PLATAFORMA-540", "55289.1", "2026-10-09"]) {
      expect(v.config, m).toContain(m);
    }
    expect(v.cobros).toContain("54054.54");
    expect(rechazado(v.resumen)).toBe(false);
  });

  it("⭐ con sólo Ventas: las plataformas sin lo cobrado y los totales, sin ninguna fila de Finanzas", async () => {
    sim.permisos = member({ sales: "full" });
    const v = await loQueViaja();
    expect(v.config).toContain("MARCA-PLATAFORMA-540");
    for (const m of MARCAS_DE_DETALLE) {
      expect(v.config, m).not.toContain(m);
      expect(v.resumen, m).not.toContain(m);
    }
    expect(v.resumen).not.toContain("MARCA-CLIENTE-540");
    expect(rechazado(v.cobros)).toBe(true);
    // Los totales que usa Ventas sí están: los gastos del mes (300 + 20 + 1500) y la facturación.
    const resumen = JSON.parse(v.resumen) as {
      success: true;
      data: { expensesSummary: { totalMonthly: number }; financeSummary: { gastosTotales: number } };
    };
    expect(resumen.data.expensesSummary.totalMonthly).toBe(1820);
    expect(resumen.data.financeSummary.gastosTotales).toBeGreaterThan(0);
    // Lo que sólo muestra Finanzas no viaja: lo cobrado por plataforma, el desglose por closer ni lo pendiente por mes.
    const fs = (JSON.parse(v.resumen) as { data: { financeSummary: Record<string, unknown> } }).data.financeSummary;
    expect(fs.platformBalances).toEqual([]);
    expect(fs.closerBreakdown).toEqual([]);
    expect(fs.porCobrarByMonth).toEqual([]);
    expect(v.resumen).not.toContain("Closer Uno");
  });

  it("⭐ con sólo Ajustes: las plataformas sin lo cobrado ni la fecha del último cobro; nada más, y no se leen los cobros", async () => {
    sim.permisos = member({ settings: "view" });
    const v = await loQueViaja();
    expect(v.config).toContain("MARCA-PLATAFORMA-540");
    for (const m of MARCAS_DE_DETALLE) expect(v.config, m).not.toContain(m);
    expect(rechazado(v.resumen)).toBe(true);
    expect(rechazado(v.cobros)).toBe(true);
    expect(sim.leidas).not.toContain("client_payments");
  });

  it("⭐ con sólo el Panel: ninguna de las tres (sus totales los calcula su página)", async () => {
    sim.permisos = member({ dashboard: "full" });
    const v = await loQueViaja();
    expect(rechazado(v.config)).toBe(true);
    expect(rechazado(v.resumen)).toBe(true);
    expect(rechazado(v.cobros)).toBe(true);
    expect(sim.leidas).toEqual([]);
  });

  it("sin ningún módulo: ninguna", async () => {
    sim.permisos = member({ team: "full" });
    const v = await loQueViaja();
    expect([v.config, v.resumen, v.cobros].every(rechazado)).toBe(true);
  });

  it("el founder y alguien sin rol: todo, como siempre", async () => {
    for (const permisos of [{ ...member({}), role: "founder", isFounder: true }, { ...member({}), hasRoleConfigured: false }]) {
      sim.permisos = permisos;
      const v = await loQueViaja();
      expect(v.config).toContain("MARCA-SUELDO-540");
      expect(v.cobros).toContain("54054.54");
    }
  });

  it("⭐ el Panel: lo que su página manda al navegador no trae ninguna fila (ni nombres ni montos de un cobro)", async () => {
    sim.permisos = member({ dashboard: "full" });
    const { entradas } = await leerEntradasDelResumen((await (await import("@/lib/supabase/server")).createClient()) as never, "org-1");
    const datos = calcularDatosDelPanel({
      ...entradas,
      conversations: [],
      metricasImportadas: null,
      hoy: `${MES}-15`,
      frequentObjections: [],
    });
    const json = JSON.stringify(datos);
    for (const m of [...MARCAS_DE_DETALLE, "MARCA-CLIENTE-540", "MARCA-LEAD-540", "MARCA-PLATAFORMA-540"]) {
      expect(json, m).not.toContain(m);
    }
    expect(datos.data.isEmpty).toBe(false);
  });
});

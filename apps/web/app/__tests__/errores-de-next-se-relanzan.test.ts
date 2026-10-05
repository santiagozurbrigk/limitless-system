import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DynamicServerError } from "next/dist/client/components/hooks-server-context";

/**
 * Tres pantallas atrapaban con try/catch el error `DYNAMIC_SERVER_USAGE`, con
 * el que Next marca una ruta como dinámica al usar `cookies()`, y lo escribían
 * como si fuera una falla real (tres "Error:" en cada `next build`). Ahora cada
 * catch empieza con `unstable_rethrow`: los errores de Next siguen su camino y
 * sólo los errores de verdad se loguean y se reemplazan por un valor vacío.
 */

const sim = vi.hoisted(() => ({ falla: null as unknown }));

function fallaSiCorresponde(): void {
  if (sim.falla) throw sim.falla;
}

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/auth/bootstrap", () => ({
  requireOrganizationId: vi.fn(async () => {
    fallaSiCorresponde();
    return "org-1";
  }),
  getCurrentProfile: vi.fn(async () => null),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

// /operations/overview
vi.mock("@/app/operations/actions", () => ({ getWeeklyReportAction: async () => null }));
vi.mock("@/lib/executive-reports/compute-departments", () => ({
  computeDepartmentStatuses: async () => [],
}));
vi.mock("@/lib/operations/map-weekly-report", () => ({
  departmentStatusesToOperationsDepartments: () => [],
}));
vi.mock("@/mocks/operations-overview", () => ({ mockOperationsOverview: { departments: [] } }));
vi.mock("@/components/operations/operations-overview", () => ({ OperationsOverview: () => null }));
vi.mock("@/components/shared/page-header", () => ({ PageHeader: () => null }));

// /business-context/documents
vi.mock("@/app/business-context/actions", () => ({
  getBusinessContextDocumentsAction: async () => {
    fallaSiCorresponde();
    return [];
  },
  getFathomContextCallsAction: async () => ({ contextCalls: [], clientMeetingCalls: [] }),
  getCustomCategoriesAction: async () => [],
}));
vi.mock("@/app/forms/actions", () => ({
  getGoogleFormsIntegrationStatusAction: async () => ({ connected: false }),
}));
vi.mock("@/components/business-context/knowledge-base-page", () => ({ KnowledgeBasePage: () => null }));

import * as React from "react";
import OperationsOverviewPage from "@/app/(platform)/operations/overview/page";
import BusinessContextDocumentsPage from "@/app/(platform)/business-context/documents/page";
import { getSalesCallsAction } from "@/app/fathom/actions";

// Las páginas usan JSX clásico.
(globalThis as Record<string, unknown>).React = React;

const CASOS = [
  ["/operations/overview", () => OperationsOverviewPage()],
  ["/business-context/documents", () => BusinessContextDocumentsPage()],
  ["/sales/llamadas (getSalesCallsAction)", () => getSalesCallsAction()],
] as const;

let errorDeConsola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.falla = null;
  errorDeConsola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorDeConsola.mockRestore());

describe.each(CASOS)("%s", (_ruta, cargar) => {
  it("⭐ el error de ruta dinámica de Next se relanza y no se loguea como falla", async () => {
    sim.falla = new DynamicServerError("Route usó `cookies`");
    await expect(cargar()).rejects.toMatchObject({ digest: "DYNAMIC_SERVER_USAGE" });
    expect(errorDeConsola).not.toHaveBeenCalled();
  });

  it("un error real se sigue atrapando y logueando, y la pantalla carga igual", async () => {
    sim.falla = new Error("fallo de red");
    await expect(cargar()).resolves.toBeDefined();
    expect(errorDeConsola).toHaveBeenCalled();
  });
});

/** Todos los `page.tsx` y `layout.tsx` de `app/`. */
function componentesDeServidor(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : componentesDeServidor(ruta);
    return e.name === "page.tsx" || e.name === "layout.tsx" ? [ruta] : [];
  });
}

describe("los catch de páginas y layouts", () => {
  it("⭐ todo catch de una página o layout empieza relanzando los errores de Next", () => {
    const app = join(__dirname, "..");
    const sinRelanzar: string[] = [];
    for (const archivo of componentesDeServidor(app)) {
      // Se vacían los template strings (conservando los saltos de línea): el
      // script del navegador de `app/layout.tsx` tiene su propio try/catch y
      // no es código de servidor.
      const codigo = readFileSync(archivo, "utf8").replace(/`[^`]*`/g, (t) =>
        t.replace(/[^\n]/g, " ")
      );
      const lineas = codigo.split("\n");
      lineas.forEach((linea, i) => {
        if (!/\bcatch\s*(\(|\{)|\.catch\(/.test(linea)) return;
        const siguientes = lineas.slice(i, i + 5).join("\n");
        if (!siguientes.includes("unstable_rethrow(")) {
          sinRelanzar.push(`${relative(app, archivo)}:${i + 1}`);
        }
      });
    }
    expect(sinRelanzar).toEqual([]);
  });
});

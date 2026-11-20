/**
 * SCRUM-540 · Una página con módulo no lee nada si quien entra no tiene el
 * módulo, y dibuja «No tenés acceso».
 *
 * Es el caso medido en la AR de SCRUM-524: un miembro sin Operaciones recibía
 * el título y el contenido de los SOP en la respuesta, aunque en pantalla
 * dijera «No tenés acceso», porque la página corre aunque el layout de la
 * plataforma no la dibuje. Acá se renderizan las páginas reales con permisos
 * simulados y se cuentan las lecturas.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";

const sim = vi.hoisted(() => ({
  permisos: null as unknown as UserPermissions,
  lecturas: [] as string[],
}));

// Hoy nada de esta cadena importa `server-only`; con SCRUM-524 el layout del
// Agente sí (la redirección por experiencia), y en Vitest ese paquete no existe.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/get-current-permissions", () => ({
  getCurrentUserPermissions: async () => sim.permisos,
}));
vi.mock("@/lib/sops/queries", () => ({
  listSops: async () => {
    sim.lecturas.push("listSops");
    return [{ id: "s1", title: "MARCA-SOP" }];
  },
  getSopContentById: async () => {
    sim.lecturas.push("getSopContentById");
    return {
      sop: { id: "s1", title: "MARCA-SOP", status: "active", goal: "OBJETIVO", generatedByAI: false, version: 1 },
      content: "CONTENIDO-SOP",
    };
  },
}));
vi.mock("@/lib/sops/suggest-sops", () => ({
  detectSOPOpportunities: async () => {
    sim.lecturas.push("detectSOPOpportunities");
    return [];
  },
}));
vi.mock("@/lib/auth/bootstrap", () => ({
  requireOrganizationId: async () => {
    sim.lecturas.push("requireOrganizationId");
    return "org";
  },
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
// Los componentes de la pantalla usan hooks de cliente: alcanza con ver qué reciben.
vi.mock("@/components/sops", () => ({
  SopsOverview: ({ sops }: { sops: { title: string }[] }) =>
    createElement("p", null, sops.map((s) => s.title).join(",")),
  SopStatusBadge: () => null,
}));
vi.mock("@/components/sops/sop-content-viewer", () => ({
  SopContentViewer: ({ content }: { content: string }) => createElement("p", null, content),
}));
vi.mock("@/app/(platform)/agent/agent-layout-cliente", () => ({
  AgentLayoutCliente: ({ children }: { children: unknown }) =>
    createElement("div", null, "PROVIDER-DEL-AGENTE", children as never),
}));

import SopDetailPage from "../(platform)/sops/[id]/page";
import OperationsSopsPage from "../(platform)/operations/sops/page";
import AgentLayout from "../(platform)/agent/layout";

function member(modulos: Partial<UserPermissions["modules"]>): UserPermissions {
  return {
    role: "member",
    isFounder: false,
    modules: { ...emptyPermissions(), ...modulos },
    hasRoleConfigured: true,
    enabledAddOns: [],
  };
}

const params = Promise.resolve({ id: "s1" });

beforeEach(() => {
  sim.lecturas = [];
});

describe("páginas de SOP", () => {
  it("⭐ sin Operaciones: «No tenés acceso» y ninguna lectura, ni del SOP ni de la org", async () => {
    sim.permisos = member({ team: "full", settings: "view" });
    const detalle = renderToStaticMarkup((await SopDetailPage({ params }))!);
    const lista = renderToStaticMarkup((await OperationsSopsPage())!);
    for (const html of [detalle, lista]) {
      expect(html).toContain("No tenés acceso a Operaciones");
      expect(html).not.toContain("MARCA-SOP");
      expect(html).not.toContain("CONTENIDO-SOP");
    }
    expect(sim.lecturas).toEqual([]);
  });

  it("con Operaciones (sólo ver) dibuja el SOP como siempre", async () => {
    sim.permisos = member({ operations: "view" });
    const detalle = renderToStaticMarkup((await SopDetailPage({ params }))!);
    expect(detalle).toContain("MARCA-SOP");
    expect(detalle).toContain("CONTENIDO-SOP");
    expect(detalle).not.toContain("No tenés acceso");
    expect(sim.lecturas).toEqual(["getSopContentById"]);
  });

  it("el founder y alguien sin rol ven la lista igual que antes", async () => {
    for (const permisos of [
      { ...member({}), role: "founder", isFounder: true },
      { ...member({}), hasRoleConfigured: false },
    ]) {
      sim.lecturas = [];
      sim.permisos = permisos;
      const lista = renderToStaticMarkup((await OperationsSopsPage())!);
      expect(lista).toContain("MARCA-SOP");
      expect(sim.lecturas).toContain("listSops");
    }
  });
});

describe("layout del Agente", () => {
  it("⭐ sin el módulo no monta el provider que pide las conversaciones", async () => {
    sim.permisos = member({ team: "full" });
    const html = renderToStaticMarkup(
      (await AgentLayout({ children: createElement("p", null, "PAGINA") }))!
    );
    expect(html).toContain("No tenés acceso a Agente de negocio");
    expect(html).not.toContain("PROVIDER-DEL-AGENTE");
    expect(html).not.toContain("PAGINA");
  });

  it("con el módulo monta el provider con la página adentro", async () => {
    sim.permisos = member({ agent: "view" });
    const html = renderToStaticMarkup(
      (await AgentLayout({ children: createElement("p", null, "PAGINA") }))!
    );
    expect(html).toContain("PROVIDER-DEL-AGENTE");
    expect(html).toContain("PAGINA");
  });
});

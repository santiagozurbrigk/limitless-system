/**
 * SCRUM-18 · [PERMISOS-FOUNDER-AREA]: `/founder` e `/intelligence` dibujan
 * «No tenés acceso» cuando la lectura del resumen vuelve rechazada.
 *
 * Importa porque en una navegación del cliente (⌘K, un link) el layout de la
 * plataforma no se vuelve a ejecutar y la página sí: el único chequeo que corre
 * es el de la lectura. Si la lectura lanzara, el member vería la pantalla de
 * error de Next en vez de `SinAcceso`.
 *
 * La action se simula con el resultado que devuelve (su lógica se prueba en
 * `app/intelligence/__tests__/actions.test.ts`); el contenido de cada pantalla
 * se reemplaza por una marca, porque usa providers del cliente.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  IntelligenceSnapshotView,
  ResultadoSnapshotDeInteligencia,
} from "@/app/intelligence/actions";

const SNAPSHOT: IntelligenceSnapshotView = {
  insights: [],
  recommendations: [],
  bottlenecks: [],
  opportunities: [],
  memoryChunks: [],
  generatedAt: null,
};

const sim = vi.hoisted(() => ({
  resultado: null as unknown as ResultadoSnapshotDeInteligencia,
  rol: "member",
}));

vi.mock("@/app/intelligence/actions", () => ({
  getIntelligenceSnapshotAction: async () => sim.resultado,
}));
vi.mock("@/lib/auth/bootstrap", () => ({
  getCurrentProfile: async () => ({ role: sim.rol }),
}));
vi.mock("@/components/founder", () => ({
  FounderOverview: ({ isFounder }: { isFounder: boolean }) =>
    createElement("p", null, `AREA_DEL_FUNDADOR founder=${isFounder}`),
}));
vi.mock("@/components/intelligence/intelligence-page-content", () => ({
  IntelligencePageContent: ({ isFounder }: { isFounder: boolean }) =>
    createElement("p", null, `INTELIGENCIA founder=${isFounder}`),
}));

import FounderAreaPage from "../(platform)/founder/page";
import IntelligencePage from "../(platform)/intelligence/page";

const RECHAZO: ResultadoSnapshotDeInteligencia = {
  success: false,
  error: "No tenés acceso a Operaciones.",
  motivo: "sin-acceso",
  moduleId: "operations",
};

const paginas = [
  { ruta: "/founder", Pagina: FounderAreaPage, marca: "AREA_DEL_FUNDADOR" },
  { ruta: "/intelligence", Pagina: IntelligencePage, marca: "INTELIGENCIA" },
];

beforeEach(() => {
  sim.rol = "member";
});

describe.each(paginas)("$ruta", ({ Pagina, marca }) => {
  it("⭐ con la lectura rechazada dibuja «No tenés acceso a Operaciones» y no lanza", async () => {
    sim.resultado = RECHAZO;
    const html = renderToStaticMarkup(await Pagina());
    expect(html).toContain("No tenés acceso a Operaciones");
    expect(html).not.toContain(marca);
  });

  it("con el resumen dibuja la pantalla", async () => {
    sim.resultado = { success: true, data: SNAPSHOT };
    const html = renderToStaticMarkup(await Pagina());
    expect(html).toContain(`${marca} founder=false`);
    expect(html).not.toContain("No tenés acceso");
  });

  it("al founder le dibuja la pantalla como founder", async () => {
    sim.rol = "founder";
    sim.resultado = { success: true, data: SNAPSHOT };
    expect(renderToStaticMarkup(await Pagina())).toContain(
      `${marca} founder=true`
    );
  });
});

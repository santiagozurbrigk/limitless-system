/**
 * SCRUM-524 (fix-pack 2 de A1, BLQ-2) · ⭐ «Generar SOP» en el panel de un
 * documento del contexto del negocio, según la experiencia.
 *
 * `/business-context/[id]` es una ruta extra de `limitless`
 * (`RUTAS_EXTRA_POR_EXPERIENCIA`), pero el link «Generar SOP» lleva a la
 * biblioteca de SOP (`/operations/sops#crear`), que `limitless` no abre: el
 * link rebotaba a Clientes. Decisión de Fernando: esconderlo cuando la
 * experiencia no abre su destino (`rutaPermitidaParaLaExperiencia`).
 *
 * Se dibuja el `DocumentViewerSidebar` real con el provider real de la
 * experiencia. Se reemplazan sólo el router de Next, las Server Actions y los
 * toasts, que este dibujo no usa. `webinar` no llega a esta pantalla (su
 * segmento está cerrado), así que no se prueba.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OrganizationExperience } from "@/lib/organization/experience";
import type { ContextDocument } from "@/types/business-context";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/business-context/actions", () => ({
  deleteDocumentAction: vi.fn(),
  getDocumentOriginalFileUrlAction: vi.fn(),
}));
vi.mock("@/providers/toast-provider", () => ({ useToast: () => ({ push: vi.fn() }) }));

import { DocumentViewerSidebar } from "../document-viewer-sidebar";
import { ExperienciaProvider } from "@/providers/experiencia-provider";

const DOCUMENTO: ContextDocument = {
  id: "doc-1",
  title: "Proceso de ventas",
  category: "frameworks",
  source: "Google Docs",
  summary: "",
  preview: "",
  updatedAt: "2026-11-01T00:00:00.000Z",
  linkedSops: [],
};

function panel(experiencia: OrganizationExperience, inicio: string) {
  return renderToStaticMarkup(
    createElement(
      ExperienciaProvider,
      { experiencia, inicio },
      createElement(DocumentViewerSidebar, { document: DOCUMENTO })
    )
  );
}

describe("⭐ «Generar SOP» en el panel de un documento", () => {
  it("full: el link está y lleva a la biblioteca de SOP", () => {
    const html = panel("full", "/dashboard");
    expect(html).toContain("Eliminar documento");
    expect(html).toContain("Generar SOP");
    expect(html).toContain('href="/operations/sops#crear"');
  });

  it("limitless: no está (la biblioteca de SOP no es de su experiencia); el resto del panel sí", () => {
    const html = panel("limitless", "/clients");
    expect(html).toContain("Eliminar documento");
    expect(html).not.toContain("Generar SOP");
    expect(html).not.toContain("/operations/sops");
  });
});

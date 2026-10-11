import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { horarioDeCron, rutasDeCrons, slugDeCron } from "@/lib/observability/cron-monitor";
import { etiquetasDeFalla } from "@/lib/observability/reportar-falla";

describe("monitores de crons (SCRUM-84)", () => {
  it("arma el slug del monitor desde la ruta", () => {
    expect(slugDeCron("/api/cron/ghl-sync")).toBe("cron-ghl-sync");
    expect(slugDeCron("/api/integrations/fathom/process")).toBe(
      "integrations-fathom-process"
    );
  });

  it("toma el horario de vercel.json", () => {
    expect(horarioDeCron("/api/integrations/fathom/process")).toBe("*/10 * * * *");
    expect(horarioDeCron("/api/no-existe")).toBeUndefined();
  });

  it("los 19 crons de vercel.json tienen monitor, con slugs distintos", () => {
    const rutas = rutasDeCrons();
    expect(rutas).toHaveLength(19);
    expect(new Set(rutas.map(slugDeCron)).size).toBe(rutas.length);

    for (const ruta of rutas) {
      const archivo = path.join(process.cwd(), "app", ruta, "route.ts");
      const codigo = readFileSync(archivo, "utf8");
      // El GET (lo que llama Vercel Cron) pasa por el monitor con su propia ruta.
      expect(codigo, ruta).toContain(`export const GET = conMonitorDeCron("${ruta}"`);
    }
  });
});

describe("etiquetas de una falla", () => {
  it("lleva org, cron y proveedor cuando los hay", () => {
    expect(
      etiquetasDeFalla({ cron: "/api/cron/ghl-sync", organizationId: "org-1", provider: "ghl" })
    ).toEqual({
      proceso_de_fondo: "true",
      cron: "/api/cron/ghl-sync",
      org_id: "org-1",
      provider: "ghl",
    });
    expect(etiquetasDeFalla({})).toEqual({ proceso_de_fondo: "true" });
  });

  it("la falla de una server action lleva su etiqueta y no cuenta como proceso de fondo (SCRUM-497)", () => {
    expect(etiquetasDeFalla({ accion: "[createClient]", organizationId: "org-1" })).toEqual({
      server_action: "[createClient]",
      org_id: "org-1",
    });
  });

  it("una lectura degradada lleva su etiqueta y no cuenta como proceso de fondo (SCRUM-108)", () => {
    expect(etiquetasDeFalla({ lectura: "layout-plataforma:zona" })).toEqual({
      lectura_degradada: "layout-plataforma:zona",
    });
  });
});

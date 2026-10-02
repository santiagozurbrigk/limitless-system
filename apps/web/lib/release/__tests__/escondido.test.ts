import { describe, expect, it } from "vitest";
import { buildPlatformNavigation } from "@/lib/navigation/build-platform-navigation";
import { modulesWithChildren } from "@/lib/navigation/sidebar-modules";
import { LISTED_INTEGRATIONS } from "@/lib/integrations/registry";
import { canalesDeLeadMagnetVisibles } from "@/lib/marketing/lead-magnet-canales";
import { paths } from "@/routes/paths";

/**
 * SCRUM-490: lo escondido para el release no aparece en ningún lado — ni en el
 * menú ni en el buscador ⌘K ni en el catálogo de integraciones.
 */
describe("escondido para el release", () => {
  const todosLosHrefs = buildPlatformNavigation().flatMap((item) => [
    item.href,
    ...(item.children ?? []).map((c) => c.href),
  ]);

  it("el ⌘K no lista ninguna pantalla escondida del menú", () => {
    const escondidos = Object.values(modulesWithChildren)
      .flatMap((m) => m.children)
      .filter((c) => c.hidden)
      .map((c) => c.href);

    expect(escondidos.length).toBeGreaterThan(0);
    for (const href of escondidos) expect(todosLosHrefs).not.toContain(href);
  });

  it("el ⌘K no lleva al Overview de Marketing; Marketing entra por Contenido", () => {
    expect(todosLosHrefs).not.toContain(paths.platform.marketing.overview);
    const marketing = buildPlatformNavigation().find((i) => i.label === "Marketing");
    expect(marketing?.href).toBe(paths.platform.marketing.content);
  });

  it("el catálogo de integraciones no ofrece ManyChat", () => {
    expect(LISTED_INTEGRATIONS.map((d) => d.provider)).not.toContain("manychat");
  });

  it("Lead Magnets ofrece sólo los canales que no prometen una captura falsa", () => {
    const canales = ["manychat", "instagram_dm", "typeform", "google_forms", "landing", "manual"].map(
      (value) => ({ value })
    );
    expect(canalesDeLeadMagnetVisibles(canales).map((c) => c.value)).toEqual([
      "instagram_dm",
      "manual",
    ]);
    expect(canalesDeLeadMagnetVisibles(canales, false)).toHaveLength(6);
  });
});

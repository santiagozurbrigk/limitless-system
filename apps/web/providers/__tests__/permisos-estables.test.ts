import { describe, expect, it } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import { permisosEstables } from "@/providers/permissions-provider";

/**
 * SCRUM-540 · AR pasada 1 (MENOR-1, X1): los lectores del marco reciben el
 * mismo objeto de permisos mientras no cambien. Si no, cada `router.refresh()`
 * (que manda un objeto nuevo con los mismos valores) volvería a disparar todas
 * las lecturas del marco.
 */

const conVentas = () => ({
  isFounder: false,
  hasRoleConfigured: true,
  modules: { ...emptyPermissions(), sales: "full" as const },
});

describe("permisosEstables", () => {
  it("⭐ con el mismo contenido en un objeto nuevo devuelve el mismo objeto", () => {
    const a = permisosEstables(conVentas());
    const b = permisosEstables(conVentas());
    expect(b).toBe(a);
  });

  it("si cambia un módulo, un objeto nuevo con el cambio", () => {
    const a = permisosEstables(conVentas());
    const cambiado = conVentas();
    cambiado.modules.finance = "view";
    const b = permisosEstables(cambiado);
    expect(b).not.toBe(a);
    expect(b.modules.finance).toBe("view");
  });

  it("ignora lo que no son permisos de módulo (el rol, los add-ons)", () => {
    const a = permisosEstables(conVentas());
    const b = permisosEstables({ ...conVentas(), role: "otro", enabledAddOns: ["producto"] } as never);
    expect(b).toBe(a);
  });
});

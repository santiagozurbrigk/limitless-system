import { describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import { suscribirPanelEnVivo } from "@/lib/dashboard/panel-en-vivo";

/**
 * SCRUM-540 · AR pasada 2 (MENOR-1): el Panel vuelve a actualizarse en vivo,
 * pero sólo abre el canal de conversaciones si quien mira puede leerlas, y
 * ante un cambio vuelve a pedir el Panel al servidor sin usar la fila.
 */

function clienteFalso() {
  const sim = { canales: [] as string[], filtros: [] as unknown[], handler: null as null | ((p: unknown) => void), quitados: 0 };
  const canal = {
    on(_tipo: string, filtro: unknown, handler: (p: unknown) => void) {
      sim.filtros.push(filtro);
      sim.handler = handler;
      return canal;
    },
    subscribe() {
      return canal;
    },
  };
  const cliente = {
    channel(nombre: string) {
      sim.canales.push(nombre);
      return canal;
    },
    removeChannel() {
      sim.quitados += 1;
    },
  };
  return { sim, cliente: () => cliente as never };
}

const permisos = (modulos: Record<string, string>, extra: Record<string, unknown> = {}) =>
  ({ isFounder: false, hasRoleConfigured: true, modules: { ...emptyPermissions(), ...modulos }, ...extra }) as never;

describe("suscribirPanelEnVivo", () => {
  it("⭐ con sólo el Panel no abre ningún canal", () => {
    const { sim, cliente } = clienteFalso();
    expect(suscribirPanelEnVivo({ permisos: permisos({ dashboard: "full" }), organizationId: "org", cliente, alCambiar: vi.fn() })).toBeNull();
    expect(sim.canales).toEqual([]);
  });

  it("⭐ con Ventas (o el founder) escucha las conversaciones de su org y, ante un cambio, sólo pide el Panel de nuevo", () => {
    for (const p of [permisos({ dashboard: "full", sales: "view" }), permisos({}, { isFounder: true })]) {
      const { sim, cliente } = clienteFalso();
      const alCambiar = vi.fn();
      const cortar = suscribirPanelEnVivo({ permisos: p, organizationId: "org-1", cliente, alCambiar });
      expect(sim.canales).toHaveLength(1);
      expect(sim.filtros).toEqual([
        { event: "*", schema: "public", table: "conversations", filter: "organization_id=eq.org-1" },
      ]);
      sim.handler!({ new: { lead_name: "MARCA" } });
      expect(alCambiar).toHaveBeenCalledTimes(1);
      expect(alCambiar).toHaveBeenCalledWith();
      cortar!();
      expect(sim.quitados).toBe(1);
    }
  });

  it("sin organización no se suscribe", () => {
    const { sim, cliente } = clienteFalso();
    expect(suscribirPanelEnVivo({ permisos: permisos({}, { isFounder: true }), organizationId: null, cliente, alCambiar: vi.fn() })).toBeNull();
    expect(sim.canales).toEqual([]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import {
  ESPERA_PARA_CERRAR_MS,
  INTERVALO_ENTRE_AVISOS_MS,
  suscribirPanelEnVivo,
} from "@/lib/dashboard/panel-en-vivo";

/**
 * SCRUM-540 · AR pasada 2 (MENOR-1): el Panel vuelve a actualizarse en vivo,
 * pero sólo abre el canal de conversaciones si quien mira puede leerlas, y
 * ante un cambio vuelve a pedir el Panel al servidor sin usar la fila. El
 * canal es uno por organización y se cierra después del último Panel.
 * Cada test usa otra organización: el canal compartido vive en el módulo.
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
    auth: { getSession: async () => ({ data: { session: { access_token: "x" } } }) },
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
const founder = permisos({}, { isFounder: true });
/** El canal se abre después de leer la sesión (asíncrono). */
const esperar = () => new Promise((r) => setImmediate(r));

afterEach(() => vi.useRealTimers());

describe("suscribirPanelEnVivo", () => {
  it("⭐ con sólo el Panel no abre ningún canal", () => {
    const { sim, cliente } = clienteFalso();
    expect(suscribirPanelEnVivo({ permisos: permisos({ dashboard: "full" }), organizationId: "org-a", cliente, alCambiar: vi.fn() })).toBeNull();
    expect(sim.canales).toEqual([]);
  });

  it("⭐ con Ventas (o el founder) escucha las conversaciones de su org, después de tener la sesión, y ante un cambio sólo pide el Panel de nuevo", async () => {
    for (const [p, org] of [[permisos({ dashboard: "full", sales: "view" }), "org-b"], [founder, "org-c"]] as const) {
      const { sim, cliente } = clienteFalso();
      const alCambiar = vi.fn();
      suscribirPanelEnVivo({ permisos: p, organizationId: org, cliente, alCambiar });
      expect(sim.canales).toEqual([]);
      await esperar();
      expect(sim.canales).toEqual([`panel:conversations:${org}`]);
      expect(sim.filtros).toEqual([
        { event: "*", schema: "public", table: "conversations", filter: `organization_id=eq.${org}` },
      ]);
      sim.handler!({ new: { lead_name: "MARCA" } });
      expect(alCambiar).toHaveBeenCalledTimes(1);
      expect(alCambiar).toHaveBeenCalledWith();
    }
  });

  it("⭐ dos montajes seguidos comparten un canal; se cierra unos segundos después del último, y no si vuelve otro antes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { sim, cliente } = clienteFalso();
    const a = vi.fn();
    const b = vi.fn();
    const cortarA = suscribirPanelEnVivo({ permisos: founder, organizationId: "org-d", cliente, alCambiar: a })!;
    await esperar();
    cortarA();
    // El segundo montaje puede llegar un rato después: el canal sigue abierto.
    vi.advanceTimersByTime(1000);
    const cortarB = suscribirPanelEnVivo({ permisos: founder, organizationId: "org-d", cliente, alCambiar: b })!;
    await esperar();
    vi.advanceTimersByTime(ESPERA_PARA_CERRAR_MS * 2);
    expect(sim.canales).toHaveLength(1);
    expect(sim.quitados).toBe(0);
    sim.handler!({});
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    cortarB();
    vi.advanceTimersByTime(ESPERA_PARA_CERRAR_MS);
    expect(sim.quitados).toBe(1);
  });

  it("sin organización no se suscribe", () => {
    const { sim, cliente } = clienteFalso();
    expect(suscribirPanelEnVivo({ permisos: founder, organizationId: null, cliente, alCambiar: vi.fn() })).toBeNull();
    expect(sim.canales).toEqual([]);
  });

  it("⭐ una ráfaga de 31 cambios seguidos pide el Panel 2 veces: enseguida y una al final (AR 3)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { sim, cliente } = clienteFalso();
    const alCambiar = vi.fn();
    suscribirPanelEnVivo({ permisos: founder, organizationId: "org-e", cliente, alCambiar });
    await esperar();
    for (let i = 0; i < 31; i++) {
      sim.handler!({});
      vi.advanceTimersByTime(30);
    }
    expect(alCambiar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(INTERVALO_ENTRE_AVISOS_MS);
    expect(alCambiar).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(INTERVALO_ENTRE_AVISOS_MS * 4);
    expect(alCambiar).toHaveBeenCalledTimes(2);
  });

  it("⭐ un cambio solo sigue pidiendo el Panel enseguida, y otro un rato después también", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { sim, cliente } = clienteFalso();
    const alCambiar = vi.fn();
    suscribirPanelEnVivo({ permisos: founder, organizationId: "org-f", cliente, alCambiar });
    await esperar();
    sim.handler!({});
    expect(alCambiar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(INTERVALO_ENTRE_AVISOS_MS + 100);
    sim.handler!({});
    expect(alCambiar).toHaveBeenCalledTimes(2);
  });

  it("⭐ el último cambio de una ráfaga siempre termina en la pantalla, aunque llegue justo antes del aviso del final", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { sim, cliente } = clienteFalso();
    const alCambiar = vi.fn();
    suscribirPanelEnVivo({ permisos: founder, organizationId: "org-g", cliente, alCambiar });
    await esperar();
    sim.handler!({});
    vi.advanceTimersByTime(INTERVALO_ENTRE_AVISOS_MS - 1);
    sim.handler!({});
    vi.advanceTimersByTime(1);
    expect(alCambiar).toHaveBeenCalledTimes(2);
  });

  it("si el canal se cierra con un aviso esperando, ese aviso no sale", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { sim, cliente } = clienteFalso();
    const alCambiar = vi.fn();
    const cortar = suscribirPanelEnVivo({ permisos: founder, organizationId: "org-h", cliente, alCambiar })!;
    await esperar();
    sim.handler!({});
    sim.handler!({});
    cortar();
    vi.advanceTimersByTime(ESPERA_PARA_CERRAR_MS + INTERVALO_ENTRE_AVISOS_MS);
    expect(sim.quitados).toBe(1);
    expect(alCambiar).toHaveBeenCalledTimes(1);
  });
});

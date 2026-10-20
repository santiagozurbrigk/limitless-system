/**
 * SCRUM-540 · Las Server Actions de lectura que chequean el módulo devuelven
 * el rechazo como valor, sin leer nada, a quien no tiene el módulo.
 *
 * La lista sale del mismo recorrido que el test de inventario
 * (`lecturas-por-modulo.test.ts`): toda action de lectura de un solo módulo
 * que el detector da por chequeada se llama acá de verdad, así el patrón que
 * mira el detector se prueba también en ejecución. Si mañana una arranca con
 * el patrón pero lee algo antes (por un import con efectos), este test lo ve.
 */

import { dirname, join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";
import { permissionModuleForPath } from "@/lib/navigation/module-for-path";
import { segmentosAlEntrar } from "@/lib/navigation/__tests__/pantallas-de-app";
import {
  GrafoDeImports,
  LLAMADA_DEL_MARCO,
  NOMBRE_DE_LECTURA,
  entradasDeApp,
} from "@/lib/navigation/__tests__/lecturas-de-app";
import {
  MODULOS_DE_LAS_LECTURAS_DEL_MARCO,
  type LecturaDelMarco,
} from "@/lib/auth/lecturas-del-marco";

const sim = vi.hoisted(() => ({
  permisos: null as unknown as UserPermissions,
  lecturas: [] as string[],
}));

vi.mock("@/lib/auth/get-current-permissions", () => ({
  getCurrentUserPermissions: async () => sim.permisos,
}));
function lectura(nombre: string) {
  return () => {
    sim.lecturas.push(nombre);
    throw new Error(`no se tenía que leer: ${nombre}`);
  };
}
vi.mock("server-only", () => ({}));
// Con Supabase configurado: si no, algunas lecturas devuelven vacío antes de chequear.
vi.mock("@/lib/supabase/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/env")>()),
  isSupabaseConfigured: () => true,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: lectura("createClient") }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: lectura("createAdminClient") }));
vi.mock("@/lib/auth/bootstrap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/bootstrap")>()),
  requireOrganizationId: lectura("requireOrganizationId"),
  getCurrentProfile: lectura("getCurrentProfile"),
}));

const WEB = process.cwd();
const APP_DIR = join(WEB, "app");

function moduloDeLaEntrada(entrada: string): string | null {
  if (!/[\\/](page|layout)\.(tsx|ts|jsx|js)$/.test(entrada)) return null;
  let segmentos: string[] = [];
  for (const p of dirname(entrada).slice(APP_DIR.length).split(/[\\/]/).filter(Boolean)) {
    segmentos = segmentosAlEntrar(segmentos, p);
  }
  return permissionModuleForPath(`/${segmentos.join("/")}`);
}

const grafo = new GrafoDeImports(WEB);
const modulos = new Map<string, Set<string>>();
for (const entrada of entradasDeApp(APP_DIR)) {
  const modulo = moduloDeLaEntrada(entrada) ?? "fuera";
  for (const accion of grafo.accionesDesde(entrada)) {
    if (!NOMBRE_DE_LECTURA.test(accion.split("#")[1]!)) continue;
    modulos.set(accion, (modulos.get(accion) ?? new Set()).add(modulo));
  }
}
const chequeadas = [...modulos]
  .filter(([, m]) => m.size === 1 && !m.has("fuera"))
  .map(([accion, m]) => ({ accion, modulo: [...m][0]!, chequeo: grafo.chequeoDeLaAccion(accion) }))
  .filter((a) => a.chequeo !== null);

const sinNada = (): UserPermissions => ({
  role: "member",
  isFounder: false,
  modules: emptyPermissions(),
  hasRoleConfigured: true,
  enabledAddOns: [],
});

beforeEach(() => {
  sim.lecturas = [];
  sim.permisos = sinNada();
});

type Acciones = Record<string, (...args: unknown[]) => Promise<unknown>>;
const cargados = new Map<string, Acciones>();

/**
 * Los archivos de actions se importan una vez, todos juntos, antes de los casos. Cargar uno trae
 * sus dependencias (el SDK de OpenAI, Google, el lector de PDF...) y eso lo pagaba el primer caso
 * de cada archivo: hasta 3,9 s en la suite contra los 5 s por caso (QA de SCRUM-540). Juntos,
 * en paralelo, tardan menos que uno detrás de otro, y cada caso queda en milisegundos. El
 * timeout del hook es explícito porque es una carga de ~40 archivos con todo su grafo, no un
 * caso: con la máquina cargada tarda varias veces lo normal.
 */
beforeAll(async () => {
  const archivos = [...new Set([...chequeadas, ...delMarco].map((a) => a.accion.split("#")[0]!))];
  await Promise.all(
    archivos.map(async (archivo) => {
      cargados.set(archivo, (await import(/* @vite-ignore */ join(WEB, archivo))) as Acciones);
    })
  );
}, 60_000);

function accionDe(accion: string): (...args: unknown[]) => Promise<unknown> {
  const [archivo, nombre] = accion.split("#") as [string, string];
  const fn = cargados.get(archivo)?.[nombre];
  if (!fn) throw new Error(`${accion} no se cargó`);
  return fn;
}

describe("lecturas que chequean el módulo", () => {
  it("son las de la entrega (la de Inteligencia, la de los SOP y las de Ventas, entre otras)", () => {
    const nombres = chequeadas.map((a) => a.accion);
    expect(nombres).toContain("app/intelligence/actions.ts#getIntelligenceSnapshotAction");
    expect(nombres).toContain("app/sops/actions.ts#getSOPVersionsAction");
    expect(nombres).toContain("app/sales/lead-actions.ts#listLeadsTableAction");
    expect(chequeadas.length).toBeGreaterThanOrEqual(50);
  });

  it.each(chequeadas.map((a) => [a.accion, a.modulo] as const))(
    "⭐ %s: sin %s devuelve el rechazo y no lee",
    async (accion, modulo) => {
      const resultado = await accionDe(accion)("x", "y", "z");
      expect(resultado).toMatchObject({ success: false, motivo: "sin-acceso", moduleId: modulo });
      expect(sim.lecturas).toEqual([]);
    }
  );
});

// Las del marco de la plataforma (SCRUM-540): las que el detector da por
// chequeadas con `rechazoDeLecturaDelMarco`, llamadas de verdad.
const delMarco = [...grafo.accionesDesde(join(APP_DIR, "(platform)", "layout.tsx"))]
  .map((accion) => ({ accion, lectura: grafo.chequeoDeLaAccion(accion, LLAMADA_DEL_MARCO) }))
  .filter((a): a is { accion: string; lectura: LecturaDelMarco } => a.lectura !== null);

describe("lecturas del marco que chequean el módulo", () => {
  it("son las de los providers, la barra y el menú del celular", () => {
    expect(delMarco.map((a) => a.accion)).toEqual(
      expect.arrayContaining([
        "app/clients/actions.ts#listClientsAction",
        "app/finance/actions.ts#loadFinanceConfigAction",
        "app/executive-reports/actions.ts#getLatestReportsByCadenceAction",
      ])
    );
    expect(delMarco.length).toBeGreaterThanOrEqual(10);
  });

  it.each(delMarco.map((a) => [a.accion, a.lectura] as const))(
    "⭐ %s (%s): sin ningún módulo devuelve el rechazo y no lee",
    async (accion, lectura) => {
      const resultado = await accionDe(accion)();
      expect(resultado).toMatchObject({
        success: false,
        motivo: "sin-acceso",
        moduleId: MODULOS_DE_LAS_LECTURAS_DEL_MARCO[lectura][0],
      });
      expect(sim.lecturas).toEqual([]);
    }
  );
});

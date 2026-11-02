import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pantallas } from "@/lib/navigation/__tests__/pantallas-de-app";
import { ErrorEsperable } from "@/lib/server/error-esperable";

/**
 * SCRUM-524 · ⭐ El bloqueo por experiencia, ejecutando los layouts reales.
 *
 * Cada carpeta de `app/(platform)` tiene un layout que llama a
 * `exigirRutaDeLaExperiencia`. Acá se ejecuta cada uno, como lo hace Next al
 * entrar al segmento (al tipear la URL, con un link o con `router.push`), con
 * la cadena real: `getOrganizationExperience()` lee
 * `organizations.experience` de la organización activa con un cliente de
 * Supabase simulado. Así también se prueba que la experiencia es la de la
 * organización activa (la del negocio elegido, en un holding) y que una falla
 * de lectura no bloquea a nadie.
 */

class Redireccion extends Error {
  constructor(readonly destino: string) {
    super(`redirect ${destino}`);
  }
}
class NoEncontrada extends Error {}

const sim = vi.hoisted(() => ({
  organizacionActiva: "org-full" as string | null,
  experiencias: {} as Record<string, unknown>,
  falla: false,
  resolverLanza: null as unknown,
  reportes: 0,
  permisos: null as unknown as { isFounder: boolean; modules: Record<string, string> },
  lecturasDePermisos: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  redirect: (destino: string) => {
    throw new Redireccion(destino);
  },
  notFound: () => {
    throw new NoEncontrada("not found");
  },
}));
vi.mock("@/lib/auth/get-current-permissions", () => ({
  getCurrentUserPermissions: async () => {
    sim.lecturasDePermisos += 1;
    return sim.permisos;
  },
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
// Como `requireOrganizationId` desde SCRUM-523: una cuenta sin organización
// (super admin) lanza con `SIN_ORGANIZACION_VINCULADA`, que la experiencia
// toma como `full` sin reportar. La constante es la real.
vi.mock("@/lib/auth/bootstrap", async () => {
  const { SIN_ORGANIZACION_VINCULADA } = await vi.importActual<typeof import("@/lib/auth/bootstrap")>(
    "@/lib/auth/bootstrap"
  );
  return {
    SIN_ORGANIZACION_VINCULADA,
    requireOrganizationId: async () => {
      if (sim.resolverLanza) throw sim.resolverLanza;
      if (sim.organizacionActiva === null) throw new Error(SIN_ORGANIZACION_VINCULADA);
      return sim.organizacionActiva;
    },
  };
});
vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: () => {
    sim.reportes += 1;
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from() {
      let id = "";
      const builder = {
        select: () => builder,
        eq(_columna: string, valor: string) {
          id = valor;
          return builder;
        },
        maybeSingle: async () =>
          sim.falla
            ? { data: null, error: { message: "fetch failed" } }
            : { data: { experience: sim.experiencias[id] }, error: null },
      };
      return builder;
    },
  }),
}));

const PLATAFORMA = join(process.cwd(), "app", "(platform)");
const SEGMENTOS = readdirSync(PLATAFORMA, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
  .map((e) => e.name)
  .sort();

type Layout = (props: { children: ReactNode }) => unknown;

async function layout(segmento: string): Promise<Layout> {
  const modulo = (await import(/* @vite-ignore */ join(PLATAFORMA, segmento, "layout.tsx"))) as {
    default: Layout;
  };
  return modulo.default;
}

const PANTALLA = createElement("p", null, "pantalla");

/** Qué pasa al entrar al segmento: `pasa`, `redirect <destino>` o `404`. */
async function entrar(segmento: string): Promise<string> {
  try {
    await (await layout(segmento))({ children: PANTALLA });
    return "pasa";
  } catch (error) {
    if (error instanceof Redireccion) return `redirect ${error.destino}`;
    if (error instanceof NoEncontrada) return "404";
    throw error;
  }
}

// Importar los 23 layouts (y lo que traen) tarda; con la suite completa en
// paralelo pasaba los 5 s por defecto de un test. Se cargan una vez acá.
beforeAll(async () => {
  for (const segmento of SEGMENTOS) await layout(segmento);
}, 120_000);

beforeEach(() => {
  sim.experiencias = {
    "org-full": "full",
    "org-webinar": "webinar",
    "org-limitless": "limitless",
    "holding-1": "full",
  };
  sim.organizacionActiva = "org-full";
  sim.falla = false;
  sim.resolverLanza = null;
  sim.reportes = 0;
  sim.permisos = { isFounder: true, modules: {} };
  sim.lecturasDePermisos = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("los segmentos de la plataforma", () => {
  it("son los de hoy (si aparece uno nuevo, este test y el de disco lo señalan)", () => {
    expect(SEGMENTOS).toEqual([
      "agent",
      "business-context",
      "clients",
      "comentarios",
      "dashboard",
      "executive-reports",
      "finance",
      "founder",
      "funnels",
      "holding",
      "integrations",
      "intelligence",
      "lanzamientos",
      "marketing",
      "onboarding",
      "operations",
      "product",
      "redesign-preview",
      "sales",
      "settings",
      "sops",
      "team",
      "workboard",
    ]);
  });
});

describe("⭐ organización webinar", () => {
  beforeEach(() => {
    sim.organizacionActiva = "org-webinar";
  });

  it("todo segmento fuera de Equipo y de los libres redirige a Equipo, sin SinAcceso", async () => {
    const resultado: Record<string, string> = {};
    for (const segmento of SEGMENTOS) resultado[segmento] = await entrar(segmento);
    const esperado = Object.fromEntries(
      SEGMENTOS.map((s) => [
        s,
        ["team", "settings", "holding", "onboarding"].includes(s) ? "pasa" : "redirect /team",
      ])
    );
    expect(resultado).toEqual(esperado);
  });

  it("tipear /finance, /marketing o /lanzamientos lleva a Equipo (no al Panel)", async () => {
    expect(await entrar("finance")).toBe("redirect /team");
    expect(await entrar("marketing")).toBe("redirect /team");
    expect(await entrar("lanzamientos")).toBe("redirect /team");
  });

  it("una ruta anidada tipeada (/finance/expenses, /lanzamientos/[id]) redirige por un layout de su cadena", async () => {
    for (const ruta of ["/finance/expenses", "/lanzamientos/[id]", "/marketing/content/[id]"]) {
      const pantalla = pantallas(join(process.cwd(), "app")).find((p) => p.ruta === ruta);
      expect(pantalla, ruta).toBeDefined();
      // Los layouts de adentro de los segmentos (el de `(platform)` es el del
      // menú y los permisos, y no se vuelve a ejecutar en el cliente).
      const propios = pantalla!.layouts.filter(
        (l) => l.startsWith(`${PLATAFORMA}/`) && l !== join(PLATAFORMA, "layout.tsx")
      );
      expect(propios.length, ruta).toBeGreaterThan(0);
      let destino = "pasa";
      for (const archivo of propios) {
        const modulo = (await import(/* @vite-ignore */ archivo)) as { default: Layout };
        try {
          await modulo.default({ children: PANTALLA });
        } catch (error) {
          if (!(error instanceof Redireccion)) throw error;
          destino = `redirect ${error.destino}`;
          break;
        }
      }
      expect(destino, ruta).toBe("redirect /team");
    }
  });

  it("/dashboard, el destino por defecto de las pantallas del cliente, lleva a Equipo", async () => {
    expect(await entrar("dashboard")).toBe("redirect /team");
  });

  it("⭐ un miembro sin Equipo va a Ajustes (no a una pantalla con «No tenés acceso»)", async () => {
    sim.permisos = { isFounder: false, modules: { finance: "full", settings: "view" } };
    expect(await entrar("finance")).toBe("redirect /settings");
    expect(await entrar("dashboard")).toBe("redirect /settings");
    expect(await entrar("lanzamientos")).toBe("redirect /settings");
  });

  it("los permisos se leen sólo para elegir el destino de una redirección", async () => {
    expect(await entrar("team")).toBe("pasa");
    expect(sim.lecturasDePermisos).toBe(0);
    expect(await entrar("finance")).toBe("redirect /team");
    expect(sim.lecturasDePermisos).toBe(1);
  });

  it("Equipo dibuja la pantalla", async () => {
    const team = await layout("team");
    expect(await team({ children: PANTALLA })).toBe(PANTALLA);
  });
});

describe("⭐ organización limitless", () => {
  beforeEach(() => {
    sim.organizacionActiva = "org-limitless";
  });

  it("todo segmento fuera de Clientes, Tablero, Ventas y los libres redirige a Clientes, sin SinAcceso", async () => {
    const resultado: Record<string, string> = {};
    for (const segmento of SEGMENTOS) resultado[segmento] = await entrar(segmento);
    const esperado = Object.fromEntries(
      SEGMENTOS.map((s) => [
        s,
        ["clients", "workboard", "sales", "settings", "holding", "onboarding"].includes(s)
          ? "pasa"
          : "redirect /clients",
      ])
    );
    expect(resultado).toEqual(esperado);
  });

  it("/dashboard, /team y /lanzamientos llevan a Clientes (no al Panel: no hay bucle)", async () => {
    expect(await entrar("dashboard")).toBe("redirect /clients");
    expect(await entrar("team")).toBe("redirect /clients");
    expect(await entrar("lanzamientos")).toBe("redirect /clients");
  });

  it("⭐ un miembro con sólo Ventas va a la Bandeja; sin ninguna de las tres, a Ajustes", async () => {
    sim.permisos = { isFounder: false, modules: { sales: "view" } };
    expect(await entrar("dashboard")).toBe("redirect /sales/inbox");
    sim.permisos = { isFounder: false, modules: { finance: "full", settings: "view" } };
    expect(await entrar("dashboard")).toBe("redirect /settings");
    expect(await entrar("settings")).toBe("pasa");
  });
});

describe("⭐ organización full: todo igual que antes", () => {
  it("ningún segmento redirige por experiencia; /lanzamientos sigue yendo al Panel y las internas, a 404", async () => {
    const resultado: Record<string, string> = {};
    for (const segmento of SEGMENTOS) resultado[segmento] = await entrar(segmento);
    const esperado = Object.fromEntries(
      SEGMENTOS.map((s) => [
        s,
        s === "lanzamientos" ? "redirect /dashboard" : s === "redesign-preview" ? "404" : "pasa",
      ])
    );
    expect(resultado).toEqual(esperado);
    expect(sim.lecturasDePermisos).toBe(0);
  });
});

describe("⭐ la experiencia es la de la organización activa", () => {
  it("un holding (full) que entra a un negocio webinar queda con el menú webinar, y al volver, con el completo", async () => {
    sim.organizacionActiva = "holding-1";
    expect(await entrar("finance")).toBe("pasa");
    sim.organizacionActiva = "org-webinar";
    expect(await entrar("finance")).toBe("redirect /team");
    sim.organizacionActiva = "holding-1";
    expect(await entrar("finance")).toBe("pasa");
  });

  it("⭐ un holding (full) que cambia entre un negocio limitless y uno webinar ve el bloqueo de cada uno", async () => {
    sim.organizacionActiva = "org-limitless";
    expect(await entrar("clients")).toBe("pasa");
    expect(await entrar("team")).toBe("redirect /clients");
    sim.organizacionActiva = "org-webinar";
    expect(await entrar("clients")).toBe("redirect /team");
    expect(await entrar("team")).toBe("pasa");
    sim.organizacionActiva = "holding-1";
    expect(await entrar("clients")).toBe("pasa");
    expect(await entrar("team")).toBe("pasa");
  });

  it("sin organización activa (super admin sin org, demo): full, no se bloquea", async () => {
    sim.organizacionActiva = null;
    expect(await entrar("finance")).toBe("pasa");
  });
});

describe("⭐ una falla de lectura no bloquea a nadie", () => {
  it("si no se puede leer la experiencia, es full: la organización webinar entra y queda registrado", async () => {
    sim.organizacionActiva = "org-webinar";
    sim.falla = true;
    expect(await entrar("finance")).toBe("pasa");
    expect(sim.reportes).toBe(1);
  });

  it("si falla resolver la organización (no la sesión), es full: nadie queda bloqueado y queda registrado", async () => {
    sim.organizacionActiva = "org-webinar";
    sim.resolverLanza = new Error("fetch failed");
    expect(await entrar("finance")).toBe("pasa");
    expect(sim.reportes).toBe(1);
  });

  it("⭐ una sesión no válida o una cuenta desactivada no se degradan a full: el layout relanza", async () => {
    for (const mensaje of ["Sesión no válida", "Tu cuenta está desactivada."]) {
      sim.resolverLanza = new ErrorEsperable(mensaje);
      await expect(entrar("finance")).rejects.toBe(sim.resolverLanza);
    }
    expect(sim.reportes).toBe(0);
  });
});

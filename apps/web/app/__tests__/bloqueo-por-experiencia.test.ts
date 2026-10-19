import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pantallas } from "@/lib/navigation/__tests__/pantallas-de-app";

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
  reportes: 0,
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
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/auth/bootstrap", () => ({
  tryRequireOrganizationId: async () => sim.organizacionActiva,
}));
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

beforeEach(() => {
  sim.experiencias = { "org-full": "full", "org-webinar": "webinar", "holding-1": "full" };
  sim.organizacionActiva = "org-full";
  sim.falla = false;
  sim.reportes = 0;
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

  it("Equipo dibuja la pantalla", async () => {
    const team = await layout("team");
    expect(await team({ children: PANTALLA })).toBe(PANTALLA);
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
});

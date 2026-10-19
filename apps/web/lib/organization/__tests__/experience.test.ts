import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-523 · `getOrganizationExperience()`: qué producto ve la organización
 * activa (`organizations.experience`).
 *
 * Contrato: lectura degradable. Si no se puede leer, devuelve `full` (nadie
 * pierde acceso por una falla de lectura) y la falla va a Sentry con el tag
 * `lectura_degradada`, sin datos de la fila. Se resuelve una vez por pedido.
 *
 * Como en `super-admin-una-consulta.test.ts`, el test carga la versión de
 * servidor de React (la que usa Next en server components) y simula un pedido
 * instalando un despachador con `getCacheForType`: en Node sin la condición
 * `react-server`, `cache` no memoiza nada.
 */

type Respuesta = { data: { experience?: unknown } | null; error: { message: string; code?: string } | null };

const sim = vi.hoisted(() => ({
  configurado: true,
  /** Lo que devuelve `requireOrganizationId`, o lo que lanza si es un error. */
  organizacion: "org-1" as string | Error,
  respuesta: null as unknown as Respuesta,
  lanza: null as unknown,
  consultas: 0,
  columnas: [] as string[],
  filtros: [] as Array<[string, unknown]>,
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const { dirname, join } = await import("node:path");
  const require = createRequire(import.meta.url);
  const raiz = dirname(require.resolve("react/package.json"));
  return require(join(raiz, "react.react-server.js"));
});
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => sim.configurado }));
vi.mock("@/lib/auth/bootstrap", () => ({
  SIN_ORGANIZACION_VINCULADA: "No se pudo vincular tu cuenta a una organización. Revisa Supabase (tablas organizations y profiles).",
  requireOrganizationId: async () => {
    if (sim.organizacion instanceof Error) throw sim.organizacion;
    return sim.organizacion;
  },
}));
vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(tabla: string) {
      expect(tabla).toBe("organizations");
      const builder = {
        select(columnas: string) {
          sim.columnas.push(columnas);
          return builder;
        },
        eq(columna: string, valor: unknown) {
          sim.filtros.push([columna, valor]);
          return builder;
        },
        maybeSingle: async () => {
          sim.consultas += 1;
          if (sim.lanza) throw sim.lanza;
          return sim.respuesta;
        },
      };
      return builder;
    },
  }),
}));

import * as React from "react";
import { SIN_ORGANIZACION_VINCULADA } from "@/lib/auth/bootstrap";
import { CUENTA_DESACTIVADA_MESSAGE } from "@/lib/auth/cuenta-desactivada";
import { ErrorEsperable } from "@/lib/server/error-esperable";
import {
  EXPERIENCIA_SI_FALLA,
  getOrganizationExperience,
  leerExperienciaDeLaOrganizacion,
} from "../experience";

type Despachador = { getCacheForType: <T>(crear: () => T) => T } | null;
const internos = (
  React as unknown as {
    __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { A: Despachador };
  }
).__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

/** Corre `fn` dentro de un pedido simulado, con su propia caché. */
async function enUnPedido<T>(fn: () => Promise<T>): Promise<T> {
  const cachePorTipo = new Map<unknown, unknown>();
  const anterior = internos.A;
  internos.A = {
    getCacheForType<C>(crear: () => C): C {
      if (!cachePorTipo.has(crear)) cachePorTipo.set(crear, crear());
      return cachePorTipo.get(crear) as C;
    },
  };
  try {
    return await fn();
  } finally {
    internos.A = anterior;
  }
}

let aviso: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.configurado = true;
  sim.organizacion = "org-1";
  sim.respuesta = { data: { experience: "webinar" }, error: null };
  sim.lanza = null;
  sim.consultas = 0;
  sim.columnas = [];
  sim.filtros = [];
  sim.reportes = [];
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
  return () => aviso.mockRestore();
});

describe("getOrganizationExperience: los dos valores", () => {
  it("una organización webinar devuelve webinar", async () => {
    await expect(getOrganizationExperience()).resolves.toBe("webinar");
    expect(sim.columnas).toEqual(["experience"]);
    expect(sim.filtros).toEqual([["id", "org-1"]]);
    expect(sim.reportes).toEqual([]);
  });

  it("una organización full devuelve full", async () => {
    sim.respuesta = { data: { experience: "full" }, error: null };
    await expect(getOrganizationExperience()).resolves.toBe("full");
    expect(sim.reportes).toEqual([]);
  });
});

describe("getOrganizationExperience: falla de lectura", () => {
  it("el valor por defecto es full", () => {
    expect(EXPERIENCIA_SI_FALLA).toBe("full");
  });

  it("⭐ un error de la base devuelve full y se reporta sin datos de la fila", async () => {
    sim.respuesta = {
      data: null,
      error: { message: "permission denied for column experience", code: "42501" },
    };
    await expect(getOrganizationExperience()).resolves.toBe("full");
    expect(sim.reportes).toHaveLength(1);
    expect(sim.reportes[0].contexto).toEqual({ lectura: "organizacion:experiencia" });
    expect((sim.reportes[0].error as Error).message).toBe("permission denied for column experience");
  });

  it("si la consulta lanza (red caída), devuelve full y se reporta", async () => {
    sim.lanza = new TypeError("fetch failed");
    await expect(getOrganizationExperience()).resolves.toBe("full");
    expect(sim.reportes).toHaveLength(1);
  });

  it("sin fila (la RLS no la deja ver) devuelve full y se reporta", async () => {
    sim.respuesta = { data: null, error: null };
    await expect(getOrganizationExperience()).resolves.toBe("full");
    expect(sim.reportes).toHaveLength(1);
  });

  it("un valor que no es webinar ni full devuelve full y se reporta sin el valor", async () => {
    sim.respuesta = { data: { experience: "otra" }, error: null };
    await expect(getOrganizationExperience()).resolves.toBe("full");
    expect(sim.reportes).toHaveLength(1);
    expect((sim.reportes[0].error as Error).message).not.toContain("otra");
  });

  it("⭐ sin organización activa (super admin) devuelve full sin consultar ni reportar", async () => {
    sim.organizacion = new Error(SIN_ORGANIZACION_VINCULADA);
    await expect(getOrganizationExperience()).resolves.toBe("full");
    expect(sim.consultas).toBe(0);
    expect(sim.reportes).toEqual([]);
  });

  it("⭐ si falla resolver la organización, devuelve full y se reporta", async () => {
    sim.organizacion = new Error("fetch failed");
    await expect(getOrganizationExperience()).resolves.toBe("full");
    expect(sim.consultas).toBe(0);
    expect(sim.reportes).toHaveLength(1);
    expect(sim.reportes[0].contexto).toEqual({ lectura: "organizacion:experiencia" });
  });

  it("⭐ una sesión no válida se relanza, no se degrada a full", async () => {
    const sesion = new ErrorEsperable("Sesión no válida");
    sim.organizacion = sesion;
    await expect(getOrganizationExperience()).rejects.toBe(sesion);
    expect(sim.reportes).toEqual([]);
  });

  it("⭐ una cuenta desactivada se relanza, no se degrada a full", async () => {
    const desactivada = new ErrorEsperable(CUENTA_DESACTIVADA_MESSAGE);
    sim.organizacion = desactivada;
    await expect(getOrganizationExperience()).rejects.toBe(desactivada);
    expect(sim.reportes).toEqual([]);
  });

  it("sin Supabase configurado devuelve full sin consultar", async () => {
    sim.configurado = false;
    await expect(getOrganizationExperience()).resolves.toBe("full");
    expect(sim.consultas).toBe(0);
  });
});

describe("getOrganizationExperience: una vez por pedido", () => {
  it("⭐ tres llamadas del mismo pedido hacen una sola consulta", async () => {
    await enUnPedido(async () => {
      await expect(getOrganizationExperience()).resolves.toBe("webinar");
      await expect(getOrganizationExperience()).resolves.toBe("webinar");
      await expect(getOrganizationExperience()).resolves.toBe("webinar");
    });
    expect(sim.consultas).toBe(1);
  });

  it("dos pedidos distintos no comparten el resultado", async () => {
    await enUnPedido(() => getOrganizationExperience());
    sim.respuesta = { data: { experience: "full" }, error: null };
    await expect(enUnPedido(() => getOrganizationExperience())).resolves.toBe("full");
    expect(sim.consultas).toBe(2);
  });

  it("una falla también se resuelve una sola vez por pedido (un solo reporte)", async () => {
    sim.respuesta = { data: null, error: { message: "fetch failed" } };
    await enUnPedido(async () => {
      await getOrganizationExperience();
      await getOrganizationExperience();
    });
    expect(sim.consultas).toBe(1);
    expect(sim.reportes).toHaveLength(1);
  });
});

describe("leerExperienciaDeLaOrganizacion (lectura estricta, para heredar)", () => {
  const cliente = async () => (await import("@/lib/supabase/server")).createClient();

  it("devuelve el valor guardado", async () => {
    sim.respuesta = { data: { experience: "full" }, error: null };
    await expect(leerExperienciaDeLaOrganizacion(await cliente() as never, "h-1")).resolves.toBe("full");
    expect(sim.filtros).toEqual([["id", "h-1"]]);
  });

  it("⭐ ante un error lanza, no inventa un valor", async () => {
    sim.respuesta = { data: null, error: { message: "fetch failed" } };
    await expect(leerExperienciaDeLaOrganizacion(await cliente() as never, "h-1")).rejects.toThrow(
      "fetch failed"
    );
  });

  it("sin fila o con un valor inválido lanza", async () => {
    sim.respuesta = { data: null, error: null };
    await expect(leerExperienciaDeLaOrganizacion(await cliente() as never, "h-1")).rejects.toThrow();
    sim.respuesta = { data: { experience: "otra" }, error: null };
    await expect(leerExperienciaDeLaOrganizacion(await cliente() as never, "h-1")).rejects.toThrow();
  });
});

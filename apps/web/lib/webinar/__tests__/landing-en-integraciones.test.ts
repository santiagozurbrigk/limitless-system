import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearBaseFalsa } from "./base-falsa-de-claves";

/**
 * SCRUM-527: la entrada Landing del registro de integraciones depende de
 * `ESCONDIDO.ingestaLanding`, y su tarjeta cuenta las claves activas.
 */

const sim = vi.hoisted(() => ({
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
}));

vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));

async function registroCon(ingestaLanding: boolean) {
  vi.resetModules();
  vi.doMock("@/lib/release/escondido", async (importOriginal) => {
    const real = await importOriginal<typeof import("@/lib/release/escondido")>();
    return { ESCONDIDO: { ...real.ESCONDIDO, ingestaLanding } };
  });
  return import("@/lib/integrations/registry");
}

afterEach(() => {
  vi.doUnmock("@/lib/release/escondido");
  vi.restoreAllMocks();
});

describe("registro de integraciones", () => {
  it("la bandera vale true en el código: la Landing está escondida", async () => {
    const { ESCONDIDO } = await import("@/lib/release/escondido");
    expect(ESCONDIDO.ingestaLanding).toBe(true);
  });

  it("con la bandera en true, la Landing no se lista y dice por qué", async () => {
    const registro = await registroCon(true);
    expect(registro.LISTED_INTEGRATIONS.map((d) => d.provider)).not.toContain("landing");
    expect(registro.getIntegrationDefinition("landing").unlistedReason).toContain("SCRUM-523/524");
  });

  it("con la bandera en false, la Landing se lista en Medición de embudos", async () => {
    const registro = await registroCon(false);
    const landing = registro.LISTED_INTEGRATIONS.find((d) => d.provider === "landing");
    expect(landing).toMatchObject({ name: "Landing", category: "embudos", connect: "panel" });
    expect(landing?.unlistedReason).toBeUndefined();
  });
});

describe("saludDeLaLanding", () => {
  // Se importa en cada test: los de arriba reinician los módulos.
  const modulo = () => import("@/lib/webinar/claves-de-ingesta");
  const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  /** Quien mira es founder o admin. */
  const SI = async () => true;

  beforeEach(() => {
    sim.reportes = [];
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("cuenta sólo las claves activas de la organización y toma el último uso", async () => {
    const base = crearBaseFalsa({
      ingest_keys: [
        { id: "1", organization_id: ORG, last_used_at: "2026-10-15T00:00:00Z", revoked_at: null },
        { id: "2", organization_id: ORG, last_used_at: "2026-10-16T00:00:00Z", revoked_at: null },
        { id: "3", organization_id: ORG, last_used_at: "2026-10-17T00:00:00Z", revoked_at: "2026-10-17T01:00:00Z" },
        { id: "4", organization_id: "otra", last_used_at: "2026-10-18T00:00:00Z", revoked_at: null },
      ],
    });
    const { leerClavesActivas, saludDeLaLanding } = await modulo();
    const claves = await leerClavesActivas(ORG, base.cliente() as SupabaseClient);
    expect(claves).toEqual({ activas: 2, ultimoUso: "2026-10-16T00:00:00Z" });
    expect(base.consultas[0].columnas).toBe("last_used_at");

    const salud = await saludDeLaLanding(async () => ORG, SI, async (org) => {
      expect(org).toBe(ORG);
      return claves;
    });
    expect(salud).toMatchObject({
      provider: "landing",
      state: "connected",
      records: 2,
      recordsLabel: "claves activas",
      lastSyncAt: "2026-10-16T00:00:00Z",
    });
  });

  it("sin claves activas, no está conectada", async () => {
    const { saludDeLaLanding } = await modulo();
    const salud = await saludDeLaLanding(async () => ORG, SI, async () => ({ activas: 0, ultimoUso: null }));
    expect(salud.state).toBe("not_connected");
  });

  it("con claves que nunca se usaron, lo avisa", async () => {
    const { saludDeLaLanding } = await modulo();
    const salud = await saludDeLaLanding(async () => ORG, SI, async () => ({ activas: 1, ultimoUso: null }));
    expect(salud.issues.map((i) => i.message)).toEqual(["Ninguna clave activa se usó todavía."]);
  });

  it("si la lectura falla, la tarjeta dice que no se pudo leer y se registra", async () => {
    const { saludDeLaLanding } = await modulo();
    const salud = await saludDeLaLanding(async () => ORG, SI, async () => {
      throw new TypeError("fetch failed");
    });
    expect(salud.sinLeer).toBe(true);
    expect(salud.state).toBe("error");
    expect(sim.reportes).toHaveLength(1);
    expect(sim.reportes[0].contexto).toEqual({ lectura: "integraciones:landing" });
  });

  it("sin sesión, tampoco se sabe, pero no es una falla", async () => {
    const { saludDeLaLanding } = await modulo();
    const { ErrorEsperable } = await import("@/lib/server/error-esperable");
    const leer = vi.fn();
    const salud = await saludDeLaLanding(async () => {
      throw new ErrorEsperable("Sesión no válida");
    }, SI, leer);
    expect(leer).not.toHaveBeenCalled();
    expect(salud.sinLeer).toBe(true);
    expect(sim.reportes).toHaveLength(0);
  });

  it("a quien no es founder ni admin no le muestra el conteo ni el último uso (AR pasada 1)", async () => {
    const { saludDeLaLanding } = await modulo();
    const salud = await saludDeLaLanding(async () => ORG, async () => false, async () => ({
      activas: 3,
      ultimoUso: "2026-10-16T00:00:00Z",
    }));
    expect(salud.state).toBe("connected");
    expect(salud.records).toBeNull();
    expect(salud.lastSyncAt).toBeNull();
    expect(salud.recordsLabel).toBeNull();
    expect(salud.issues.map((i) => i.message)).toEqual([
      "El detalle de las claves de ingesta lo ven el founder o un admin.",
    ]);
    expect(JSON.stringify(salud)).not.toContain("2026-10-16");
    expect(JSON.stringify(salud)).not.toContain("3");
  });

  it("sin detalle y sin claves activas, no está conectada (AR pasada 2)", async () => {
    const { saludDeLaLanding } = await modulo();
    const salud = await saludDeLaLanding(async () => ORG, async () => false, async () => ({
      activas: 0,
      ultimoUso: null,
    }));
    expect(salud.state).toBe("not_connected");
    expect(salud.records).toBeNull();
  });

  it("si puedeVerDetalle lanza de forma síncrona, la lectura de claves no queda sin atender", async () => {
    const { saludDeLaLanding } = await modulo();
    const sueltas: unknown[] = [];
    const oir = (motivo: unknown) => sueltas.push(motivo);
    process.on("unhandledRejection", oir);
    try {
      const salud = await saludDeLaLanding(
        async () => ORG,
        (() => {
          throw new TypeError("tieneRolEnLaOrg is not a function");
        }) as () => Promise<boolean>,
        async () => {
          await Promise.resolve();
          throw new TypeError("cliente.from is not a function");
        },
      );
      await new Promise((listo) => setTimeout(listo, 20));
      expect(salud.sinLeer).toBe(true);
      expect(sueltas).toEqual([]);
    } finally {
      process.off("unhandledRejection", oir);
    }
  });

  it("si no se puede verificar el rol, la tarjeta dice que no se pudo leer", async () => {
    const { saludDeLaLanding } = await modulo();
    const salud = await saludDeLaLanding(
      async () => ORG,
      async () => {
        throw new TypeError("fetch failed");
      },
      async () => ({ activas: 3, ultimoUso: "2026-10-16T00:00:00Z" }),
    );
    expect(salud.sinLeer).toBe(true);
    expect(salud.records).toBeNull();
    expect(sim.reportes).toHaveLength(1);
  });
});

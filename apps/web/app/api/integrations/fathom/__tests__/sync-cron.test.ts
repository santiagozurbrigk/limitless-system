import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-36 · N-1: el cron de Fathom pasa un plazo común a la tanda de las
 * organizaciones y a la de los miembros, y alterna cuál va primero.
 */

const sim = vi.hoisted(() => ({
  orden: [] as string[],
  opciones: [] as Array<{ plazo?: number; corrida?: number }>,
}));

vi.mock("@/lib/integrations/cron-auth", () => ({ assertCronAuthorized: () => null }));
vi.mock("@/lib/observability/cron-monitor", () => ({
  conMonitorDeCron: (_ruta: string, handler: (r: Request) => Promise<Response>) => handler,
}));
vi.mock("@/lib/fathom/sync", () => ({
  syncAllFathomIntegrations: async (opciones: { plazo?: number; corrida?: number }) => {
    sim.orden.push("orgs");
    sim.opciones.push(opciones);
    return { organizations: 0, ingested: 0, skippedOrgs: [], postergadas: [], orgResults: [] };
  },
}));
vi.mock("@/lib/fathom/member-sync", () => ({
  sincronizarTodosLosMiembrosFathom: async (opciones: { plazo?: number; corrida?: number }) => {
    sim.orden.push("miembros");
    sim.opciones.push(opciones);
    return { miembros: 0, ingested: 0, fallidos: 0, postergados: 0 };
  },
}));

import { POST } from "@/app/api/integrations/fathom/sync/route";
import { PLAZO_DEL_CRON_MS, numeroDeCorrida } from "@/lib/fathom/plazo-del-cron";

beforeEach(() => {
  sim.orden = [];
  sim.opciones = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function correrA(iso: string) {
  vi.setSystemTime(new Date(iso));
  const res = await POST(new Request("https://app.test/api/integrations/fathom/sync", { method: "POST" }));
  expect(res.status).toBe(200);
}

describe("cron /api/integrations/fathom/sync", () => {
  it("⭐ las dos tandas reciben el mismo plazo, 45 s después del inicio, y el número de corrida", async () => {
    await correrA("2026-10-05T10:00:00.000Z");
    const inicio = Date.parse("2026-10-05T10:00:00.000Z");
    expect(sim.opciones).toEqual([
      { plazo: inicio + PLAZO_DEL_CRON_MS, corrida: numeroDeCorrida(inicio) },
      { plazo: inicio + PLAZO_DEL_CRON_MS, corrida: numeroDeCorrida(inicio) },
    ]);
  });

  it("⭐ las tandas se alternan de una hora a la otra: los miembros no van siempre últimos", async () => {
    await correrA("2026-10-05T10:00:00.000Z");
    const primeraHora = [...sim.orden];
    sim.orden = [];
    await correrA("2026-10-05T11:00:00.000Z");
    expect(sim.orden).toEqual([...primeraHora].reverse());
    expect(new Set([primeraHora[0], sim.orden[0]])).toEqual(new Set(["orgs", "miembros"]));
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-210 · la org se comprueba también al procesarla, no sólo al listarla.
 *
 * Un trabajo que ya estaba en QStash cuando se pausó la org (o uno de sus
 * reintentos), o una corrida manual con `?organizationId=`, llega directo al
 * generador. Cada generador vuelve a preguntar por la org antes de la IA.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const OTRA = "22222222-2222-4222-8222-222222222222";

const sim = vi.hoisted(() => ({
  orgs: {} as Record<string, { id: string; account_type: string; status: string }>,
  errorAlChequear: null as { message: string } | null,
  consultasDeOrg: [] as Array<Array<[string, unknown]>>,
}));

/** Un builder que acepta cualquier encadenado y resuelve vacío (otras tablas). */
function builderGenerico(): unknown {
  const target = {
    then(resolver: (r: unknown) => void) {
      resolver({ data: [{ week_label: "S1", executive_summary: "x" }], error: null });
    },
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop === "then") return t.then;
      if (prop === "maybeSingle" || prop === "single") {
        return async () => ({ data: null, error: null });
      }
      return () => builderGenerico();
    },
  });
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      if (tabla !== "organizations") return builderGenerico();
      const filtros: Array<[string, unknown]> = [];
      const filasFiltradas = () =>
        Object.values(sim.orgs).filter((f) =>
          filtros.every(([c, v]) => (f as Record<string, unknown>)[c] === v)
        );
      const builder = {
        select: () => builder,
        eq(columna: string, valor: unknown) {
          filtros.push([columna, valor]);
          return builder;
        },
        async maybeSingle() {
          sim.consultasDeOrg.push([...filtros]);
          if (sim.errorAlChequear) return { data: null, error: sim.errorAlChequear };
          return { data: filasFiltradas()[0] ?? null, error: null };
        },
        then(resolver: (r: unknown) => void) {
          resolver({ data: filasFiltradas(), error: null });
        },
      };
      return builder;
    },
  }),
}));

// La puerta de la IA: sin cliente no hay llamada. Se espía para saber si el
// generador llegó a intentarlo.
const ia = vi.hoisted(() => ({
  getClientForOrg: vi.fn(async () => null),
  callClaudeJson: vi.fn(),
  callClaudeText: vi.fn(),
}));
vi.mock("@/lib/ai/anthropic", () => ({
  getClientForOrg: ia.getClientForOrg,
  callClaudeJson: ia.callClaudeJson,
  callClaudeText: ia.callClaudeText,
  getModelForTask: () => "modelo-de-prueba",
}));
vi.mock("@/lib/ai/org-context", () => ({
  buildOrgContextText: () => "",
  getOrgContext: async () => ({ orgName: "Org" }),
}));
vi.mock("@/lib/intelligence/collect-context", () => ({
  collectIntelligenceData: async () => ({ hasMeaningfulData: true }),
  formatCollectedDataForPrompt: () => "",
}));
vi.mock("@/lib/founder-tone/collect-sources", () => ({
  collectFounderToneSources: async () => ({ hasEnoughContent: true, summary: {} }),
  formatToneSourcesForPrompt: () => "",
}));
vi.mock("@/lib/queue/verify-queue-request", () => ({
  verifyQueueRequest: async () => ({ ok: true }),
}));
vi.mock("@/lib/observability/reportar-falla", () => ({ reportarFalla: vi.fn() }));

import { organizacionSigueActiva } from "../organizaciones-activas";
import {
  generateAllIntelligenceSnapshots,
  generateAndSaveIntelligenceSnapshot,
} from "../generate-snapshot";
import { generateAndSaveFounderTone } from "@/lib/founder-tone/analyze-tone";
import { generateAndSaveDailyExecutiveReport } from "@/lib/executive-reports/generate-daily";
import { generateAndSaveWeeklyExecutiveReport } from "@/lib/executive-reports/generate-weekly";
import { generateAndSaveMonthlyExecutiveReport } from "@/lib/executive-reports/generate-monthly";
import * as workerSnapshot from "@/app/api/queue/process-cron-intelligence-snapshot/route";
import * as workerReporte from "@/app/api/queue/process-cron-executive-report/route";
import * as workerTono from "@/app/api/queue/process-cron-founder-tone/route";

const GENERADORES = [
  ["inteligencia", generateAndSaveIntelligenceSnapshot],
  ["tono del founder", generateAndSaveFounderTone],
  ["reporte diario", generateAndSaveDailyExecutiveReport],
  ["reporte semanal", generateAndSaveWeeklyExecutiveReport],
  ["reporte mensual", generateAndSaveMonthlyExecutiveReport],
] as const;

const WORKERS = [
  ["process-cron-intelligence-snapshot", workerSnapshot, {}],
  ["process-cron-founder-tone", workerTono, {}],
  ["process-cron-executive-report (diario)", workerReporte, { period: "daily" }],
  ["process-cron-executive-report (semanal)", workerReporte, { period: "weekly" }],
  ["process-cron-executive-report (mensual)", workerReporte, { period: "monthly" }],
] as const;

function conStatus(status: string, accountType = "founder") {
  sim.orgs = { [ORG]: { id: ORG, account_type: accountType, status } };
}

function pedidoAlWorker(extra: Record<string, unknown>): Request {
  return new Request("http://localhost/api/queue/worker", {
    method: "POST",
    body: JSON.stringify({ organizationId: ORG, ...extra }),
  });
}

beforeEach(() => {
  sim.errorAlChequear = null;
  sim.consultasDeOrg = [];
  conStatus("active");
  ia.getClientForOrg.mockClear();
  ia.callClaudeJson.mockClear();
  ia.callClaudeText.mockClear();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("organizacionSigueActiva", () => {
  it("⭐ consulta la org por su id y sólo una org activa sigue activa", async () => {
    await expect(organizacionSigueActiva(ORG)).resolves.toBe(true);
    expect(sim.consultasDeOrg).toEqual([[["id", ORG]]]);

    for (const status of ["paused", "churned"]) {
      conStatus(status);
      await expect(organizacionSigueActiva(ORG)).resolves.toBe(false);
    }
  });

  it("⭐ mira sólo el estado: una holding activa sigue activa y una pausada no", async () => {
    conStatus("active", "holding");
    await expect(organizacionSigueActiva(ORG)).resolves.toBe(true);
    conStatus("paused", "holding");
    await expect(organizacionSigueActiva(ORG)).resolves.toBe(false);
  });

  it("una org que no existe no está activa", async () => {
    await expect(organizacionSigueActiva(OTRA)).resolves.toBe(false);
  });

  it("si la base falla, lanza en vez de suponer nada", async () => {
    sim.errorAlChequear = { message: "fallo de red" };
    await expect(organizacionSigueActiva(ORG)).rejects.toThrow("fallo de red");
  });
});

describe.each(GENERADORES)("generador de %s", (_nombre, generar) => {
  it("⭐ con la org pausada devuelve skipped y no llega a la IA", async () => {
    conStatus("paused");
    await expect(generar(ORG)).resolves.toBe("skipped");
    expect(ia.getClientForOrg).not.toHaveBeenCalled();
    expect(ia.callClaudeJson).not.toHaveBeenCalled();
    expect(ia.callClaudeText).not.toHaveBeenCalled();
  });

  it("con la org dada de baja tampoco llega a la IA", async () => {
    conStatus("churned");
    await expect(generar(ORG)).resolves.toBe("skipped");
    expect(ia.getClientForOrg).not.toHaveBeenCalled();
  });

  it("con la org activa sigue hasta la IA", async () => {
    await generar(ORG);
    expect(ia.getClientForOrg).toHaveBeenCalledWith(ORG);
  });

  it("⭐ una holding activa sigue generando (como antes) y una holding pausada no", async () => {
    conStatus("active", "holding");
    await generar(ORG);
    expect(ia.getClientForOrg).toHaveBeenCalledWith(ORG);

    ia.getClientForOrg.mockClear();
    conStatus("paused", "holding");
    await expect(generar(ORG)).resolves.toBe("skipped");
    expect(ia.getClientForOrg).not.toHaveBeenCalled();
  });

  it("⭐ si la base falla al comprobar, lanza y no procesa la org", async () => {
    sim.errorAlChequear = { message: "fallo de red" };
    await expect(generar(ORG)).rejects.toThrow("fallo de red");
    expect(ia.getClientForOrg).not.toHaveBeenCalled();
  });
});

describe.each(WORKERS)("worker %s", (_nombre, modulo, extra) => {
  it("⭐ un trabajo encolado de una org pausada termina en 200 con skipped (QStash no reintenta)", async () => {
    conStatus("paused");
    const res = await modulo.POST(pedidoAlWorker(extra));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, organizationId: ORG, result: "skipped" });
    expect(ia.getClientForOrg).not.toHaveBeenCalled();
  });

  it("si la base falla al comprobar, responde 500 para que QStash reintente", async () => {
    sim.errorAlChequear = { message: "fallo de red" };
    const res = await modulo.POST(pedidoAlWorker(extra));
    expect(res.status).toBe(500);
    expect(ia.getClientForOrg).not.toHaveBeenCalled();
  });
});

describe("modo en serie", () => {
  it("si la comprobación de una org falla, la cuenta como fallida y sigue con la próxima", async () => {
    sim.orgs = {
      [ORG]: { id: ORG, account_type: "founder", status: "active" },
      [OTRA]: { id: OTRA, account_type: "founder", status: "active" },
    };
    sim.errorAlChequear = { message: "fallo de red" };
    await expect(generateAllIntelligenceSnapshots()).resolves.toEqual({
      orgs: 2,
      generated: 0,
      skipped: 0,
      failed: 2,
    });
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * SCRUM-85 · la página de Infraestructura del super admin muestra lo que mide
 * el chequeo de salud y la última corrida real de cada cron. Antes tenía estados
 * escritos a mano ("Configurado ✓", "Pendiente aprobación ⚠") que siempre
 * decían lo mismo.
 */

const sim = vi.hoisted(() => ({ resend: true }));
vi.mock("@/lib/email", () => ({ isResendConfigured: () => sim.resend }));
vi.mock("@/components/settings/claude-api-key-settings", () => ({
  ClaudeApiKeySettings: () => null,
}));

import { InfrastructurePage } from "../infrastructure-page";
import type { RespuestaDeSalud } from "@/lib/observability/salud";
import type { CorridasDeProcesos } from "@/types/super-admin";

const AHORA = new Date("2026-10-07T12:00:00Z");

const STATS = {
  organizations: 7,
  users: 20,
  conversations: 0,
  closingCalls: 0,
  clients: 0,
  aiBrainDocuments: 0,
};

const CLAVE = { hasKey: false, status: "none", lastValidated: null, keyPreview: null } as const;

function salud(cambios: Partial<RespuestaDeSalud> = {}): RespuestaDeSalud {
  return {
    status: "ok",
    chequeos: { base: true, storage: true, variables: true },
    version: { commit: "cdfca43", entorno: "production" },
    hora: "2026-10-07T11:59:50Z",
    ...cambios,
  };
}

const CORRIDAS: CorridasDeProcesos = {
  disponible: true,
  procesos: [
    {
      proceso: "/api/cron/ghl-sync",
      horario: "0 * * * *",
      corrida: {
        estado: "parcial",
        inicio: "2026-10-07T11:00:00Z",
        fin: "2026-10-07T11:00:09Z",
        orgsProcesadas: 4,
        orgsFallidas: 1,
        organizacionesFallidas: [{ id: "0a000000-0000-4000-8000-000000000001", nombre: "Academia Norte" }],
        jobsEncolados: null,
        error: null,
      },
    },
    {
      proceso: "/api/cron/daily-signals",
      horario: "20 7 * * *",
      corrida: {
        estado: "en_curso",
        inicio: "2026-10-07T07:20:00Z",
        fin: null,
        orgsProcesadas: null,
        orgsFallidas: null,
        organizacionesFallidas: [],
        jobsEncolados: null,
        error: null,
      },
    },
    {
      proceso: "/api/cron/intelligence-snapshot",
      horario: "0 0,12 * * *",
      corrida: {
        estado: "encolado",
        inicio: "2026-10-07T00:00:00Z",
        fin: "2026-10-07T00:00:02Z",
        orgsProcesadas: 6,
        orgsFallidas: 0,
        organizacionesFallidas: [],
        jobsEncolados: 6,
        error: null,
      },
    },
    { proceso: "/api/cron/cleanup-trial-reels", horario: "0 3 * * *", corrida: null },
  ],
};

function html(props: { salud?: RespuestaDeSalud; corridas?: CorridasDeProcesos } = {}): string {
  return renderToStaticMarkup(
    createElement(InfrastructurePage, {
      stats: STATS,
      platformClaudeKey: CLAVE,
      salud: props.salud ?? salud(),
      corridas: props.corridas ?? CORRIDAS,
      ahora: AHORA,
    })
  );
}

describe("InfrastructurePage", () => {
  it("⭐ ya no tiene estados escritos a mano", () => {
    const pagina = html();
    for (const fijo of [
      "Configurado ✓",
      "Pendiente aprobación",
      "No configurado",
      "ManyChat",
      "YouTube API",
      "otc-plaform",
      "sa-east-1",
    ]) {
      expect(pagina, fijo).not.toContain(fijo);
    }
  });

  it("⭐ muestra el chequeo de salud real: versión, base, Storage y variables", () => {
    const pagina = html();
    expect(pagina).toContain("cdfca43 (production)");
    expect(pagina).toContain("Todo responde");
    expect(pagina).toContain("Base de datos");
    expect(pagina).toContain("Completas");

    const caida = html({
      salud: salud({ status: "caido", chequeos: { base: false, storage: false, variables: false } }),
    });
    expect(caida).toContain("Caído");
    expect(caida.match(/No responde/g)).toHaveLength(2);
    expect(caida).toContain("Falta alguna");

    const local = html({ salud: salud({ version: { commit: null, entorno: null } }) });
    expect(local).toContain("Sin datos de Vercel (entorno local)");
  });

  it("muestra Resend según su configuración real", () => {
    sim.resend = false;
    expect(html()).toContain("Falta API key o remitente");
    sim.resend = true;
    expect(html()).toContain("API key y remitente definidos");
  });

  it("⭐ muestra la última corrida de cada proceso: estado, hora y orgs fallidas", () => {
    const pagina = html();
    expect(pagina).toContain("/api/cron/ghl-sync");
    expect(pagina).toContain("Parcial: 1 de 4 orgs fallaron");
    expect(pagina).toContain("Fallaron: Academia Norte");
    // 11:00 UTC = 08:00 en Argentina.
    expect(pagina).toMatch(/Empezó 0?7\/10,? 08:00/);
    // Más de 15 min en curso: se cortó.
    expect(pagina).toContain("Sin cierre");
    expect(pagina).toContain("Sin corridas registradas");
    expect(pagina).toContain("Todavía no corrió");
  });

  it("⭐ un cron con fan-out figura como Encolado con sus jobs, no como OK", () => {
    const pagina = html();
    expect(pagina).toContain("Encolado: 6 jobs encolados");
    expect(pagina).toContain("Encolado no es terminado");
    expect(pagina).not.toContain("6 orgs procesadas");
  });

  it("si no se pudo leer el registro, lo avisa", () => {
    const pagina = html({ corridas: { disponible: false, procesos: [] } });
    expect(pagina).toContain("No se pudo leer el registro de corridas");
  });
});

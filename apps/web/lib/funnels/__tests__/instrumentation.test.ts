/**
 * Instrumentación y cadencia — sección 05 del documento.
 */

import { describe, it, expect } from "vitest";
import {
  INSTRUMENTATION_TOOLS,
  REPORTING_CADENCE,
  DEFAULT_REPORTING_TIMEZONE,
  ATTRIBUTION_STACK,
  blockingTools,
  getInstrumentationTool,
} from "../instrumentation";
import { FUNNEL_TEMPLATES } from "../templates";
import { DOC_TOOLS, DOC_CADENCE } from "./document-fixture";

describe("dueño de cada etapa", () => {
  it("hay una herramienta por cada fila del documento", () => {
    expect(INSTRUMENTATION_TOOLS).toHaveLength(DOC_TOOLS.length);
  });

  it("copia lo que cada herramienta posee", () => {
    INSTRUMENTATION_TOOLS.forEach((tool, i) => {
      expect(tool.label).toBe(DOC_TOOLS[i]!.tool);
      expect(tool.owns).toBe(DOC_TOOLS[i]!.owns);
    });
  });

  it("todo sourceHint de las plantillas resuelve a una herramienta real", () => {
    for (const template of FUNNEL_TEMPLATES) {
      for (const step of template.steps) {
        expect(() => getInstrumentationTool(step.sourceHint)).not.toThrow();
      }
    }
  });
});

describe("track de integraciones bloqueante (§7)", () => {
  it("bloquean las que no existen y las que cubren sólo una parte", () => {
    expect(blockingTools().map((t) => t.id).sort()).toEqual([
      "crm_pipeline",
      "hyros",
      "landing_page",
      "webinar_platform",
    ]);
  });

  it("GHL sigue parcial: pipelines y webhook existen, pero hay que asociar etapas y no hay historial previo", () => {
    // El documento le asigna "Stage counts, set/close, follow-up", que es lo que
    // necesita el embudo DM. Limitless sincroniza pipelines y arma el historial
    // con el webhook, pero cada paso hay que asociarlo a una etapa a mano y lo
    // anterior al webhook no se recupera.
    const ghl = getInstrumentationTool("crm_pipeline");
    expect(ghl.otcStatus).toBe("partial");
    // SCRUM-60: la nota no puede volver a decir que no se consumen pipelines.
    expect(ghl.otcNote).not.toMatch(/NO \/opportunities|no se sincronizan/i);
  });

  it("el checkout está disponible vía Whop y Fanbasis; Stripe y Mercado Pago no alimentan embudos", () => {
    const checkout = getInstrumentationTool("checkout");
    expect(checkout.otcStatus).toBe("available");
    expect(checkout.otcNote).toMatch(/Whop/);
    expect(checkout.otcNote).toMatch(/Stripe y Mercado Pago no alimentan/);
  });

  it("Meta Ads ya persiste sus métricas diarias", () => {
    expect(getInstrumentationTool("meta_ads").otcNote).toMatch(/ad_metrics_daily/);
  });

  it("los tres embudos dependen de alguna herramienta pendiente", () => {
    // El DM también, contra lo que se asumió en la Fase 1: el documento le
    // asigna sus conteos por etapa al pipeline de GHL, que Limitless no sincroniza.
    const blocking = new Set(blockingTools().map((t) => t.id));
    for (const template of FUNNEL_TEMPLATES) {
      expect(template.steps.some((s) => blocking.has(s.sourceHint))).toBe(true);
    }
  });

  it("el DM depende de GHL en cuatro de sus seis pasos", () => {
    const dm = FUNNEL_TEMPLATES.find((t) => t.id === "dm")!;
    const conGhl = dm.steps.filter((s) => s.sourceHint === "crm_pipeline");
    expect(conGhl.map((s) => s.id)).toEqual([
      "dm.conversation",
      "dm.replied",
      "dm.set",
    ]);
  });
});

describe("cadencia de reporte", () => {
  it("tiene las tres frecuencias del documento", () => {
    expect(REPORTING_CADENCE.map((c) => c.title)).toEqual(DOC_CADENCE.map((c) => c.title));
  });

  it("el pulso diario existe pero todavía no lee los embudos", () => {
    expect(REPORTING_CADENCE.find((c) => c.id === "daily")!.otcStatus).toBe("partial");
  });

  it("los reportes semanal y mensual ya tienen cron", () => {
    expect(REPORTING_CADENCE.find((c) => c.id === "weekly")!.otcStatus).toBe("available");
    expect(REPORTING_CADENCE.find((c) => c.id === "monthly")!.otcStatus).toBe("available");
  });
});

describe("gobernanza (§3.7)", () => {
  it("el timezone de reporte por defecto es EST", () => {
    // "report every metric in EST (the Hyros dashboard defaults to Mountain Time)"
    expect(DEFAULT_REPORTING_TIMEZONE).toBe("America/New_York");
  });

  it("el stack de atribución es Hyros + Meta + GHL", () => {
    expect(ATTRIBUTION_STACK).toEqual(["hyros", "meta_ads", "crm_pipeline"]);
  });
});

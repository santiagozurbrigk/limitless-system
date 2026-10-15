import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * SCRUM-519 (AR pasada 2): la tarjeta y el detalle de Integraciones usan
 * `estaConectada`, así que una integración cuyo estado no se pudo leer
 * (`estadoSinLeer`) no se dibuja como conectada.
 */

// Los botones de conectar usan providers y server actions: no hacen falta acá.
vi.mock("@/components/integrations/integration-connect-actions", () => ({
  IntegrationConnectActions: () => null,
}));

import { IntegrationDetail } from "@/components/integrations/integration-detail";
import { IntegrationTile } from "@/components/integrations/integration-tile";
import { buildHealth, estadoSinLeer, type IntegrationHealth } from "@/lib/integrations/health";

const SIN_LEER = estadoSinLeer({
  provider: "youtube",
  recordsLabel: "videos",
  motivo: "Ocurrió un error inesperado. Intentá de nuevo.",
});
const CONECTADA = buildHealth({
  provider: "youtube",
  connected: true,
  records: 12,
  recordsLabel: "videos",
  lastSyncAt: "2026-10-12T00:00:00Z",
});

function detalle(health: IntegrationHealth) {
  return renderToStaticMarkup(createElement(IntegrationDetail, { health, onBack: () => {} }));
}

function tarjeta(health: IntegrationHealth) {
  return renderToStaticMarkup(createElement(IntegrationTile, { health, onOpen: () => {} }));
}

describe("detalle de una integración", () => {
  it("conectada, muestra los registros y los últimos datos", () => {
    const html = detalle(CONECTADA);
    expect(html).toContain("Últimos datos recibidos");
  });

  it("⭐ sin leer, muestra el motivo y no el bloque de estadísticas vacío", () => {
    const html = detalle(SIN_LEER);
    expect(html).toContain("No se pudo leer el estado de esta integración");
    expect(html).not.toContain("Últimos datos recibidos");
    expect(html).not.toContain("Sin conteo");
  });
});

describe("tarjeta de una integración", () => {
  it("sin leer, muestra la insignia de error", () => {
    expect(tarjeta(SIN_LEER)).toContain("Con error");
  });

  it("⭐ sin leer y sin avisos, no se dibuja como conectada", () => {
    // Un `estadoSinLeer` siempre trae su aviso; sin él se ve la rama que decide
    // entre "Conectada" y "Sin conectar", que es la que usa `estaConectada`.
    const html = tarjeta({ ...SIN_LEER, issues: [] });
    expect(html).not.toContain("Conectada");
    expect(html).not.toContain("Sin conteo");
  });

  it("conectada y sin avisos, dice cuántos registros tiene", () => {
    expect(tarjeta(CONECTADA)).toContain("12 videos");
  });
});

/**
 * SCRUM-108 (AR pasada 1, MENOR-1): con la lectura del holding caída, el
 * layout le pasa al shell el valor de un holding sin negocio activo. El shell
 * real tiene que dibujar la barra sin los módulos, como para ese holding.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HoldingSessionState } from "@/lib/holding/session";

const sim = vi.hoisted(() => ({
  holding: null as unknown as HoldingSessionState,
  showItems: [] as Array<boolean | undefined>,
}));

vi.mock("@/components/holding/holding-platform-provider", () => ({
  useHoldingSession: () => sim.holding,
}));
vi.mock("@/components/navigation/notch-nav/platform-notch-nav", () => ({
  PlatformNotchNav: ({ showItems }: { showItems?: boolean }) => {
    sim.showItems.push(showItems);
    return null;
  },
}));
vi.mock("@/components/holding/holding-viewing-banner", () => ({ HoldingViewingBanner: () => null }));
vi.mock("@/components/brand", () => ({ PlatformDocumentTitle: () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/clients" }));
vi.mock("@ai-coo/ui", () => ({
  TooltipProvider: ({ children }: { children: unknown }) => children,
}));

import { PlatformShell } from "../platform-shell";

function dibujar(holding: HoldingSessionState): boolean | undefined {
  sim.holding = holding;
  sim.showItems = [];
  renderToStaticMarkup(createElement(PlatformShell, null, "contenido"));
  return sim.showItems[0];
}

beforeEach(() => {
  sim.showItems = [];
});

describe("la barra según el estado del holding", () => {
  it("⭐ el valor de la lectura caída (holding sin negocio activo) esconde los módulos", () => {
    expect(dibujar({ isHolding: true, viewingBusiness: false, businesses: [] })).toBe(false);
  });

  it("una cuenta sin holding ve los módulos", () => {
    expect(dibujar({ isHolding: false, viewingBusiness: false, businesses: [] })).toBe(true);
  });

  it("un holding operando un negocio ve los módulos", () => {
    expect(
      dibujar({ isHolding: true, holdingOrgId: "h", activeOrgId: "n", viewingBusiness: true, businesses: [] })
    ).toBe(true);
  });
});

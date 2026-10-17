import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ClaveDeIngestaResumen } from "@/lib/webinar/claves-de-ingesta";

/**
 * SCRUM-527: el panel de la Landing en Integraciones (claves de ingesta).
 */

vi.mock("@/providers/toast-provider", () => ({ useToast: () => ({ push: () => {} }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/webinar/claves-de-ingesta-actions", () => ({
  crearClaveDeIngestaAction: vi.fn(),
  revocarClaveDeIngestaAction: vi.fn(),
}));

const {
  AVISO_UNA_SOLA_VEZ,
  AvisoDeCopiado,
  ClaveRecienCreada,
  LandingSettings,
  ListaDeClaves,
  conClaveRevocada,
  copiarAlPortapapeles,
  destinoDelFoco,
  manejarResultadoDeRevocar,
} = await import("@/components/integrations/settings/landing-settings");

const ACTIVA: ClaveDeIngestaResumen = {
  id: "11111111-1111-4111-8111-111111111111",
  label: "Landing de noviembre",
  createdAt: "2026-10-10T00:00:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
};
const REVOCADA: ClaveDeIngestaResumen = {
  id: "22222222-2222-4222-8222-222222222222",
  label: "Landing vieja",
  createdAt: "2026-09-01T00:00:00.000Z",
  lastUsedAt: "2026-09-02T00:00:00.000Z",
  revokedAt: "2026-09-30T00:00:00.000Z",
};

const lista = (aConfirmar: string | null = null) =>
  renderToStaticMarkup(
    createElement(ListaDeClaves, {
      claves: [ACTIVA, REVOCADA],
      aConfirmar,
      ocupado: false,
      onPedirRevocar: () => {},
      onCancelar: () => {},
      onConfirmar: () => {},
    }),
  );

describe("panel de la Landing", () => {
  it("si la lectura falló, muestra el motivo", () => {
    const html = renderToStaticMarkup(
      createElement(LandingSettings, {
        lectura: {
          ok: false,
          motivo: "Sólo el founder o un admin pueden ver, crear o revocar las claves de ingesta.",
        },
      }),
    );
    expect(html).toContain("Sólo el founder o un admin pueden ver, crear o revocar las claves de ingesta.");
    expect(html).not.toContain("Crear clave");
  });

  it("un error inesperado muestra el texto fijo", () => {
    const html = renderToStaticMarkup(
      createElement(LandingSettings, {
        lectura: { ok: false, motivo: "Ocurrió un error inesperado. Intentá de nuevo." },
      }),
    );
    expect(html).toContain("Ocurrió un error inesperado. Intentá de nuevo.");
  });

  it("con las claves, muestra crear y la lista", () => {
    const html = renderToStaticMarkup(
      createElement(LandingSettings, { lectura: { ok: true, data: [ACTIVA] } }),
    );
    expect(html).toContain("Crear clave");
    expect(html).toContain("Landing de noviembre");
    expect(html).toContain("Último uso: nunca");
  });

  it("sin claves, lo dice", () => {
    const html = renderToStaticMarkup(
      createElement(LandingSettings, { lectura: { ok: true, data: [] } }),
    );
    expect(html).toContain("Todavía no creaste ninguna clave.");
  });
});

describe("clave recién creada", () => {
  it("muestra la clave, copiar y el aviso de que no se vuelve a mostrar", () => {
    const html = renderToStaticMarkup(
      createElement(ClaveRecienCreada, { clave: "lmt_ing_ejemplo", onListo: () => {} }),
    );
    expect(html).toContain("lmt_ing_ejemplo");
    expect(html).toContain("Copiar");
    expect(html).toContain("no se vuelve a mostrar");
    expect(AVISO_UNA_SOLA_VEZ).toContain("no se vuelve a mostrar");
  });
});

describe("lista y revocar", () => {
  it("una activa ofrece revocar; una revocada no", () => {
    const html = lista();
    expect(html.match(/>Revocar</g)).toHaveLength(1);
    expect(html).toContain("Revocada");
    expect(html).not.toContain("Sí, revocar");
  });

  it("revocar pide confirmación dentro de la página", () => {
    const html = lista(ACTIVA.id);
    expect(html).toContain("¿Revocar «Landing de noviembre»?");
    expect(html).toContain("Sí, revocar");
    expect(html).toContain("Cancelar");
  });

  it("no usa confirm() del navegador", () => {
    const fuente = readFileSync(
      fileURLToPath(new URL("../settings/landing-settings.tsx", import.meta.url)),
      "utf8",
    );
    expect(fuente).not.toMatch(/\bconfirm\s*\(/);
  });

  it("cada «Revocar» dice de qué clave es", () => {
    expect(lista()).toContain('aria-label="Revocar la clave «Landing de noviembre»"');
  });

  it("conClaveRevocada marca sólo esa clave", () => {
    const despues = conClaveRevocada([ACTIVA, REVOCADA], ACTIVA.id, "2026-10-16T00:00:00.000Z");
    expect(despues[0].revokedAt).toBe("2026-10-16T00:00:00.000Z");
    expect(despues[1]).toEqual(REVOCADA);
  });
});

describe("AR pasada 1", () => {
  function acciones() {
    return {
      cerrarConfirmacion: vi.fn(),
      marcarRevocada: vi.fn(),
      releer: vi.fn(),
      avisar: vi.fn(),
    };
  }

  describe("manejarResultadoDeRevocar (MNR-1)", () => {
    it("con éxito, cierra la confirmación, la marca revocada y avisa", () => {
      const a = acciones();
      manejarResultadoDeRevocar({ success: true, data: { revokedAt: "2026-10-16T00:00:00Z" } }, ACTIVA.id, a);
      expect(a.cerrarConfirmacion).toHaveBeenCalledTimes(1);
      expect(a.marcarRevocada).toHaveBeenCalledWith(ACTIVA.id, "2026-10-16T00:00:00Z");
      expect(a.releer).not.toHaveBeenCalled();
      expect(a.avisar).toHaveBeenCalledWith({ title: "Clave revocada", variant: "success" });
    });

    it("si ya estaba revocada o no existe, cierra la confirmación y relee la lista", () => {
      const a = acciones();
      manejarResultadoDeRevocar(
        { success: false, error: "No encontramos esa clave o ya estaba revocada." },
        ACTIVA.id,
        a,
      );
      expect(a.cerrarConfirmacion).toHaveBeenCalledTimes(1);
      expect(a.releer).toHaveBeenCalledTimes(1);
      expect(a.marcarRevocada).not.toHaveBeenCalled();
      expect(a.avisar).toHaveBeenCalledWith({
        title: "No se pudo revocar la clave",
        description: "No encontramos esa clave o ya estaba revocada.",
      });
    });

    it("otro error deja la confirmación abierta para reintentar, sin releer", () => {
      const a = acciones();
      manejarResultadoDeRevocar(
        { success: false, error: "Ocurrió un error inesperado. Intentá de nuevo." },
        ACTIVA.id,
        a,
      );
      expect(a.cerrarConfirmacion).not.toHaveBeenCalled();
      expect(a.releer).not.toHaveBeenCalled();
      expect(a.avisar).toHaveBeenCalledTimes(1);
    });
  });

  describe("foco al abrir y cerrar la confirmación (MNR-2)", () => {
    it("al abrir, a «Cancelar»", () => {
      expect(destinoDelFoco(null, ACTIVA.id, [ACTIVA])).toEqual({ a: "cancelar" });
    });

    it("al cancelar, vuelve al «Revocar» de esa clave", () => {
      expect(destinoDelFoco(ACTIVA.id, null, [ACTIVA])).toEqual({ a: "revocar", id: ACTIVA.id });
    });

    it("al revocarla, va a su fila (el botón ya no existe)", () => {
      const revocada = { ...ACTIVA, revokedAt: "2026-10-16T00:00:00Z" };
      expect(destinoDelFoco(ACTIVA.id, null, [revocada])).toEqual({ a: "fila", id: ACTIVA.id });
    });

    it("sin cambios, o si la clave ya no está, no mueve el foco", () => {
      expect(destinoDelFoco(null, null, [ACTIVA])).toBeNull();
      expect(destinoDelFoco(ACTIVA.id, ACTIVA.id, [ACTIVA])).toBeNull();
      expect(destinoDelFoco(ACTIVA.id, null, [])).toBeNull();
    });

    it("las filas se pueden enfocar y «Cancelar» está en la confirmación", () => {
      const html = lista(ACTIVA.id);
      expect(html).toContain('tabindex="-1"');
      expect(html).toContain('role="group"');
    });
  });

  describe("copiar (MNR-2 y MNR-4)", () => {
    it("con portapapeles, copia y es «si»", async () => {
      const writeText = vi.fn(async () => {});
      expect(await copiarAlPortapapeles("lmt_ing_x", { writeText })).toBe("si");
      expect(writeText).toHaveBeenCalledWith("lmt_ing_x");
    });

    it("si el portapapeles rechaza, es «no»", async () => {
      const writeText = vi.fn(async () => {
        throw new Error("NotAllowedError");
      });
      expect(await copiarAlPortapapeles("lmt_ing_x", { writeText })).toBe("no");
    });

    it("sin portapapeles, es «no»", async () => {
      expect(await copiarAlPortapapeles("lmt_ing_x", undefined)).toBe("no");
    });

    it("el resultado se anuncia en una región aria-live, que existe antes de copiar", () => {
      const vacio = renderToStaticMarkup(createElement(AvisoDeCopiado, { estado: null }));
      expect(vacio).toContain('aria-live="polite"');
      expect(renderToStaticMarkup(createElement(AvisoDeCopiado, { estado: "si" }))).toContain("Copiada");
      expect(renderToStaticMarkup(createElement(AvisoDeCopiado, { estado: "no" }))).toContain(
        "No se pudo copiar: seleccioná la clave y copiala a mano.",
      );
      const recienCreada = renderToStaticMarkup(
        createElement(ClaveRecienCreada, { clave: "lmt_ing_ejemplo", onListo: () => {} }),
      );
      expect(recienCreada).toContain('aria-live="polite"');
    });
  });
});

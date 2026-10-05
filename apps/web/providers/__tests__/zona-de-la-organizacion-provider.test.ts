/**
 * SCRUM-493: la zona de la organización llega al cliente una sola vez, por el
 * provider que arma el layout, y todos los "hoy" y campos de fecha de un dato
 * de la org la usan. Un miembro en Madrid con la org en Argentina, a las 22:00
 * de Argentina (ya las 03:00 del día siguiente en Madrid), ve el día de la org.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampoFecha } from "@/components/shared/campo-fecha";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import { fechaDeHoyEnZona } from "@/lib/fechas/calendario";
import {
  suscribirseAlReloj,
  useHoyDeLaOrganizacion,
  useZonaDeLaOrganizacion,
  ZonaDeLaOrganizacionProvider,
} from "../zona-de-la-organizacion-provider";

afterEach(() => {
  restaurarZona();
  vi.useRealTimers();
});

const ARGENTINA = "America/Argentina/Buenos_Aires";

function MostrarZona() {
  return createElement("span", null, `zona=${useZonaDeLaOrganizacion() ?? "ninguna"}`);
}

function MostrarHoy() {
  return createElement("span", null, `hoy=${useHoyDeLaOrganizacion() ?? "todavía no"}`);
}

describe("⭐ ZonaDeLaOrganizacionProvider", () => {
  it("los componentes leen la zona que pasó el layout; sin provider, ninguna (la de por defecto)", () => {
    expect(
      renderToStaticMarkup(
        createElement(ZonaDeLaOrganizacionProvider, { zona: ARGENTINA, children: createElement(MostrarZona) })
      )
    ).toContain(`zona=${ARGENTINA}`);
    expect(renderToStaticMarkup(createElement(MostrarZona))).toContain("zona=ninguna");
  });

  it("un miembro en Madrid a las 22:00 de Argentina ve en CampoFecha el día de la org", () => {
    conZona("Europe/Madrid");
    const salida = renderToStaticMarkup(
      createElement(ZonaDeLaOrganizacionProvider, {
        zona: ARGENTINA,
        children: createElement(CampoFecha, { value: "2026-10-06T01:00:00Z", onChange: () => {} }),
      })
    );
    expect(salida).toContain('value="2026-10-05"');
  });

  it("en el render del servidor el hoy todavía no está (null), para no hidratar otro día", () => {
    expect(
      renderToStaticMarkup(
        createElement(ZonaDeLaOrganizacionProvider, { zona: ARGENTINA, children: createElement(MostrarHoy) })
      )
    ).toContain("hoy=todavía no");
  });

  it("el hoy de la org, mirado desde Madrid a las 03:00, es el día anterior de Madrid", () => {
    conZona("Europe/Madrid");
    // Es lo que devuelve useHoyDeLaOrganizacion en el navegador.
    expect(fechaDeHoyEnZona(ARGENTINA, new Date("2026-10-06T01:00:00Z"))).toBe("2026-10-05");
  });

  it("vuelve a mirar el día una vez por minuto, hasta que se desuscribe", () => {
    vi.useFakeTimers();
    const avisar = vi.fn();
    const desuscribir = suscribirseAlReloj(avisar);
    vi.advanceTimersByTime(60_000);
    expect(avisar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120_000);
    expect(avisar).toHaveBeenCalledTimes(3);
    desuscribir();
    vi.advanceTimersByTime(600_000);
    expect(avisar).toHaveBeenCalledTimes(3);
  });
});

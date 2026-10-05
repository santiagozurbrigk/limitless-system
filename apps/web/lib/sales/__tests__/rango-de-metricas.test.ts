/**
 * SCRUM-493: el selector de rango de métricas de ventas se elige, se muestra y
 * filtra en días de la zona de la organización. Un miembro en Madrid a las
 * 00:30 del 6-oct (19:30 del 5-oct en Argentina) ve como "hoy" el 5, que es el
 * tope del campo y se puede elegir, y el rango cubre el 5 entero de la org.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { DateRangePicker } from "@/components/sales/metrics/date-range-picker";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import { ZonaDeLaOrganizacionProvider } from "@/providers/zona-de-la-organizacion-provider";
import {
  diasDelRango,
  PRESETS_DE_RANGO,
  rangoDeDias,
  rangoDelPreset,
  rangoPorDefecto,
} from "../rango-de-metricas";

afterEach(restaurarZona);

const ARGENTINA = "America/Argentina/Buenos_Aires";
/** 6-oct 00:30 en Madrid (UTC+2) = 5-oct 22:30 UTC = 5-oct 19:30 en Argentina. */
const MADRID_00_30 = new Date("2026-10-05T22:30:00Z");

describe("⭐ rango de métricas en la zona de la organización", () => {
  it("el valor por defecto es este mes de la org: del 1 al 5, aunque en Madrid ya sea el 6", () => {
    conZona("Europe/Madrid");
    const rango = rangoPorDefecto(ARGENTINA, MADRID_00_30);
    expect(diasDelRango(rango, ARGENTINA)).toEqual({ desde: "2026-10-01", hasta: "2026-10-05" });
    expect(rango.from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(rango.to.toISOString()).toBe("2026-10-06T02:59:59.999Z");
  });

  it("se puede elegir hoy (el tope): el rango cubre el día entero de la org", () => {
    conZona("Europe/Madrid");
    const hoy = rangoDeDias("2026-10-05", "2026-10-05", ARGENTINA);
    expect(hoy.from.toISOString()).toBe("2026-10-05T03:00:00.000Z");
    expect(hoy.to.toISOString()).toBe("2026-10-06T02:59:59.999Z");
    // Una conversación de las 22:00 ART del 5 (6-oct 01:00 UTC, ya el 6 en Madrid) entra.
    const mensaje = new Date("2026-10-06T01:00:00Z");
    expect(mensaje >= hoy.from && mensaje <= hoy.to).toBe(true);
    expect(diasDelRango(hoy, ARGENTINA)).toEqual({ desde: "2026-10-05", hasta: "2026-10-05" });
  });

  it("los atajos terminan hoy en la org", () => {
    conZona("Europe/Madrid");
    const treinta = rangoDelPreset(PRESETS_DE_RANGO[1], ARGENTINA, MADRID_00_30);
    expect(diasDelRango(treinta, ARGENTINA)).toEqual({ desde: "2026-09-05", hasta: "2026-10-05" });
  });

  it("organización sin zona: la de por defecto", () => {
    conZona("UTC");
    expect(diasDelRango(rangoPorDefecto(null, MADRID_00_30), null)).toEqual({
      desde: "2026-10-01",
      hasta: "2026-10-05",
    });
  });

  it("el selector muestra los días de la org a un miembro en Madrid", () => {
    conZona("Europe/Madrid");
    const salida = renderToStaticMarkup(
      createElement(ZonaDeLaOrganizacionProvider, {
        zona: ARGENTINA,
        children: createElement(DateRangePicker, {
          value: rangoDeDias("2026-10-01", "2026-10-05", ARGENTINA),
          onChange: () => {},
        }),
      })
    );
    expect(salida).toContain('value="2026-10-01"');
    expect(salida).toContain('value="2026-10-05"');
    expect(salida).not.toContain('value="2026-10-06"');
  });
});

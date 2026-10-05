/**
 * SCRUM-493: `CampoFecha` muestra el valor guardado con el día que se eligió
 * (columna `date` o `timestamptz`) y emite exactamente la fecha elegida.
 *
 * Los tests corren en Node (sin DOM): el HTML se arma con `renderToStaticMarkup`
 * y el cambio se simula llamando al `onChange` del `Input` que devuelve el
 * componente. La zona de la organización sale del provider, que acá se simula
 * (`sim.zona`); el provider real se prueba en
 * `providers/__tests__/zona-de-la-organizacion-provider.test.ts`. Los instantes se arman en UTC y la zona del
 * proceso se fija, así que con el código viejo (`toISOString().slice(0, 10)`)
 * el caso de las 22:00 de Argentina falla en cualquier máquina.
 */

import { createElement, type ChangeEvent, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import {
  fechaAInstanteEnZona,
  formatearFechaGuardada,
} from "@/lib/fechas/calendario";
import { buildLeadThread, type LeadAttempt } from "@/lib/sales/lead-thread";
import { CampoFecha, type CampoFechaProps } from "../campo-fecha";

const sim = vi.hoisted(() => ({ zona: "America/Argentina/Buenos_Aires" as string | null }));
vi.mock("@/providers/zona-de-la-organizacion-provider", () => ({
  useZonaDeLaOrganizacion: () => sim.zona,
}));

afterEach(() => {
  restaurarZona();
  sim.zona = "America/Argentina/Buenos_Aires";
});

function html(props: CampoFechaProps): string {
  return renderToStaticMarkup(createElement(CampoFecha, props));
}

/** El `value` del `<input>` que se renderiza. */
function valorMostrado(props: CampoFechaProps): string | null {
  return /value="([^"]*)"/.exec(html(props))?.[1] ?? null;
}

/** Simula que el usuario elige `valor` en el campo y devuelve lo que se emitió. */
function elegir(valor: string): unknown {
  const onChange = vi.fn();
  const elemento = CampoFecha({ value: null, onChange }) as ReactElement<{
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  }>;
  elemento.props.onChange({ target: { value: valor } } as ChangeEvent<HTMLInputElement>);
  expect(onChange).toHaveBeenCalledTimes(1);
  return onChange.mock.calls[0]![0];
}

describe("⭐ CampoFecha a las 22:00 de Argentina", () => {
  it("un timestamptz guardado a las 22:00 se muestra con ese día, no con el de UTC", () => {
    conZona("America/Argentina/Buenos_Aires");
    // 5-oct 22:00 en Buenos Aires = 6-oct 01:00 UTC.
    expect(valorMostrado({ value: "2026-10-06T01:00:00+00:00", onChange: () => {} })).toBe(
      "2026-10-05"
    );
  });

  it("una columna date se muestra tal cual", () => {
    conZona("America/Argentina/Buenos_Aires");
    expect(valorMostrado({ value: "2026-10-05", onChange: () => {} })).toBe("2026-10-05");
  });

  it("una fecha guardada en timestamptz a medianoche UTC se muestra con su día", () => {
    conZona("America/Argentina/Buenos_Aires");
    expect(valorMostrado({ value: "2026-10-05T00:00:00+00:00", onChange: () => {} })).toBe(
      "2026-10-05"
    );
  });

  it("lo guardado con fechaAInstanteEnZona vuelve igual con la misma zona (ida y vuelta)", () => {
    conZona("Europe/Madrid");
    const zona = "America/Argentina/Buenos_Aires";
    expect(
      valorMostrado({ value: fechaAInstanteEnZona("2026-10-05", zona), onChange: () => {}, zona })
    ).toBe("2026-10-05");
  });

  it("emite exactamente la fecha elegida", () => {
    conZona("America/Argentina/Buenos_Aires");
    expect(elegir("2026-10-05")).toBe("2026-10-05");
    expect(elegir("2026-12-31")).toBe("2026-12-31");
  });
});

describe("CampoFecha", () => {
  it("sin valor muestra el campo vacío, y borrar emite null", () => {
    expect(valorMostrado({ value: null, onChange: () => {} })).toBe("");
    expect(valorMostrado({ value: undefined, onChange: () => {} })).toBe("");
    expect(elegir("")).toBeNull();
  });

  it("es un input de fecha y pasa las props del Input", () => {
    const salida = html({
      value: "2026-10-05",
      onChange: () => {},
      id: "fecha",
      min: "2026-10-01",
      max: "2026-10-31",
      disabled: true,
      className: "mi-clase",
    });
    expect(salida).toContain('type="date"');
    expect(salida).toContain('id="fecha"');
    expect(salida).toContain('min="2026-10-01"');
    expect(salida).toContain('max="2026-10-31"');
    expect(salida).toContain("disabled");
    expect(salida).toContain("mi-clase");
  });
});

/**
 * SCRUM-493 (segunda pasada): el próximo paso de Closing es un dato de la
 * organización. Con `zona`, la celda, el cajón y el estado del lead dicen el
 * mismo día para todos los miembros, estén donde estén.
 */
describe("⭐ CampoFecha con la zona de la organización", () => {
  const argentina = "America/Argentina/Buenos_Aires";

  it("org en Argentina, navegador en Madrid: la celda, el cajón y el estado dicen el mismo día", () => {
    conZona("Europe/Madrid");
    // 5-oct 22:00 ART (por ejemplo, una fila del default viejo "ahora + 2 días").
    const valor = "2026-10-06T01:00:00Z";
    expect(valorMostrado({ value: valor, onChange: () => {}, zona: argentina })).toBe("2026-10-05");
    expect(
      formatearFechaGuardada(valor, {
        opciones: { day: "2-digit", month: "2-digit", year: "numeric" },
        zona: argentina,
      })
    ).toBe("05/10/2026");
    // El 5 a las 23:00 ART todavía está a tiempo; el 6 a las 12:00 ART, vencido.
    const intento: LeadAttempt = {
      id: "a1",
      scheduledAt: "2026-10-01T15:00:00Z",
      status: "not_closed",
      nextAction: "follow_up",
      nextActionAt: valor,
      preCallQualification: null,
      postCallQualification: null,
    };
    expect(buildLeadThread([intento], new Date("2026-10-06T02:00:00Z"), argentina).state).toBe(
      "follow_up_planned"
    );
    expect(buildLeadThread([intento], new Date("2026-10-06T15:00:00Z"), argentina).state).toBe(
      "follow_up_due"
    );
  });

  it("un miembro en Tokio elige el 6: se guarda el 6 de la org y todos lo ven y lo vencen el 6", () => {
    conZona("Asia/Tokyo");
    const guardado = fechaAInstanteEnZona("2026-10-06", argentina);
    expect(valorMostrado({ value: guardado, onChange: () => {}, zona: argentina })).toBe("2026-10-06");
    conZona(argentina);
    expect(valorMostrado({ value: guardado, onChange: () => {}, zona: argentina })).toBe("2026-10-06");
    const intento: LeadAttempt = {
      id: "a1",
      scheduledAt: "2026-10-01T15:00:00Z",
      status: "not_closed",
      nextAction: "follow_up",
      nextActionAt: guardado,
      preCallQualification: null,
      postCallQualification: null,
    };
    // 6-oct 12:00 ART: vence hoy, todavía a tiempo.
    expect(buildLeadThread([intento], new Date("2026-10-06T15:00:00Z"), argentina).state).toBe(
      "follow_up_planned"
    );
  });

  it("⭐ sin zona, usa la de la organización: un miembro en Madrid ve el día de la org", () => {
    conZona("Europe/Madrid");
    // 5-oct 22:00 ART: en Madrid ya es el 6 a las 03:00.
    expect(valorMostrado({ value: "2026-10-06T01:00:00Z", onChange: () => {} })).toBe("2026-10-05");
    sim.zona = "Europe/Madrid";
    expect(valorMostrado({ value: "2026-10-06T01:00:00Z", onChange: () => {} })).toBe("2026-10-06");
  });
});

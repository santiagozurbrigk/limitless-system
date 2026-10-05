/**
 * SCRUM-493: `CampoFecha` muestra el valor guardado con el día que se eligió
 * (columna `date` o `timestamptz`) y emite exactamente la fecha elegida.
 *
 * Los tests corren en Node (sin DOM): el HTML se arma con `renderToStaticMarkup`
 * y el cambio se simula llamando al `onChange` del `Input` que devuelve el
 * componente, que no usa hooks. Los instantes se arman en UTC y la zona del
 * proceso se fija, así que con el código viejo (`toISOString().slice(0, 10)`)
 * el caso de las 22:00 de Argentina falla en cualquier máquina.
 */

import { createElement, type ChangeEvent, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import { fechaAInstanteLocal } from "@/lib/fechas/calendario";
import { CampoFecha, type CampoFechaProps } from "../campo-fecha";

afterEach(restaurarZona);

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

  it("lo guardado con fechaAInstanteLocal vuelve igual (ida y vuelta)", () => {
    conZona("America/Argentina/Buenos_Aires");
    expect(valorMostrado({ value: fechaAInstanteLocal("2026-10-05"), onChange: () => {} })).toBe(
      "2026-10-05"
    );
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

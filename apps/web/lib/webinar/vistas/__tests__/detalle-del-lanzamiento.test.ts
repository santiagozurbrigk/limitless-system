/**
 * SCRUM-544 · Lo que el contrato del Detalle suma a SCRUM-542: las etapas de
 * cada variante (diseño del producto, sección 6), el paso entre etapas, el
 * corte por anuncio (`utm_content`) y la evolución diaria en la zona de la
 * organización. Sobre el escenario de ejemplo, cambiando sólo lo necesario.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { calcularDetalleDelLanzamiento, calcularInicio } from "../calcular";
import {
  PASO_SE_MIDE_CONTRA,
  PASOS_POR_VARIANTE,
  type PasoDelEmbudo,
  type PasoDelEmbudoId,
  type VarianteDelLanzamiento,
} from "../contratos";
import { tieneValor } from "../dato";
import { escenarioDeEjemplo } from "../escenario-de-ejemplo";
import type { FilasDelWebinar } from "../filas";

const AHORA = new Date("2026-11-01T15:30:00Z");
const ZONA = "America/Argentina/Buenos_Aires";

function conVariante(variante: VarianteDelLanzamiento): FilasDelWebinar {
  const filas = escenarioDeEjemplo(AHORA);
  return { ...filas, lanzamientos: filas.lanzamientos.map((l, i) => (i === 0 ? { ...l, variant: variante } : l)) };
}

function detalle(filas: FilasDelWebinar, zona: string | null = ZONA) {
  return calcularDetalleDelLanzamiento(filas, filas.lanzamientos[0].id, AHORA, true, zona)!;
}

function paso(embudo: PasoDelEmbudo[], id: PasoDelEmbudoId): PasoDelEmbudo {
  const p = embudo.find((x) => x.paso === id);
  if (!p) throw new Error(`no está el paso ${id}`);
  return p;
}

describe("⭐ las tres variantes muestran sus etapas", () => {
  it.each(["organic", "paid", "paid_plus"] as const)("%s: las etapas de PASOS_POR_VARIANTE, en orden", (variante) => {
    const d = detalle(conVariante(variante));
    expect(d.embudo.map((p) => p.paso)).toEqual(PASOS_POR_VARIANTE[variante]);
  });

  it("el asiento VIP es sólo de Pago +++; la inversión, sólo de las pagas", () => {
    expect(detalle(conVariante("paid_plus")).embudo.map((p) => p.paso)).toContain("compraron_el_vip");
    expect(detalle(conVariante("paid")).embudo.map((p) => p.paso)).not.toContain("compraron_el_vip");
    expect(detalle(conVariante("organic")).anuncios).toBeNull();
    expect(detalle(conVariante("organic")).evolucionDiaria.inversion).toBeNull();
    expect(detalle(conVariante("paid")).anuncios).not.toBeNull();
  });

  it("todas las variantes cuentan Calificados (carga del equipo)", () => {
    for (const v of ["organic", "paid", "paid_plus"] as const) {
      const calificados = paso(detalle(conVariante(v)).embudo, "calificados");
      expect(calificados.personas.state).toBe("medido");
      expect(calificados.personas.source).toBe("manual");
    }
  });

  it("el VIP de Pago +++ sin producto VIP cargado: falta configurar, nunca cero", () => {
    const filas = conVariante("paid_plus");
    const sinVip = { ...filas, productos: filas.productos.filter((p) => p.role !== "vip") };
    const vip = paso(detalle(sinVip).embudo, "compraron_el_vip").personas;
    expect(vip.state).toBe("falta_configurar");
    expect(vip.value).toBeNull();
  });

  it("Inicio usa el mismo embudo de la variante", () => {
    const inicio = calcularInicio(conVariante("paid_plus"), AHORA, true, ZONA);
    expect(inicio.activo.value!.embudo.map((p) => p.paso)).toEqual(PASOS_POR_VARIANTE.paid_plus);
  });
});

describe("⭐ paso entre etapas", () => {
  const d = detalle(conVariante("paid_plus"));

  it("la primera etapa no tiene paso; las demás se miden contra PASO_SE_MIDE_CONTRA", () => {
    expect(d.embudo[0].pasoDesde).toBeNull();
    for (const p of d.embudo.slice(1)) expect(p.pasoDesde?.desde, p.paso).toBe(PASO_SE_MIDE_CONTRA[p.paso]);
  });

  it("la tasa es personas de la etapa / personas de la etapa base, entre 0 y 1", () => {
    const asistieron = paso(d.embudo, "asistieron");
    const registrados = paso(d.embudo, "registrados");
    expect(tieneValor(asistieron.personas) && tieneValor(registrados.personas)).toBe(true);
    if (tieneValor(asistieron.personas) && tieneValor(registrados.personas)) {
      expect(asistieron.pasoDesde!.tasa.value).toBeCloseTo(asistieron.personas.value / registrados.personas.value);
    }
  });

  it("si una de las dos etapas no tiene valor, la tasa tampoco (hereda el estado)", () => {
    const confirmaron = paso(d.embudo, "confirmaron_el_email");
    expect(confirmaron.personas.state).toBe("sin_fuente");
    expect(confirmaron.pasoDesde!.tasa.state).toBe("sin_fuente");
  });

  it("toda etapa base de la tabla existe en las tres variantes", () => {
    for (const v of ["organic", "paid", "paid_plus"] as const) {
      for (const p of PASOS_POR_VARIANTE[v]) {
        const contra = PASO_SE_MIDE_CONTRA[p];
        if (contra) expect(PASOS_POR_VARIANTE[v], `${v} ${p}`).toContain(contra);
      }
    }
  });
});

describe("⭐ corte por anuncio (utm_content)", () => {
  it("suma los registros del lanzamiento, de más a menos", () => {
    const filas = conVariante("paid");
    const d = detalle(filas);
    expect(tieneValor(d.registrosPorAnuncio)).toBe(true);
    const lista = d.registrosPorAnuncio.value!;
    const total = filas.registros.filter((r) => r.launch_id === filas.lanzamientos[0].id).length;
    expect(lista.reduce((a, b) => a + b.registros, 0)).toBe(total);
    for (let i = 1; i < lista.length; i++) expect(lista[i - 1].registros).toBeGreaterThanOrEqual(lista[i].registros);
  });
});

describe("⭐ evolución diaria", () => {
  const filas = conVariante("paid");
  const d = detalle(filas);
  const puntos = d.evolucionDiaria.registros.value!;

  it("días consecutivos, sin huecos, y la suma es el total del lanzamiento", () => {
    expect(puntos.length).toBeGreaterThan(1);
    for (let i = 1; i < puntos.length; i++) {
      const anterior = new Date(`${puntos[i - 1].dia}T00:00:00Z`).getTime();
      expect(new Date(`${puntos[i].dia}T00:00:00Z`).getTime() - anterior).toBe(86_400_000);
    }
    const total = filas.registros.filter((r) => r.launch_id === filas.lanzamientos[0].id).length;
    expect(puntos.reduce((a, p) => a + p.valor, 0)).toBe(total);
  });

  it("los días se cuentan en la zona de la organización", () => {
    const base = conVariante("paid");
    const id = base.lanzamientos[0].id;
    // 01:30 UTC del 31-oct es 22:30 del 30-oct en Buenos Aires.
    const unRegistro = {
      ...base,
      lanzamientos: base.lanzamientos.map((l) => (l.id === id ? { ...l, capture_starts_on: "2026-10-30" } : l)),
      registros: [{ ...base.registros.find((r) => r.launch_id === id)!, registered_at: "2026-10-31T01:30:00Z" }],
    };
    const enBA = detalle(unRegistro, ZONA).evolucionDiaria.registros.value!;
    expect(enBA.find((p) => p.dia === "2026-10-30")?.valor).toBe(1);
    const enUTC = detalle(unRegistro, "UTC").evolucionDiaria.registros.value!;
    expect(enUTC.find((p) => p.dia === "2026-10-31")?.valor).toBe(1);
  });

  it("la inversión diaria no se inventa: sin serie por día, sin fuente con su motivo", () => {
    const inversion = d.evolucionDiaria.inversion!;
    expect(inversion.state).toBe("sin_fuente");
    expect(inversion.value).toBeNull();
    expect(inversion.reason).toMatch(/total del lanzamiento/);
  });

  it("si la inversión total no tiene valor, la diaria hereda su estado y motivo", () => {
    const sinCampanas = { ...filas, campanas: [] };
    const d2 = detalle(sinCampanas);
    expect(d2.anuncios!.inversion.state).toBe("falta_configurar");
    expect(d2.evolucionDiaria.inversion!.state).toBe("falta_configurar");
    expect(d2.evolucionDiaria.inversion!.reason).toBe(d2.anuncios!.inversion.reason);
  });
});

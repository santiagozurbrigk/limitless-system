import { describe, expect, it } from "vitest";
import {
  LANZAMIENTOS_EN_PARALELO,
  datosDelLanzamientoSchema,
  motivoDeSuperposicion,
  type PeriodoDeLanzamiento,
} from "../esquemas";

const VALIDO = {
  nombre: "Webinar de diciembre",
  variante: "paid",
  moneda: "usd",
  precioDeLaOferta: 997,
  captaDesde: "2026-11-20",
  cierraEl: "2026-12-05",
  sesiones: [{ empiezaAt: "2026-12-02T23:00:00.000Z", zoomWebinarId: null, segundoDeLaOferta: null }],
};

describe("SCRUM-529 · datos de un lanzamiento", () => {
  it("⭐ un lanzamiento completo pasa; la moneda se normaliza a mayúsculas", () => {
    const r = datosDelLanzamientoSchema.safeParse(VALIDO);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.moneda).toBe("USD");
  });

  it("sin precio, sin fechas y sin sesiones también (se completa después)", () => {
    expect(
      datosDelLanzamientoSchema.safeParse({ ...VALIDO, precioDeLaOferta: null, captaDesde: null, cierraEl: null, sesiones: [] })
        .success
    ).toBe(true);
  });

  it("rechaza nombre vacío, variante desconocida, moneda inválida y precio negativo", () => {
    for (const cambio of [{ nombre: "  " }, { variante: "vip" }, { moneda: "dolares" }, { precioDeLaOferta: -1 }]) {
      expect(datosDelLanzamientoSchema.safeParse({ ...VALIDO, ...cambio }).success, JSON.stringify(cambio)).toBe(false);
    }
  });

  it("⭐ el cierre no puede ser antes de la captación", () => {
    const r = datosDelLanzamientoSchema.safeParse({ ...VALIDO, captaDesde: "2026-12-10", cierraEl: "2026-12-05" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("El cierre no puede ser antes del inicio de la captación");
  });

  it("una sesión sin fecha o con un segundo de la oferta negativo se rechaza", () => {
    expect(
      datosDelLanzamientoSchema.safeParse({ ...VALIDO, sesiones: [{ empiezaAt: "mañana", zoomWebinarId: null, segundoDeLaOferta: null }] }).success
    ).toBe(false);
    expect(
      datosDelLanzamientoSchema.safeParse({
        ...VALIDO,
        sesiones: [{ empiezaAt: "2026-12-02T23:00:00.000Z", zoomWebinarId: null, segundoDeLaOferta: -5 }],
      }).success
    ).toBe(false);
  });
});

describe("⭐ lanzamientos en paralelo", () => {
  const OTROS: PeriodoDeLanzamiento[] = [
    { id: "a", estado: "active", captaDesde: "2026-11-01", cierraEl: "2026-11-30" },
    { id: "b", estado: "closed", captaDesde: "2026-10-01", cierraEl: "2026-12-31" },
  ];

  it("la decisión está pendiente (SCRUM-522): sin límite, nunca rechaza", () => {
    expect(LANZAMIENTOS_EN_PARALELO).toBeNull();
    expect(motivoDeSuperposicion(OTROS, { captaDesde: "2026-11-15", cierraEl: "2026-12-05" })).toBeNull();
  });

  it("con uno a la vez: rechaza si se pisa con otro no cerrado", () => {
    expect(motivoDeSuperposicion(OTROS, { captaDesde: "2026-11-15", cierraEl: "2026-12-05" }, 1)).toBe(
      "Ya hay otro lanzamiento en esas fechas: una cuenta corre uno a la vez."
    );
  });

  it("los cerrados no cuentan, y uno que no se pisa pasa", () => {
    expect(motivoDeSuperposicion(OTROS, { captaDesde: "2026-12-01", cierraEl: "2026-12-20" }, 1)).toBeNull();
  });

  it("al editar, el lanzamiento no se pisa consigo mismo", () => {
    expect(motivoDeSuperposicion(OTROS, { id: "a", captaDesde: "2026-11-05", cierraEl: "2026-11-25" }, 1)).toBeNull();
  });

  it("sin fechas se toma abierto: se pisa con cualquiera", () => {
    expect(motivoDeSuperposicion(OTROS, { captaDesde: null, cierraEl: null }, 1)).not.toBeNull();
  });

  it("con hasta dos, el segundo pasa y el tercero no", () => {
    expect(motivoDeSuperposicion(OTROS, { captaDesde: "2026-11-15", cierraEl: "2026-11-20" }, 2)).toBeNull();
    const dos = [...OTROS, { id: "c", estado: "draft" as const, captaDesde: "2026-11-10", cierraEl: "2026-11-25" }];
    expect(motivoDeSuperposicion(dos, { captaDesde: "2026-11-15", cierraEl: "2026-11-20" }, 2)).toMatch(/hasta 2/);
  });
});

import { describe, expect, it } from "vitest";
import { datosDelLanzamientoSchema } from "../esquemas";
import { CAMPOS_VACIOS, camposDesdeLaVista, datosDesdeElFormulario } from "../formulario";

describe("SCRUM-529 · formulario del lanzamiento", () => {
  it("⭐ del formulario a la acción: precio con coma, minutos a segundos, vacíos a null", () => {
    const datos = datosDesdeElFormulario({
      ...CAMPOS_VACIOS,
      nombre: "Webinar",
      variante: "paid",
      precioDeLaOferta: "997,50",
      captaDesde: "2026-11-20",
      sesiones: [{ empiezaAt: "2026-12-02T20:00", zoomWebinarId: " 123 ", minutoDeLaOferta: "45" }],
    });
    expect(datos).toMatchObject({ precioDeLaOferta: 997.5, captaDesde: "2026-11-20", cierraEl: null });
    expect(datos.sesiones[0]).toMatchObject({ zoomWebinarId: "123", segundoDeLaOferta: 2700 });
    expect(datos.sesiones[0].empiezaAt).toMatch(/^2026-12-0[23]T\d{2}:00:00\.000Z$/);
    expect(datosDelLanzamientoSchema.safeParse(datos).success).toBe(true);
  });

  it("un precio que no es número no se inventa: lo rechaza el esquema", () => {
    const datos = datosDesdeElFormulario({ ...CAMPOS_VACIOS, nombre: "X", precioDeLaOferta: "mil" });
    expect(datosDelLanzamientoSchema.safeParse(datos).success).toBe(false);
  });

  it("ida y vuelta: los campos de un lanzamiento existente vuelven a los mismos datos", () => {
    const campos = camposDesdeLaVista(
      {
        id: "l1",
        nombre: "Webinar",
        variante: "paid_plus",
        estado: "active",
        moneda: "USD",
        precioDeLaOferta: 997,
        captaDesde: "2026-10-28",
        cierraEl: "2026-11-08",
        cerradoAt: null,
      },
      [{ id: "s1", empiezaAt: "2026-11-03T23:00:00.000Z", zoomWebinarId: "987", segundoDeLaOferta: 3000 }]
    );
    expect(campos.sesiones[0].minutoDeLaOferta).toBe("50");
    const datos = datosDesdeElFormulario(campos);
    expect(datos).toMatchObject({ variante: "paid_plus", precioDeLaOferta: 997, cierraEl: "2026-11-08" });
    expect(datos.sesiones[0]).toEqual({
      empiezaAt: "2026-11-03T23:00:00.000Z",
      zoomWebinarId: "987",
      segundoDeLaOferta: 3000,
    });
  });
});

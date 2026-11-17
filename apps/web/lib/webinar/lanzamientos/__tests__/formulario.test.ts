import { describe, expect, it } from "vitest";
import { datosDelLanzamientoSchema } from "../esquemas";
import { CAMPOS_VACIOS, camposDesdeLaVista, datosDesdeElFormulario, numeroEscrito } from "../formulario";

const BA = "America/Argentina/Buenos_Aires";

describe("SCRUM-529 · formulario del lanzamiento", () => {
  it("⭐ del formulario a la acción: precio con coma, minutos a segundos, vacíos a null, hora de la org", () => {
    const datos = datosDesdeElFormulario(
      {
        ...CAMPOS_VACIOS,
        nombre: "Webinar",
        variante: "paid",
        precioDeLaOferta: "997,50",
        captaDesde: "2026-11-20",
        sesiones: [{ empiezaAt: "2026-12-02T20:00", zoomWebinarId: " 123 ", minutoDeLaOferta: "45" }],
      },
      BA
    );
    expect(datos).toMatchObject({ precioDeLaOferta: 997.5, captaDesde: "2026-11-20", cierraEl: null });
    expect(datos.sesiones[0]).toEqual({
      empiezaAt: "2026-12-02T23:00:00.000Z",
      zoomWebinarId: "123",
      segundoDeLaOferta: 2700,
    });
    expect(datosDelLanzamientoSchema.safeParse(datos).success).toBe(true);
  });

  it("un precio que no es número no se inventa: lo rechaza el esquema, con el motivo en castellano", () => {
    const datos = datosDesdeElFormulario({ ...CAMPOS_VACIOS, nombre: "X", precioDeLaOferta: "mil" }, BA);
    const r = datosDelLanzamientoSchema.safeParse(datos);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Escribí el precio como número, por ejemplo 1.500,00");
  });

  it("ida y vuelta: los campos de un lanzamiento existente vuelven a los mismos datos", () => {
    const campos = camposDesdeLaVista(
      {
        id: "l1",
        nombre: "Webinar",
        variante: "paid_plus",
        estado: "active",
        moneda: "USD",
        precioDeLaOferta: 2.125,
        captaDesde: "2026-10-28",
        cierraEl: "2026-11-08",
        cerradoAt: null,
      },
      [{ id: "s1", empiezaAt: "2026-11-03T23:00:00.000Z", zoomWebinarId: "987", segundoDeLaOferta: 3030 }],
      BA
    );
    expect(campos.precioDeLaOferta).toBe("2,125");
    expect(campos.sesiones[0]).toMatchObject({ empiezaAt: "2026-11-03T20:00", minutoDeLaOferta: "50,5" });
    const datos = datosDesdeElFormulario(campos, BA);
    expect(datos).toMatchObject({ variante: "paid_plus", precioDeLaOferta: 2.125, cierraEl: "2026-11-08" });
    expect(datos.sesiones[0]).toEqual({
      empiezaAt: "2026-11-03T23:00:00.000Z",
      zoomWebinarId: "987",
      segundoDeLaOferta: 3030,
    });
  });

  it("⭐ revisión de #153: la hora no depende de la zona del proceso ni del navegador", () => {
    // Una sesión a las 20:00 de Buenos Aires se edita como 20:00, y guardarla
    // sin tocar nada devuelve el mismo instante (antes: 23:00 y 02:00Z).
    const sesion = { id: "s1", empiezaAt: "2026-11-03T23:00:00.000Z", zoomWebinarId: null, segundoDeLaOferta: null };
    const lanzamiento = {
      id: "l1", nombre: "W", variante: "paid" as const, estado: "active" as const, moneda: "USD",
      precioDeLaOferta: null, captaDesde: null, cierraEl: null, cerradoAt: null,
    };
    const campos = camposDesdeLaVista(lanzamiento, [sesion], BA);
    expect(campos.sesiones[0]?.empiezaAt).toBe("2026-11-03T20:00");
    expect(datosDesdeElFormulario(campos, BA).sesiones[0]?.empiezaAt).toBe(sesion.empiezaAt);
    // Sin zona elegida, la de por defecto (Buenos Aires).
    expect(camposDesdeLaVista(lanzamiento, [sesion], null).sesiones[0]?.empiezaAt).toBe("2026-11-03T20:00");
  });
});

describe("⭐ numeroEscrito (revisión de #153: precio como en Argentina)", () => {
  it.each([
    ["1.000", 1000],
    ["2.500", 2500],
    ["1.000,50", 1000.5],
    ["1.000.000", 1000000],
    ["1000,50", 1000.5],
    ["1000.50", 1000.5],
    ["997,5", 997.5],
    ["2.75", 2.75],
    ["45", 45],
    [" 1 500 ", 1500],
  ])("«%s» es %s", (texto, esperado) => {
    expect(numeroEscrito(texto)).toBe(esperado);
  });

  it("vacío es null", () => {
    expect(numeroEscrito("  ")).toBeNull();
  });

  it.each(["1,500,00", "1.5.0", "10.00,5", "mil", "1,", "12,5a"])("«%s» no se adivina: NaN", (texto) => {
    expect(numeroEscrito(texto)).toBeNaN();
  });
});

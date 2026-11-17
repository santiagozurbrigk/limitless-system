import { afterEach, describe, expect, it } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
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
    expect(campos.precioDeLaOferta).toBe("2,1250");
    expect(campos.sesiones[0]).toMatchObject({ empiezaAt: "2026-11-03T20:00", minutoDeLaOferta: "50,5" });
    const datos = datosDesdeElFormulario(campos, BA);
    expect(datos).toMatchObject({ variante: "paid_plus", precioDeLaOferta: 2.125, cierraEl: "2026-11-08" });
    expect(datos.sesiones[0]).toEqual({
      empiezaAt: "2026-11-03T23:00:00.000Z",
      zoomWebinarId: "987",
      segundoDeLaOferta: 3030,
    });
  });

  afterEach(() => restaurarZona());

  it("⭐ revisión de #153: la hora no depende de la zona del proceso ni del navegador", () => {
    // El proceso en UTC (como en CI): con el código viejo, esto fallaba.
    conZona("UTC");
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

describe("⭐ la hora de una sesión los días que cambia el horario (2.ª revisión de #153)", () => {
  const lanzamiento = {
    id: "l1", nombre: "W", variante: "paid" as const, estado: "active" as const, moneda: "USD",
    precioDeLaOferta: null, captaDesde: null, cierraEl: null, cerradoAt: null,
  };

  it.each([
    ["Europe/Madrid", "2026-10-25T00:30:00.000Z"],
    ["America/New_York", "2026-11-01T06:30:00.000Z"],
    ["America/Santiago", "2026-04-05T03:30:00.000Z"],
  ])("%s: la hora que se repite no se mueve al guardar sin tocar", (zona, iso) => {
    const campos = camposDesdeLaVista(lanzamiento, [{ id: "s1", empiezaAt: iso, zoomWebinarId: null, segundoDeLaOferta: null }], zona);
    expect(datosDesdeElFormulario(campos, zona).sesiones[0]?.empiezaAt).toBe(iso);
  });

  it.each([
    ["America/Santiago", "2026-09-06T00:30"],
    ["America/New_York", "2026-03-08T02:30"],
    ["Europe/Madrid", "2026-03-29T02:30"],
  ])("%s: una hora que no existe (%s) se rechaza, no se corre", (zona, local) => {
    const datos = datosDesdeElFormulario(
      { ...CAMPOS_VACIOS, nombre: "W", sesiones: [{ empiezaAt: local, zoomWebinarId: "", minutoDeLaOferta: "" }] },
      zona
    );
    const r = datosDelLanzamientoSchema.safeParse(datos);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Esa hora no existe ese día en la zona de la organización (cambio de horario)");
  });
});

describe("editar la hora de una sesión que ya existía (3.ª revisión de #153)", () => {
  const lanzamiento = {
    id: "l1", nombre: "W", variante: "paid" as const, estado: "active" as const, moneda: "USD",
    precioDeLaOferta: null, captaDesde: null, cierraEl: null, cerradoAt: null,
  };

  it("si se cambió el texto, se manda el instante del texto nuevo, no el original", () => {
    const campos = camposDesdeLaVista(
      lanzamiento,
      [{ id: "s1", empiezaAt: "2026-11-03T23:00:00.000Z", zoomWebinarId: null, segundoDeLaOferta: null }],
      BA
    );
    const editados = { ...campos, sesiones: [{ ...campos.sesiones[0]!, empiezaAt: "2026-11-04T21:15" }] };
    expect(datosDesdeElFormulario(editados, BA).sesiones[0]?.empiezaAt).toBe("2026-11-05T00:15:00.000Z");
  });

  it("un instante que llega como texto de Postgres se normaliza a ISO", () => {
    const campos = camposDesdeLaVista(
      lanzamiento,
      [{ id: "s1", empiezaAt: "2026-10-25 00:30:00+00", zoomWebinarId: null, segundoDeLaOferta: null }],
      "Europe/Madrid"
    );
    const datos = datosDesdeElFormulario(campos, "Europe/Madrid");
    expect(datos.sesiones[0]?.empiezaAt).toBe("2026-10-25T00:30:00.000Z");
    expect(datosDelLanzamientoSchema.safeParse({ ...datos, nombre: "W" }).success).toBe(true);
  });

  it("vacía: pide cargarla (no habla de la zona)", () => {
    const datos = datosDesdeElFormulario(
      { ...CAMPOS_VACIOS, nombre: "W", sesiones: [{ empiezaAt: "", zoomWebinarId: "", minutoDeLaOferta: "" }] },
      BA
    );
    expect(datosDelLanzamientoSchema.safeParse(datos).error?.issues[0]?.message).toBe("Cargá la fecha y hora de la sesión");
  });
});

/**
 * ⭐ La tabla de lo que alguien puede escribir en el precio o en el minuto de
 * la oferta y lo que tiene que dar (revisiones de #153, uso de es-AR):
 * un número, `null` (vacío) o `"rechazo"` (no se adivina; el esquema avisa).
 */
const CASOS_DE_NUMEROS: Array<[texto: string, esperado: number | null | "rechazo", por: string]> = [
  // Vacío
  ["", null, "vacío"],
  ["   ", null, "sólo espacios"],
  // Enteros
  ["0", 0, "cero"],
  ["45", 45, "entero"],
  ["1500", 1500, "entero sin separadores"],
  [" 1 500 ", 1500, "espacios"],
  ["-5", -5, "negativo (lo rechaza el esquema por el mínimo)"],
  // Punto de miles
  ["1.000", 1000, "miles"],
  ["2.500", 2500, "miles"],
  ["10.000", 10000, "miles, primer grupo de 2"],
  ["100.000", 100000, "miles, primer grupo de 3"],
  ["1.500.000", 1500000, "millones"],
  // Coma decimal (Argentina)
  ["997,5", 997.5, "coma decimal"],
  ["1,50", 1.5, "coma con dos decimales"],
  ["0,5", 0.5, "cero coma"],
  ["0,500", 0.5, "cero coma tres cifras"],
  ["1000,50", 1000.5, "sin punto de miles"],
  ["1250,500", 1250.5, "parte entera de 4 cifras: no es miles en inglés"],
  ["2,1250", 2.125, "lo que escribe el formulario con tres decimales"],
  ["1.000,50", 1000.5, "miles y coma"],
  ["100.000,50", 100000.5, "miles y coma"],
  // Punto decimal (inglés)
  ["2.75", 2.75, "punto decimal"],
  ["1000.50", 1000.5, "punto decimal"],
  ["1500.5", 1500.5, "punto decimal"],
  ["0.500", 0.5, "cero punto tres cifras"],
  ["0.050", 0.05, "cero punto"],
  // Ambiguos: no se adivinan
  ["1,500", "rechazo", "uno coma cinco o mil quinientos"],
  ["1,000", "rechazo", "ídem"],
  ["2,500", "rechazo", "ídem"],
  ["999,999", "rechazo", "ídem"],
  // Cero adelante de más cifras
  ["015.000", "rechazo", "¿cero de más o decimal?"],
  ["01.000", "rechazo", "ídem"],
  ["010.000", "rechazo", "ídem"],
  ["01.500", "rechazo", "ídem"],
  ["00.500", "rechazo", "ídem"],
  ["-01.500", "rechazo", "ídem, negativo"],
  ["015,000", "rechazo", "ídem, con coma"],
  ["01,500", "rechazo", "ídem, con coma"],
  ["0015,000", "rechazo", "ídem, dos ceros"],
  ["0150,000", "rechazo", "ídem"],
  ["015", "rechazo", "ídem, sin separadores"],
  ["0.500,00", "rechazo", "cero con punto de miles y coma"],
  // Mal escritos
  ["1,500,00", "rechazo", "dos comas"],
  ["1.5.0", "rechazo", "puntos mal puestos"],
  ["10.00,5", "rechazo", "punto de miles mal puesto"],
  ["1,", "rechazo", "coma sin decimales"],
  [",5", "rechazo", "coma sin parte entera"],
  ["1.", "rechazo", "punto al final"],
  [".5", "rechazo", "punto al principio"],
  ["12,5a", "rechazo", "letras"],
  ["mil", "rechazo", "palabra"],
];

describe("⭐ numeroEscrito: la tabla de casos", () => {
  it.each(CASOS_DE_NUMEROS)("«%s» → %s (%s)", (texto, esperado) => {
    const valor = numeroEscrito(texto);
    if (esperado === "rechazo") expect(valor).toBeNaN();
    else expect(valor).toBe(esperado);
  });

  it("todo lo que el formulario escribe al editar se vuelve a leer igual", () => {
    for (const n of [0, 0.5, 1.5, 2.125, 45, 997.5, 1000.5, 1500, 100000.5]) {
      const campos = camposDesdeLaVista(
        { id: "l1", nombre: "W", variante: "paid", estado: "active", moneda: "USD", precioDeLaOferta: n, captaDesde: null, cierraEl: null, cerradoAt: null },
        [],
        BA
      );
      expect(numeroEscrito(campos.precioDeLaOferta), String(n)).toBe(n);
    }
  });
});

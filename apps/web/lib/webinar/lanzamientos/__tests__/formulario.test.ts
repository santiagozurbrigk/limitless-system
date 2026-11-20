import { afterEach, describe, expect, it } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import { datosDelLanzamientoSchema } from "../esquemas";
import {
  CAMPOS_VACIOS,
  MENSAJE_DEL_MOTIVO,
  camposDesdeLaVista,
  datosDesdeElFormulario,
  leerNumeroEscrito,
  numeroEscrito,
  primerNumeroIlegible,
  type MotivoDeNumero,
} from "../formulario";

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
 * la oferta y lo que tiene que dar (revisiones de #153, uso de es-AR: punto
 * sólo para los miles y coma para los decimales): un número, `null` (vacío) o
 * el motivo por el que no se lee.
 */
const CASOS_DE_NUMEROS: Array<[texto: string, esperado: number | null | MotivoDeNumero, por: string]> = [
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
  // Coma decimal
  ["997,5", 997.5, "coma decimal"],
  ["1,50", 1.5, "coma con dos decimales"],
  ["0,5", 0.5, "cero coma"],
  ["0,500", 0.5, "cero coma tres cifras"],
  ["0,0000001", 0.0000001, "muchos decimales"],
  ["1000,50", 1000.5, "sin punto de miles"],
  ["1250,500", 1250.5, "parte entera de 4 cifras: no es miles en inglés"],
  ["2,1250", 2.125, "lo que escribe el formulario con tres decimales"],
  ["1.000,50", 1000.5, "miles y coma"],
  ["100.000,50", 100000.5, "miles y coma"],
  // Punto que no forma grupos de tres: decimales a la inglesa
  ["2.12", "punto_decimal", "punto con dos cifras"],
  ["2.75", "punto_decimal", "ídem"],
  ["1000.50", "punto_decimal", "ídem"],
  ["1500.5", "punto_decimal", "ídem"],
  ["0.500", "punto_decimal", "cero punto tres cifras"],
  ["0.050", "punto_decimal", "ídem"],
  // Ambiguos
  ["1,500", "ambiguo", "uno coma cinco o mil quinientos"],
  ["1,000", "ambiguo", "ídem"],
  ["2,500", "ambiguo", "ídem"],
  ["999,999", "ambiguo", "ídem"],
  // Cero adelante de más cifras
  ["015.000", "cero_adelante", "¿cero de más?"],
  ["01.000", "cero_adelante", "ídem"],
  ["010.000", "cero_adelante", "ídem"],
  ["01.500", "cero_adelante", "ídem"],
  ["00.500", "cero_adelante", "ídem"],
  ["-01.500", "cero_adelante", "ídem, negativo"],
  ["015,000", "cero_adelante", "ídem, con coma"],
  ["01,500", "cero_adelante", "ídem, con coma"],
  ["0015,000", "cero_adelante", "ídem, dos ceros"],
  ["0150,000", "cero_adelante", "ídem"],
  ["015", "cero_adelante", "ídem, sin separadores"],
  // Mal escritos
  ["0.500,00", "mal_escrito", "punto de miles mal puesto y coma"],
  ["1,500,00", "mal_escrito", "dos comas"],
  ["1.5.0", "mal_escrito", "puntos mal puestos"],
  ["12.34.56", "mal_escrito", "ídem"],
  ["10.00,5", "mal_escrito", "punto de miles mal puesto"],
  ["1,", "mal_escrito", "coma sin decimales"],
  [",5", "mal_escrito", "coma sin parte entera"],
  ["1.", "mal_escrito", "punto al final"],
  ["0.", "mal_escrito", "ídem"],
  [".5", "mal_escrito", "punto al principio"],
  ["-.5", "mal_escrito", "ídem, con signo"],
  ["12,5a", "mal_escrito", "letras"],
  ["mil", "mal_escrito", "palabra"],
  ["+5", "mal_escrito", "signo más"],
  ["1e3", "mal_escrito", "notación científica"],
];

describe("⭐ numeroEscrito: la tabla de casos", () => {
  it.each(CASOS_DE_NUMEROS)("«%s» → %s (%s)", (texto, esperado) => {
    const lectura = leerNumeroEscrito(texto);
    if (typeof esperado === "string") {
      expect(lectura).toEqual({ ok: false, motivo: esperado });
      expect(numeroEscrito(texto)).toBeNaN();
    } else {
      expect(lectura).toEqual({ ok: true, valor: esperado });
    }
  });

  it("⭐ cada motivo tiene su mensaje, con un ejemplo de cómo escribirlo", () => {
    expect(MENSAJE_DEL_MOTIVO.ambiguo).toMatch(/1,5 o 1\.500/);
    expect(MENSAJE_DEL_MOTIVO.cero_adelante).toMatch(/cero de adelante/);
    expect(MENSAJE_DEL_MOTIVO.punto_decimal).toMatch(/coma para los decimales/);
    expect(MENSAJE_DEL_MOTIVO.mal_escrito).toMatch(/1\.500,50/);
  });

  it("el formulario avisa el primer número ilegible, con su campo y su motivo", () => {
    expect(primerNumeroIlegible({ ...CAMPOS_VACIOS, precioDeLaOferta: "1,500" })).toEqual({
      campo: "Precio de la oferta",
      mensaje: MENSAJE_DEL_MOTIVO.ambiguo,
    });
    expect(
      primerNumeroIlegible({
        ...CAMPOS_VACIOS,
        precioDeLaOferta: "1.500",
        sesiones: [
          { empiezaAt: "", zoomWebinarId: "", minutoDeLaOferta: "45" },
          { empiezaAt: "", zoomWebinarId: "", minutoDeLaOferta: "015" },
        ],
      })
    ).toEqual({ campo: "Minuto de la oferta de la sesión 2", mensaje: MENSAJE_DEL_MOTIVO.cero_adelante });
    expect(primerNumeroIlegible({ ...CAMPOS_VACIOS, precioDeLaOferta: "1.500,50" })).toBeNull();
  });

  it("todo lo que el formulario escribe al editar se vuelve a leer igual", () => {
    for (const n of [0, 0.5, 1.5, 2.125, 45, 997.5, 1000.5, 1500, 100000.5, 1e-7, 1e21]) {
      const campos = camposDesdeLaVista(
        { id: "l1", nombre: "W", variante: "paid", estado: "active", moneda: "USD", precioDeLaOferta: n, captaDesde: null, cierraEl: null, cerradoAt: null },
        [],
        BA
      );
      expect(numeroEscrito(campos.precioDeLaOferta), String(n)).toBe(n);
    }
  });
});

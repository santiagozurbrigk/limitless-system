import { horaLocalEnZonaAInstante, instanteAHoraLocalEnZona } from "@/lib/fechas/calendario";
import type { LanzamientoResumen, SesionConfigurada } from "@/lib/webinar/vistas/contratos";
import type { DatosDelLanzamientoInput } from "./esquemas";

/**
 * El formulario de crear y editar un lanzamiento (SCRUM-529): lo que escribe la
 * persona (todo texto) y su paso a la entrada de las acciones. Lógica pura, sin
 * `server-only`: la usa el formulario (cliente) y sus tests.
 *
 * El segundo de la oferta se carga en **minutos** (es como lo dice el diseño:
 * "el minuto de la oferta") y viaja en segundos. La fecha y hora de una sesión
 * se escribe en la hora **de la organización** (`datetime-local`, la misma
 * zona con la que el Detalle muestra las sesiones) y viaja en ISO UTC. Nunca
 * se usa la zona del proceso: la pantalla de Configuración se arma en el
 * servidor y se edita en el navegador, y cada uno puede tener otra.
 *
 * Los números se escriben como en Argentina o como en inglés: "1.500,50",
 * "1500,50", "1500.50" y "1500" son lo mismo; "1.500" (punto y tres cifras, sin
 * coma) es mil quinientos. Lo ambiguo no se adivina: queda `NaN` y el esquema
 * lo rechaza con un motivo. Es ambiguo "1,500" (en Argentina, uno coma cinco;
 * en inglés, mil quinientos): una coma con exactamente tres cifras después,
 * sin puntos y con parte entera de 1 a 3 cifras que no es cero. "0,500" y
 * "1,50" no lo son. También "1.5.0", "1,500,00" y una parte entera de más de
 * una cifra que empieza con cero ("015.000", "015,000", "01,500", "015"). "0",
 * "0,5" y "0.500" sí se leen. Los casos están en una sola tabla en
 * `__tests__/formulario.test.ts` (`CASOS_DE_NUMEROS`).
 *
 * La hora de una sesión que ya existía viaja con su instante original: si el
 * texto no cambió, se manda ese instante y no el que sale de convertir el
 * texto. Así "Guardar" sin tocar nada no mueve la sesión ni en la hora que se
 * repite el día que se atrasa el reloj.
 */
export type CamposDeSesion = {
  empiezaAt: string;
  zoomWebinarId: string;
  minutoDeLaOferta: string;
  /** Sólo en una sesión que ya existía: el texto con que se abrió y su instante. */
  original?: { empiezaAt: string; iso: string };
};

export type CamposDelLanzamiento = {
  nombre: string;
  variante: string;
  moneda: string;
  precioDeLaOferta: string;
  captaDesde: string;
  cierraEl: string;
  sesiones: CamposDeSesion[];
};

export const CAMPOS_VACIOS: CamposDelLanzamiento = {
  nombre: "",
  variante: "organic",
  moneda: "USD",
  precioDeLaOferta: "",
  captaDesde: "",
  cierraEl: "",
  sesiones: [],
};

export const SESION_VACIA: CamposDeSesion = { empiezaAt: "", zoomWebinarId: "", minutoDeLaOferta: "" };

/** Puntos de miles bien puestos: el primer grupo de 1 a 3 cifras sin empezar con cero. */
const MILES = /^-?[1-9]\d{0,2}(\.\d{3})+$/;

/**
 * Un número escrito a mano; vacío es `null`; lo que no se puede leer sin
 * adivinar, `NaN` (lo rechaza el esquema con su motivo).
 */
export function numeroEscrito(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, "");
  if (limpio === "") return null;
  if (!/^-?[\d.,]+$/.test(limpio)) return Number.NaN;
  const [entero = "", decimal, ...sobra] = limpio.split(",");
  if (sobra.length > 0) return Number.NaN; // más de una coma
  // Una parte entera de más de una cifra no empieza con cero ("015.000",
  // "015,000", "01,500", "00.500"): ¿un cero de más (un precio en 0 al que se
  // le escribió atrás) o un decimal? No se adivina. "0", "0,5" y "0.500" sí.
  if (/^-?0\d/.test(entero)) return Number.NaN;

  if (decimal !== undefined) {
    // Con coma: la coma es el decimal y los puntos, separadores de miles.
    if (!/^\d+$/.test(decimal)) return Number.NaN;
    if (entero.includes(".")) {
      if (!MILES.test(entero)) return Number.NaN;
    } else if (decimal.length === 3 && /^-?[1-9]\d{0,2}$/.test(entero)) {
      // "1,500": uno coma cinco (Argentina) o mil quinientos (inglés).
      return Number.NaN;
    }
    const numero = Number(`${entero.replace(/\./g, "")}.${decimal}`);
    return entero === "" || entero === "-" ? Number.NaN : numero;
  }

  // Sin coma: punto de miles si cada grupo después del punto tiene tres cifras
  // ("1.500", "1.000.000"); con un solo punto y otra cantidad de cifras, o con
  // parte entera de más de tres cifras, decimal ("2.75", "1500.5").
  if (MILES.test(entero)) return Number(entero.replace(/\./g, ""));
  const puntos = (entero.match(/\./g) ?? []).length;
  if (puntos > 1 || entero.startsWith(".") || entero.endsWith(".")) return Number.NaN;
  return Number(entero);
}

/**
 * Un número guardado como se escribe en el formulario: coma decimal y sin
 * puntos, para que `numeroEscrito` lo lea igual ("2,125" y no "2.125", que
 * sería dos mil ciento veinticinco). Con exactamente tres decimales se suma un
 * cero ("2,1250"): "2,125" sería ambiguo y se rechazaría.
 */
function comoSeEscribe(n: number): string {
  const texto = String(n).replace(".", ",");
  return /,\d{3}$/.test(texto) ? `${texto}0` : texto;
}

/** Hora de la organización a ISO UTC; vacía o inválida queda como vino para que la rechace el esquema. */
function instanteISO(local: string, zona: string | null): string {
  return horaLocalEnZonaAInstante(local, zona) ?? local;
}

/**
 * El instante en ISO con "T" y "Z", como lo pide el esquema, aunque la base lo
 * devuelva como texto de Postgres ("2026-10-25 00:30:00+00"). Si no se entiende,
 * queda como vino (y el esquema lo rechaza).
 */
function comoISO(valor: string): string {
  const d = new Date(valor.includes("T") ? valor : valor.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return Number.isNaN(d.getTime()) ? valor : d.toISOString();
}

/** ISO UTC a `datetime-local` en la hora de la organización. */
export function aDatetimeLocal(iso: string, zona: string | null): string {
  return instanteAHoraLocalEnZona(iso, zona);
}

/** `zona`: la de la organización (`null` = la de por defecto). */
export function datosDesdeElFormulario(c: CamposDelLanzamiento, zona: string | null): DatosDelLanzamientoInput {
  return {
    nombre: c.nombre,
    variante: c.variante as DatosDelLanzamientoInput["variante"],
    moneda: c.moneda,
    precioDeLaOferta: numeroEscrito(c.precioDeLaOferta),
    captaDesde: c.captaDesde.trim() || null,
    cierraEl: c.cierraEl.trim() || null,
    sesiones: c.sesiones.map((s) => {
      const minuto = numeroEscrito(s.minutoDeLaOferta);
      return {
        empiezaAt:
          s.original && s.empiezaAt === s.original.empiezaAt ? s.original.iso : instanteISO(s.empiezaAt, zona),
        zoomWebinarId: s.zoomWebinarId.trim() || null,
        segundoDeLaOferta: minuto === null ? null : Math.round(minuto * 60),
      };
    }),
  };
}

/** Los campos de un lanzamiento que ya existe, para editarlo, con las horas en la zona de la organización. */
export function camposDesdeLaVista(
  lanzamiento: LanzamientoResumen,
  sesiones: readonly SesionConfigurada[],
  zona: string | null
): CamposDelLanzamiento {
  return {
    nombre: lanzamiento.nombre,
    variante: lanzamiento.variante,
    moneda: lanzamiento.moneda,
    precioDeLaOferta: lanzamiento.precioDeLaOferta === null ? "" : comoSeEscribe(lanzamiento.precioDeLaOferta),
    captaDesde: lanzamiento.captaDesde ?? "",
    cierraEl: lanzamiento.cierraEl ?? "",
    sesiones: sesiones.map((s) => ({
      empiezaAt: aDatetimeLocal(s.empiezaAt, zona),
      original: { empiezaAt: aDatetimeLocal(s.empiezaAt, zona), iso: comoISO(s.empiezaAt) },
      zoomWebinarId: s.zoomWebinarId ?? "",
      minutoDeLaOferta: s.segundoDeLaOferta === null ? "" : comoSeEscribe(Math.round((s.segundoDeLaOferta / 60) * 100) / 100),
    })),
  };
}

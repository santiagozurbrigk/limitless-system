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
 * Los números se escriben como en Argentina: punto para los miles y coma
 * para los decimales (`leerNumeroEscrito`). Lo que no se puede leer sin
 * adivinar no se lee: el formulario avisa el motivo antes de llamar a la
 * acción (`primerNumeroIlegible`) y el esquema lo rechaza igual.
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

/** Por qué no se pudo leer un número escrito a mano. */
export type MotivoDeNumero = "ambiguo" | "cero_adelante" | "punto_decimal" | "mal_escrito";

/**
 * Qué se le dice a la persona en cada caso, con el ejemplo de cómo escribirlo
 * (6.ª revisión de #153: el motivo, no un "escribí un número" para todo).
 */
export const MENSAJE_DEL_MOTIVO: Record<MotivoDeNumero, string> = {
  ambiguo: "¿1,5 o 1.500? Es ambiguo: escribí 1.500 si son miles o 1,5 si son decimales.",
  cero_adelante: "Sacá el cero de adelante: por ejemplo, 15.000 en vez de 015.000.",
  punto_decimal: "Usá coma para los decimales (2,75); el punto es sólo para los miles (1.500).",
  mal_escrito: "Escribí el número con punto para los miles y coma para los decimales, por ejemplo 1.500,50.",
};

export type LecturaDeNumero = { ok: true; valor: number | null } | { ok: false; motivo: MotivoDeNumero };

/**
 * ⭐ Un número escrito a mano, como se escribe en Argentina: punto **sólo**
 * para los miles (en grupos de tres) y coma para los decimales. Vacío es
 * `null`. Lo que no se puede leer sin adivinar no se lee y dice por qué:
 *   - `ambiguo`: "1,500" (¿uno coma cinco o mil quinientos?);
 *   - `cero_adelante`: "015.000", "015,000", "015" (¿un cero de más?);
 *   - `punto_decimal`: un punto que no forma grupos de tres, como "2.75",
 *     "2.12" o "0.500" (decimales a la inglesa);
 *   - `mal_escrito`: dos comas, puntos mal puestos, un separador en el borde
 *     (".5", ",5", "1500.", "-.5") o letras.
 * Los casos están en una sola tabla en `__tests__/formulario.test.ts`
 * (`CASOS_DE_NUMEROS`).
 */
export function leerNumeroEscrito(texto: string): LecturaDeNumero {
  const limpio = texto.trim().replace(/\s/g, "");
  if (limpio === "") return { ok: true, valor: null };
  const mal: LecturaDeNumero = { ok: false, motivo: "mal_escrito" };
  if (!/^-?[\d.,]+$/.test(limpio)) return mal;
  const [entero = "", decimal, ...sobra] = limpio.split(",");
  if (sobra.length > 0) return mal; // más de una coma
  if (entero === "" || entero === "-" || /^-?\./.test(entero) || entero.endsWith(".")) return mal;
  if (/^-?0\d/.test(entero)) return { ok: false, motivo: "cero_adelante" };

  if (decimal !== undefined) {
    if (!/^\d+$/.test(decimal)) return mal;
    if (entero.includes(".")) {
      if (!MILES.test(entero)) return mal;
    } else if (decimal.length === 3 && /^-?[1-9]\d{0,2}$/.test(entero)) {
      return { ok: false, motivo: "ambiguo" };
    }
    return { ok: true, valor: Number(`${entero.replace(/\./g, "")}.${decimal}`) };
  }

  if (!entero.includes(".")) return { ok: true, valor: Number(entero) };
  if (MILES.test(entero)) return { ok: true, valor: Number(entero.replace(/\./g, "")) };
  const puntos = (entero.match(/\./g) ?? []).length;
  return puntos === 1 ? { ok: false, motivo: "punto_decimal" } : mal;
}

/** Lo mismo como número: lo que no se lee es `NaN`, que el esquema rechaza. */
export function numeroEscrito(texto: string): number | null {
  const lectura = leerNumeroEscrito(texto);
  return lectura.ok ? lectura.valor : Number.NaN;
}

/**
 * El primer número del formulario que no se puede leer, con el campo y el
 * motivo, para avisarlo antes de llamar a la acción. `null` si todos se leen.
 */
export function primerNumeroIlegible(c: CamposDelLanzamiento): { campo: string; mensaje: string } | null {
  const precio = leerNumeroEscrito(c.precioDeLaOferta);
  if (!precio.ok) return { campo: "Precio de la oferta", mensaje: MENSAJE_DEL_MOTIVO[precio.motivo] };
  for (const [i, s] of c.sesiones.entries()) {
    const minuto = leerNumeroEscrito(s.minutoDeLaOferta);
    if (!minuto.ok) {
      return { campo: `Minuto de la oferta de la sesión ${i + 1}`, mensaje: MENSAJE_DEL_MOTIVO[minuto.motivo] };
    }
  }
  return null;
}

/**
 * Un número guardado como se escribe en el formulario: coma decimal, sin
 * puntos y sin notación científica (1e-7 se escribe "0,0000001"), para que
 * `leerNumeroEscrito` lo lea igual. Con exactamente tres decimales se suma un
 * cero ("2,1250"): "2,125" sería ambiguo y se rechazaría.
 */
function comoSeEscribe(n: number): string {
  const texto = n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 }).replace(".", ",");
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

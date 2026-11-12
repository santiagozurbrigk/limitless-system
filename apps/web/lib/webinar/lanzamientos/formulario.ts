import type { LanzamientoResumen, SesionConfigurada } from "@/lib/webinar/vistas/contratos";
import type { DatosDelLanzamientoInput } from "./esquemas";

/**
 * El formulario de crear y editar un lanzamiento (SCRUM-529): lo que escribe la
 * persona (todo texto) y su paso a la entrada de las acciones. Lógica pura, sin
 * `server-only`: la usa el formulario (cliente) y sus tests.
 *
 * El segundo de la oferta se carga en **minutos** (es como lo dice el diseño:
 * "el minuto de la oferta") y viaja en segundos. La fecha y hora de una sesión
 * se escribe en la hora del navegador (`datetime-local`) y viaja en ISO UTC.
 */
export type CamposDeSesion = { empiezaAt: string; zoomWebinarId: string; minutoDeLaOferta: string };

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

/** Un número escrito con coma o punto decimal; vacío es `null`; lo que no es número, `NaN` (lo rechaza el esquema). */
function numeroONulo(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "") return null;
  return Number(limpio);
}

/** `datetime-local` (hora del navegador) a ISO UTC; vacío o inválido queda como vino para que lo rechace el esquema. */
function instanteISO(local: string): string {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? local : d.toISOString();
}

/** ISO UTC a `datetime-local` en la hora del navegador. */
export function aDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

export function datosDesdeElFormulario(c: CamposDelLanzamiento): DatosDelLanzamientoInput {
  return {
    nombre: c.nombre,
    variante: c.variante as DatosDelLanzamientoInput["variante"],
    moneda: c.moneda,
    precioDeLaOferta: numeroONulo(c.precioDeLaOferta),
    captaDesde: c.captaDesde.trim() || null,
    cierraEl: c.cierraEl.trim() || null,
    sesiones: c.sesiones.map((s) => {
      const minuto = numeroONulo(s.minutoDeLaOferta);
      return {
        empiezaAt: instanteISO(s.empiezaAt),
        zoomWebinarId: s.zoomWebinarId.trim() || null,
        segundoDeLaOferta: minuto === null ? null : Math.round(minuto * 60),
      };
    }),
  };
}

/** Los campos de un lanzamiento que ya existe, para editarlo. */
export function camposDesdeLaVista(
  lanzamiento: LanzamientoResumen,
  sesiones: readonly SesionConfigurada[]
): CamposDelLanzamiento {
  return {
    nombre: lanzamiento.nombre,
    variante: lanzamiento.variante,
    moneda: lanzamiento.moneda,
    precioDeLaOferta: lanzamiento.precioDeLaOferta === null ? "" : String(lanzamiento.precioDeLaOferta),
    captaDesde: lanzamiento.captaDesde ?? "",
    cierraEl: lanzamiento.cierraEl ?? "",
    sesiones: sesiones.map((s) => ({
      empiezaAt: aDatetimeLocal(s.empiezaAt),
      zoomWebinarId: s.zoomWebinarId ?? "",
      minutoDeLaOferta: s.segundoDeLaOferta === null ? "" : String(Math.round((s.segundoDeLaOferta / 60) * 100) / 100),
    })),
  };
}

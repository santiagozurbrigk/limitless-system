import type {
  EstadoDeFuente,
  InicioDelLanzamientoActivo,
  VarianteDelLanzamiento,
} from "@/lib/webinar/vistas/contratos";
import { ETIQUETA_DE_FUENTE } from "@/lib/webinar/vistas/dato";

/**
 * ⭐ Inicio de Limitless Webinars (SCRUM-543): textos y reglas de la pantalla.
 * Lógica pura sobre el contrato `VistaInicio` (SCRUM-542): no lee la base ni
 * calcula números nuevos, sólo decide cómo se dicen. Sin `server-only`.
 */

export const ETIQUETA_DE_VARIANTE: Record<VarianteDelLanzamiento, string> = {
  organic: "Orgánico",
  paid: "Pago",
  paid_plus: "Pago con VIP",
};

/** La cuenta regresiva al cierre, en días calendario de la zona de la org. */
export function textoDelCierre(dias: number | null): string {
  if (dias === null) return "Sin fecha de cierre";
  if (dias < 0) return "La fecha de cierre ya pasó";
  if (dias === 0) return "Cierra hoy";
  if (dias === 1) return "Cierra mañana";
  return `Cierra en ${dias} días`;
}

const NUMERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export function formatearCantidad(valor: number): string {
  return NUMERO.format(valor);
}

/**
 * Un monto en la moneda del lanzamiento, sin convertir. Una moneda que `Intl`
 * no conoce se muestra con su código delante, en vez de fallar.
 */
export function formatearMonto(valor: number, moneda: string): string {
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: moneda,
      maximumFractionDigits: 0,
    }).format(valor);
  } catch {
    return `${moneda} ${NUMERO.format(valor)}`;
  }
}

/** Una tasa entre 0 y 1 como porcentaje; `null` (no se puede calcular) es "—". */
export function formatearTasa(valor: number | null): string {
  if (valor === null) return "—";
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(valor * 100)} %`;
}

/** Un cociente sin unidad (el ROAS): "3,2x"; `null` es "—". */
export function formatearVeces(valor: number | null): string {
  if (valor === null) return "—";
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(valor)}x`;
}

export type AvisoDeRegistros = {
  titulo: string;
  detalle: string;
};

/**
 * El aviso de "registros que dejan de llegar". Aparece cuando:
 *   1. la fuente de la landing no está al día (sin conectar, con error o
 *      desactualizada): se muestra su motivo, que es el que explica qué pasa;
 *   2. la landing está al día pero en las últimas 24 h no entró ningún registro
 *      y el lanzamiento sigue captando (activo y su cierre no pasó).
 * Si el número de las últimas 24 h no se pudo medir por otra razón, no se
 * avisa nada: ese número ya muestra su propio estado. Nunca se avisa por un
 * cero que no se midió.
 */
export function avisoDeRegistros(activo: InicioDelLanzamientoActivo): AvisoDeRegistros | null {
  const landing = activo.fuentes.find((f) => f.fuente === "landing");
  if (landing && landing.state !== "medido") {
    return {
      titulo: "Los registros pueden no estar llegando",
      detalle:
        landing.reason ??
        `${ETIQUETA_DE_FUENTE.landing}: la última lectura no está al día.`,
    };
  }

  const recientes = activo.registradosUltimas24h;
  const sigueCaptando =
    activo.lanzamiento.estado === "active" &&
    (activo.diasParaElCierre === null || activo.diasParaElCierre >= 0);
  if (recientes.state === "medido" && recientes.value === 0 && sigueCaptando) {
    return {
      titulo: "No entró ningún registro en las últimas 24 horas",
      detalle:
        "El lanzamiento sigue captando. Revisá que la landing esté publicada y que el formulario siga enviando a Limitless.",
    };
  }
  return null;
}

/** Las fuentes que no están al día primero (error, sin fuente, falta configurar, desactualizada), después las medidas. */
const PRIORIDAD_DE_FUENTE: Record<EstadoDeFuente["state"], number> = {
  error: 0,
  sin_fuente: 1,
  falta_configurar: 2,
  desactualizado: 3,
  medido: 4,
};

export function fuentesOrdenadas(fuentes: readonly EstadoDeFuente[]): EstadoDeFuente[] {
  return [...fuentes].sort((a, b) => PRIORIDAD_DE_FUENTE[a.state] - PRIORIDAD_DE_FUENTE[b.state]);
}

/** Cuántas fuentes no están al día. */
export function fuentesConProblemas(fuentes: readonly EstadoDeFuente[]): number {
  return fuentes.filter((f) => f.state !== "medido").length;
}


import { sinFuente } from "./dato";
import {
  ETIQUETA_DEL_FILTRO,
  FILTROS_DE_LEADS,
  type FiltroDeLeads,
  type ParametrosDeLeads,
  type VistaInicio,
  type VistaLeads,
  type VistaListaDeLanzamientos,
} from "./contratos";

/**
 * Lo que ve una organización que no es la de demo mientras las funciones de
 * lectura no lean la base (hasta B4; las tablas de SCRUM-526 todavía no
 * existen en producción).
 *
 * Nunca datos inventados ni un "no tenés lanzamientos": no se leyó nada, así
 * que todo número y toda lista es `sin_fuente` con este motivo, y las
 * pantallas de un lanzamiento o de un lead responden "no encontrado"
 * (`{ ok: true, data: null }`).
 */
export const MOTIVO_SIN_LECTURA_REAL =
  "Todavía no podemos mostrar los lanzamientos de tu organización: esta pantalla se está construyendo.";

const sinLectura = () => sinFuente("configuracion", MOTIVO_SIN_LECTURA_REAL);

export function inicioSinLecturaReal(): VistaInicio {
  return { esEjemplo: false, activo: sinLectura() };
}

export function listaSinLecturaReal(): VistaListaDeLanzamientos {
  return { esEjemplo: false, lanzamientos: sinLectura() };
}

export function leadsSinLecturaReal(parametros: ParametrosDeLeads): VistaLeads {
  const filtro: FiltroDeLeads =
    parametros.filtro && (FILTROS_DE_LEADS as readonly string[]).includes(parametros.filtro)
      ? parametros.filtro
      : "todos";
  return {
    esEjemplo: false,
    lanzamientos: sinLectura(),
    lanzamientoElegido: null,
    filtroElegido: filtro,
    busqueda: (parametros.busqueda ?? "").trim(),
    filtros: FILTROS_DE_LEADS.map((f) => ({
      filtro: f,
      etiqueta: ETIQUETA_DEL_FILTRO[f],
      personas: sinLectura(),
    })),
    total: sinLectura(),
    filas: sinLectura(),
    siguienteCursor: null,
  };
}

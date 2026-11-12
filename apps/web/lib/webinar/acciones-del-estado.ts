import { ETIQUETA_DE_FUENTE, type Dato, type EstadoDelDato, type FuenteDelDato } from "@/lib/webinar/vistas/dato";
import { paths } from "@/routes/paths";

/**
 * ⭐ Qué puede hacer el usuario con un número que no llegó medido (SCRUM-544;
 * diseño del producto, sección 11): cada estado tiene su texto y su botón.
 *
 *   - sin fuente: "Conectá <fuente>" → Integraciones;
 *   - falta configurar: "Completá la configuración" → Configuración del
 *     lanzamiento;
 *   - desactualizado: "Ver <fuente>" → Integraciones;
 *   - error: "Reconectá <fuente>" → Integraciones.
 *
 * Lo que carga el equipo (`manual`), un número calculado (`calculado`) o la
 * configuración no se "conecta": su falta siempre se resuelve en la
 * configuración del lanzamiento.
 *
 * Los destinos viven en `DESTINOS_DE_LAS_ACCIONES`. Mientras la pantalla de
 * destino no exista para Limitless Webinars, el destino es `null` y el botón
 * no se dibuja como enlace (sin enlaces muertos, como DT-22 de SCRUM-545): la
 * pantalla muestra el texto de la acción igual
 * (`[WEBINAR-ACCIONES-SIN-DESTINO]`). Lógica pura, sin `server-only`.
 */

export type DestinoDeLaAccion = "integraciones" | "configuracion";

export type AccionDelEstado = {
  texto: string;
  destino: DestinoDeLaAccion;
  /** `null` mientras la pantalla de destino no existe para Webinars. */
  href: string | null;
};

/**
 * Integraciones no está en el menú webinar (PO, 28-oct) y la pantalla de
 * hoy lista todas las integraciones del producto completo: sin destino hasta
 * que se decida. Configuración del lanzamiento existe desde SCRUM-529.
 */
export const DESTINOS_DE_LAS_ACCIONES: Record<DestinoDeLaAccion, ((launchId: string) => string) | null> = {
  integraciones: null,
  // SCRUM-529: la Configuración del lanzamiento.
  configuracion: paths.platform.lanzamientosConfiguracion,
};

const FUENTES_QUE_NO_SE_CONECTAN: readonly FuenteDelDato[] = ["manual", "calculado", "configuracion"];

export function accionDelEstado(
  estado: Exclude<EstadoDelDato, "medido">,
  fuente: FuenteDelDato,
  launchId: string
): AccionDelEstado {
  const nombre = ETIQUETA_DE_FUENTE[fuente];
  const seConecta = !FUENTES_QUE_NO_SE_CONECTAN.includes(fuente);
  const [texto, destino]: [string, DestinoDeLaAccion] =
    estado === "falta_configurar" || !seConecta
      ? ["Completá la configuración del lanzamiento", "configuracion"]
      : estado === "sin_fuente"
        ? [`Conectá ${nombre}`, "integraciones"]
        : estado === "desactualizado"
          ? [`Ver ${nombre}`, "integraciones"]
          : [`Reconectá ${nombre}`, "integraciones"];
  const ruta = DESTINOS_DE_LAS_ACCIONES[destino];
  return { texto, destino, href: ruta ? ruta(launchId) : null };
}

/** La acción de un dato, o `null` si está medido. */
export function accionDelDato(dato: Dato<unknown>, launchId: string): AccionDelEstado | null {
  if (dato.state === "medido") return null;
  return accionDelEstado(dato.state, dato.source, launchId);
}

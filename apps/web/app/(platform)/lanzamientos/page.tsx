import { PantallaDeLanzamientos } from "@/components/webinar/pantalla-de-lanzamientos";
import { leerListaDeLanzamientos } from "@/lib/webinar/vistas/leer";

/**
 * Lista de lanzamientos de Limitless Webinars (SCRUM-544). Reemplaza el
 * "Próximamente" del módulo viejo (`[LANZAMIENTOS-DORMIDO]`), como pide el
 * documento técnico (sección 7). Dibuja sólo lo que devuelve
 * `leerListaDeLanzamientos` (SCRUM-542).
 */
export default async function LanzamientosPage() {
  const vista = await leerListaDeLanzamientos();
  return <PantallaDeLanzamientos vista={vista} />;
}

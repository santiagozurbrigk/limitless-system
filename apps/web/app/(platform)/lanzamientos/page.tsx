import { PantallaDeLanzamientos } from "@/components/webinar/pantalla-de-lanzamientos";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";
import { leerListaDeLanzamientos } from "@/lib/webinar/vistas/leer";

/**
 * Lista de lanzamientos de Limitless Webinars (SCRUM-544). Reemplaza el
 * "Próximamente" del módulo viejo (`[LANZAMIENTOS-DORMIDO]`), como pide el
 * documento técnico (sección 7). Dibuja sólo lo que devuelve
 * `leerListaDeLanzamientos` (SCRUM-542). Permiso del módulo `funnels`
 * antes de leer (SCRUM-540).
 */
export default async function LanzamientosPage() {
  const sinAcceso = await exigirModuloDeLaPagina("funnels");
  if (sinAcceso) return sinAcceso;

  const vista = await leerListaDeLanzamientos();
  return <PantallaDeLanzamientos vista={vista} />;
}

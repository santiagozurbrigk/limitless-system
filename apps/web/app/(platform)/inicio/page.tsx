import { PantallaDeInicio } from "@/components/webinar/pantalla-de-inicio";
import { leerInicio } from "@/lib/webinar/vistas/leer";

/**
 * Inicio de Limitless Webinars (SCRUM-543): el lanzamiento activo. La pantalla
 * dibuja sólo lo que devuelve `leerInicio` (SCRUM-542).
 */
export default async function InicioPage() {
  const vista = await leerInicio();
  return <PantallaDeInicio vista={vista} />;
}

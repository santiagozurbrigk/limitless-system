import { PantallaDeInicio } from "@/components/webinar/pantalla-de-inicio";
import { moduloBloqueadoParaRuta } from "@/lib/auth/acceso-a-modulo";
import { getCurrentUserPermissions } from "@/lib/auth/get-current-permissions";
import { leerInicio } from "@/lib/webinar/vistas/leer";
import { paths } from "@/routes/paths";

/**
 * Inicio de Limitless Webinars (SCRUM-543): el lanzamiento activo. La pantalla
 * dibuja sólo lo que devuelve `leerInicio` (SCRUM-542). «Ver leads» se enlaza
 * sólo si quien mira puede abrir Leads (el mismo chequeo que el layout).
 */
export default async function InicioPage() {
  const [vista, permisos] = await Promise.all([leerInicio(), getCurrentUserPermissions()]);
  const puedeVerLeads = moduloBloqueadoParaRuta(paths.platform.webinars.leads, permisos) === null;
  return <PantallaDeInicio vista={vista} puedeVerLeads={puedeVerLeads} />;
}

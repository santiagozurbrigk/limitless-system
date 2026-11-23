import { PantallaDeInicio } from "@/components/webinar/pantalla-de-inicio";
import { exigirModuloDeLaPagina, moduloBloqueadoParaRuta } from "@/lib/auth/acceso-a-modulo";
import { getCurrentUserPermissions } from "@/lib/auth/get-current-permissions";
import { lecturaDegradable } from "@/lib/server/lectura-degradable";
import { leerInicio } from "@/lib/webinar/vistas/leer";
import { paths } from "@/routes/paths";

/**
 * Inicio de Limitless Webinars (SCRUM-543): el lanzamiento activo. La pantalla
 * dibuja sólo lo que devuelve `leerInicio` (SCRUM-542). «Ver leads» se enlaza
 * sólo si quien mira puede abrir Leads (el mismo chequeo que el layout). Si
 * los permisos no se pueden leer, Inicio se muestra igual, sin el enlace: es
 * un adorno, no el acceso (Leads lo protege su layout). Antes de leer, el
 * permiso del módulo `dashboard` (SCRUM-540).
 */
export default async function InicioPage() {
  const sinAcceso = await exigirModuloDeLaPagina("dashboard");
  if (sinAcceso) return sinAcceso;

  const [vista, permisos] = await Promise.all([
    leerInicio(),
    lecturaDegradable("inicio:permisos", getCurrentUserPermissions, null),
  ]);
  const puedeVerLeads =
    permisos !== null && moduloBloqueadoParaRuta(paths.platform.webinars.leads, permisos) === null;
  return <PantallaDeInicio vista={vista} puedeVerLeads={puedeVerLeads} />;
}

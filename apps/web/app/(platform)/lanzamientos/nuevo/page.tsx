import { FormularioDelLanzamiento } from "@/components/webinar/formulario-del-lanzamiento";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

/**
 * Crear un lanzamiento de Limitless Webinars (SCRUM-529). Hoy el guardado es de
 * ejemplo (`[WEBINAR-LANZAMIENTOS-PERSISTIR]`): la pantalla lo avisa. Permiso
 * del módulo `funnels` antes de dibujar (SCRUM-540).
 */
export default async function NuevoLanzamientoPage() {
  const sinAcceso = await exigirModuloDeLaPagina("funnels");
  if (sinAcceso) return sinAcceso;

  return <FormularioDelLanzamiento modo="crear" />;
}

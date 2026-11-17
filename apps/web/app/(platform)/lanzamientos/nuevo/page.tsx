import { FormularioDelLanzamiento } from "@/components/webinar/formulario-del-lanzamiento";

/**
 * Crear un lanzamiento de Limitless Webinars (SCRUM-529). Hoy el guardado es de
 * ejemplo (`[WEBINAR-LANZAMIENTOS-PERSISTIR]`): la pantalla lo avisa.
 */
export default function NuevoLanzamientoPage() {
  return <FormularioDelLanzamiento modo="crear" />;
}

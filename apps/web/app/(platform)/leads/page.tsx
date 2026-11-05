import { PantallaDeLeads } from "@/components/webinar/pantalla-de-leads";
import { parametrosDesdeUrl, type ParametrosDeLaUrl } from "@/lib/webinar/leads/url";
import { leerLeads } from "@/lib/webinar/vistas/leer";

/**
 * Leads de Limitless Webinars (SCRUM-545). Filtro, búsqueda, lanzamiento y
 * cursor llegan de la URL (`/leads?filtro=<id>` abre con el filtro aplicado);
 * la pantalla dibuja sólo lo que devuelve `leerLeads`.
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<ParametrosDeLaUrl>;
}) {
  const parametros = parametrosDesdeUrl(await searchParams);
  const vista = await leerLeads(parametros);
  return <PantallaDeLeads vista={vista} cursor={parametros.cursor ?? null} />;
}

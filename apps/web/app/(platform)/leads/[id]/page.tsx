import { notFound } from "next/navigation";
import { ErrorDeCarga } from "@/components/webinar/aviso-de-estado";
import { FichaDelLead } from "@/components/webinar/ficha-del-lead";
import { lanzamientoDesdeUrl, type ParametrosDeLaUrl } from "@/lib/webinar/leads/url";
import { leerFichaDelLead } from "@/lib/webinar/vistas/leer";

/**
 * Ficha del lead de Limitless Webinars (SCRUM-545). `?lanzamiento=` elige el
 * lanzamiento del estado de venta. Si no se pudo leer, el motivo; si no existe
 * (o es de otra organización), el 404 de la app (AC-8).
 */
export default async function FichaDelLeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ParametrosDeLaUrl>;
}) {
  const { id } = await params;
  const lectura = await leerFichaDelLead(id, lanzamientoDesdeUrl(await searchParams));
  if (!lectura.ok) return <ErrorDeCarga motivo={lectura.motivo} />;
  if (!lectura.data) notFound();
  return <FichaDelLead vista={lectura.data} />;
}

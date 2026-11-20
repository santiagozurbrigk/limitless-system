import { notFound } from "next/navigation";
import { ErrorDeCarga } from "@/components/webinar/aviso-de-estado";
import { PantallaDeDetalleDelLanzamiento } from "@/components/webinar/pantalla-de-detalle-del-lanzamiento";
import { leerDetalleDelLanzamiento } from "@/lib/webinar/vistas/leer";

/**
 * Detalle del lanzamiento de Limitless Webinars (SCRUM-544). Si no se pudo
 * leer, el motivo; si no existe (o es de otra organización), el 404 de la app.
 */
export default async function DetalleDelLanzamientoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lectura = await leerDetalleDelLanzamiento(id);
  if (!lectura.ok) return <ErrorDeCarga motivo={lectura.motivo} titulo="No pudimos cargar este lanzamiento." />;
  if (!lectura.data) notFound();
  return <PantallaDeDetalleDelLanzamiento vista={lectura.data} />;
}

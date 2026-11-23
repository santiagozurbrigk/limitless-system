import { notFound } from "next/navigation";
import { ErrorDeCarga } from "@/components/webinar/aviso-de-estado";
import { PantallaDeDetalleDelLanzamiento } from "@/components/webinar/pantalla-de-detalle-del-lanzamiento";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";
import { leerDetalleDelLanzamiento } from "@/lib/webinar/vistas/leer";

/**
 * Detalle del lanzamiento de Limitless Webinars (SCRUM-544). Permiso del
 * módulo `funnels` antes de leer (SCRUM-540). Si no se pudo leer, el motivo;
 * si no existe (o es de otra organización), el 404 de la app.
 */
export default async function DetalleDelLanzamientoPage({ params }: { params: Promise<{ id: string }> }) {
  const sinAcceso = await exigirModuloDeLaPagina("funnels");
  if (sinAcceso) return sinAcceso;

  const { id } = await params;
  const lectura = await leerDetalleDelLanzamiento(id);
  if (!lectura.ok) return <ErrorDeCarga motivo={lectura.motivo} titulo="No pudimos cargar este lanzamiento." />;
  if (!lectura.data) notFound();
  return <PantallaDeDetalleDelLanzamiento vista={lectura.data} />;
}

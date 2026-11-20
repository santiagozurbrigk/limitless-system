import { notFound } from "next/navigation";
import { ErrorDeCarga } from "@/components/webinar/aviso-de-estado";
import { PantallaDeConfiguracion } from "@/components/webinar/pantalla-de-configuracion";
import { leerConfiguracionDelLanzamiento } from "@/lib/webinar/vistas/leer";

/**
 * Configuración de un lanzamiento (SCRUM-529). Si no se pudo leer, el motivo;
 * si no existe (o es de otra organización), el 404 de la app.
 */
export default async function ConfiguracionDelLanzamientoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lectura = await leerConfiguracionDelLanzamiento(id);
  if (!lectura.ok) return <ErrorDeCarga motivo={lectura.motivo} titulo="No pudimos cargar la configuración." />;
  if (!lectura.data) notFound();
  return <PantallaDeConfiguracion vista={lectura.data} />;
}

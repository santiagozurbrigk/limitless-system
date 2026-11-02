import { notFound } from "next/navigation";
import { ESCONDIDO } from "@/lib/release/escondido";
import { exigirRutaDeLaExperiencia } from "@/lib/organization/ruta-de-la-experiencia";

/**
 * Pantalla interna o maqueta: cerrada para el release (SCRUM-490). Antes, el
 * bloqueo por experiencia de la organización (SCRUM-524).
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirRutaDeLaExperiencia("/redesign-preview");
  if (ESCONDIDO.pantallasInternas) notFound();
  return children;
}

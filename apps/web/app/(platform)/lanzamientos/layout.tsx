import { redirect } from "next/navigation";
import { ESCONDIDO } from "@/lib/release/escondido";
import { exigirRutaDeLaExperiencia } from "@/lib/organization/ruta-de-la-experiencia";
import { paths } from "@/routes";

/**
 * Primero el bloqueo por experiencia (SCRUM-524): una organización webinar va
 * a su pantalla de inicio mientras Lanzamientos no esté lista en su menú.
 * Después, "Próximamente" y sin lanzamientos cargados: lleva al Panel
 * (SCRUM-490), para todas las organizaciones.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirRutaDeLaExperiencia("/lanzamientos");
  if (ESCONDIDO.lanzamientos) redirect(paths.platform.dashboard);
  return children;
}

import { redirect } from "next/navigation";
import { ESCONDIDO } from "@/lib/release/escondido";
import { exigirRutaDeLaExperiencia } from "@/lib/organization/ruta-de-la-experiencia";
import { paths } from "@/routes";

/**
 * Primero el bloqueo por experiencia (SCRUM-524): una organización `limitless`
 * va a su pantalla de inicio. Después la bandera de release: desde SCRUM-544
 * la bandera `lanzamientos` de `ESCONDIDO` está en `false`: las pantallas son las de
 * Limitless Webinars; volver a ponerla en `true` lleva a todos al Panel
 * (SCRUM-490), y un test impide hacerlo con Lanzamientos lista en el menú
 * webinar (bucle de redirecciones).
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirRutaDeLaExperiencia("/lanzamientos");
  if (ESCONDIDO.lanzamientos) redirect(paths.platform.dashboard);
  return children;
}

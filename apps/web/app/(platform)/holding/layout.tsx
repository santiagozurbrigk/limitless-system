import { exigirRutaDeLaExperiencia } from "@/lib/organization/ruta-de-la-experiencia";

/** Bloqueo por experiencia de la organización (SCRUM-524). */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirRutaDeLaExperiencia("/holding");
  return children;
}

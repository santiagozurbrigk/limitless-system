import { exigirRutaDeLaExperiencia } from "@/lib/organization/ruta-de-la-experiencia";

/** Bloqueo por experiencia de la organización (SCRUM-524, SCRUM-543). */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirRutaDeLaExperiencia("/inicio");
  return children;
}

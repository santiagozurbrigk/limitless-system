import { redirect } from "next/navigation";
import { ESCONDIDO } from "@/lib/release/escondido";
import { paths } from "@/routes";

/** "Próximamente" y sin lanzamientos cargados: lleva al Panel (SCRUM-490). */
export default function Layout({ children }: { children: React.ReactNode }) {
  if (ESCONDIDO.lanzamientos) redirect(paths.platform.dashboard);
  return children;
}

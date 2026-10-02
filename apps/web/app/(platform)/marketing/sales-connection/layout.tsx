import { redirect } from "next/navigation";
import { ESCONDIDO } from "@/lib/release/escondido";
import { paths } from "@/routes";

/** Conexión con Ventas sale siempre vacía: lleva a Contenido (SCRUM-490). */
export default function Layout({ children }: { children: React.ReactNode }) {
  if (ESCONDIDO.marketingConexionVentas) redirect(paths.platform.marketing.content);
  return children;
}

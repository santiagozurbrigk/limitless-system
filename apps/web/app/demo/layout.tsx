import { notFound } from "next/navigation";
import { ESCONDIDO } from "@/lib/release/escondido";

/** Pantalla interna o maqueta: cerrada para el release (SCRUM-490). */
export default function Layout({ children }: { children: React.ReactNode }) {
  if (ESCONDIDO.pantallasInternas) notFound();
  return children;
}

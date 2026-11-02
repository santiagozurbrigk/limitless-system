import { exigirRutaDeLaExperiencia } from "@/lib/organization/ruta-de-la-experiencia";
import { AgentLayoutCliente } from "./agent-layout-cliente";

/** Bloqueo por experiencia de la organización (SCRUM-524). */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirRutaDeLaExperiencia("/agent");
  return <AgentLayoutCliente>{children}</AgentLayoutCliente>;
}

import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";
import { exigirRutaDeLaExperiencia } from "@/lib/organization/ruta-de-la-experiencia";
import { AgentLayoutCliente } from "./agent-layout-cliente";

/**
 * Primero el bloqueo por experiencia de la organización (SCRUM-524), después
 * el permiso del módulo antes de montar el provider del Agente (SCRUM-540):
 * el provider es de cliente y pide las conversaciones al montarse, aunque la
 * página de abajo dibuje «No tenés acceso».
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirRutaDeLaExperiencia("/agent");
  const sinAcceso = await exigirModuloDeLaPagina("agent");
  if (sinAcceso) return sinAcceso;

  return <AgentLayoutCliente>{children}</AgentLayoutCliente>;
}

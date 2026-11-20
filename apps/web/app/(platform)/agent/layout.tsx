import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";
import { AgentLayoutCliente } from "./agent-layout-cliente";

/**
 * Permiso del módulo antes de montar el provider del Agente (SCRUM-540): el
 * provider es de cliente y pide las conversaciones al montarse, aunque la
 * página de abajo dibuje «No tenés acceso».
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const sinAcceso = await exigirModuloDeLaPagina("agent");
  if (sinAcceso) return sinAcceso;

  return <AgentLayoutCliente>{children}</AgentLayoutCliente>;
}

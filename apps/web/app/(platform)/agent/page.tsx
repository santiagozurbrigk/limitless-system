import { AgentShell } from "@/components/agent/agent-shell";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function AgentPage() {
  const sinAcceso = await exigirModuloDeLaPagina("agent");
  if (sinAcceso) return sinAcceso;

  return <AgentShell />;
}

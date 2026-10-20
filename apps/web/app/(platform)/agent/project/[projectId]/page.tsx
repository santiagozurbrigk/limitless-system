import { redirect } from "next/navigation";
import { paths } from "@/routes/paths";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function AgentProjectPage() {
  const sinAcceso = await exigirModuloDeLaPagina("agent");
  if (sinAcceso) return sinAcceso;

  redirect(paths.platform.agent.root);
}

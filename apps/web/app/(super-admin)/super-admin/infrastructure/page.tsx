import { unstable_rethrow } from "next/navigation";
import { InfrastructurePage } from "@/components/super-admin";
import { loadInfrastructureStats } from "@/lib/super-admin/queries";
import { getPlatformClaudeKeyStatusAction } from "@/app/super-admin/platform-ai-actions";
import type { PlatformClaudeKeyStatus } from "@/lib/ai/platform-credential";

const SIN_CLAVE: PlatformClaudeKeyStatus = {
  hasKey: false,
  status: "none",
  lastValidated: null,
  keyPreview: null,
};

export default async function SuperAdminInfrastructurePage() {
  const [stats, platformClaudeKey] = await Promise.all([
    loadInfrastructureStats(),
    // Si la lectura falla (p. ej. la tabla todavía no existe), la página igual carga.
    getPlatformClaudeKeyStatusAction().catch((error) => {
      unstable_rethrow(error);
      console.error("[super-admin] estado de la clave de la plataforma", error);
      return SIN_CLAVE;
    }),
  ]);
  return <InfrastructurePage stats={stats} platformClaudeKey={platformClaudeKey} />;
}

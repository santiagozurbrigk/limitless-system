import { unstable_rethrow } from "next/navigation";
import { InfrastructurePage } from "@/components/super-admin";
import { loadInfrastructureStats, loadUltimasCorridas } from "@/lib/super-admin/queries";
import { getPlatformClaudeKeyStatusAction } from "@/app/super-admin/platform-ai-actions";
import type { PlatformClaudeKeyStatus } from "@/lib/ai/platform-credential";
import { leerSalud } from "@/lib/observability/salud";

const SIN_CLAVE: PlatformClaudeKeyStatus = {
  hasKey: false,
  status: "none",
  lastValidated: null,
  keyPreview: null,
};

export default async function SuperAdminInfrastructurePage() {
  const [stats, platformClaudeKey, salud, corridas] = await Promise.all([
    loadInfrastructureStats(),
    // Si la lectura falla (p. ej. la tabla todavía no existe), la página igual carga.
    getPlatformClaudeKeyStatusAction().catch((error) => {
      unstable_rethrow(error);
      console.error("[super-admin] estado de la clave de la plataforma", error);
      return SIN_CLAVE;
    }),
    // El mismo chequeo que `GET /api/health` (SCRUM-85).
    leerSalud(),
    loadUltimasCorridas(),
  ]);
  return (
    <InfrastructurePage
      stats={stats}
      platformClaudeKey={platformClaudeKey}
      salud={salud}
      corridas={corridas}
      ahora={new Date()}
    />
  );
}

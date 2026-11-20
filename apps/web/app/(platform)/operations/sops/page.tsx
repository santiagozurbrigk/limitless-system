import { unstable_rethrow } from "next/navigation";
import { SopsOverview } from "@/components/sops";
import { listSops } from "@/lib/sops/queries";
import { detectSOPOpportunities } from "@/lib/sops/suggest-sops";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function OperationsSopsPage() {
  const sinAcceso = await exigirModuloDeLaPagina("operations");
  if (sinAcceso) return sinAcceso;

  const sops = await listSops();

  let suggestions: Awaited<ReturnType<typeof detectSOPOpportunities>> = [];
  if (isSupabaseConfigured()) {
    try {
      const organizationId = await requireOrganizationId();
      suggestions = await detectSOPOpportunities(organizationId);
    } catch (error) {
      unstable_rethrow(error);
      suggestions = [];
    }
  }

  return <SopsOverview sops={sops} suggestions={suggestions} />;
}

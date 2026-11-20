import { getLeadMagnetsAction } from "@/app/marketing/lead-magnets-actions";
import { LeadMagnetsOverview } from "@/components/marketing/lead-magnets/lead-magnets-overview";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export const metadata = { title: "Lead Magnets" };

export default async function LeadMagnetsPage() {
  const sinAcceso = await exigirModuloDeLaPagina("marketing");
  if (sinAcceso) return sinAcceso;

  const leadMagnets = await getLeadMagnetsAction();
  return <LeadMagnetsOverview initialLeadMagnets={leadMagnets} />;
}

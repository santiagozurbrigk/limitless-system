export const dynamic = "force-dynamic";

import { FinanceOverview } from "@/components/finance/finance-overview";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function FinancePage() {
  const sinAcceso = await exigirModuloDeLaPagina("finance");
  if (sinAcceso) return sinAcceso;

  return <FinanceOverview />;
}

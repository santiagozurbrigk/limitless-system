import { redirect } from "next/navigation";
import { MarketingOverview } from "@/components/marketing/marketing-overview";
import {
  getContentDistributionDataAction,
  getMarketingOverviewContextAction,
} from "@/app/marketing/actions";
import { ESCONDIDO } from "@/lib/release/escondido";
import { paths } from "@/routes";

export default async function MarketingPage() {
  // El Overview está escondido para el release (SCRUM-490): lee la integración
  // vieja de Instagram y casi siempre sale vacío. La entrada es Contenido.
  if (ESCONDIDO.marketingOverview) redirect(paths.platform.marketing.content);

  const [distribution, overview] = await Promise.all([
    getContentDistributionDataAction(),
    getMarketingOverviewContextAction(),
  ]);

  return <MarketingOverview distribution={distribution} overview={overview} />;
}

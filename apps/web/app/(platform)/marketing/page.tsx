import { redirect } from "next/navigation";
import { MarketingOverview } from "@/components/marketing/marketing-overview";
import { EmptyState } from "@/components/shared/empty-state";
import {
  getContentDistributionDataAction,
  getMarketingOverviewContextAction,
} from "@/app/marketing/actions";
import { ESCONDIDO } from "@/lib/release/escondido";
import { paths } from "@/routes";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

const RESUMEN_SIN_CARGAR = "No se pudo cargar el resumen de Marketing";

export default async function MarketingPage() {
  const sinAcceso = await exigirModuloDeLaPagina("marketing");
  if (sinAcceso) return sinAcceso;

  // El Overview está escondido para el release (SCRUM-490): lee la integración
  // vieja de Instagram y casi siempre sale vacío. La entrada es Contenido.
  if (ESCONDIDO.marketingOverview) redirect(paths.platform.marketing.content);

  const [distribution, overview] = await Promise.all([
    getContentDistributionDataAction(),
    getMarketingOverviewContextAction(),
  ]);

  // Las dos lecturas devuelven su error como valor (SCRUM-519): la pantalla
  // muestra el motivo en vez de un resumen en cero.
  if (!distribution.success) {
    return <EmptyState title={RESUMEN_SIN_CARGAR} description={distribution.error} />;
  }
  if (!overview.success) {
    return <EmptyState title={RESUMEN_SIN_CARGAR} description={overview.error} />;
  }

  return <MarketingOverview distribution={distribution.data} overview={overview.data} />;
}

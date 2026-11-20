import { AdsDashboard } from "@/components/marketing/ads-dashboard";
import { getMarketingAdsAction } from "@/app/marketing/content/ad-actions";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

function resolveDefaultDateRange(days = 30) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
  };
}

export default async function MarketingAnunciosPage() {
  const sinAcceso = await exigirModuloDeLaPagina("marketing");
  if (sinAcceso) return sinAcceso;

  const range = resolveDefaultDateRange(30);
  // La lectura devuelve su error como valor (SCRUM-502): el tablero muestra
  // el motivo (antes, el texto crudo de Zernio).
  const result = await getMarketingAdsAction(range);

  return (
    <div className="p-6">
      <AdsDashboard
        initialAds={result.success ? result.data.ads : []}
        initialError={result.success ? null : result.error}
        initialRangeDays={30}
      />
    </div>
  );
}

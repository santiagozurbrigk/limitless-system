import { HoldingsAdminPanel } from "@/components/super-admin/holdings-admin-panel";
import { HoldingPortfolioContent } from "@/components/super-admin/holding-portfolio-content";
import { loadHoldingsForAdmin } from "@/lib/super-admin/holdings-admin";
import { getHoldingKPIs, getHoldingPortfolio } from "@/lib/super-admin/holding-queries";

/**
 * Holdings de la consola (SCRUM-551): la administración de las cuentas holding
 * (la pestaña "Holdings" de Organizaciones en el panel viejo) y el portfolio
 * (su pantalla "Holding").
 */
export default async function HoldingsPage() {
  const [holdings, { holdingName, organizations }, kpis] = await Promise.all([
    loadHoldingsForAdmin(),
    getHoldingPortfolio(),
    getHoldingKPIs(),
  ]);
  return (
    <div className="space-y-10">
      <HoldingsAdminPanel holdings={holdings} base="consola" />
      <HoldingPortfolioContent holdingName={holdingName} kpis={kpis} organizations={organizations} base="consola" />
    </div>
  );
}

import { MarketingSalesConnection } from "@/components/marketing/marketing-sales-connection";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function MarketingSalesConnectionPage() {
  const sinAcceso = await exigirModuloDeLaPagina("marketing");
  if (sinAcceso) return sinAcceso;

  return <MarketingSalesConnection />;
}

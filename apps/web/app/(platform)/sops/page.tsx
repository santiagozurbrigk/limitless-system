import { SopsOverview } from "@/components/sops/sops-overview";
import { listSops } from "@/lib/sops/queries";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function SopsPage() {
  const sinAcceso = await exigirModuloDeLaPagina("operations");
  if (sinAcceso) return sinAcceso;

  const sops = await listSops();
  return <SopsOverview sops={sops} />;
}

import { WinsPage } from "@/components/clients/wins";
import { getWinsPageDataAction } from "@/app/clients/win-page-actions";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function WinsRoute() {
  const sinAcceso = await exigirModuloDeLaPagina("clients");
  if (sinAcceso) return sinAcceso;

  const data = await getWinsPageDataAction();
  return <WinsPage initialData={data} />;
}

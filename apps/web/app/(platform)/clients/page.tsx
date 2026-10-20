import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";
import { ClientsPageCliente } from "./clients-page-cliente";

export default async function ClientsPage() {
  const sinAcceso = await exigirModuloDeLaPagina("clients");
  if (sinAcceso) return sinAcceso;

  return <ClientsPageCliente />;
}

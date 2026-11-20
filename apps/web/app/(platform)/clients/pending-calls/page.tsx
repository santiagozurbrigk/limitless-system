import { PendingFathomCallsPage } from "@/components/clients/pending-fathom-calls";
import { listPendingFathomCallsAction } from "@/app/fathom/actions";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function PendingCallsPage() {
  const sinAcceso = await exigirModuloDeLaPagina("clients");
  if (sinAcceso) return sinAcceso;

  const calls = await listPendingFathomCallsAction();
  return <PendingFathomCallsPage initialCalls={calls} />;
}

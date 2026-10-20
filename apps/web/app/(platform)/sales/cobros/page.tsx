import { CobrosPage } from "@/components/sales/cobros-page";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

/**
 * `?cliente=<id>` abre la pantalla con el historial de pagos de ese cliente ya
 * desplegado. Lo usa el botón "Ver cobros de este cliente" de la ficha: sin
 * esto, el botón prometía un cliente y entregaba una lista.
 */
export default async function CobrosRoute({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const sinAcceso = await exigirModuloDeLaPagina("sales");
  if (sinAcceso) return sinAcceso;

  const { cliente } = await searchParams;
  return <CobrosPage initialClientId={cliente ?? null} />;
}

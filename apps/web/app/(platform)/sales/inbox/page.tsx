import { Suspense } from "react";
import { SalesInboxLayout } from "@/components/sales";
import { PageLoading } from "@/components/shared/page-loading";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function SalesInboxPage() {
  const sinAcceso = await exigirModuloDeLaPagina("sales");
  if (sinAcceso) return sinAcceso;

  return (
    <Suspense fallback={<PageLoading label="Cargando bandeja…" />}>
      <SalesInboxLayout />
    </Suspense>
  );
}

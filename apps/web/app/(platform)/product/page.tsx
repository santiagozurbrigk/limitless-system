import { Suspense } from "react";
import { ProductModule } from "@/components/product";
import { getProductPageData } from "@/lib/product/queries";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function ProductPage() {
  const sinAcceso = await exigirModuloDeLaPagina("operations");
  if (sinAcceso) return sinAcceso;

  const { productData, spatialNodes, graphData, hasRealData, canEdit } = await getProductPageData();

  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
      <ProductModule
        productData={productData}
        spatialNodes={spatialNodes}
        graphData={graphData}
        hasRealData={hasRealData}
        canEdit={canEdit}
      />
    </Suspense>
  );
}

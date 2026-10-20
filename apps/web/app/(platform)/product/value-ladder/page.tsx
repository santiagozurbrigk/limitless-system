import { ValueLadderSection } from "@/components/product";
import { ProductBackLink } from "@/components/product/product-back-link";
import { EmptyState } from "@/components/shared/empty-state";
import { getProductPageData } from "@/lib/product/queries";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function ProductValueLadderPage() {
  const sinAcceso = await exigirModuloDeLaPagina("operations");
  if (sinAcceso) return sinAcceso;

  const { productData, hasRealData } = await getProductPageData();

  if (!hasRealData) {
    return (
      <div>
        <ProductBackLink />
        <EmptyState
          title="Sin escalera de valor configurada"
          description="Agregá productos y ofertas en el módulo de Producto para ver la escalera de valor."
        />
      </div>
    );
  }

  return (
    <div>
      <ProductBackLink />
      <h1 className="mb-6 text-xl font-semibold text-foreground">Escalera de valor</h1>
      <ValueLadderSection steps={productData.valueLadder} canEdit />
    </div>
  );
}

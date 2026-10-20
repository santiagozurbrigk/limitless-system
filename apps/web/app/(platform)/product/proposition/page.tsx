import { PropositionSection } from "@/components/product";
import { ProductBackLink } from "@/components/product/product-back-link";
import { EmptyState } from "@/components/shared/empty-state";
import { getProductPageData } from "@/lib/product/queries";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function ProductPropositionPage() {
  const sinAcceso = await exigirModuloDeLaPagina("operations");
  if (sinAcceso) return sinAcceso;

  const { productData, hasRealData } = await getProductPageData();

  if (!hasRealData) {
    return (
      <div>
        <ProductBackLink />
        <EmptyState
          title="Sin propuesta de valor configurada"
          description="Definí avatares y ofertas en el módulo de Producto para generar tu propuesta."
        />
      </div>
    );
  }

  return (
    <div>
      <ProductBackLink />
      <h1 className="mb-6 text-xl font-semibold text-foreground">Propuesta de valor</h1>
      <PropositionSection
        initial={productData.proposition}
        canEdit
      />
    </div>
  );
}

import { notFound } from "next/navigation";
import { OfferDetailPageContent, ProductBackLink } from "@/components/product";
import { getProductOfferById, getProductPageData } from "@/lib/product/queries";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function ProductOfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sinAcceso = await exigirModuloDeLaPagina("operations");
  if (sinAcceso) return sinAcceso;

  const { id } = await params;
  const [{ hasRealData, canEdit, productData }, offer] = await Promise.all([
    getProductPageData(),
    getProductOfferById(id),
  ]);

  if (!offer) notFound();

  return (
    <div>
      <ProductBackLink />
      <h1 className="mb-6 text-xl font-semibold text-foreground">{offer.name}</h1>
      <OfferDetailPageContent
        offer={offer}
        avatars={productData.avatars}
        hasRealData={hasRealData}
        canEdit={canEdit}
      />
    </div>
  );
}

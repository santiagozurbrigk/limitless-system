import { notFound } from "next/navigation";
import { OrganizationDetailView } from "@/components/super-admin";
import { loadOrgClientHealthTimeline } from "@/lib/super-admin/client-health";
import { loadOrganizationDetail } from "@/lib/super-admin/queries";

/** Ficha de una organización en la consola (SCRUM-551), con su experiencia. */
export default async function OrganizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, clientHealth] = await Promise.all([
    loadOrganizationDetail(id),
    loadOrgClientHealthTimeline(id),
  ]);
  if (!detail) notFound();
  return <OrganizationDetailView detail={detail} clientHealth={clientHealth} base="consola" />;
}

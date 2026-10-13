import { UTMPageContent } from "@/components/marketing/utm-page-content";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { listContentAssetsAction } from "@/app/marketing/actions";
import {
  getOrganizationWebsiteAction,
  getUTMLinksAction,
} from "@/app/marketing/utm-actions";

export default async function MarketingUTMsPage() {
  const [links, assets, orgWebsiteUrl] = await Promise.all([
    getUTMLinksAction(),
    listContentAssetsAction(),
    getOrganizationWebsiteAction(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="UTMs de YouTube"
        description="Generá links trackeables y medí qué videos traen leads, bookings y ventas."
      />
      {/* La lista de videos devuelve su error como valor (SCRUM-519): con la
          lectura caída se avisa el motivo en vez de mostrar "sin videos". */}
      {assets.success ? (
        <UTMPageContent
          initialLinks={links}
          youtubeVideos={assets.data.filter((a) => a.platform === "youtube")}
          orgWebsiteUrl={orgWebsiteUrl}
        />
      ) : (
        <EmptyState title="No se pudieron cargar los videos de YouTube" description={assets.error} />
      )}
    </div>
  );
}

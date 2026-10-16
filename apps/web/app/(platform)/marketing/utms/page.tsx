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
      {/* La lista de videos devuelve su error como valor (SCRUM-519): si falla,
          se avisa el motivo y los links UTM, que sí se leyeron, se siguen
          viendo; el generador queda con el título manual. */}
      {assets.success ? null : (
        <EmptyState
          variant="inline"
          title="No se pudieron cargar los videos de YouTube"
          description={assets.error}
        />
      )}
      {/* Los links y la URL del sitio también (SCRUM-520): si fallan, la tabla
          y el generador muestran el motivo en su lugar y el resto de la
          pantalla sigue funcionando. Antes la tabla decía "Todavía no creaste
          UTMs" y el generador pedía configurar una URL que quizás ya estaba. */}
      <UTMPageContent
        initialLinks={links.success ? links.data : []}
        motivoDeLinks={links.success ? null : links.error}
        youtubeVideos={assets.success ? assets.data.filter((a) => a.platform === "youtube") : []}
        orgWebsiteUrl={orgWebsiteUrl.success ? orgWebsiteUrl.data : null}
        motivoDeUrlDelSitio={orgWebsiteUrl.success ? null : orgWebsiteUrl.error}
      />
    </div>
  );
}

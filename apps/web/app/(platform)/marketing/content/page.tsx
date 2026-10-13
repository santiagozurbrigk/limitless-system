import { getContentPiecesAction, getContentDraftsAction } from "@/app/marketing/content/actions";
import { maybeSyncZernioContentAction } from "@/app/marketing/content/sync-actions";
import { ContentPieceGrid } from "@/components/marketing/content-piece-grid";
import { ContentDraftsLibrary } from "@/components/marketing/content-drafts-library";
import { ContentTabSwitcher } from "@/components/marketing/content-tab-switcher";
import { RefreshCw } from "lucide-react";

export default async function MarketingContentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "borradores" ? "borradores" : "biblioteca";

  // La sincronización con Zernio devuelve su error como valor (SCRUM-519): si
  // falla, la página se dibuja igual y dice por qué no se sincronizó (antes no
  // decía nada, y una caída de Zernio no se registraba).
  const sincronizacion = await maybeSyncZernioContentAction();
  const syncedAt = sincronizacion.success ? new Date() : null;
  const motivoSinSincronizar = sincronizacion.success ? null : sincronizacion.error;

  const [pieces, drafts] = await Promise.all([
    getContentPiecesAction({ limit: 50 }),
    getContentDraftsAction({ limit: 100 }),
  ]);

  const reelCount = pieces.filter((p) => p.type === "reel").length;
  const analyzedCount = pieces.filter((p) => p.analysis).length;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Contenido</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {activeTab === "biblioteca" ? (
              <>
                <span>
                  {pieces.length} {pieces.length === 1 ? "pieza" : "piezas"}
                  {reelCount > 0 ? ` · ${reelCount} reels` : ""}
                </span>
                {analyzedCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    {analyzedCount} analizadas con IA
                  </span>
                ) : null}
                {syncedAt ? (
                  <span className="inline-flex items-center gap-1 text-[11px]">
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    Sincronizado{" "}
                    {syncedAt.toLocaleTimeString("es-AR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                ) : null}
                {motivoSinSincronizar ? (
                  <span className="inline-flex items-center gap-1 text-[11px]">
                    Sin sincronizar: {motivoSinSincronizar}
                  </span>
                ) : null}
              </>
            ) : (
              <span>
                {drafts.length} {drafts.length === 1 ? "borrador" : "borradores"} generados por IA
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div data-tour="content-tabs">
      <ContentTabSwitcher
        activeTab={activeTab}
        draftsCount={drafts.length}
      />
      </div>

      {/* Content */}
      <div data-tour="content-grid" className="mt-6">
        {activeTab === "biblioteca" ? (
          <ContentPieceGrid pieces={pieces} />
        ) : (
          <ContentDraftsLibrary drafts={drafts} />
        )}
      </div>
    </div>
  );
}

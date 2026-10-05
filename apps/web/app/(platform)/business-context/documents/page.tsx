import { unstable_rethrow } from "next/navigation";
import { KnowledgeBasePage } from "@/components/business-context/knowledge-base-page";
import { PageHeader } from "@/components/shared/page-header";
import {
  getBusinessContextDocumentsAction,
  getFathomContextCallsAction,
  getCustomCategoriesAction,
} from "@/app/business-context/actions";
import { getGoogleFormsIntegrationStatusAction } from "@/app/forms/actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { ContextDocument, FathomKnowledgeCall, CustomCategory } from "@/types/business-context";

export default async function BusinessContextDocumentsPage() {
  let documents: ContextDocument[] = [];
  let contextCalls: FathomKnowledgeCall[] = [];
  let clientMeetingCalls: FathomKnowledgeCall[] = [];
  let customCategories: CustomCategory[] = [];
  let googleConnected = false;

  if (isSupabaseConfigured()) {
    try {
      const [docs, fathom, googleStatus, cats] = await Promise.all([
        getBusinessContextDocumentsAction(),
        getFathomContextCallsAction(),
        getGoogleFormsIntegrationStatusAction(),
        getCustomCategoriesAction(),
      ]);
      documents = docs;
      contextCalls = fathom.contextCalls;
      clientMeetingCalls = fathom.clientMeetingCalls;
      googleConnected = googleStatus.connected;
      customCategories = cats as CustomCategory[];
    } catch (e) {
      // El error con el que Next marca la ruta como dinámica (y los de redirect o
      // notFound) no es una falla: se relanza para que Next lo maneje.
      unstable_rethrow(e);
      console.error("[KnowledgeBase] load:", e);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader description="Documentos, calls y frameworks indexados para la IA" />
      <KnowledgeBasePage
        documents={documents}
        contextCalls={contextCalls}
        clientMeetingCalls={clientMeetingCalls}
        googleConnected={googleConnected}
        customCategories={customCategories}
      />
    </div>
  );
}

import Link from "next/link";
import { getGHLIntegrationStatusAction } from "@/app/ghl/actions";
import { DataImportWizard } from "@/components/integrations/data-import-wizard";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@ai-coo/ui";
import { ArrowLeft } from "lucide-react";
import { paths } from "@/routes";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function ImportDataPage() {
  const sinAcceso = await exigirModuloDeLaPagina("integrations");
  if (sinAcceso) return sinAcceso;

  const ghlStatus = await getGHLIntegrationStatusAction();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={paths.platform.integrations}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Link>
        </Button>
      </div>
      <PageHeader
        description="Importá tu base de datos histórica desde GoHighLevel o un archivo Excel"
      />
      <DataImportWizard ghlConnected={ghlStatus.connected} />
    </div>
  );
}

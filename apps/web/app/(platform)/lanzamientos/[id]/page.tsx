import Link from "next/link";
import { Rocket } from "lucide-react";
import { Button } from "@ai-coo/ui";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { paths } from "@/routes";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function LaunchDetailPage() {
  const sinAcceso = await exigirModuloDeLaPagina("funnels");
  if (sinAcceso) return sinAcceso;

  return (
    <div className="space-y-8">
      <PageHeader title="Lanzamientos" />
      <EmptyState
        icon={<Rocket className="h-8 w-8" />}
        title="Próximamente"
        description="Estamos trabajando en este módulo. Estará disponible muy pronto."
        action={
          <Button asChild variant="outline">
            <Link href={paths.platform.dashboard}>Volver al inicio</Link>
          </Button>
        }
      />
    </div>
  );
}

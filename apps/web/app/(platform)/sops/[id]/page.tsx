import { Sparkles } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge } from "@ai-coo/ui";
import { SopStatusBadge } from "@/components/sops";
import { SopContentViewer } from "@/components/sops/sop-content-viewer";
import { Panel } from "@/components/shared/panel";
import { getSopContentById } from "@/lib/sops/queries";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function SopDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sinAcceso = await exigirModuloDeLaPagina("operations");
  if (sinAcceso) return sinAcceso;

  const { id } = await params;
  const result = await getSopContentById(id);
  if (!result) notFound();

  const { sop, content } = result;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{sop.title}</h2>
        <SopStatusBadge status={sop.status} />
        {sop.generatedByAI ? (
          <Badge variant="outline" className="gap-1 text-xs text-brand-700 dark:text-brand-300">
            <Sparkles className="h-3 w-3" />
            IA
          </Badge>
        ) : null}
        {sop.version ? (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            v{sop.version}
          </Badge>
        ) : null}
      </div>
      <Panel title="Objetivo">
        <p className="text-sm text-muted-foreground">{sop.goal}</p>
      </Panel>
      <Panel title="Contenido del SOP">
        <SopContentViewer content={content} />
      </Panel>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { FunnelBindingsForm } from "@/components/funnels/funnel-bindings-form";
import {
  getFunnelBindingsAction,
  listFunnelFormOptionsAction,
} from "@/app/funnels/actions";
import { listGHLStageOptionsAction } from "@/app/ghl/opportunity-actions";
import { listVTurbPlayerOptionsAction } from "@/app/vturb/actions";
import { listWebinarJamWebinarOptionsAction } from "@/app/webinarjam/actions";
import { blockingTools } from "@/lib/funnels";
import { paths } from "@/routes/paths";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function FunnelConfigurePage({
  params,
}: {
  params: Promise<{ funnelId: string }>;
}) {
  const sinAcceso = await exigirModuloDeLaPagina("funnels");
  if (sinAcceso) return sinAcceso;

  const { funnelId } = await params;
  const data = await getFunnelBindingsAction(funnelId);
  if (!data) notFound();

  // Dos fuentes piden un parámetro: las de GHL, la etapa del pipeline; las de
  // VTurb, el video. Si la org no sincronizó su catálogo, la lista viene vacía y
  // el formulario lo dice en vez de ofrecer un selector sin opciones.
  const [ghlStages, vturbPlayers, webinarJamWebinars, forms] = await Promise.all([
    listGHLStageOptionsAction(),
    listVTurbPlayerOptionsAction(),
    listWebinarJamWebinarOptionsAction(),
    listFunnelFormOptionsAction(),
  ]);

  const pendientes = blockingTools();

  return (
    <div className="space-y-6 p-6">
      <Link
        href={paths.platform.funnels.detail(funnelId)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al embudo
      </Link>

      <PageHeader
        title={`Fuentes de ${data.instanceName}`}
        description={`${data.templateLabel} · elegí de dónde sale el número de cada paso. Un paso sin fuente queda sin datos, que no es lo mismo que cero.`}
      />

      <FunnelBindingsForm
        funnelId={funnelId}
        rows={data.rows}
        ghlStages={ghlStages}
        vturbPlayers={vturbPlayers}
        webinarJamWebinars={webinarJamWebinars}
        forms={forms}
      />

      {pendientes.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card p-5 dark:border-glass dark:bg-glass">
          <h3 className="text-sm font-medium">Herramientas que el estándar pide y Limitless no cubre</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Mientras no existan, los pasos que dependen de ellas no tienen fuente posible.
          </p>
          <ul className="mt-3 space-y-2">
            {pendientes.map((tool) => (
              <li key={tool.id} className="text-xs">
                <span className="font-medium">{tool.label}</span>
                <span className="text-muted-foreground"> — {tool.owns}</span>
                <p className="mt-0.5 text-muted-foreground">{tool.otcNote}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

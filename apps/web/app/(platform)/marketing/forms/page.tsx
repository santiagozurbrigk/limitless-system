import Link from "next/link";
import { Badge, Button, GlassPanel } from "@ai-coo/ui";
import { listFormsAction } from "@/app/forms/actions";
import { FormSyncButton } from "@/components/marketing/form-sync-button";
import { FormDisconnectButton } from "@/components/marketing/form-disconnect-button";
import { paths } from "@/routes";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function MarketingFormsPage() {
  const sinAcceso = await exigirModuloDeLaPagina("marketing");
  if (sinAcceso) return sinAcceso;

  const forms = await listFormsAction();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Formularios conectados</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Typeform y Google Forms centralizados con lead scoring IA.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={paths.platform.integrations}>+ Conectar formulario</Link>
        </Button>
      </div>

      {forms.length === 0 && (
        <GlassPanel className="p-6 text-sm text-muted-foreground">
          Conectá Typeform o Google Forms desde Integraciones.
        </GlassPanel>
      )}

      <div className="grid gap-4">
        {forms.map((form) => (
          <GlassPanel key={form.id} className="p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{form.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {form.platform === "typeform" ? "Typeform" : "Google Forms"} ·{" "}
                  {form.totalResponses} respuestas · {form.completionRate}%
                  completion
                </p>
              </div>
              {form.avgLeadScore != null && (
                <Badge variant="secondary">
                  Lead score prom: {form.avgLeadScore}/100
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FormSyncButton formId={form.id} />
              <Button asChild size="sm">
                <Link href={paths.platform.marketing.formDetail(form.id)}>
                  Ver métricas
                </Link>
              </Button>
              <FormDisconnectButton formId={form.id} />
            </div>
          </GlassPanel>
        ))}
      </div>
    </div>
  );
}

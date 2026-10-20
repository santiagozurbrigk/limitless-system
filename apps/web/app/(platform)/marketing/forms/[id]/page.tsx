import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge, Button, GlassPanel } from "@ai-coo/ui";
import { getFormDetailAction } from "@/app/forms/actions";
import { paths } from "@/routes";
import { FormsDetailActions } from "@/components/marketing/forms-detail-actions";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function MarketingFormDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sinAcceso = await exigirModuloDeLaPagina("marketing");
  if (sinAcceso) return sinAcceso;

  const { id } = await params;
  const detail = await getFormDetailAction(id);
  if (!detail) notFound();

  const { form, responses } = detail;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link href={paths.platform.marketing.forms}>← Formularios</Link>
        </Button>
        <h1 className="text-xl font-semibold">{form.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {form.platform === "typeform" ? "Typeform" : "Google Forms"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Total respuestas", String(form.total_responses)],
          ["Completion rate", `${form.completion_rate}%`],
          [
            "Tiempo promedio",
            `${Math.round(form.avg_completion_time_seconds / 60)}m`,
          ],
          ["Plataforma", form.platform],
        ].map(([label, value]) => (
          <GlassPanel key={label} className="p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold tabular-nums">{value}</p>
          </GlassPanel>
        ))}
      </div>

      <FormsDetailActions formId={form.id} />

      {(form.ai_form_analysis || form.ai_drop_off_insights) && (
        <GlassPanel className="p-5 space-y-3">
          <h2 className="text-sm font-semibold">Análisis IA</h2>
          {form.ai_form_analysis && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {form.ai_form_analysis}
            </p>
          )}
          {form.ai_drop_off_insights && (
            <p className="text-sm">
              <span className="font-medium">Abandonos: </span>
              {form.ai_drop_off_insights}
            </p>
          )}
          {form.ai_qualification_insights && (
            <p className="text-sm">
              <span className="font-medium">Calificación: </span>
              {form.ai_qualification_insights}
            </p>
          )}
        </GlassPanel>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Respuestas recientes</h2>
        {responses.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin respuestas aún.</p>
        )}
        {responses.map((r) => (
          <GlassPanel key={r.id} className="p-4 text-sm space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {r.respondent_name ?? r.respondent_email ?? "Anónimo"}
              </span>
              {r.ai_lead_score != null && (
                <Badge variant="secondary">
                  Score: {r.ai_lead_score}/100
                </Badge>
              )}
              {r.ai_lead_qualification && (
                <Badge>{r.ai_lead_qualification}</Badge>
              )}
            </div>
            {(r.ai_key_insights ?? []).slice(0, 2).map((insight: string) => (
              <p key={insight} className="text-muted-foreground">
                · {insight}
              </p>
            ))}
          </GlassPanel>
        ))}
      </section>
    </div>
  );
}

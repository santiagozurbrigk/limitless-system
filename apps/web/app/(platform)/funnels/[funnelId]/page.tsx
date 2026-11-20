import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Settings2 } from "lucide-react";
import { cn } from "@ai-coo/ui";
import { FunnelKpiPanel } from "@/components/funnels/funnel-kpi-panel";
import { FunnelSpineStrip } from "@/components/funnels/funnel-spine-strip";
import { FunnelStepsTable } from "@/components/funnels/funnel-steps-table";
import { FunnelSwitcher } from "@/components/funnels/funnel-switcher";
import { formatFunnelValue } from "@/components/funnels/funnel-format";
import { getFunnelAction, listFunnelInstancesAction } from "@/app/funnels/actions";
import {
  FUNNEL_PERIOD_PRESETS,
  DEFAULT_PERIOD_PRESET,
  isPeriodPresetId,
  getFunnelTemplate,
  getInstrumentationTool,
} from "@/lib/funnels";
import { paths } from "@/routes/paths";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

/**
 * Detalle de un embudo.
 *
 * Página GENÉRICA: renderiza cualquier plantilla. Si al agregar un tipo de
 * embudo hiciera falta tocar este archivo, la arquitectura falló
 * (docs/specs/FUNNELS_ARCHITECTURE.md §0).
 *
 * ⭐ **El orden de la página es una decisión, no una lista.** De arriba abajo:
 *
 * 1. Los tres punteros del embudo — qué mirar primero según su propia plantilla.
 * 2. Los KPIs universales — si el embudo funciona y si escala, con las dos
 *    ratios decisivas arriba de todo.
 * 3. El spine — dónde está roto.
 * 4. La tabla de pasos — el detalle, con su fuente.
 *
 * Es la jerarquía que pide el documento: *"the stage-by-stage tables tell you
 * WHERE a funnel is broken; these two ratios tell you WHETHER it is"*. Primero
 * si funciona, después dónde falla.
 *
 * El período va como query param para que se preserve al cambiar de embudo:
 * comparar la misma ventana entre embudos es el trabajo real del usuario.
 */
export default async function FunnelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ funnelId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const sinAcceso = await exigirModuloDeLaPagina("funnels");
  if (sinAcceso) return sinAcceso;

  const { funnelId } = await params;
  const { period: periodParam } = await searchParams;

  const presetId =
    periodParam && isPeriodPresetId(periodParam) ? periodParam : DEFAULT_PERIOD_PRESET;

  const [data, instances] = await Promise.all([
    getFunnelAction(funnelId, presetId),
    listFunnelInstancesAction(),
  ]);
  if (!data) notFound();

  const { instance, template, computed, provenance, period } = data;

  const metricById = new Map(computed.metrics.map((m) => [m.metricId, m]));
  const pointer = (metricId: string) =>
    metricById.get(metricId) ??
    computed.kpis.find((k) => k.metricId === metricId) ??
    null;

  // Un paso sin fuente y un paso con fuente que no trajo número son problemas
  // distintos, y se arreglan en lugares distintos: uno en la configuración del
  // embudo, el otro en la integración.
  const unboundSteps = provenance.filter((p) => p.unbound);
  const brokenSteps = provenance.filter((p) => !p.unbound && p.nullReason !== null);

  const missingTools = [
    ...new Set(
      template.steps
        .filter((s) => unboundSteps.some((u) => u.stepId === s.id))
        .map((s) => getInstrumentationTool(s.sourceHint).label)
    ),
  ];

  const switcherItems = instances.map((item) => ({
    id: item.id,
    name: item.name,
    templateLabel: getFunnelTemplate(item.template_id)?.label ?? item.template_id,
  }));

  const pointers = [
    { label: "North-star", pointer: template.northStar },
    { label: "Indicador adelantado", pointer: template.leadingIndicator },
    { label: "Tasa que gobierna", pointer: template.governingRate },
  ];

  return (
    <div className="space-y-8 p-6">
      {/* ── Cabecera: cambiar de embudo y de período sin perder el otro ── */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FunnelSwitcher
            current={{
              id: instance.id,
              name: instance.name,
              templateLabel: template.label,
            }}
            items={switcherItems}
            periodId={presetId}
          />

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              {FUNNEL_PERIOD_PRESETS.map((preset) => (
                <Link
                  key={preset.id}
                  href={`${paths.platform.funnels.detail(funnelId)}?period=${preset.id}`}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    preset.id === presetId
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {preset.label}
                </Link>
              ))}
            </div>
            <Link
              href={paths.platform.funnels.configure(funnelId)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Fuentes
            </Link>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {template.label} · {template.badge} · {period.start} a {period.end} · zona
          horaria {instance.reporting_timezone}
        </p>
      </header>

      {/* ── Huecos de instrumentación, separados por cómo se arreglan ── */}
      {missingTools.length > 0 || brokenSteps.length > 0 ? (
        <div className="space-y-2">
          {missingTools.length > 0 ? (
            <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="text-sm">
                <p className="font-medium">
                  {unboundSteps.length} paso(s) sin fuente configurada
                </p>
                <p className="mt-1 text-muted-foreground">
                  Quedan <strong>sin datos</strong>, que no es lo mismo que tener cero.
                  El estándar les asigna: {missingTools.join(", ")}.{" "}
                  <Link
                    href={paths.platform.funnels.configure(funnelId)}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    Configurar fuentes
                  </Link>
                </p>
              </div>
            </div>
          ) : null}

          {brokenSteps.length > 0 ? (
            <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="text-sm">
                <p className="font-medium">
                  {brokenSteps.length} paso(s) con fuente pero sin número
                </p>
                <p className="mt-1 text-muted-foreground">
                  {brokenSteps.some((s) => s.nullReason === "missing_config")
                    ? "Falta elegir un parámetro de la fuente (la etapa del CRM, el video o el webinar). "
                    : ""}
                  {brokenSteps.some((s) => s.nullReason === "outside_history")
                    ? "El período pedido empieza antes de que Limitless tuviera historial de esa fuente: los conteos anteriores no existen, no son cero."
                    : ""}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── 1. Los tres punteros de esta plantilla ── */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium">Qué mirar en este embudo</h3>
          <p className="text-xs text-muted-foreground">
            Los define la plantilla: cada tipo de embudo se lee distinto.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {pointers.map((item) => {
            const metric = pointer(item.pointer.metricId);
            return (
              <div
                key={item.label}
                className="rounded-2xl border border-border bg-card p-4 dark:border-glass dark:bg-glass"
              >
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-1 text-sm font-medium">{item.pointer.label}</p>
                <p
                  className={cn(
                    "mt-1 text-2xl font-semibold tabular-nums",
                    metric?.value === null && "text-muted-foreground"
                  )}
                >
                  {metric
                    ? formatFunnelValue(metric.value, metric.unit, instance.currency)
                    : "—"}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 2. Si funciona y si escala ── */}
      <FunnelKpiPanel kpis={computed.kpis} currency={instance.currency} />

      {/* ── 3. Dónde está roto ── */}
      <FunnelSpineStrip stages={computed.stages} transitions={computed.transitions} />

      {/* ── 4. El detalle, paso por paso ── */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium">Paso a paso</h3>
          <p className="text-xs text-muted-foreground">
            Cada cifra con su fuente, como pide el estándar.
          </p>
        </div>
        <FunnelStepsTable
          template={template}
          computed={computed}
          provenance={provenance}
          currency={instance.currency}
        />
      </section>
    </div>
  );
}

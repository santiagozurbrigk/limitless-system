import Link from "next/link";
import { ArrowRight, Filter, Settings2 } from "lucide-react";
import { cn } from "@ai-coo/ui";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { FunnelCreateForm } from "@/components/funnels/funnel-create-form";
import {
  listFunnelIndexAction,
  listFunnelTemplatesAction,
} from "@/app/funnels/actions";
import { blockingTools } from "@/lib/funnels";
import { paths } from "@/routes/paths";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

/**
 * Índice de embudos.
 *
 * Es un índice real y no un redirect al último usado: un redirect hace que el
 * mismo click lleve a lugares distintos según el día
 * (docs/specs/FUNNELS_ARCHITECTURE.md §6).
 *
 * Cada tarjeta muestra **cuántos pasos tienen fuente**, no un número de negocio.
 * Es lo que el usuario necesita para elegir a cuál entrar, y evita resolver cada
 * embudo entero —con todas sus integraciones— sólo para pintar una grilla.
 */
export default async function FunnelsPage() {
  const sinAcceso = await exigirModuloDeLaPagina("funnels");
  if (sinAcceso) return sinAcceso;

  const [funnels, templates] = await Promise.all([
    listFunnelIndexAction(),
    listFunnelTemplatesAction(),
  ]);

  const pending = blockingTools();

  return (
    <div className="space-y-8 p-6">
      <PageHeader
        title="Embudos"
        description="Cada embudo se mide con las mismas siete etapas, así que los mismos números significan lo mismo en cualquier oferta."
      />

      {funnels.length === 0 ? (
        <EmptyState
          variant="inline"
          icon={<Filter className="h-5 w-5" />}
          title="Todavía no hay embudos"
          description="Creá el primero eligiendo un tipo. Después vas a poder elegir de dónde sale el número de cada paso."
        />
      ) : (
        <div data-tour="funnels-list" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {funnels.map((funnel) => {
            const complete = funnel.boundSteps >= funnel.stepCount;
            const ratio = funnel.stepCount === 0 ? 0 : funnel.boundSteps / funnel.stepCount;

            return (
              <div
                key={funnel.id}
                className="group flex flex-col rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40 dark:border-glass dark:bg-glass"
              >
                <Link href={paths.platform.funnels.detail(funnel.id)} className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium">{funnel.name}</p>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {funnel.templateLabel} · {funnel.badge}
                  </p>
                  <p className="mt-3 text-lg font-semibold tabular-nums">
                    {new Intl.NumberFormat("es-AR", {
                      style: "currency",
                      currency: funnel.currency,
                      maximumFractionDigits: 0,
                    }).format(funnel.pricePoint)}
                  </p>
                </Link>

                <div className="mt-4 space-y-1.5">
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        complete ? "bg-primary" : "bg-amber-500"
                      )}
                      style={{ width: `${Math.round(ratio * 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      className={cn(
                        complete ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"
                      )}
                    >
                      {funnel.boundSteps} de {funnel.stepCount} pasos con fuente
                    </span>
                    <Link
                      href={paths.platform.funnels.configure(funnel.id)}
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <Settings2 className="h-3 w-3" />
                      Fuentes
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section data-tour="funnels-create" className="space-y-2">
        <h3 className="text-sm font-medium">Crear un embudo</h3>
        <FunnelCreateForm templates={templates} />
      </section>

      {pending.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Cobertura de las herramientas del estándar</h3>
          <p className="text-xs text-muted-foreground">
            Lo que cada una cubre hoy en Limitless. Los pasos que dependen de lo que falta
            quedan <strong>sin datos</strong>, nunca en cero.
          </p>
          <div className="rounded-2xl border border-border bg-card p-4 dark:border-glass dark:bg-glass">
            <ul className="space-y-2.5">
              {pending.map((tool) => (
                <li key={tool.id} className="text-xs">
                  <span className="font-medium">{tool.label}</span>
                  <span className="text-muted-foreground"> — {tool.owns}</span>
                  <p className="mt-0.5 text-muted-foreground">{tool.otcNote}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}

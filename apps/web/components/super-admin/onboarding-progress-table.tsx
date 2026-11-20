import Link from "next/link";
import { AlertTriangle, Check, Circle, Minus } from "lucide-react";
import { Badge, Button, GlassPanel, cn } from "@ai-coo/ui";
import type { OrgOnboardingProgress } from "@/lib/super-admin/onboarding-progress";
import { rutasDeAdministracion, type BaseDeAdministracion } from "@/lib/administracion/rutas";

/**
 * A partir de cuántos días una organización trabada en el gate deja de ser
 * "recién creada" y pasa a ser algo para mirar.
 */
const STUCK_AFTER_DAYS = 3;

function GateCell({ org }: { org: OrgOnboardingProgress }) {
  if (!org.applies) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        {org.accountType === "holding"
          ? "Holding — tiene su propio onboarding"
          : "Excluida a mano del onboarding"}
      </span>
    );
  }

  if (!org.state.gate.required) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="h-3 w-3 text-emerald-500" />
        Configuración inicial hecha
      </span>
    );
  }

  const stuck = org.ageInDays >= STUCK_AFTER_DAYS;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        stuck ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
      )}
    >
      <AlertTriangle className="h-3 w-3" />
      {stuck
        ? `Trabada en la configuración inicial hace ${org.ageInDays} días`
        : "Todavía no terminó la configuración inicial"}
    </span>
  );
}

function ChecklistCell({ org }: { org: OrgOnboardingProgress }) {
  const items = org.state.items.filter((i) => i.tier === "checklist");
  const done = items.filter((i) => i.done).length;
  const open = org.state.checklist.open;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {done} de {items.length}
        </span>
      </div>
      {open.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Falta: {open.map((i) => i.label).join(" · ")}
        </p>
      )}
    </div>
  );
}

export function OnboardingProgressTable({
  orgs,
  base,
}: {
  orgs: OrgOnboardingProgress[];
  base?: BaseDeAdministracion;
}) {
  const rutas = rutasDeAdministracion(base);
  if (orgs.length === 0) {
    return (
      <GlassPanel className="p-8 text-center text-sm text-muted-foreground">
        No hay organizaciones con usuarios todavía.
      </GlassPanel>
    );
  }

  return (
    <div className="space-y-3">
      {orgs.map((org) => (
        <GlassPanel key={org.organizationId} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{org.organizationName}</p>
                {org.orgStatus && org.orgStatus !== "active" && (
                  <Badge variant="warning">{org.orgStatus}</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {org.memberCount}{" "}
                  {org.memberCount === 1 ? "usuario" : "usuarios"}
                </span>
              </div>

              {org.founderEmail && (
                <p className="text-xs text-muted-foreground">{org.founderEmail}</p>
              )}

              <GateCell org={org} />
            </div>

            <div className="flex items-start gap-6">
              {/* Sin checklist para las que no aplican: medir embudos e
                  histórico en un holding sería medir lo que no corresponde. */}
              {org.applies && <ChecklistCell org={org} />}
              <Button asChild size="sm" variant="outline">
                <Link href={rutas.organizacion(org.organizationId)}>
                  Ver
                </Link>
              </Button>
            </div>
          </div>

          {org.state.gate.required && org.state.gate.pendingItemIds.length > 0 && (
            <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              <Circle className="mr-1 inline h-2 w-2 fill-current" />
              Pendiente de la configuración inicial:{" "}
              {org.state.items
                .filter((i) => i.tier === "gate" && !i.done)
                .map((i) => i.label)
                .join(" · ")}
            </p>
          )}
        </GlassPanel>
      ))}
    </div>
  );
}

import { loadOnboardingProgress } from "@/lib/super-admin/onboarding-progress";
import { OnboardingProgressTable } from "@/components/super-admin/onboarding-progress-table";
import type { BaseDeAdministracion } from "@/lib/administracion/rutas";

/**
 * En qué punto del onboarding quedó cada organización. La usan el panel viejo
 * y la consola de Administración (SCRUM-551, `base`).
 *
 * Responde una sola pregunta —**quién se trabó y dónde**— y por eso el orden no
 * es alfabético ni por fecha: primero las que no terminaron la configuración
 * inicial, después las que tienen más pendientes, y a igual estado las más
 * viejas.
 */
export async function OnboardingDeClientes({ base }: { base?: BaseDeAdministracion } = {}) {
  const orgs = await loadOnboardingProgress();

  // Los contadores sólo cuentan organizaciones a las que este onboarding le
  // aplica: sumar holdings inflaría el número de "pendientes" con cuentas que
  // tienen otro flujo.
  const applicable = orgs.filter((o) => o.applies);
  const stuck = applicable.filter((o) => o.state.gate.required).length;
  const withOpenItems = applicable.filter((o) => !o.state.checklist.complete).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Onboarding de clientes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ordenado por quién necesita atención primero. Sólo se listan las
          organizaciones con al menos un usuario: una sin gente no puede estar
          trabada.
        </p>
        <p className="mt-2 text-sm">
          <span className="font-medium tabular-nums">{stuck}</span> sin terminar
          la configuración inicial ·{" "}
          <span className="font-medium tabular-nums">{withOpenItems}</span> con
          pasos pendientes · {applicable.length} organizaciones alcanzadas
          {orgs.length > applicable.length && (
            <span className="text-muted-foreground">
              {" "}
              · {orgs.length - applicable.length} con onboarding aparte
            </span>
          )}
        </p>
      </div>

      <OnboardingProgressTable orgs={orgs} base={base} />
    </div>
  );
}

import { AppProviders } from "@/providers";
import { WelcomeGate } from "@/components/platform/welcome-gate";
import { HoldingPlatformProvider } from "@/components/holding/holding-platform-provider";
import { getHoldingSessionState } from "@/lib/holding/session";
import { PlatformLayout } from "@/layouts";
import { getCurrentUserPermissions } from "@/lib/auth/get-current-permissions";
import { PermissionsProvider } from "@/providers/permissions-provider";
import { OnboardingProvider } from "@/providers/onboarding-provider";
import { TourRunner } from "@/components/onboarding/tour-runner";
import { getCurrentOnboardingContext } from "@/lib/onboarding/current";
import { headers } from "next/headers";
import { moduloBloqueadoParaRuta } from "@/lib/auth/acceso-a-modulo";
import { getPermissionModuleLabel } from "@/constants/permission-modules";
import { SinAcceso } from "@/components/platform/sin-acceso";
import { AvisoClaveIa } from "@/components/platform/aviso-clave-ia";
import { zonaDeLaOrganizacionActiva } from "@/lib/fechas/organizacion-activa";
import { ZonaDeLaOrganizacionProvider } from "@/providers/zona-de-la-organizacion-provider";

export default async function PlatformRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [holdingSession, permissions, onboarding, headerList, zona] =
    await Promise.all([
      getHoldingSessionState(),
      getCurrentUserPermissions(),
      // El checklist viene en null para cuentas invitadas; los tours, no.
      getCurrentOnboardingContext(),
      headers(),
      // La zona de la org, una vez para toda la plataforma: el "hoy" y las
      // fechas de los datos de la org se cuentan en ella (SCRUM-493).
      zonaDeLaOrganizacionActiva(),
    ]);

  /**
   * ⭐ El permiso se aplica acá, en el servidor, no sólo escondiendo links.
   *
   * `x-pathname` lo pone el middleware. Antes de este chequeo, alguien sin
   * acceso a Finanzas que tipeaba `/finance` entraba igual: la pantalla se
   * renderizaba entera. Ahora el módulo no llega a renderizarse.
   *
   * La regla (founder siempre pasa, sin rol no se bloquea, rutas sin módulo
   * libres) vive en `moduloBloqueadoParaRuta`. Toda pantalla mapeada en
   * `module-for-path` tiene que colgar de este layout: el test de
   * `module-for-path` recorre `app/` y falla si una queda afuera (SCRUM-18).
   */
  const moduloBloqueado = moduloBloqueadoParaRuta(
    headerList.get("x-pathname") ?? "",
    permissions
  );

  return (
    <ZonaDeLaOrganizacionProvider zona={zona}>
      <AppProviders>
        <PermissionsProvider value={permissions}>
          <HoldingPlatformProvider value={holdingSession}>
            <OnboardingProvider value={onboarding}>
              <WelcomeGate>
                <PlatformLayout>
                  {/*
                  El aviso de la clave de IA vencida va arriba de todo y en
                  todas las pantallas: mientras esté rota, cualquier función de
                  IA que se toque va a fallar, así que no sirve esconderlo en
                  una sola página.
                */}
                  <AvisoClaveIa esFounder={permissions.isFounder} />

                  {moduloBloqueado ? (
                    <SinAcceso
                      moduleLabel={getPermissionModuleLabel(moduloBloqueado)}
                    />
                  ) : (
                    children
                  )}
                </PlatformLayout>
              </WelcomeGate>
              <TourRunner />
            </OnboardingProvider>
          </HoldingPlatformProvider>
        </PermissionsProvider>
      </AppProviders>
    </ZonaDeLaOrganizacionProvider>
  );
}

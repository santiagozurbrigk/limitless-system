import { AppProviders } from "@/providers";
import { WelcomeGate } from "@/components/platform/welcome-gate";
import { HoldingPlatformProvider } from "@/components/holding/holding-platform-provider";
import {
  getHoldingSessionState,
  type HoldingSessionState,
} from "@/lib/holding/session";
import { PlatformLayout } from "@/layouts";
import { getCurrentUserPermissions } from "@/lib/auth/get-current-permissions";
import { PermissionsProvider } from "@/providers/permissions-provider";
import { OnboardingProvider } from "@/providers/onboarding-provider";
import { TourRunner } from "@/components/onboarding/tour-runner";
import {
  getCurrentOnboardingContext,
  type OnboardingContext,
} from "@/lib/onboarding/current";
import { TOUR_IDS } from "@/lib/onboarding/tours";
import { headers } from "next/headers";
import { moduloBloqueadoParaRuta } from "@/lib/auth/acceso-a-modulo";
import { getPermissionModuleLabel } from "@/constants/permission-modules";
import { SinAcceso } from "@/components/platform/sin-acceso";
import { AvisoClaveIa } from "@/components/platform/aviso-clave-ia";
import { zonaDeLaOrganizacionActiva } from "@/lib/fechas/organizacion-activa";
import { ZonaDeLaOrganizacionProvider } from "@/providers/zona-de-la-organizacion-provider";
import { lecturaDegradable } from "@/lib/server/lectura-degradable";

/**
 * Lo que se usa si una lectura secundaria del layout falla (SCRUM-108).
 *
 * - Holding: como una cuenta holding sin negocio activo, la vista más
 *   restrictiva de la barra: sin ningún ítem (ni los módulos ni "Mi Holding"),
 *   sin selector de negocios ni el aviso de "estás viendo X". En la práctica sólo falla la
 *   lectura de una cuenta holding: para el resto `getHoldingSessionState`
 *   termina antes de leer los negocios (y la lectura del perfil no lanza). Si
 *   alguna vez fallara para otra cuenta, perdería los ítems de la barra
 *   (las pantallas siguen por URL con los permisos de siempre, y `/holding` la
 *   devuelve al panel): esconder de más es seguro, mostrar de más no. Qué org
 *   se lee no cambia: lo sigue resolviendo `requireOrganizationId` con la
 *   cookie del negocio activo.
 * - Onboarding: sin checklist y con todos los tours vistos, para que no se
 *   lance un tour (que además intentaría guardar en la base caída).
 * - Zona: `null`, la zona por defecto (`ZONA_HORARIA_POR_DEFECTO`), lo mismo
 *   que una org que todavía no la eligió.
 */
const HOLDING_SI_FALLA: HoldingSessionState = {
  isHolding: true,
  viewingBusiness: false,
  businesses: [],
};
const ONBOARDING_SI_FALLA: OnboardingContext = {
  state: null,
  toursSeen: [...TOUR_IDS],
};

export default async function PlatformRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /**
   * ⭐ Imprescindibles y degradables (SCRUM-108).
   *
   * Los permisos y los headers son imprescindibles: sin ellos no se puede
   * decidir qué pantalla ve cada uno. Nunca se reemplazan por un valor por
   * defecto, que abriría el acceso: `getCurrentUserPermissions` lanza
   * `FallaDeLaBase` si una de sus lecturas (Auth con un error que no es de
   * sesión, `profiles`,
   * `enabled_add_ons`, `team_roles`) devuelve error, y el layout cae en
   * `global-error`. Antes se tragaba ese error y quedaba "sin rol", sin
   * bloqueo por módulo (riesgo R1); lo prueba
   * `layout-plataforma-permisos-caidos.test.ts` con la función real.
   *
   * Holding, onboarding y zona son degradables: si fallan se registran en
   * Sentry (`lectura_degradada`) y la plataforma sigue con el valor de arriba.
   * Una sesión no válida o una cuenta desactivada no se degradan: se relanzan.
   */
  const [holdingSession, permissions, onboarding, headerList, zona] =
    await Promise.all([
      lecturaDegradable(
        "layout-plataforma:holding",
        getHoldingSessionState,
        HOLDING_SI_FALLA
      ),
      getCurrentUserPermissions(),
      // El checklist viene en null para cuentas invitadas; los tours, no.
      lecturaDegradable(
        "layout-plataforma:onboarding",
        getCurrentOnboardingContext,
        ONBOARDING_SI_FALLA
      ),
      headers(),
      // La zona de la org, una vez para toda la plataforma: el "hoy" y las
      // fechas de los datos de la org se cuentan en ella (SCRUM-493).
      lecturaDegradable(
        "layout-plataforma:zona",
        zonaDeLaOrganizacionActiva,
        null
      ),
    ]);

  /**
   * ⭐ El permiso se aplica acá, en el servidor, no sólo escondiendo links.
   *
   * `x-pathname` lo pone el middleware. Con este chequeo, alguien sin acceso a
   * Finanzas que tipea `/finance` ve `SinAcceso` en lugar de la pantalla.
   *
   * El layout decide qué se dibuja, nada más: Next ejecuta la página del
   * segmento aunque acá no se use `children`, y en una navegación del cliente
   * este layout no se vuelve a ejecutar. Una lectura que no tiene que llegarle
   * a alguien sin el módulo chequea el permiso por su cuenta, como
   * `getIntelligenceSnapshotAction` con `rechazoPorModulo`.
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

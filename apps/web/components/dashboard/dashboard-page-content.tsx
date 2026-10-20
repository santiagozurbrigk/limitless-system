"use client";

import type { ZernioAnalyticsSummary } from "@/app/integrations/zernio/actions";
import type { ComputedCustomMetric } from "@/lib/metrics/custom-metrics";
import type { DatosDelPanel } from "@/lib/dashboard/datos-del-panel";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { DashboardOverview } from "./dashboard-overview";
import { AvisoDeLecturaFallida } from "@/components/shared/aviso-de-lectura-fallida";
import { ERROR_INESPERADO } from "@/lib/client/correr-accion";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePermisosDeModulo } from "@/providers/permissions-provider";
import { suscribirPanelEnVivo } from "@/lib/dashboard/panel-en-vivo";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * El Panel con sus totales ya calculados en el servidor (SCRUM-540): la página
 * lee y calcula (`leerDatosDelPanel`) y acá sólo se dibuja. Antes este
 * componente pedía al marco cada cliente, conversación, llamada, gasto, sueldo
 * y cobro y calculaba en el navegador.
 */
export function DashboardPageContent({
  datos,
  organizationId = null,
  pagosSinLeer = false,
  zernioAnalytics = {
    totalImpressions: 0,
    totalLikes: 0,
    totalComments: 0,
    hasData: false,
  },
}: {
  datos: DatosDelPanel;
  organizationId?: string | null;
  pagosSinLeer?: boolean;
  zernioAnalytics?: ZernioAnalyticsSummary;
  customMetrics?: ComputedCustomMetric[];
}) {
  // En vivo (SCRUM-540): con permiso para leer conversaciones, una conversación
  // nueva o cambiada vuelve a pedir el Panel al servidor. Sin ese permiso no se
  // abre el canal (`suscribirPanelEnVivo`).
  const router = useRouter();
  const permisos = usePermisosDeModulo();
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const cortar = suscribirPanelEnVivo({
      permisos,
      organizationId,
      cliente: createClient,
      alCambiar: () => router.refresh(),
    });
    return cortar ?? undefined;
  }, [permisos, organizationId, router]);

  /*
   * El checklist va acá y no dentro de `DashboardOverview` porque ese
   * componente hace un early return al empty state — que es justo donde cae una
   * organización recién configurada, o sea el momento en que el checklist más
   * hace falta.
   */
  return (
    <div className="space-y-6">
      <SetupChecklist />
      {pagosSinLeer ? (
        <AvisoDeLecturaFallida
          titulo="No se pudieron cargar los pagos: lo cobrado no está al día."
          motivo={ERROR_INESPERADO}
        />
      ) : null}
      <DashboardOverview data={datos.data} embudo={datos.embudo} zernioAnalytics={zernioAnalytics} />
    </div>
  );
}

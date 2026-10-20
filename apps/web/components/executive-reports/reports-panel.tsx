"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Sparkles } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@ai-coo/ui";
import { getLatestReportsByCadenceAction } from "@/app/executive-reports/actions";
import { usePermisosDeModulo } from "@/providers/permissions-provider";
import { leerDelMarco } from "@/lib/auth/lecturas-del-marco";
import { ReportBody } from "./report-body";
import { REPORT_CADENCES } from "@/lib/executive-reports/cadences";
import { paths } from "@/routes/paths";
import type { ExecutiveReport, ReportPeriod } from "@/types/executive-reports";

/**
 * Panel de reportes ejecutivos.
 *
 * ⭐ **Por qué es un panel y no un módulo del navbar.** Un reporte automático se
 * lee y se cierra: no es un lugar donde uno *trabaja*, y ocupar un renglón del
 * navbar con algo que se abre una vez por día lo pondría al mismo nivel que
 * Clientes o Marketing. Vive detrás de un ícono en la isla derecha de la barra
 * de navegación, disponible desde cualquier pantalla y sin costo visual cuando
 * no se usa.
 *
 * ⭐ **Por qué el punto no es un contador.** Marca que hay un reporte que este
 * navegador no vio, y se guarda en `localStorage`. Es a propósito una comodidad
 * local y no un dato de servidor: no hace falta una tabla de "leídos" para algo
 * cuyo peor caso es volver a ver un punto que ya se había apagado.
 *
 * **Por qué se trae sus propios datos.** El shell de la plataforma es client
 * hasta arriba, así que no hay dónde hacer la consulta del lado del servidor sin
 * atravesar dos componentes con props que no les incumben. Vive en el layout, o
 * sea que monta una vez por sesión y no en cada navegación: es una consulta
 * indexada, una vez.
 */

const SEEN_KEY = "limitless:last-seen-report";
/** Nombre previo al rebranding. Se lee una vez para no marcar todo como nuevo. */
const LEGACY_SEEN_KEY = "otc:last-seen-report";

/** Lee la marca sin romperse si el navegador bloquea el almacenamiento. */
function readLastSeen(): string | null {
  try {
    return (
      window.localStorage.getItem(SEEN_KEY) ??
      window.localStorage.getItem(LEGACY_SEEN_KEY)
    );
  } catch {
    return null;
  }
}

function writeLastSeen(id: string): void {
  try {
    window.localStorage.setItem(SEEN_KEY, id);
  } catch {
    // Modo privado o almacenamiento bloqueado: el punto va a volver a aparecer
    // en la próxima visita. Es molesto, no roto.
  }
}

const SIN_REPORTES: Record<ReportPeriod, ExecutiveReport | null> = {
  daily: null,
  weekly: null,
  monthly: null,
};

export function ReportsPanel() {
  const [open, setOpen] = useState(false);
  const [hasUnseen, setHasUnseen] = useState(false);
  const [reports, setReports] =
    useState<Record<ReportPeriod, ExecutiveReport | null>>(SIN_REPORTES);

  // Los reportes son de Operaciones: sin el módulo no se piden (SCRUM-540) y,
  // sin reportes, el botón no aparece.
  const permisos = usePermisosDeModulo();

  useEffect(() => {
    let vigente = true;
    leerDelMarco(permisos, "reportesEjecutivos", getLatestReportsByCadenceAction, SIN_REPORTES)
      .then((data) => {
        if (vigente) setReports(data);
      })
      .catch(() => {
        // Sin reportes que mostrar, el botón simplemente no aparece.
      });
    return () => {
      vigente = false;
    };
  }, [permisos]);

  // El reporte más reciente de cualquier cadencia es el que enciende el punto.
  const newest = REPORT_CADENCES.map((c) => reports[c.id])
    .filter((r): r is ExecutiveReport => r !== null)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];

  useEffect(() => {
    if (!newest) return;
    setHasUnseen(readLastSeen() !== newest.id);
  }, [newest]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && newest) {
      writeLastSeen(newest.id);
      setHasUnseen(false);
    }
  }

  // Sin ningún reporte todavía, el ícono no aparece: un botón que sólo puede
  // mostrar un vacío es ruido en la barra.
  if (!newest) return null;

  const defaultTab: ReportPeriod = reports.daily
    ? "daily"
    : reports.weekly
      ? "weekly"
      : "monthly";

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="topbar-icon relative h-8 w-8 rounded-lg"
        type="button"
        onClick={() => handleOpenChange(true)}
        title="Reportes ejecutivos"
        aria-label="Reportes ejecutivos"
      >
        <FileText className="h-4 w-4" />
        {hasUnseen ? (
          <span
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary"
            aria-hidden
          />
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        {/*
          `flex flex-col gap-0 p-0` pisa el `grid gap-4 p-6` que trae
          DialogContent por defecto. Sin eso la columna no arma y el contenido
          se desborda en vez de scrollear adentro.
        */}
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Reportes ejecutivos
            </DialogTitle>
            <DialogDescription className="text-xs">
              Los genera la IA sola, con los datos de tu operación. No hay nada
              que apretar.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue={defaultTab} className="flex min-h-0 flex-1 flex-col">
            <div className="px-6 pt-4">
              <TabsList className="w-full">
                {REPORT_CADENCES.map((cadence) => (
                  <TabsTrigger
                    key={cadence.id}
                    value={cadence.id}
                    className="flex-1 gap-1.5"
                  >
                    {cadence.label}
                    {reports[cadence.id] === null ? (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {REPORT_CADENCES.map((cadence) => {
              const report = reports[cadence.id];
              return (
                <TabsContent
                  key={cadence.id}
                  value={cadence.id}
                  className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4"
                >
                  <p className="mb-4 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{cadence.title}</span>
                    {" · "}
                    {cadence.watches}
                    {" · "}
                    {cadence.schedule}
                  </p>

                  {report ? (
                    <ReportBody report={report} compact />
                  ) : (
                    <p className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                      Todavía no se generó ningún reporte {cadence.label.toLowerCase()}.
                      Se crea solo {cadence.schedule.toLowerCase()}, cuando haya
                      datos suficientes de tu operación.
                    </p>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>

          <div className="shrink-0 border-t border-border px-6 py-3">
            <Link
              href={paths.platform.executiveReports.history}
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Ver todos los reportes anteriores
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@ai-coo/ui";
import { Calendar, CheckCircle2, RefreshCw, Unplug } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  getMyCalendlyIntegrationAction,
  disconnectMyCalendlyAction,
  syncCloserCalendlyAction,
} from "@/app/sales/closer-actions";
import { useToast } from "@/providers/toast-provider";
import { formatRelativeTime } from "@/lib/format";
import { correrMutacion, leerConMotivo, type Aviso, type Lectura } from "@/lib/client/correr-accion";

/**
 * Sincroniza el Calendly del closer actual (SCRUM-504). Un rechazo esperable
 * (conexión vencida, Calendly que limita las consultas) se avisa con su
 * motivo; si la acción lanza, con el texto fijo. Con éxito avisa los números y
 * llama a `alSincronizar`.
 */
export function sincronizarMiCalendly(
  avisar: (aviso: Aviso) => void,
  alSincronizar: () => void | Promise<void>
): Promise<void> {
  return correrMutacion({
    accion: () => syncCloserCalendlyAction(),
    avisar,
    tituloError: "Error al sincronizar",
    etiqueta: "[CloserCalendlySettings] sincronizar",
    alExito: async (result) => {
      avisar({
        title: `Sync completado: ${result.inserted} nuevas, ${result.updated} actualizadas`,
        variant: "success",
      });
      await alSincronizar();
    },
  });
}

/** Desconecta el Calendly del closer actual; avisa el motivo si no se pudo. */
export function desconectarMiCalendly(
  avisar: (aviso: Aviso) => void,
  alDesconectar: () => void
): Promise<void> {
  return correrMutacion({
    accion: disconnectMyCalendlyAction,
    avisar,
    tituloError: "Error al desconectar",
    etiqueta: "[CloserCalendlySettings] desconectar",
    alExito: () => {
      alDesconectar();
      avisar({ title: "Calendly desconectado", variant: "success" });
    },
  });
}

/** El estado del Calendly propio, o el motivo si no se pudo leer. */
export function cargarEstadoDeMiCalendly(): Promise<
  Lectura<{ connected: boolean; calendlyUserUri?: string; lastSyncAt?: string }>
> {
  return leerConMotivo(getMyCalendlyIntegrationAction, "[CloserCalendlySettings] estado");
}

/** Lo que se ve si no se pudo leer el estado: ni "conectado" ni "No conectado". */
export function EstadoDeCalendlySinLeer({ motivo }: { motivo: string }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Calendly personal</h3>
      <p className="text-sm text-destructive" role="alert">
        No se pudo leer el estado de tu Calendly. {motivo}
      </p>
    </div>
  );
}

export function CloserCalendlySettings() {
  const { push } = useToast();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<{
    connected: boolean;
    calendlyUserUri?: string;
    lastSyncAt?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, startSync] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  useEffect(() => {
    // Manejar resultado del OAuth callback
    const result = searchParams.get("calendly_closer");
    if (result === "connected") {
      push({ title: "Calendly conectado correctamente", variant: "success" });
    } else if (result === "token_error") {
      push({ title: "Error al obtener el token de Calendly. Intentá de nuevo." });
    } else if (result === "uri_error") {
      push({ title: "No se pudo obtener tu usuario de Calendly. Intentá de nuevo." });
    } else if (result === "save_error") {
      push({ title: "Error al guardar la integración. Intentá de nuevo." });
    }
  }, [searchParams, push]);

  // Por qué no se pudo leer el estado (AR de SCRUM-504, MENOR-4): antes una
  // falla se mostraba como "No conectado" y ofrecía conectar.
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    void cargarEstadoDeMiCalendly().then((lectura) => {
      if (lectura.ok) setStatus(lectura.data);
      else setStatusError(lectura.motivo);
      setLoading(false);
    });
  }, []);

  function handleConnect() {
    window.location.href = "/api/integrations/calendly/closer/start";
  }

  function handleSync() {
    startSync(() =>
      sincronizarMiCalendly(push, async () => {
        // Refrescar status. La sync ya terminó bien: si esto falla, queda lo
        // que se veía (y la falla, en la consola o en Sentry).
        const lectura = await cargarEstadoDeMiCalendly();
        if (lectura.ok) setStatus(lectura.data);
      })
    );
  }

  function handleDisconnect() {
    startDisconnect(() =>
      desconectarMiCalendly(push, () => setStatus({ connected: false }))
    );
  }

  if (!loading && statusError) {
    return <EstadoDeCalendlySinLeer motivo={statusError} />;
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-20 rounded-xl bg-muted/40 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">
          Calendly personal
        </h3>
        <p className="text-xs text-muted-foreground">
          Conectá tu calendario de Calendly para que el sistema asigne tus llamadas de cierre automáticamente.
        </p>
      </div>

      {status?.connected ? (
        <div className="rounded-xl border border-border/40 bg-card/60 p-5 space-y-4">
          {/* Estado conectado */}
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Calendly conectado</p>
              {status.calendlyUserUri && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {status.calendlyUserUri}
                </p>
              )}
              {status.lastSyncAt && (
                <p className="text-xs text-muted-foreground mt-1">
                  Último sync: {formatRelativeTime(status.lastSyncAt)}
                </p>
              )}
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSync}
              disabled={syncing}
              className="gap-2"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar ahora"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="gap-2 text-destructive hover:text-destructive"
            >
              <Unplug className="h-3.5 w-3.5" />
              {disconnecting ? "Desconectando..." : "Desconectar"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border/40 bg-card/60 p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground mb-1">
                No conectado
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Conectá tu Calendly para que el sistema registre tus llamadas y las asigne a tu nombre automáticamente.
              </p>
              <Button size="sm" onClick={handleConnect} className="gap-2">
                <Calendar className="h-3.5 w-3.5" />
                Conectar Calendly
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-muted/30 border border-border/30 p-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground/70">¿Cómo funciona?</span>{" "}
          Al conectar tu Calendly, el sistema sincroniza automáticamente tus llamadas agendadas y las asigna a tu perfil. Los análisis de IA, métricas de conversión y comisiones se calculan por cada closer individualmente.
        </p>
      </div>
    </div>
  );
}

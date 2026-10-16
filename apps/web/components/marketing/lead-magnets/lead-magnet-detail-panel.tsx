"use client";

import { useEffect, useState, useTransition } from "react";
import { GlassPanel, Button, Badge, cn } from "@ai-coo/ui";
import {
  CheckCircle2,
  ExternalLink,
  Trash2,
  TrendingUp,
  Users,
  Clock,
  RefreshCw,
} from "lucide-react";
import {
  getLeadMagnetLeadsAction,
  updateLeadMagnetAction,
  deleteLeadMagnetAction,
  type LeadMagnet,
  type LeadMagnetLead,
} from "@/app/marketing/lead-magnets-actions";
import { useToast } from "@/providers/toast-provider";
import { formatRelativeTime } from "@/lib/format";
import {
  correrMutacion,
  leerConMotivo,
  type Aviso,
  type Lectura,
} from "@/lib/client/correr-accion";

/**
 * Los leads del lead magnet o el motivo para el usuario (SCRUM-520). Antes una
 * falla de la base llegaba como lista vacía: "Todavía no hay leads registrados".
 */
export function cargarLeadsDelLeadMagnet(leadMagnetId: string): Promise<Lectura<LeadMagnetLead[]>> {
  return leerConMotivo(() => getLeadMagnetLeadsAction(leadMagnetId), "[LeadMagnetDetailPanel] leads");
}

/**
 * Pausa o activa el lead magnet. Con éxito avisa y llama a `alExito`; con un
 * error avisa el motivo (antes la acción lanzaba y en producción el aviso era
 * el párrafo técnico de Next).
 */
export function cambiarEstadoDelLeadMagnet(
  leadMagnetId: string,
  estado: "active" | "paused",
  avisar: (aviso: Aviso) => void,
  alExito: () => void
): Promise<void> {
  return correrMutacion({
    accion: () => updateLeadMagnetAction(leadMagnetId, { status: estado }),
    alExito: () => {
      avisar({
        title: estado === "paused" ? "Lead Magnet pausado" : "Lead Magnet activado",
        variant: "success",
      });
      alExito();
    },
    avisar,
    tituloError: "Error",
    etiqueta: "[LeadMagnetDetailPanel] pausar o activar",
  });
}

/**
 * Archiva el lead magnet. Antes la acción no miraba el resultado y la pantalla
 * decía "Lead Magnet eliminado" aunque no se hubiera archivado (SCRUM-520).
 */
export function eliminarLeadMagnet(
  leadMagnetId: string,
  avisar: (aviso: Aviso) => void,
  alExito: () => void
): Promise<void> {
  return correrMutacion({
    accion: () => deleteLeadMagnetAction(leadMagnetId),
    alExito: () => {
      avisar({ title: "Lead Magnet eliminado", variant: "success" });
      alExito();
    },
    avisar,
    tituloError: "Error al eliminar",
    etiqueta: "[LeadMagnetDetailPanel] eliminar",
  });
}

function LeadRow({ lead }: { lead: LeadMagnetLead }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/60 text-xs font-medium text-muted-foreground shrink-0">
        {(lead.name ?? lead.email ?? "?")[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {lead.name ?? lead.email ?? "Sin nombre"}
        </p>
        {lead.email && lead.name && (
          <p className="text-xs text-muted-foreground truncate">{lead.email}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {formatRelativeTime(lead.capturedAt)}
        </p>
      </div>
      {lead.attributedClientId ? (
        <div className="flex items-center gap-1 shrink-0">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <div className="text-right">
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 truncate max-w-[100px]">
              {lead.attributedClientName ?? "Cliente"}
            </p>
            {lead.attributedRevenue && lead.attributedRevenue > 0 && (
              <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 tabular-nums">
                ${lead.attributedRevenue.toLocaleString("es-AR")}
              </p>
            )}
          </div>
        </div>
      ) : (
        <span className="text-[10px] text-muted-foreground shrink-0">Sin conversión</span>
      )}
    </div>
  );
}

export function LeadMagnetDetailPanel({
  leadMagnet,
  onUpdated,
}: {
  leadMagnet: LeadMagnet;
  onUpdated: () => void;
}) {
  const { push } = useToast();
  const [leads, setLeads] = useState<LeadMagnetLead[]>([]);
  const [motivoDeLeads, setMotivoDeLeads] = useState<string | null>(null);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [, startAction] = useTransition();

  useEffect(() => {
    setLoadingLeads(true);
    setMotivoDeLeads(null);
    void cargarLeadsDelLeadMagnet(leadMagnet.id)
      .then((lectura) => {
        if (lectura.ok) setLeads(lectura.data);
        else {
          setLeads([]);
          setMotivoDeLeads(lectura.motivo);
        }
      })
      .finally(() => setLoadingLeads(false));
  }, [leadMagnet.id]);

  function handleTogglePause() {
    startAction(async () => {
      const newStatus = leadMagnet.status === "paused" ? "active" : "paused";
      await cambiarEstadoDelLeadMagnet(leadMagnet.id, newStatus, push, onUpdated);
    });
  }

  function handleDelete() {
    startAction(async () => {
      await eliminarLeadMagnet(leadMagnet.id, push, onUpdated);
    });
  }

  const convRate =
    leadMagnet.totalLeads > 0
      ? Math.round((leadMagnet.totalAttributedClients / leadMagnet.totalLeads) * 100)
      : 0;

  const avgRevenue =
    leadMagnet.totalAttributedClients > 0
      ? Math.round(leadMagnet.totalRevenue / leadMagnet.totalAttributedClients)
      : 0;

  return (
    <GlassPanel className="p-5 space-y-5 h-fit">
      {/* Header del LM */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground leading-snug">{leadMagnet.name}</h3>
          {leadMagnet.status === "paused" && (
            <Badge variant="secondary" className="text-[10px] shrink-0">Pausado</Badge>
          )}
        </div>
        {leadMagnet.description && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{leadMagnet.description}</p>
        )}
        {leadMagnet.assetUrl && (
          <a
            href={leadMagnet.assetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Ver recurso
          </a>
        )}
      </div>

      {/* Métricas clave */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/30 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wide font-medium">Leads</span>
          </div>
          <p className="text-lg font-semibold tabular-nums">{leadMagnet.totalLeads}</p>
          <p className="text-[10px] text-muted-foreground">{leadMagnet.totalAttributedClients} convertidos</p>
        </div>
        <div className="rounded-xl bg-muted/30 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wide font-medium">Conversión</span>
          </div>
          <p className={cn("text-lg font-semibold tabular-nums", convRate >= 10 && "text-emerald-500")}>
            {convRate}%
          </p>
          {avgRevenue > 0 && (
            <p className="text-[10px] text-muted-foreground">
              ${avgRevenue.toLocaleString("es-AR")} promedio
            </p>
          )}
        </div>
        {leadMagnet.totalRevenue > 0 && (
          <div className="col-span-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 space-y-0.5">
            <p className="text-[10px] uppercase tracking-wide font-medium text-emerald-600 dark:text-emerald-400">
              Revenue atribuido
            </p>
            <p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              ${leadMagnet.totalRevenue.toLocaleString("es-AR")}
            </p>
          </div>
        )}
      </div>

      {/* Leads recientes */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Leads recientes
        </h4>
        {loadingLeads ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : motivoDeLeads ? (
          <div className="flex flex-col items-center gap-1 py-6 text-center">
            <p className="text-xs font-medium text-foreground">No se pudieron cargar los leads</p>
            <p className="text-xs text-muted-foreground">{motivoDeLeads}</p>
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Clock className="h-5 w-5 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">Todavía no hay leads registrados para este LM</p>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {leads.slice(0, 20).map((lead) => (
              <LeadRow key={lead.id} lead={lead} />
            ))}
            {leads.length > 20 && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                +{leads.length - 20} más
              </p>
            )}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-2 border-t border-border/30 pt-4">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 gap-1.5"
          onClick={handleTogglePause}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {leadMagnet.status === "paused" ? "Activar" : "Pausar"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-destructive hover:text-destructive"
          onClick={handleDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Eliminar
        </Button>
      </div>
    </GlassPanel>
  );
}

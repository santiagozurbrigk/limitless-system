"use client";

import { useState, useTransition } from "react";
import { GlassPanel, Button, cn, Badge } from "@ai-coo/ui";
import {
  BookOpen,
  ExternalLink,
  FileText,
  Instagram,
  LayoutDashboard,
  Link2,
  Megaphone,
  Monitor,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  Video,
  Zap,
} from "lucide-react";
import {
  getLeadMagnetsAction,
  type LeadMagnet,
  type LeadMagnetChannel,
  type LeadMagnetType,
} from "@/app/marketing/lead-magnets-actions";
import { useToast } from "@/providers/toast-provider";
import { correrMutacion, type Aviso } from "@/lib/client/correr-accion";
import { LeadMagnetFormModal } from "./lead-magnet-form-modal";
import { LeadMagnetDetailPanel } from "./lead-magnet-detail-panel";
import { FunnelChartPanel } from "@/components/charts/platform/funnel-chart-panel";
import { RingDistributionChart } from "@/components/charts/platform/ring-distribution-chart";
import { brand, brandColors } from "@/lib/brand";

// ─── Helpers visuales ─────────────────────────────────────────────────────────

const TYPE_ICON: Record<LeadMagnetType, React.ElementType> = {
  documento: FileText,
  loom: Video,
  dashboard: LayoutDashboard,
  landing: Monitor,
  otro: BookOpen,
};

const TYPE_LABEL: Record<LeadMagnetType, string> = {
  documento: "Documento",
  loom: "Loom / Video",
  dashboard: "Dashboard",
  landing: "Landing page",
  otro: "Otro",
};

const CHANNEL_LABEL: Record<LeadMagnetChannel, string> = {
  manychat: "ManyChat",
  typeform: "Typeform",
  google_forms: "Google Forms",
  landing: "Landing",
  instagram_dm: "DM Instagram",
  manual: "Manual",
};

const CHANNEL_ICON: Record<LeadMagnetChannel, React.ElementType> = {
  manychat: Zap,
  typeform: FileText,
  google_forms: FileText,
  landing: Monitor,
  instagram_dm: Instagram,
  manual: Users,
};

// ─── Lead Magnet Card ─────────────────────────────────────────────────────────

function LeadMagnetCard({
  lm,
  selected,
  onClick,
}: {
  lm: LeadMagnet;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = TYPE_ICON[lm.type];
  const ChannelIcon = CHANNEL_ICON[lm.channel];
  const convRate =
    lm.totalLeads > 0
      ? Math.round((lm.totalAttributedClients / lm.totalLeads) * 100)
      : 0;

  return (
    <GlassPanel
      className={cn(
        "p-4 cursor-pointer transition-all space-y-3",
        selected && "ring-2 ring-primary/40"
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{lm.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ChannelIcon className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {CHANNEL_LABEL[lm.channel]}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-xs text-muted-foreground">{TYPE_LABEL[lm.type]}</span>
          </div>
        </div>
        {lm.status === "paused" && (
          <Badge variant="secondary" className="text-[10px] shrink-0">Pausado</Badge>
        )}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2 border-t border-border/30 pt-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Leads</p>
          <p className="text-sm font-semibold tabular-nums">{lm.totalLeads}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Conversión</p>
          <p className={cn("text-sm font-semibold tabular-nums", convRate >= 10 && "text-emerald-500")}>
            {convRate}%
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Revenue</p>
          <p className={cn("text-sm font-semibold tabular-nums", lm.totalRevenue > 0 && "text-emerald-500")}>
            {lm.totalRevenue > 0 ? `$${lm.totalRevenue.toLocaleString("es-AR")}` : "—"}
          </p>
        </div>
      </div>
    </GlassPanel>
  );
}

// ─── Card Próximamente ────────────────────────────────────────────────────────

function ComingSoonCard({ title, description, icon: Icon }: { title: string; description: string; icon: React.ElementType }) {
  return (
    <GlassPanel className="p-4 opacity-60 space-y-3 border-dashed">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/60 shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Próximamente
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
    </GlassPanel>
  );
}

// ─── Vista principal ──────────────────────────────────────────────────────────

/**
 * Recarga la lista. Con un error avisa el motivo (o el texto fijo si la acción
 * lanzó); antes el error volvía como lista y la pantalla quedaba vacía
 * (SCRUM-520).
 */
export function recargarLeadMagnets(
  avisar: (aviso: Aviso) => void,
  alExito: (lista: LeadMagnet[]) => void
): Promise<void> {
  return correrMutacion({
    accion: getLeadMagnetsAction,
    alExito,
    avisar,
    tituloError: "Error al recargar lead magnets",
    etiqueta: "[LeadMagnetsOverview] recargar",
  });
}

export function LeadMagnetsOverview({
  initialLeadMagnets,
}: {
  initialLeadMagnets: LeadMagnet[];
}) {
  const { push } = useToast();
  const [lms, setLms] = useState<LeadMagnet[]>(initialLeadMagnets);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialLeadMagnets[0]?.id ?? null
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [, startRefresh] = useTransition();

  function refresh() {
    startRefresh(async () => {
      await recargarLeadMagnets(push, setLms);
    });
  }

  const selected = lms.find((l) => l.id === selectedId) ?? null;

  // Totales del equipo
  const totalLeads = lms.reduce((s, l) => s + l.totalLeads, 0);
  const totalClients = lms.reduce((s, l) => s + l.totalAttributedClients, 0);
  const totalRevenue = lms.reduce((s, l) => s + l.totalRevenue, 0);
  const globalConv = totalLeads > 0 ? Math.round((totalClients / totalLeads) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Lead Magnets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestioná tus recursos gratuitos y medí cuántos leads convierten en clientes
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2 shrink-0">
          <Plus className="h-3.5 w-3.5" />
          Nuevo LM
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" id="lm-summary">
        {[
          { icon: Megaphone, label: "Lead Magnets", value: lms.length },
          { icon: Users, label: "Leads captados", value: totalLeads },
          { icon: TrendingUp, label: "Conversión global", value: `${globalConv}%` },
          {
            icon: Link2,
            label: "Revenue atribuido",
            value: totalRevenue > 0 ? `$${totalRevenue.toLocaleString("es-AR")}` : "—",
          },
        ].map(({ icon: Icon, label, value }) => (
          <GlassPanel key={label} className="px-4 py-3 flex items-center gap-3">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
              <p className="text-base font-semibold tabular-nums">{value}</p>
            </div>
          </GlassPanel>
        ))}
      </div>

      {/* Gráficos: embudo de conversión + distribución por canal */}
      {lms.length > 0 && (totalLeads > 0 || totalClients > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Embudo leads → clientes */}
          <GlassPanel className="p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Embudo de conversión</p>
              <p className="text-xs text-muted-foreground">De leads a clientes atribuidos</p>
            </div>
            <FunnelChartPanel
              orientation="horizontal"
              color="hsl(var(--primary))"
              stages={[
                { label: "Leads captados", value: totalLeads },
                { label: "Clientes", value: totalClients },
              ].filter((s) => s.value > 0)}
              style={{ minHeight: 160, aspectRatio: "2.8 / 1" }}
              className="min-h-[160px]"
            />
          </GlassPanel>

          {/* Distribución por canal */}
          <GlassPanel className="p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Leads por canal</p>
              <p className="text-xs text-muted-foreground">Distribución de captación</p>
            </div>
            {(() => {
              const byChannel = lms.reduce<Record<string, number>>((acc, lm) => {
                acc[lm.channel] = (acc[lm.channel] ?? 0) + lm.totalLeads;
                return acc;
              }, {});
              const channelColors: Record<string, string> = {
                manychat: brandColors.primary,
                typeform: "#0F6E56",
                google_forms: "#185FA5",
                landing: "#D97706",
                instagram_dm: "#E11D48",
                manual: "#64748B",
              };
              const slices = Object.entries(byChannel)
                .filter(([, v]) => v > 0)
                .map(([key, value]) => ({
                  label: CHANNEL_LABEL[key as LeadMagnetChannel] ?? key,
                  value,
                  color: channelColors[key] ?? "#94A3B8",
                }));
              return (
                <div className="flex items-center gap-4">
                  <RingDistributionChart
                    slices={slices}
                    centerValue={totalLeads.toString()}
                    centerLabel="Leads"
                    className="max-w-[160px]"
                    emptyMessage="Sin leads registrados"
                  />
                  <div className="flex-1 space-y-2">
                    {slices.map((s) => (
                      <div key={s.label} className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                        <span className="text-xs text-muted-foreground flex-1 truncate">{s.label}</span>
                        <span className="text-xs font-semibold tabular-nums">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </GlassPanel>
        </div>
      )}

      <div className={lms.length === 0 ? "space-y-4" : "grid gap-6 lg:grid-cols-[1fr_380px]"}>
        {/* Lista */}
        <div className="space-y-4">
          {lms.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center w-full">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40">
                <Megaphone className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Sin lead magnets registrados</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Creá tu primer LM para empezar a medir su impacto en ventas
                </p>
              </div>
              <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
                <Plus className="h-3.5 w-3.5" />
                Crear primer LM
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {lms.map((lm) => (
                <LeadMagnetCard
                  key={lm.id}
                  lm={lm}
                  selected={selectedId === lm.id}
                  onClick={() => setSelectedId(lm.id)}
                />
              ))}
            </div>
          )}

          {/* Próximamente */}
          <div className="pt-2 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
              Próximas funciones
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <ComingSoonCard
                icon={Sparkles}
                title="Crear LM con IA"
                description={`Generá landing pages, formularios y entregas automáticas desde ${brand.name}, sin salir de la plataforma.`}
              />
              <ComingSoonCard
                icon={Zap}
                title="Automatización de entrega"
                description={`Configurá flows de ManyChat y respuestas automáticas de WhatsApp directamente desde ${brand.name}.`}
              />
              <ComingSoonCard
                icon={ExternalLink}
                title="Links de seguimiento propios"
                description={`${brand.name} genera un link de redirección para cada LM que trackea cada apertura y click en tiempo real.`}
              />
            </div>
          </div>
        </div>

        {/* Panel de detalle */}
        {selected && (
          <LeadMagnetDetailPanel
            leadMagnet={selected}
            onUpdated={refresh}
          />
        )}
      </div>

      <LeadMagnetFormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(newLm) => {
          setLms((prev) => [newLm, ...prev]);
          setSelectedId(newLm.id);
          setCreateOpen(false);
        }}
      />
    </div>
  );
}

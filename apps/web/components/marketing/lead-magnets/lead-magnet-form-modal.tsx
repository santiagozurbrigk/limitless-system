"use client";

import { useState, useTransition } from "react";
import { Button } from "@ai-coo/ui";
import { X } from "lucide-react";
import {
  createLeadMagnetAction,
  getLeadMagnetsAction,
  type CreateLeadMagnetInput,
  type LeadMagnet,
  type LeadMagnetChannel,
  type LeadMagnetType,
} from "@/app/marketing/lead-magnets-actions";
import { listAutomationFlowsAction } from "@/app/marketing/automations-actions";
import { useToast } from "@/providers/toast-provider";
import { brand } from "@/lib/brand";
import { canalesDeLeadMagnetVisibles } from "@/lib/marketing/lead-magnet-canales";

const TYPES: { value: LeadMagnetType; label: string }[] = [
  { value: "documento", label: "Documento / PDF" },
  { value: "loom", label: "Loom / Video" },
  { value: "dashboard", label: "Dashboard / Mini-sistema" },
  { value: "landing", label: "Landing page" },
  { value: "otro", label: "Otro" },
];

const ALL_CHANNELS: { value: LeadMagnetChannel; label: string; description: string }[] = [
  { value: "manychat", label: "ManyChat", description: "El LM se entrega por un flujo de ManyChat" },
  { value: "instagram_dm", label: "DM Instagram", description: `Se envía por DM manualmente (${brand.name} lo detecta automáticamente)` },
  { value: "typeform", label: "Typeform", description: "Se entrega al completar un formulario Typeform" },
  { value: "google_forms", label: "Google Forms", description: "Se entrega al completar un Google Form" },
  { value: "landing", label: "Landing page", description: "El LM es o está en una landing page" },
  { value: "manual", label: "Manual", description: "Otro canal o entrega manual" },
];

const CHANNELS = canalesDeLeadMagnetVisibles(ALL_CHANNELS);
const DEFAULT_CHANNEL: LeadMagnetChannel = CHANNELS[0]?.value ?? "manual";

export function LeadMagnetFormModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (lm: LeadMagnet) => void;
}) {
  const { push } = useToast();
  const [, startCreate] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<LeadMagnetType>("documento");
  const [channel, setChannel] = useState<LeadMagnetChannel>(DEFAULT_CHANNEL);
  const [assetUrl, setAssetUrl] = useState("");
  const [manychatFlowId, setManychatFlowId] = useState("");
  const [manychatFlowName, setManychatFlowName] = useState("");
  const [flows, setFlows] = useState<{ id: string; name: string }[]>([]);
  const [loadingFlows, setLoadingFlows] = useState(false);
  const [flowsLoaded, setFlowsLoaded] = useState(false);

  async function loadFlows() {
    if (flowsLoaded) return;
    setLoadingFlows(true);
    try {
      const { flows: f } = await listAutomationFlowsAction();
      setFlows(f.map((flow) => ({ id: flow.id, name: flow.name })));
    } catch {
      // silencioso
    } finally {
      setLoadingFlows(false);
      setFlowsLoaded(true);
    }
  }

  function handleChannelChange(c: LeadMagnetChannel) {
    setChannel(c);
    if (c === "manychat") loadFlows();
  }

  function handleFlowSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const selected = flows.find((f) => f.id === e.target.value);
    if (selected) {
      setManychatFlowId(selected.id);
      setManychatFlowName(selected.name);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    startCreate(async () => {
      try {
        const input: CreateLeadMagnetInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          type,
          channel,
          assetUrl: assetUrl.trim() || undefined,
          manychatFlowId: channel === "manychat" ? manychatFlowId || undefined : undefined,
          manychatFlowName: channel === "manychat" ? manychatFlowName || undefined : undefined,
        };
        await createLeadMagnetAction(input);
        // Recargar para obtener el objeto completo con ID
        const all = await getLeadMagnetsAction();
        const newLm = all[0]; // el más reciente
        if (newLm) {
          onCreated(newLm);
          push({ title: "Lead Magnet creado", variant: "success" });
        }
        // Reset
        setName("");
        setDescription("");
        setType("documento");
        setChannel(DEFAULT_CHANNEL);
        setAssetUrl("");
        setManychatFlowId("");
        setManychatFlowName("");
        setFlowsLoaded(false);
      } catch (err) {
        push({ title: err instanceof Error ? err.message : "Error al crear LM" });
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header fijo */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border/40 shrink-0">
          <h2 className="text-base font-semibold text-foreground">Nuevo Lead Magnet</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          {/* Scroll area */}
          <div className="overflow-y-auto flex-1 px-6 py-5">
            <div className="grid grid-cols-2 gap-x-5 gap-y-5">
              {/* Nombre — full width */}
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Nombre del LM
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Guía de escala para infoproductores"
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Tipo */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Tipo de LM
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors text-left ${
                        type === t.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-border/70 hover:text-foreground"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Canal */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Canal de entrega
                </label>
                <div className="space-y-1.5">
                  {CHANNELS.map((c) => (
                    <label
                      key={c.value}
                      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                        channel === c.value
                          ? "border-primary bg-primary/10"
                          : "border-border bg-muted/30 hover:bg-muted/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="channel"
                        value={c.value}
                        checked={channel === c.value}
                        onChange={() => handleChannelChange(c.value)}
                        className="mt-0.5 accent-primary shrink-0"
                      />
                      <div>
                        <p className="text-xs font-medium text-foreground">{c.label}</p>
                        <p className="text-[11px] text-muted-foreground leading-snug">{c.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Descripción — full width */}
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Descripción <span className="normal-case text-muted-foreground/60">(opcional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="¿De qué trata este lead magnet?"
                  rows={2}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>

              {/* ManyChat flow selector — full width */}
              {channel === "manychat" && (
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Flujo de ManyChat asociado
                  </label>
                  {loadingFlows ? (
                    <p className="text-xs text-muted-foreground">Cargando flujos...</p>
                  ) : flows.length > 0 ? (
                    <select
                      value={manychatFlowId}
                      onChange={handleFlowSelect}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <option value="">Seleccionar flujo</option>
                      {flows.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Sin flujos disponibles — conectá ManyChat en Integraciones primero.
                    </p>
                  )}
                </div>
              )}

              {/* URL del asset — full width */}
              {(channel !== "manychat") && (
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {channel === "instagram_dm" ? "URL del LM (para detección automática)" : "URL del LM"}
                    {channel !== "instagram_dm" && <span className="normal-case text-muted-foreground/60 ml-1">(opcional)</span>}
                  </label>
                  {channel === "instagram_dm" && (
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 mb-2">
                      <p className="text-xs text-primary/90 leading-relaxed">
                        {brand.name} detecta automáticamente cuando enviás este link en tus DMs de Instagram y registra al lead.
                      </p>
                    </div>
                  )}
                  <input
                    type="url"
                    value={assetUrl}
                    onChange={(e) => setAssetUrl(e.target.value)}
                    placeholder={channel === "instagram_dm" ? "https://drive.google.com/..." : "https://..."}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer fijo con acciones */}
          <div className="flex gap-2 px-6 py-4 border-t border-border/40 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" className="flex-1" disabled={!name.trim()}>
              Crear Lead Magnet
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  getManyChatCTAStatsAction,
  syncManyChatCtaEventsAction,
  updateManyChatCtaTagsAction,
  type ManyChatCTAStats,
} from "@/app/manychat/cta-actions";
import { Button, Input, Label } from "@ai-coo/ui";
import { useToast } from "@/providers/toast-provider";
import { esRechazoPorModulo, type RechazoPorModulo } from "@/lib/auth/regla-de-modulo";
import { SinAcceso } from "@/components/platform/sin-acceso";
import { getPermissionModuleLabel } from "@/constants/permission-modules";

export function ManyChatCtaPanel({ initialTags = "" }: { initialTags?: string }) {
  const { push } = useToast();
  const [tagsInput, setTagsInput] = useState(initialTags);
  const [stats, setStats] = useState<ManyChatCTAStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [rechazo, setRechazo] = useState<RechazoPorModulo | null>(null);

  const refreshStats = async () => {
    setLoading(true);
    try {
      const data = await getManyChatCTAStatsAction();
      if (esRechazoPorModulo(data)) {
        setRechazo(data);
        return;
      }
      setStats(data);
    } catch {
      setStats({ cta_responses: 0, flows_triggered: 0, top_flows: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshStats();
  }, []);

  const handleSaveTags = async () => {
    setPending(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      await updateManyChatCtaTagsAction(tags);
      push({ title: "Tags de CTA guardados", variant: "success" });
    } catch (error) {
      push({
        title: "No se pudieron guardar los tags",
        description: error instanceof Error ? error.message : "Error desconocido",
      });
    } finally {
      setPending(false);
    }
  };

  const handleSync = async () => {
    setPending(true);
    try {
      const result = await syncManyChatCtaEventsAction();
      push({
        title: "Sync de CTAs completado",
        description: `${result.synced} evento(s) registrados`,
        variant: "success",
      });
      await refreshStats();
    } catch (error) {
      push({
        title: "Error al sincronizar CTAs",
        description: error instanceof Error ? error.message : "Error desconocido",
      });
    } finally {
      setPending(false);
    }
  };

  // Sin Integraciones la recarga vuelve rechazada: pasa si los permisos cambian
  // con la pantalla abierta (SCRUM-541).
  if (rechazo) {
    return <SinAcceso moduleLabel={getPermissionModuleLabel(rechazo.moduleId)} />;
  }

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
      <div>
        <Label htmlFor="manychat-cta-tags" className="text-xs">
          Tags de ManyChat que equivalen a “respondió a un CTA”
        </Label>
        <Input
          id="manychat-cta-tags"
          value={tagsInput}
          onChange={(event) => setTagsInput(event.target.value)}
          placeholder="cta_reel, respondio_dm, flow_lead_magnet"
          className="mt-1"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Separados por coma. El sync busca subscribers con estos tags.
        </p>
        <Button
          size="sm"
          className="mt-2"
          variant="outline"
          onClick={() => void handleSaveTags()}
          disabled={pending}
        >
          Guardar tags
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void handleSync()} disabled={pending}>
          Sincronizar CTAs
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Cargando métricas…</p>
      ) : stats ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border bg-card p-3 text-xs">
            <p className="text-muted-foreground">Respuestas a CTAs este mes</p>
            <p className="mt-1 text-xl font-semibold">{stats.cta_responses}</p>
          </div>
          <div className="rounded-md border bg-card p-3 text-xs">
            <p className="text-muted-foreground">Leads que dispararon flujos</p>
            <p className="mt-1 text-xl font-semibold">{stats.flows_triggered}</p>
          </div>
          {stats.top_flows.length > 0 ? (
            <div className="sm:col-span-2 rounded-md border bg-card p-3 text-xs">
              <p className="mb-2 text-muted-foreground">Top flows / tags</p>
              <ul className="space-y-1">
                {stats.top_flows.map((flow) => (
                  <li key={flow.name} className="flex justify-between gap-2">
                    <span className="truncate">{flow.name}</span>
                    <span className="font-medium tabular-nums">{flow.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

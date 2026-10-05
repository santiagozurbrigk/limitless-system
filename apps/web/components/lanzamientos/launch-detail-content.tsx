"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  MetricBand,
  MetricStat,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@ai-coo/ui";
import { TrendLineChart } from "@/components/charts/platform";
import { LaunchPostMortemPanel } from "@/components/lanzamientos/launch-post-mortem-panel";
import { LaunchStatusBadge } from "@/components/lanzamientos/launch-status-badge";
import {
  generateLaunchPostMortemAction,
  recordLaunchMetricAction,
  updateLaunchAction,
} from "@/app/lanzamientos/actions";
import {
  daysRemaining,
  formatLaunchDate,
  formatLaunchMoney,
  goalProgressPct,
} from "@/lib/launches/format";
import { STATUS_LABELS, TASK_AREA_LABELS } from "@/lib/workboard/constants";
import { paths } from "@/routes";
import type { LaunchDetail, LaunchStatus } from "@/types/launches";
import { FilterPills } from "@/components/marketing/filter-pills";
import { CampoFecha } from "@/components/shared/campo-fecha";
import { fechaDeHoyLocal } from "@/lib/fechas/calendario";

export function LaunchDetailContent({
  initialLaunch,
}: {
  initialLaunch: LaunchDetail;
}) {
  const [launch, setLaunch] = useState(initialLaunch);
  const [taskFilter, setTaskFilter] = useState("all");
  const [metricOpen, setMetricOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [generatingPostMortem, setGeneratingPostMortem] = useState(false);
  const [metricForm, setMetricForm] = useState({
    date: fechaDeHoyLocal(),
    revenue: "",
    newClients: "",
    conversationsStarted: "",
    bookings: "",
  });

  const revenuePct = goalProgressPct(launch.actualRevenue, launch.goalRevenue);
  const clientsPct = goalProgressPct(launch.actualClients, launch.goalClients);
  const completedTasks = launch.tasks.filter((t) => t.status === "done").length;
  const tasksPct =
    launch.tasks.length > 0
      ? Math.round((completedTasks / launch.tasks.length) * 100)
      : null;
  const remainingDays = daysRemaining(launch.endDate, launch.launchDate);

  const filteredTasks = useMemo(() => {
    if (taskFilter === "all") return launch.tasks;
    return launch.tasks.filter((t) => t.status === taskFilter);
  }, [launch.tasks, taskFilter]);

  const revenueSeries = useMemo(
    () =>
      [...launch.metrics]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((m) => ({
          label: new Date(m.date + "T12:00:00").toLocaleDateString("es", {
            day: "numeric",
            month: "short",
          }),
          value: m.revenue,
        })),
    [launch.metrics]
  );

  function handleStatusChange(status: LaunchStatus) {
    startTransition(async () => {
      await updateLaunchAction(launch.id, { status });
      setLaunch((prev) => ({ ...prev, status }));
    });
  }

  function handleRecordMetric() {
    startTransition(async () => {
      await recordLaunchMetricAction(launch.id, {
        date: metricForm.date,
        revenue: Number(metricForm.revenue || 0),
        newClients: Number(metricForm.newClients || 0),
        conversationsStarted: Number(metricForm.conversationsStarted || 0),
        bookings: Number(metricForm.bookings || 0),
      });
      window.location.reload();
    });
  }

  async function handleGeneratePostMortem() {
    setGeneratingPostMortem(true);
    try {
      const postMortem = await generateLaunchPostMortemAction(launch.id);
      setLaunch((prev) => ({
        ...prev,
        postMortem,
        hasPostMortem: true,
        postMortemGeneratedAt: new Date().toISOString(),
      }));
    } finally {
      setGeneratingPostMortem(false);
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2 gap-2" asChild>
        <Link href={paths.platform.lanzamientos}>
          <ArrowLeft className="h-4 w-4" />
          Lanzamientos
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{launch.name}</h1>
            <LaunchStatusBadge status={launch.status} />
          </div>
          {launch.description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">
              {launch.description}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {formatLaunchDate(launch.launchDate)}
            {launch.endDate ? ` → ${formatLaunchDate(launch.endDate)}` : ""}
            {launch.product ? ` · ${launch.product.name}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {launch.status !== "completed" && launch.status !== "cancelled" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => handleStatusChange("completed")}
            >
              Marcar como completado
            </Button>
          ) : null}
          {launch.status === "planning" ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => handleStatusChange("active")}
            >
              Activar lanzamiento
            </Button>
          ) : null}
        </div>
      </div>

      <MetricBand>
        <MetricStat
          title="Revenue actual"
          value={formatLaunchMoney(launch.actualRevenue)}
          subtitle={
            revenuePct != null
              ? `${revenuePct}% del objetivo`
              : launch.goalRevenue
                ? `Objetivo ${formatLaunchMoney(launch.goalRevenue)}`
                : undefined
          }
        />
        <MetricStat
          title="Clientes actuales"
          value={String(launch.actualClients)}
          subtitle={
            clientsPct != null
              ? `${clientsPct}% del objetivo (${launch.goalClients})`
              : launch.goalClients
                ? `Objetivo ${launch.goalClients}`
                : undefined
          }
        />
        <MetricStat
          title="Tareas completadas"
          value={`${completedTasks}/${launch.tasks.length}`}
          subtitle={tasksPct != null ? `${tasksPct}% del tablero` : "Sin tareas"}
        />
        <MetricStat
          title="Días restantes"
          value={
            remainingDays != null
              ? remainingDays > 0
                ? String(remainingDays)
                : "0"
              : "—"
          }
          subtitle={
            remainingDays != null && remainingDays < 0
              ? "Finalizado"
              : remainingDays != null
                ? "hasta el cierre"
                : "Sin fecha de cierre"
          }
        />
      </MetricBand>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">Tareas</TabsTrigger>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
          <TabsTrigger value="postmortem">Post-mortem</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterPills
              options={[
                { value: "all", label: "Todas" },
                ...Object.entries(STATUS_LABELS).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
              value={taskFilter}
              onChange={setTaskFilter}
            />
            <Button size="sm" variant="outline" asChild>
              <Link href={`${paths.platform.workboard.root}?launch=${launch.id}`}>
                Nueva tarea en workboard
              </Link>
            </Button>
          </div>

          {filteredTasks.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
              No hay tareas vinculadas. Creá una desde el workboard seleccionando
              este lanzamiento.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3">Título</th>
                    <th className="px-4 py-3">Área</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Asignado</th>
                    <th className="px-4 py-3 text-right">Tiempo</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((task) => (
                    <tr
                      key={task.id}
                      className="border-b border-border/40 hover:bg-muted/20"
                    >
                      <td className="px-4 py-3 font-medium">{task.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {TASK_AREA_LABELS[task.area as keyof typeof TASK_AREA_LABELS] ??
                          task.area}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-[10px]">
                          {STATUS_LABELS[task.status as keyof typeof STATUS_LABELS] ??
                            task.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {task.assigneeName ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {task.actualMinutes != null
                          ? `${task.actualMinutes} min`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="metrics" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setMetricOpen(true)}>
              Registrar día
            </Button>
          </div>

          {revenueSeries.length >= 2 ? (
            <div className="rounded-xl border border-border/60 p-4">
              <p className="mb-3 text-sm font-medium">Revenue diario</p>
              <TrendLineChart data={revenueSeries} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Registrá al menos dos días para ver el gráfico de revenue.
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right">Clientes</th>
                  <th className="px-4 py-3 text-right">Conversaciones</th>
                  <th className="px-4 py-3 text-right">Bookings</th>
                </tr>
              </thead>
              <tbody>
                {[...launch.metrics]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((metric) => (
                    <tr key={metric.id} className="border-b border-border/40">
                      <td className="px-4 py-3">{formatLaunchDate(metric.date)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatLaunchMoney(metric.revenue)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {metric.newClients}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {metric.conversationsStarted}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {metric.bookings}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="postmortem" className="mt-4">
          {launch.status !== "completed" ? (
            <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              Completá el lanzamiento para generar el post-mortem.
            </div>
          ) : launch.postMortem ? (
            <div className="space-y-4">
              <LaunchPostMortemPanel postMortem={launch.postMortem} />
              <Button
                variant="outline"
                size="sm"
                disabled={generatingPostMortem}
                onClick={() => void handleGeneratePostMortem()}
              >
                {generatingPostMortem ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Regenerando…
                  </>
                ) : (
                  "Regenerar post-mortem"
                )}
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-8 text-center">
              <Button
                disabled={generatingPostMortem}
                onClick={() => void handleGeneratePostMortem()}
              >
                {generatingPostMortem ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analizando el lanzamiento…
                  </>
                ) : (
                  "Generar post-mortem con IA"
                )}
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={metricOpen} onOpenChange={setMetricOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar métricas del día</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label>Fecha</Label>
              <CampoFecha
                value={metricForm.date}
                onChange={(fecha) =>
                  setMetricForm((f) => ({ ...f, date: fecha ?? "" }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Revenue (USD)</Label>
                <Input
                  type="number"
                  min={0}
                  value={metricForm.revenue}
                  onChange={(e) =>
                    setMetricForm((f) => ({ ...f, revenue: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Clientes nuevos</Label>
                <Input
                  type="number"
                  min={0}
                  value={metricForm.newClients}
                  onChange={(e) =>
                    setMetricForm((f) => ({ ...f, newClients: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetricOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={pending} onClick={handleRecordMetric}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

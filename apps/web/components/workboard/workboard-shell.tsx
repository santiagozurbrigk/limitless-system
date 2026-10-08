"use client";

import { useEffect, useState } from "react";
import type React from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Clock, Kanban, Plus } from "lucide-react";
import { FilterPills } from "@/components/marketing/filter-pills";
import { TASK_AREA_OPTIONS } from "@/lib/workboard/constants";
import { WORKBOARD_STATUSES, STATUS_LABELS } from "@/lib/workboard/constants";
import { useWorkboard } from "@/providers/workboard-provider";
import type { TaskArea, TaskPriority, TaskStatus, WorkboardMember } from "@/types/workboard";
import {
  WorkboardTaskResources,
  applyDraftTaskResources,
  type WorkboardTaskResourcesDraft,
} from "./workboard-task-resources";
import { getWorkboardTaskByIdAction } from "@/app/workboard/task-link-actions";
import { WorkboardCalendar } from "./workboard-calendar";
import { WorkboardKanban } from "./workboard-kanban";
import { LogTimeModal } from "./log-time-modal";
import { WorkboardTaskDetailDialog } from "./workboard-task-detail-dialog";
import { WorkboardTimeReport } from "./workboard-time-report";
import { WorkboardSprintHeader } from "./workboard-sprint-header";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  SteppedAlert,
  Textarea,
} from "@ai-coo/ui";
import { Users } from "lucide-react";
import { useToast } from "@/providers/toast-provider";

const AREA_FILTER_OPTIONS = [
  { value: "all", label: "Todas las áreas" },
  ...TASK_AREA_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
];

const VIEW_OPTIONS = [
  { value: "board", label: "Tablero" },
  { value: "calendar", label: "Calendario" },
  { value: "time", label: "Tiempo por persona" },
];

export function WorkboardShell() {
  const searchParams = useSearchParams();
  const {
    areaFilter,
    setAreaFilter,
    view,
    setView,
    members,
    launches,
    launchFilterId,
    setLaunchFilterId,
    createTask,
    isSaving,
    upsertTaskInState,
    pendingCompleteTask,
    confirmCompleteWithTime,
    skipTimeAndComplete,
    cancelComplete,
  } = useWorkboard();

  const { push } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus>("todo");
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    area: "general" as TaskArea,
    priority: "medium" as TaskPriority,
    assigneeIds: [] as string[],
    dueDate: "",
    tags: "",
    launchId: "",
  });
  const [resourcesDraft, setResourcesDraft] =
    useState<WorkboardTaskResourcesDraft>({
      pendingFiles: [],
      sopId: null,
      documentIds: [],
    });

  useEffect(() => {
    const launchFromUrl = searchParams.get("launch");
    if (!launchFromUrl) return;
    setLaunchFilterId(launchFromUrl);
    setNewTask((prev) => ({ ...prev, launchId: launchFromUrl }));
    setIsAddOpen(true);
  }, [searchParams, setLaunchFilterId]);

  const emptyMembers = members.length === 0;

  async function handleAddTask() {
    if (!newTask.title.trim()) return;
    // Si la acción rechaza, el provider ya avisó con el motivo y el formulario
    // queda abierto con lo que escribiste.
    const created = await createTask({
      title: newTask.title,
      description: newTask.description,
      status: selectedStatus,
      area: newTask.area,
      priority: newTask.priority,
      assigneeIds: newTask.assigneeIds,
      dueDate: newTask.dueDate || null,
      tags: newTask.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      launchId: newTask.launchId || null,
    });
    if (!created) return;

    const resourceError = await applyDraftTaskResources(created.id, resourcesDraft);
    const refreshed = await getWorkboardTaskByIdAction(created.id);
    if (refreshed) upsertTaskInState(refreshed);
    if (resourceError) {
      push({
        title: "Tarea creada con advertencias",
        description: resourceError,
      });
    }

    setNewTask({
      title: "",
      description: "",
      area: "general",
      priority: "medium",
      assigneeIds: [],
      dueDate: "",
      tags: "",
      launchId: launchFilterId !== "all" ? launchFilterId : "",
    });
    setResourcesDraft({
      pendingFiles: [],
      sopId: null,
      documentIds: [],
    });
    setIsAddOpen(false);
  }

  return (
    <div className="workboard-surface space-y-4">
      {emptyMembers ? (
        <SteppedAlert
          variant="info"
          title="Sin miembros en el equipo"
          icon={<Users className="h-4 w-4" />}
        >
          <p>
            Invitá miembros a tu organización para asignar tareas. Mientras tanto,
            cualquier usuario con acceso al tablero puede crear y mover tareas sin
            importar su rol.
          </p>
        </SteppedAlert>
      ) : null}

      {view !== "time" ? (
        <WorkboardSprintHeader
          areaFilter={areaFilter}
          onAreaFilterChange={setAreaFilter}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <FilterPills
            options={VIEW_OPTIONS}
            value={view}
            onChange={(v) => setView(v as "board" | "calendar" | "time")}
          />
          {view === "time" ? (
            <FilterPills
              options={AREA_FILTER_OPTIONS}
              value={areaFilter}
              onChange={setAreaFilter}
            />
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {view === "board" ? (
              <span className="inline-flex items-center gap-1">
                <Kanban className="h-3.5 w-3.5" /> Vista tablero
              </span>
            ) : view === "calendar" ? (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> Vista calendario
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Tiempo por persona
              </span>
            )}
          </span>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Nueva tarea
              </Button>
            </DialogTrigger>
            <AddTaskDialogContent
              newTask={newTask}
              setNewTask={setNewTask}
              selectedStatus={selectedStatus}
              setSelectedStatus={setSelectedStatus}
              members={members}
              launches={launches}
              isSaving={isSaving}
              onSubmit={() => void handleAddTask()}
              onCancel={() => setIsAddOpen(false)}
              resourcesDraft={resourcesDraft}
              onResourcesDraftChange={setResourcesDraft}
            />
          </Dialog>
        </div>
      </div>

      {view === "board" ? (
        <WorkboardKanban
          onAgregarEnColumna={(status) => {
            setSelectedStatus(status);
            setIsAddOpen(true);
          }}
        />
      ) : view === "calendar" ? (
        <WorkboardCalendar />
      ) : (
        <WorkboardTimeReport />
      )}
      <LogTimeModal
        open={Boolean(pendingCompleteTask)}
        taskId={pendingCompleteTask?.id ?? ""}
        taskTitle={pendingCompleteTask?.title ?? ""}
        estimatedMinutes={pendingCompleteTask?.estimatedMinutes}
        onConfirm={(minutes, note) => confirmCompleteWithTime(minutes, note)}
        onSkip={async () => {
          await skipTimeAndComplete();
        }}
        onCancel={cancelComplete}
      />
      <WorkboardTaskDetailDialog />
    </div>
  );
}

function AddTaskDialogContent({
  newTask,
  setNewTask,
  selectedStatus,
  setSelectedStatus,
  members,
  launches,
  isSaving,
  onSubmit,
  onCancel,
  resourcesDraft,
  onResourcesDraftChange,
}: {
  newTask: {
    title: string;
    description: string;
    area: TaskArea;
    priority: TaskPriority;
    assigneeIds: string[];
    dueDate: string;
    tags: string;
    launchId: string;
  };
  setNewTask: React.Dispatch<
    React.SetStateAction<typeof newTask>
  >;
  selectedStatus: TaskStatus;
  setSelectedStatus: (s: TaskStatus) => void;
  members: WorkboardMember[];
  launches: { id: string; name: string }[];
  isSaving: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  resourcesDraft: WorkboardTaskResourcesDraft;
  onResourcesDraftChange: (draft: WorkboardTaskResourcesDraft) => void;
}) {
  return (
    <DialogContent className="flex max-h-[min(90vh,720px)] max-w-md flex-col gap-0 overflow-hidden p-0">
      <DialogHeader className="shrink-0">
        <DialogTitle>Nueva tarea</DialogTitle>
        <DialogDescription>
          Todos los miembros del equipo pueden crear y gestionar tareas.
        </DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="wb-title">Título</Label>
          <Input
            id="wb-title"
            placeholder="¿Qué hay que hacer?"
            value={newTask.title}
            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wb-desc">Descripción</Label>
          <Textarea
            id="wb-desc"
            placeholder="Detalles opcionales"
            value={newTask.description}
            onChange={(e) =>
              setNewTask({ ...newTask, description: e.target.value })
            }
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wb-status">Estado</Label>
            <select
              id="wb-status"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={selectedStatus}
              onChange={(e) =>
                setSelectedStatus(e.target.value as TaskStatus)
              }
            >
              {WORKBOARD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wb-area">Área</Label>
            <select
              id="wb-area"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={newTask.area}
              onChange={(e) =>
                setNewTask({ ...newTask, area: e.target.value as TaskArea })
              }
            >
              {TASK_AREA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wb-priority">Prioridad</Label>
            <select
              id="wb-priority"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={newTask.priority}
              onChange={(e) =>
                setNewTask({
                  ...newTask,
                  priority: e.target.value as TaskPriority,
                })
              }
            >
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          {/*
            ⭐ Varios responsables, con casillas y no con un desplegable.
            Una tarea que hacen dos personas es una tarea; antes había que
            duplicarla, y entonces una se marcaba terminada y la otra quedaba
            viva. Las casillas muestran de un vistazo quiénes están, que es
            justo lo que un desplegable de selección múltiple esconde.
          */}
          <Label>Responsables</Label>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {members.length === 0 ? (
              <p className="px-1 py-1 text-sm text-muted-foreground">
                No hay miembros en el equipo todavía.
              </p>
            ) : (
              members.map((member) => {
                const elegido = newTask.assigneeIds.includes(member.id);
                return (
                  <label
                    key={member.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={elegido}
                      onChange={() =>
                        setNewTask({
                          ...newTask,
                          assigneeIds: elegido
                            ? newTask.assigneeIds.filter((id) => id !== member.id)
                            : [...newTask.assigneeIds, member.id],
                        })
                      }
                    />
                    {member.name}
                  </label>
                );
              })
            )}
          </div>
          {newTask.assigneeIds.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Sin asignar. Podés dejarla así y asignarla después.
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="wb-due">Fecha límite</Label>
          <Input
            id="wb-due"
            type="date"
            value={newTask.dueDate}
            onChange={(e) =>
              setNewTask({ ...newTask, dueDate: e.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wb-launch">Lanzamiento (opcional)</Label>
          <select
            id="wb-launch"
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            value={newTask.launchId}
            onChange={(e) =>
              setNewTask({ ...newTask, launchId: e.target.value })
            }
          >
            <option value="">Sin lanzamiento</option>
            {launches.map((launch) => (
              <option key={launch.id} value={launch.id}>
                {launch.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wb-tags">Etiquetas (separadas por coma)</Label>
          <Input
            id="wb-tags"
            value={newTask.tags}
            onChange={(e) => setNewTask({ ...newTask, tags: e.target.value })}
          />
        </div>
        <WorkboardTaskResources
          taskId={null}
          draft={resourcesDraft}
          onDraftChange={onResourcesDraftChange}
          disabled={isSaving}
        />
        </div>
      </div>
      <DialogFooter className="shrink-0">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button disabled={isSaving} onClick={onSubmit}>
          {isSaving ? "Creando…" : "Crear tarea"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

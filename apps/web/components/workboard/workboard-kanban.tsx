"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Calendar, MoreVertical, Plus, Tag } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ai-coo/ui";
import { fechaVencida } from "@/lib/fechas/calendario";
import {
  useHoyDeLaOrganizacion,
  useZonaDeLaOrganizacion,
} from "@/providers/zona-de-la-organizacion-provider";
import { TASK_AREA_LABELS } from "@/lib/workboard/constants";
import { filterKanbanDoneTasks, filterWorkboardTasks, groupTasksIntoColumns } from "@/lib/workboard/group-tasks";
import {
  getAreaClasses,
  getAreaStyle,
  getPriorityClasses,
  PRIORITY_LABELS,
} from "@/lib/workboard/styles";
import { useWorkboard } from "@/providers/workboard-provider";
import type { TaskStatus, WorkboardTask } from "@/types/workboard";

/**
 * ⭐ El "+" de cada columna **abre el formulario**, no crea una tarea.
 *
 * Antes creaba al instante una tarjeta titulada "Nueva tarea", vacía, y había
 * que entrar al detalle a completarla. Si te distraías en el medio, quedaba una
 * tarea fantasma en el tablero — y en un tablero compartido eso es ruido para
 * todo el equipo.
 *
 * Ahora abre el mismo formulario que el botón "Nueva tarea" de arriba, con la
 * columna ya elegida. Si cancelás, no queda nada.
 */
export function WorkboardKanban({
  onAgregarEnColumna,
}: {
  onAgregarEnColumna: (status: TaskStatus) => void;
}) {
  const { tasks, areaFilter, sprintFilterId, launchFilterId, assigneeFilterId, moveTask, deleteTask, setSelectedTask, kanbanDoneVisibleUntil } =
    useWorkboard();
  const hoy = useHoyDeLaOrganizacion();
  const [draggedTask, setDraggedTask] = useState<{
    task: WorkboardTask;
    status: TaskStatus;
  } | null>(null);

  const filtered = useMemo(() => {
    const base = filterWorkboardTasks(
      tasks,
      areaFilter,
      sprintFilterId,
      launchFilterId,
      assigneeFilterId
    );
    return filterKanbanDoneTasks(base, kanbanDoneVisibleUntil);
  }, [tasks, areaFilter, sprintFilterId, launchFilterId, assigneeFilterId, kanbanDoneVisibleUntil]);
  const zonaDeLaOrganizacion = useZonaDeLaOrganizacion();
  const columns = useMemo(
    () => groupTasksIntoColumns(filtered, zonaDeLaOrganizacion),
    [filtered, zonaDeLaOrganizacion]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetStatus: TaskStatus) => {
    if (!draggedTask) return;
    const { task, status: sourceStatus } = draggedTask;
    if (sourceStatus === targetStatus) {
      setDraggedTask(null);
      return;
    }
    void moveTask(task.id, targetStatus);
    setDraggedTask(null);
  };

  return (
    <div className="grid min-h-[calc(100vh-14rem)] grid-cols-1 gap-[var(--space-card-sm)] md:grid-cols-2 xl:grid-cols-4">
      {columns.map((column) => (
        <div
          key={column.id}
          className={cn(
            "workboard-kanban-column flex min-h-[320px] flex-col rounded-[var(--radius-xl)] border p-[var(--space-card-sm)] shadow-card transition-colors",
            draggedTask &&
              draggedTask.status !== column.id &&
              "border-primary/40 bg-primary/[0.04]"
          )}
          onDragOver={handleDragOver}
          onDrop={() => handleDrop(column.id as TaskStatus)}
        >
          <div className="mb-[var(--space-card-sm)] flex items-center gap-2 px-1">
            <h2 className="text-caption font-semibold text-foreground">{column.title}</h2>
            <Badge variant="secondary" className="rounded-[var(--radius-pill)] px-2">
              {column.tasks.length}
            </Badge>
          </div>

          <div className="flex-1 space-y-[var(--space-card-sm)] overflow-y-auto pr-1">
            {column.tasks.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                Sin tareas
              </p>
            ) : (
              column.tasks.map((task) => {
                const overdue =
                  hoy !== null && task.status !== "done" && fechaVencida(task.dueDate, hoy);
                return (
                  <Card
                    key={task.id}
                    draggable
                    onDragStart={() =>
                      setDraggedTask({ task, status: column.id as TaskStatus })
                    }
                    onDragEnd={() => setDraggedTask(null)}
                    onClick={() => setSelectedTask(task)}
                    className={cn(
                      "cursor-grab rounded-[var(--radius-lg)] border-border shadow-card transition-shadow active:cursor-grabbing hover:shadow-md",
                      draggedTask?.task.id === task.id && "opacity-50"
                    )}
                  >
                    <CardHeader className="pb-2 pt-[var(--space-card-sm)]">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm font-medium leading-snug">
                          {task.title}
                        </CardTitle>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 shrink-0 p-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTask(task);
                              }}
                            >
                              Ver detalle
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteTask(task.id);
                              }}
                            >
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-[var(--space-card-sm)] pb-[var(--space-card-sm)]">
                      {task.description ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {task.description}
                        </p>
                      ) : null}

                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", getAreaClasses(task.area))}
                        style={getAreaStyle(task.area)}
                      >
                        {TASK_AREA_LABELS[task.area]}
                      </Badge>

                      {task.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {task.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="gap-0.5 text-[10px] font-normal"
                            >
                              <Tag className="h-2.5 w-2.5" />
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      ) : null}

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            getPriorityClasses(task.priority)
                          )}
                        >
                          {PRIORITY_LABELS[task.priority]}
                        </Badge>
                        <div className="flex items-center gap-2">
                          {task.dueDate ? (
                            <span
                              className={cn(
                                "flex items-center gap-1 text-[10px]",
                                overdue
                                  ? "font-medium text-red-600 dark:text-red-400"
                                  : "text-muted-foreground"
                              )}
                            >
                              {overdue ? (
                                <AlertCircle className="h-3 w-3" />
                              ) : (
                                <Calendar className="h-3 w-3" />
                              )}
                              {new Date(task.dueDate).toLocaleDateString("es", {
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                          ) : null}
                          {/*
                            ⭐ Los responsables, superpuestos.
                            Se muestran hasta tres y el resto se resume en "+N":
                            una tarjeta de tablero tiene que leerse de un
                            vistazo, y cinco circulitos en fila la ensanchan
                            hasta descolocar la columna.
                          */}
                          {task.assignees.length > 0 ? (
                            <div className="flex -space-x-1.5">
                              {task.assignees.slice(0, 3).map((persona) => (
                                <span
                                  key={persona.id}
                                  className="flex h-6 w-6 items-center justify-center rounded-full border border-background bg-muted text-[10px] font-medium text-foreground"
                                  title={persona.name}
                                >
                                  {persona.initials}
                                </span>
                              ))}
                              {task.assignees.length > 3 ? (
                                <span
                                  className="flex h-6 w-6 items-center justify-center rounded-full border border-background bg-muted text-[10px] font-medium text-muted-foreground"
                                  title={task.assignees
                                    .slice(3)
                                    .map((persona) => persona.name)
                                    .join(", ")}
                                >
                                  +{task.assignees.length - 3}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={() => onAgregarEnColumna(column.id as TaskStatus)}
            className="mt-2 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar tarea
          </button>
        </div>
      ))}
    </div>
  );
}

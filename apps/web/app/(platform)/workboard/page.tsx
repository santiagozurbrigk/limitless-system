import { WorkboardShell } from "@/components/workboard";
import { listLaunchPickerOptionsAction } from "@/app/lanzamientos/actions";
import { loadWorkboardPageDataAction } from "@/app/workboard/actions";
import { EmptyState } from "@/components/shared/empty-state";
import { WorkboardProvider } from "@/providers/workboard-provider";

export default async function WorkboardPage() {
  const [resultado, launches] = await Promise.all([
    loadWorkboardPageDataAction(),
    listLaunchPickerOptionsAction(),
  ]);
  // La lectura devuelve su error como valor (SCRUM-503): la pantalla muestra
  // el motivo en vez de la pantalla de error de Next.
  if (!resultado.success) {
    return (
      <EmptyState title="No se pudo cargar el tablero" description={resultado.error} />
    );
  }

  const { tasks, members, sprints } = resultado.data;
  const activeSprint = sprints.find((s) => s.status === "active");
  const initialSprintFilterId = activeSprint?.id ?? "all";

  return (
    <WorkboardProvider
      initialTasks={tasks}
      members={members}
      initialSprints={sprints}
      initialSprintFilterId={initialSprintFilterId}
      launches={launches}
    >
      <WorkboardShell />
    </WorkboardProvider>
  );
}

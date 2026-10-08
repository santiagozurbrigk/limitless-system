import { WorkboardShell } from "@/components/workboard";
import { listLaunchPickerOptionsAction } from "@/app/lanzamientos/actions";
import { loadWorkboardPageDataAction } from "@/app/workboard/actions";
import { EmptyState } from "@/components/shared/empty-state";
import { WorkboardProvider } from "@/providers/workboard-provider";

/**
 * La ruta ya era dinámica (lee la sesión con `cookies()`). Se declara para que
 * `next build` no intente prerenderizarla: en ese intento `cookies()` lanza el
 * error interno con el que Next marca la ruta como dinámica, y la lectura, que
 * ahora atrapa sus errores (SCRUM-503), lo registraría como una falla.
 */
export const dynamic = "force-dynamic";

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

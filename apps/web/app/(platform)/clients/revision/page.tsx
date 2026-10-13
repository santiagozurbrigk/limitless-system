import { WeeklyReviewPage } from "@/components/clients/weekly-review";
import { getWeeklyReviewAction } from "@/app/clients/tracking-actions";
import { EmptyState } from "@/components/shared/empty-state";

export default async function WeeklyReviewRoute() {
  const resultado = await getWeeklyReviewAction();
  // La lectura devuelve su error como valor (SCRUM-517): la pantalla muestra
  // el motivo en vez de "Ningún cliente pide atención esta semana".
  if (!resultado.success) {
    return (
      <EmptyState title="No se pudo armar la revisión semanal" description={resultado.error} />
    );
  }
  return <WeeklyReviewPage initialData={resultado.data} />;
}

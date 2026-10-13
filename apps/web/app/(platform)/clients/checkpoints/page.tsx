import { JourneyPage } from "@/components/clients/checkpoints";
import { getJourneyPageDataAction } from "@/app/clients/checkpoint-actions";
import { EmptyState } from "@/components/shared/empty-state";

export default async function CheckpointsRoute() {
  const resultado = await getJourneyPageDataAction();
  // La lectura devuelve su error como valor (SCRUM-517): la pantalla muestra
  // el motivo en vez de un recorrido vacío.
  if (!resultado.success) {
    return (
      <EmptyState title="No se pudo cargar el recorrido" description={resultado.error} />
    );
  }
  return <JourneyPage initialData={resultado.data} />;
}

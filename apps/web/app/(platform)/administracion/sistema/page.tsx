import SuperAdminCostsPage from "@/app/(super-admin)/super-admin/costs/page";
import SuperAdminInfrastructurePage from "@/app/(super-admin)/super-admin/infrastructure/page";

/**
 * Sistema de la consola (SCRUM-551): infraestructura y crons, y costos de IA.
 * Son las dos pantallas del panel viejo (sin enlaces a otras pantallas), una
 * debajo de la otra: cuando SCRUM-553 cierre `/super-admin`, su lógica se muda acá.
 */
export default async function SistemaPage() {
  return (
    <div className="space-y-10">
      <SuperAdminInfrastructurePage />
      <SuperAdminCostsPage />
    </div>
  );
}

import { FounderOverview } from "@/components/founder";
import { SinAcceso } from "@/components/platform/sin-acceso";
import { getIntelligenceSnapshotAction } from "@/app/intelligence/actions";
import { getCurrentProfile } from "@/lib/auth/bootstrap";
import { getPermissionModuleLabel } from "@/constants/permission-modules";

export default async function FounderAreaPage() {
  const [resultado, profile] = await Promise.all([
    getIntelligenceSnapshotAction(),
    getCurrentProfile(),
  ]);
  // Sin Operaciones la lectura vuelve rechazada: pasa si se llega con una
  // navegación del cliente, donde el layout no se vuelve a ejecutar.
  if (!resultado.success) {
    return (
      <SinAcceso moduleLabel={getPermissionModuleLabel(resultado.moduleId)} />
    );
  }
  return (
    <FounderOverview
      snapshot={resultado.data}
      isFounder={profile?.role === "founder"}
    />
  );
}

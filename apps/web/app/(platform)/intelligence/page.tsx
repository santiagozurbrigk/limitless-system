import { getIntelligenceSnapshotAction } from "@/app/intelligence/actions";
import { IntelligencePageContent } from "@/components/intelligence/intelligence-page-content";
import { SinAcceso } from "@/components/platform/sin-acceso";
import { getCurrentProfile } from "@/lib/auth/bootstrap";
import { getPermissionModuleLabel } from "@/constants/permission-modules";

export default async function IntelligencePage() {
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
    <IntelligencePageContent
      snapshot={resultado.data}
      isFounder={profile?.role === "founder"}
    />
  );
}

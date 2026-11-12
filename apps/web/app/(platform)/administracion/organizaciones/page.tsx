import { OrganizationsList } from "@/components/super-admin";
import { loadOrganizationsList } from "@/lib/super-admin/queries";

/** Organizaciones de la consola (SCRUM-551): la misma lista del panel viejo. */
export default async function OrganizacionesPage() {
  const organizations = await loadOrganizationsList();
  return <OrganizationsList organizations={organizations} base="consola" />;
}

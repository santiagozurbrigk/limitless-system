import { redirect } from "next/navigation";
import { isStaffUser } from "@/lib/auth/require-staff";
import {
  exigirRutaDeLaExperiencia,
  pantallaDeInicioDeLaOrganizacionActiva,
} from "@/lib/organization/ruta-de-la-experiencia";

/**
 * La consola de Administración (SCRUM-551). Primero el bloqueo por experiencia
 * (SCRUM-524: sólo `limitless`, y `full` por URL); después la lista de staff
 * (SCRUM-552): quien no está en ella va a su pantalla de inicio, aunque sea
 * founder de la org de Limitless. Cada acción vuelve a validar con
 * `requireStaff()` en el servidor.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirRutaDeLaExperiencia("/administracion");
  if (!(await isStaffUser())) redirect(await pantallaDeInicioDeLaOrganizacionActiva());
  return children;
}

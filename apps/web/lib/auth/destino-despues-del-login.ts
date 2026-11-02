/**
 * Adónde va alguien que entra sin un destino pedido: el login con contraseña
 * (`postAuthRedirect` en `app/auth/actions.ts`) y `/auth/callback` sin `next`
 * usan esta misma resolución (fix-pack 1 de A1, MNR-1: el callback no tenía la rama
 * del holding y un holding `webinar` terminaba en Equipo).
 *
 *   - Una cuenta holding: a su holding (`/holding`), sea cual sea la
 *     experiencia.
 *   - El resto: la pantalla de inicio de la experiencia de la organización
 *     activa (`/dashboard` para `full`; la primera entrada lista del menú que
 *     la persona ve para `webinar` y `limitless`, SCRUM-524).
 *
 * El super admin, el cambio de contraseña obligatorio y las invitaciones se
 * deciden antes, en cada llamador.
 */
import "server-only";
import { loadProfileOrganizationContext } from "@/lib/auth/bootstrap";
import { pantallaDeInicioDeLaOrganizacionActiva } from "@/lib/organization/ruta-de-la-experiencia";
import { paths } from "@/routes";

export async function destinoPorDefectoDespuesDelLogin(userId: string): Promise<string> {
  const { accountType } = await loadProfileOrganizationContext(userId);
  if (accountType === "holding") return paths.platform.holding;
  return pantallaDeInicioDeLaOrganizacionActiva();
}

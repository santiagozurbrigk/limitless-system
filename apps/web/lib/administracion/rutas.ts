import { paths } from "@/routes/paths";

/**
 * ⭐ Dónde se dibujan las pantallas de administración (SCRUM-551): el panel viejo
 * (`/super-admin`, hasta que SCRUM-553 lo cierre) o la consola dentro de la org
 * de Limitless (`/administracion`). Los componentes de `components/super-admin`
 * reciben `base` (un texto: viaja de Server a Client Components) y arman sus
 * enlaces con `rutasDeAdministracion(base)`, así un clic en la consola no saca
 * al staff al panel viejo. Sin `base`, el panel viejo, como siempre.
 */
export type BaseDeAdministracion = "super-admin" | "consola";

export type RutasDeAdministracion = {
  organizaciones: string;
  organizacion: (id: string) => string;
  organizacionNueva: string;
  usuarios: string;
  holdings: string;
  sistema: string;
  onboarding: string;
};

const SUPER_ADMIN: RutasDeAdministracion = {
  organizaciones: paths.superAdmin.organizations,
  organizacion: paths.superAdmin.organizationDetail,
  organizacionNueva: paths.superAdmin.organizationsNew,
  usuarios: paths.superAdmin.users,
  holdings: paths.superAdmin.holding,
  sistema: paths.superAdmin.infrastructure,
  onboarding: paths.superAdmin.onboarding,
};

const CONSOLA: RutasDeAdministracion = paths.platform.consola;

export function rutasDeAdministracion(base: BaseDeAdministracion = "super-admin"): RutasDeAdministracion {
  return base === "consola" ? CONSOLA : SUPER_ADMIN;
}

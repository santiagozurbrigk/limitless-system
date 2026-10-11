"use client";

import {
  PantallaDeError,
  type PropsDeBoundary,
} from "@/components/platform/pantalla-de-error";
import { paths } from "@/routes";

/**
 * Error de una pantalla del super admin, dentro de su cáscara (SCRUM-108). El
 * resto lo hace `PantallaDeError`: captura en Sentry, nunca muestra el mensaje
 * interno y da el código de referencia.
 */
export default function ErrorDelSuperAdmin(props: PropsDeBoundary) {
  return (
    <PantallaDeError
      {...props}
      boundary="super-admin"
      titulo="No pudimos cargar esta sección"
      inicio={{ href: paths.superAdmin.organizations, texto: "Ir a organizaciones" }}
    />
  );
}

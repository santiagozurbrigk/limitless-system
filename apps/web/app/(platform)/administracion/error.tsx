"use client";

import {
  PantallaDeError,
  type PropsDeBoundary,
} from "@/components/platform/pantalla-de-error";
import { paths } from "@/routes";

/**
 * Error de una pantalla de Administración (SCRUM-551): la caída queda en la
 * consola y la navegación sigue. Captura en Sentry y nunca muestra el mensaje
 * interno.
 */
export default function ErrorDeAdministracion(props: PropsDeBoundary) {
  return (
    <PantallaDeError
      {...props}
      boundary="administracion"
      titulo="No pudimos cargar Administración"
      inicio={{ href: paths.platform.consola.organizaciones, texto: "Ir a Organizaciones" }}
    />
  );
}

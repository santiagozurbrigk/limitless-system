"use client";

import {
  PantallaDeError,
  type PropsDeBoundary,
} from "@/components/platform/pantalla-de-error";
import { paths } from "@/routes";

/**
 * Error de Lanzamientos o del Detalle de Limitless Webinars (SCRUM-544,
 * SCRUM-546): la caída queda en la pantalla y la navegación sigue. Sale a
 * Inicio. Captura en Sentry y nunca muestra el mensaje interno.
 */
export default function ErrorDeLanzamientos(props: PropsDeBoundary) {
  return (
    <PantallaDeError
      {...props}
      boundary="webinar-lanzamientos"
      titulo="No pudimos cargar Lanzamientos"
      inicio={{ href: paths.platform.inicio, texto: "Ir al inicio" }}
    />
  );
}

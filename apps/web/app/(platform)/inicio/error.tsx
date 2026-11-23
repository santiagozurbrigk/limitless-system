"use client";

import {
  PantallaDeError,
  type PropsDeBoundary,
} from "@/components/platform/pantalla-de-error";
import { paths } from "@/routes";

/**
 * Error de Inicio de Limitless Webinars (SCRUM-546): la caída queda en la
 * pantalla y la navegación sigue. Sale a Leads, no a Inicio (sería la misma
 * pantalla rota). Captura en Sentry y nunca muestra el mensaje interno.
 */
export default function ErrorDeInicio(props: PropsDeBoundary) {
  return (
    <PantallaDeError
      {...props}
      boundary="webinar-inicio"
      titulo="No pudimos cargar Inicio"
      inicio={{ href: paths.platform.webinars.leads, texto: "Ir a Leads" }}
    />
  );
}

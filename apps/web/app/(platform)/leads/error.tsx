"use client";

import {
  PantallaDeError,
  type PropsDeBoundary,
} from "@/components/platform/pantalla-de-error";
import { paths } from "@/routes";

/**
 * Error de Leads o de la ficha del lead de Limitless Webinars (SCRUM-546): la
 * caída queda en la pantalla y la navegación sigue. Sale a Inicio (una cuenta
 * sin el módulo del Panel la redirige a su pantalla de inicio). Captura en
 * Sentry y nunca muestra el mensaje interno.
 */
export default function ErrorDeLeads(props: PropsDeBoundary) {
  return (
    <PantallaDeError
      {...props}
      boundary="webinar-leads"
      titulo="No pudimos cargar Leads"
      inicio={{ href: paths.platform.inicio, texto: "Ir al inicio" }}
    />
  );
}

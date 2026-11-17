"use client";

import {
  PantallaDeError,
  type PropsDeBoundary,
} from "@/components/platform/pantalla-de-error";
import { usePantallaDeInicio } from "@/providers/experiencia-provider";

/**
 * Error de Leads o de la ficha del lead de Limitless Webinars (SCRUM-546): la
 * caída queda en la pantalla y la navegación sigue. Sale a la pantalla de
 * inicio de quien mira (`usePantallaDeInicio`, la misma del logo): `/inicio`
 * en webinar, el Panel en `full`, donde `/leads` también se abre. Captura en
 * Sentry y nunca muestra el mensaje interno.
 */
export default function ErrorDeLeads(props: PropsDeBoundary) {
  const inicio = usePantallaDeInicio();
  return (
    <PantallaDeError
      {...props}
      boundary="webinar-leads"
      titulo="No pudimos cargar Leads"
      inicio={{ href: inicio, texto: "Ir al inicio" }}
    />
  );
}

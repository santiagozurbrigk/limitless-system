"use client";

import {
  PantallaDeError,
  type PropsDeBoundary,
} from "@/components/platform/pantalla-de-error";
import { usePantallaDeInicio } from "@/providers/experiencia-provider";
import { destinoDelErrorDeLeads } from "@/lib/webinar/destino-del-error";

/**
 * Error de Leads o de la ficha del lead de Limitless Webinars (SCRUM-546): la
 * caída queda en la pantalla y la navegación sigue. Sale a la pantalla de
 * inicio de quien mira (`usePantallaDeInicio`, la misma del logo): `/inicio`
 * en webinar, el Panel en `full`, donde `/leads` también se abre. Si esa
 * pantalla es Leads misma (un rol con Ventas y sin Inicio), a Ajustes, que es
 * libre (`destinoDelErrorDeLeads`). Captura en Sentry y nunca muestra el
 * mensaje interno.
 */
export default function ErrorDeLeads(props: PropsDeBoundary) {
  const inicio = destinoDelErrorDeLeads(usePantallaDeInicio());
  return (
    <PantallaDeError
      {...props}
      boundary="webinar-leads"
      titulo="No pudimos cargar Leads"
      inicio={inicio}
    />
  );
}

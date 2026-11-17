"use client";

import {
  PantallaDeError,
  type PropsDeBoundary,
} from "@/components/platform/pantalla-de-error";
import { destinoDelErrorDeLeads, puedeAbrirModulo } from "@/lib/webinar/destino-del-error";
import { usePantallaDeInicio } from "@/providers/experiencia-provider";
import { usePermissions } from "@/providers/permissions-provider";

/**
 * Error de Leads o de la ficha del lead de Limitless Webinars (SCRUM-546): la
 * caída queda en la pantalla y la navegación sigue. Sale a la pantalla de
 * inicio de quien mira (`usePantallaDeInicio`, la misma del logo): `/inicio`
 * en webinar, el Panel en `full`, donde `/leads` también se abre. Si esa
 * pantalla es Leads misma, a Ajustes si la puede abrir; si no, sin enlace
 * (`destinoDelErrorDeLeads`). Captura en Sentry y nunca muestra el mensaje
 * interno.
 */
export default function ErrorDeLeads(props: PropsDeBoundary) {
  const inicio = destinoDelErrorDeLeads(
    usePantallaDeInicio(),
    puedeAbrirModulo(usePermissions(), "settings")
  );
  return (
    <PantallaDeError
      {...props}
      boundary="webinar-leads"
      titulo="No pudimos cargar Leads"
      inicio={inicio}
    />
  );
}

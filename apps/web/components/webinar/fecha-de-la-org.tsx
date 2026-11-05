"use client";

import { formatearInstante } from "@/lib/webinar/leads/config";
import { useZonaDeLaOrganizacion } from "@/providers/zona-de-la-organizacion-provider";

/**
 * Un instante en la zona horaria de la organización (SCRUM-545, DT-17). La
 * zona llega por el provider del layout de la plataforma; sin provider (o sin
 * zona elegida) se usa la de por defecto. Es la única hoja con hook de Leads y
 * de la ficha fuera del envoltorio del panel: sólo lee el contexto.
 */
export function FechaDeLaOrg({ iso }: { iso: string }) {
  const zona = useZonaDeLaOrganizacion();
  return <time dateTime={iso}>{formatearInstante(iso, zona)}</time>;
}

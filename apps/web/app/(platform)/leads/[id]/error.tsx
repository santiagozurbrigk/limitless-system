"use client";

import {
  PantallaDeError,
  type PropsDeBoundary,
} from "@/components/platform/pantalla-de-error";
import { paths } from "@/routes/paths";

/**
 * Error de la ficha de un lead de Limitless Webinars (SCRUM-546): la caída
 * queda en la ficha, con su propio título, y sale a la lista de Leads, que es
 * otra pantalla (si la lista también falla, su `error.tsx` la cubre). Captura
 * en Sentry y nunca muestra el mensaje interno.
 */
export default function ErrorDeLaFichaDelLead(props: PropsDeBoundary) {
  return (
    <PantallaDeError
      {...props}
      boundary="webinar-ficha-del-lead"
      titulo="No pudimos cargar la ficha del lead"
      inicio={{ href: paths.platform.webinars.leads, texto: "Volver a Leads" }}
    />
  );
}

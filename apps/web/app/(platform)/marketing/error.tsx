"use client";

import {
  PantallaDeError,
  type PropsDeBoundary,
} from "@/components/platform/pantalla-de-error";
import { paths } from "@/routes";

/**
 * Error de una pantalla de Marketing: la caída queda en el módulo y el resto
 * de la plataforma sigue andando (SCRUM-108). El resto lo hace
 * `PantallaDeError`: captura en Sentry, nunca muestra el mensaje interno y da
 * el código de referencia.
 */
export default function ErrorDeMarketing(props: PropsDeBoundary) {
  return (
    <PantallaDeError
      {...props}
      boundary="marketing"
      titulo="No pudimos cargar Marketing"
      inicio={{ href: paths.platform.dashboard, texto: "Ir al panel" }}
    />
  );
}

"use client";

import {
  PantallaDeError,
  type PropsDeBoundary,
} from "@/components/platform/pantalla-de-error";
import { paths } from "@/routes";

/**
 * Error de una pantalla de la plataforma, dentro de la cáscara: la navegación
 * sigue visible (SCRUM-108). El resto lo hace `PantallaDeError`: captura en
 * Sentry, nunca muestra el mensaje interno y da el código de referencia.
 */
export default function ErrorDeLaPlataforma(props: PropsDeBoundary) {
  return (
    <PantallaDeError
      {...props}
      boundary="plataforma"
      titulo="No pudimos cargar esta sección"
      inicio={{ href: paths.platform.dashboard, texto: "Ir al panel" }}
    />
  );
}

"use client";

import {
  PantallaDeError,
  type PropsDeBoundary,
} from "@/components/platform/pantalla-de-error";
import { paths } from "@/routes";

/**
 * Error de una pantalla del Agente: la caída queda en el módulo y el resto de
 * la plataforma sigue andando (SCRUM-108). El resto lo hace `PantallaDeError`:
 * captura en Sentry, nunca muestra el mensaje interno y da el código de
 * referencia.
 */
export default function ErrorDelAgente(props: PropsDeBoundary) {
  return (
    <PantallaDeError
      {...props}
      boundary="agente"
      titulo="No pudimos cargar el Agente"
      inicio={{ href: paths.platform.dashboard, texto: "Ir al panel" }}
    />
  );
}

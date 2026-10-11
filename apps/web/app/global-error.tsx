"use client";

import {
  useBoundaryDeError,
  type PropsDeBoundary,
} from "@/components/platform/pantalla-de-error";
import { brand } from "@/lib/brand";
import { paths } from "@/routes";

/**
 * La última pantalla de error: la que se ve cuando falla el layout raíz o un
 * layout que no tiene un `error.tsx` arriba, como el de la plataforma cuando no
 * se pueden leer los permisos (SCRUM-108).
 *
 * Reemplaza al layout raíz, así que trae su propio `<html>` y `<body>` y no
 * tiene ni los estilos de la app ni el tema: los estilos van en línea y en
 * colores neutros que se leen en claro y en oscuro.
 *
 * Captura en Sentry (`useBoundaryDeError`, que también arma el reintento). No
 * muestra el mensaje ni el stack del error; sólo el código de referencia.
 */

const estilos = {
  body: {
    margin: 0,
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px",
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    background: "#0b0b0c",
    color: "#ededed",
  },
  caja: { maxWidth: "440px", textAlign: "center" as const },
  marca: {
    fontSize: "12px",
    letterSpacing: "0.2em",
    textTransform: "uppercase" as const,
    opacity: 0.6,
    margin: "0 0 24px",
  },
  titulo: { fontSize: "20px", fontWeight: 600, margin: "0 0 8px" },
  texto: { fontSize: "14px", lineHeight: 1.5, opacity: 0.75, margin: 0 },
  codigo: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    background: "rgba(255,255,255,0.08)",
    borderRadius: "4px",
    padding: "2px 6px",
  },
  acciones: {
    display: "flex",
    gap: "12px",
    justifyContent: "center",
    flexWrap: "wrap" as const,
    marginTop: "24px",
  },
  boton: {
    font: "inherit",
    fontSize: "13px",
    fontWeight: 500,
    padding: "9px 18px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.2)",
    background: "#ededed",
    color: "#0b0b0c",
    cursor: "pointer",
  },
  link: {
    fontSize: "13px",
    fontWeight: 500,
    padding: "9px 18px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.2)",
    color: "inherit",
    textDecoration: "none",
  },
};

export default function GlobalError({ error, reset }: PropsDeBoundary) {
  const reintentar = useBoundaryDeError(error, reset, "global");

  return (
    <html lang="es">
      <body style={estilos.body}>
        <main role="alert" style={estilos.caja}>
          <p style={estilos.marca}>{brand.name}</p>
          <h1 style={estilos.titulo}>No pudimos cargar la plataforma</h1>
          <p style={estilos.texto}>
            Algo falló de nuestro lado. Lo que ya guardaste no se perdió. Probá
            de nuevo en unos segundos; si sigue pasando, avisale a soporte
            {error.digest ? " con el código de referencia" : ""}.
          </p>
          {error.digest ? (
            <p style={{ ...estilos.texto, marginTop: "12px" }}>
              Código de referencia:{" "}
              <code style={estilos.codigo}>{error.digest}</code>
            </p>
          ) : null}
          <div style={estilos.acciones}>
            <button type="button" onClick={reintentar} style={estilos.boton}>
              Reintentar
            </button>
            {/*
              Un `<a>` y no `Link`: con el layout raíz caído, ir al inicio
              tiene que ser una carga completa de la página.
            */}
            <a href={paths.platform.dashboard} style={estilos.link}>
              Ir al inicio
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}

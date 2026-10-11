/**
 * SCRUM-108: las pantallas de error propias.
 *
 * Se prueban el componente compartido y cada boundary real (`global-error`,
 * plataforma, super admin y los módulos): el texto en español, que el
 * "Reintentar" llama a `reset` (y refresca lo que vino del servidor), que el
 * error va a Sentry, que nunca se ve el mensaje interno ni el stack y que el
 * código de referencia sí.
 *
 * Corren en Node, sin DOM: el HTML sale de `renderToStaticMarkup` y el click se
 * simula llamando al `onClick` del botón que devuelve el componente. Como en
 * el servidor los efectos no corren, `useEffect` se reemplaza por uno que
 * corre al toque: así se ve la captura en Sentry.
 */

import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
  capturas: [] as Array<{ error: unknown; contexto: unknown }>,
  refrescos: 0,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: (error: unknown, contexto: unknown) => sim.capturas.push({ error, contexto }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => (sim.refrescos += 1) }),
}));
vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  return { ...real, useEffect: (efecto: () => void) => efecto() };
});

import GlobalError from "@/app/global-error";
import ErrorDeLaPlataforma from "@/app/(platform)/error";
import ErrorDelSuperAdmin from "@/app/(super-admin)/error";
import ErrorDeMarketing from "@/app/(platform)/marketing/error";
import ErrorDelTablero from "@/app/(platform)/workboard/error";
import ErrorDelAgente from "@/app/(platform)/agent/error";
import ErrorDeVentas from "@/app/(platform)/sales/error";
import NoEncontradoEnLaPlataforma from "@/app/(platform)/not-found";
import type { PropsDeBoundary } from "../pantalla-de-error";

type Boundary = (props: PropsDeBoundary) => ReactNode;

const MENSAJE_INTERNO = 'relation "public.clients" does not exist';
const STACK_INTERNO = "at loadClients (/var/task/apps/web/lib/clients/queries.ts:42:11)";

function errorDelServidor(digest?: string): PropsDeBoundary["error"] {
  const error = new Error(MENSAJE_INTERNO) as PropsDeBoundary["error"];
  error.stack = `Error: ${MENSAJE_INTERNO}\n    ${STACK_INTERNO}`;
  if (digest) error.digest = digest;
  return error;
}

function html(boundary: Boundary, props: PropsDeBoundary): string {
  return renderToStaticMarkup(createElement(boundary, props));
}

/**
 * Busca el elemento con `onClick` cuyo texto es "Reintentar", expandiendo los
 * componentes función (no los `forwardRef`, como el `Button` de la UI).
 */
function botonReintentar(nodo: ReactNode): (() => void) | null {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) {
      const encontrado = botonReintentar(hijo);
      if (encontrado) return encontrado;
    }
    return null;
  }
  if (!isValidElement(nodo)) return null;
  const elemento = nodo as ReactElement<{ onClick?: () => void; children?: ReactNode }>;
  if (typeof elemento.type === "function") {
    return botonReintentar((elemento.type as (p: unknown) => ReactNode)(elemento.props));
  }
  if (elemento.props.onClick && elemento.props.children === "Reintentar") {
    return elemento.props.onClick;
  }
  return botonReintentar(elemento.props.children);
}

const BOUNDARIES: Array<[string, Boundary, string, string]> = [
  ["global-error", GlobalError, "global", "No pudimos cargar la plataforma"],
  ["(platform)/error", ErrorDeLaPlataforma, "plataforma", "No pudimos cargar esta sección"],
  ["(super-admin)/error", ErrorDelSuperAdmin, "super-admin", "No pudimos cargar esta sección"],
  ["(platform)/marketing/error", ErrorDeMarketing, "marketing", "No pudimos cargar Marketing"],
  ["(platform)/workboard/error", ErrorDelTablero, "tablero", "No pudimos cargar el Tablero"],
  ["(platform)/agent/error", ErrorDelAgente, "agente", "No pudimos cargar el Agente"],
  ["(platform)/sales/error", ErrorDeVentas, "ventas", "No pudimos cargar Ventas"],
];

beforeEach(() => {
  sim.capturas = [];
  sim.refrescos = 0;
});

describe.each(BOUNDARIES)("%s", (_ruta, boundary, etiqueta, titulo) => {
  it("muestra el texto en español con Reintentar y un link para salir", () => {
    const pagina = html(boundary, { error: errorDelServidor(), reset: () => {} });
    expect(pagina).toContain(titulo);
    expect(pagina).toContain("Algo falló de nuestro lado.");
    expect(pagina).toContain("Reintentar");
    expect(pagina).toMatch(/<a [^>]*href="\/[^"]*"/);
  });

  it("⭐ nunca muestra el mensaje interno ni el stack", () => {
    const pagina = html(boundary, { error: errorDelServidor("1234567890"), reset: () => {} });
    expect(pagina).not.toContain("public.clients");
    expect(pagina).not.toContain("does not exist");
    expect(pagina).not.toContain("loadClients");
    expect(pagina).not.toContain("queries.ts");
  });

  it("⭐ muestra el código de referencia si el error lo trae, y no lo menciona si no", () => {
    const conCodigo = html(boundary, { error: errorDelServidor("3841936291"), reset: () => {} });
    expect(conCodigo).toContain("Código de referencia");
    expect(conCodigo).toContain("3841936291");

    const sinCodigo = html(boundary, { error: errorDelServidor(), reset: () => {} });
    expect(sinCodigo).not.toContain("Código de referencia");
    expect(sinCodigo).not.toContain("con el código de referencia");
  });

  it("⭐ manda el error a Sentry con el boundary y el código de referencia", () => {
    const error = errorDelServidor("3841936291");
    html(boundary, { error, reset: () => {} });
    expect(sim.capturas).toEqual([
      { error, contexto: { tags: { boundary: etiqueta, error_digest: "3841936291" } } },
    ]);
  });

  it("⭐ Reintentar llama a reset y refresca lo que vino del servidor", () => {
    const reset = vi.fn();
    const onClick = botonReintentar(boundary({ error: errorDelServidor(), reset }));
    expect(onClick).toBeTypeOf("function");
    onClick!();
    expect(reset).toHaveBeenCalledOnce();
    expect(sim.refrescos).toBe(1);
  });
});

describe("global-error", () => {
  it("trae su propio <html> y <body>, porque reemplaza al layout raíz", () => {
    const pagina = html(GlobalError, { error: errorDelServidor(), reset: () => {} });
    expect(pagina).toMatch(/^<html lang="es">/);
    expect(pagina).toContain("<body");
  });
});

describe("(platform)/not-found", () => {
  it("dice en voseo que no se encontró y ofrece volver al panel", () => {
    const pagina = renderToStaticMarkup(createElement(NoEncontradoEnLaPlataforma));
    expect(pagina).toContain("No encontramos lo que buscás");
    expect(pagina).toContain("Volvé al panel");
    expect(pagina).toContain('href="/dashboard"');
  });
});

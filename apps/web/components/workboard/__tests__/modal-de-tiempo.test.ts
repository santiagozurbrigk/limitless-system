/**
 * MAYOR-1 de la AR pasada 2 de SCRUM-503: si el tiempo ya quedó registrado en
 * este intento (el completado rechazó después), el modal lo dice y no deja
 * cambiar los minutos: confirmar sólo completa. Antes los minutos nuevos se
 * ignoraban sin aviso.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// El Dialog real usa un portal; acá alcanza con dibujar su contenido.
vi.mock("@ai-coo/ui", () => {
  const pasa = ({ children }: { children?: unknown }) => children ?? null;
  return {
    Dialog: pasa,
    DialogContent: pasa,
    DialogDescription: pasa,
    DialogFooter: pasa,
    DialogHeader: pasa,
    DialogTitle: pasa,
    Label: pasa,
    Button: (props: Record<string, unknown>) => createElement("button", props),
    Input: (props: Record<string, unknown>) => createElement("input", props),
    Textarea: (props: Record<string, unknown>) => createElement("textarea", props),
    cn: (...clases: unknown[]) => clases.filter(Boolean).join(" "),
  };
});

import { LogTimeModal, minutosAConfirmar } from "../log-time-modal";

const BASE = {
  taskId: "t1",
  taskTitle: "Llamar a Ana",
  onConfirm: async () => true,
  onSkip: async () => undefined,
  onCancel: async () => undefined,
  open: true,
};

describe("minutosAConfirmar", () => {
  it("sin tiempo registrado confirma lo del formulario, y nada si es cero", () => {
    expect(minutosAConfirmar(45)).toBe(45);
    expect(minutosAConfirmar(0)).toBeNull();
  });

  it("⭐ con tiempo ya registrado confirma esos minutos, aunque el formulario diga otra cosa", () => {
    expect(minutosAConfirmar(45, 30)).toBe(30);
    expect(minutosAConfirmar(0, 30)).toBe(30);
  });
});

describe("LogTimeModal", () => {
  it("⭐ con tiempo ya registrado lo avisa y deshabilita los minutos y la nota", () => {
    const html = renderToStaticMarkup(createElement(LogTimeModal, { ...BASE, minutosYaRegistrados: 30 }));
    expect(html).toContain("Ya quedaron registrados 30 minutos");
    expect(html).toContain("el tiempo no se vuelve a cargar");
    const campos = html.match(/<(input|textarea)[^>]*>/g) ?? [];
    expect(campos).toHaveLength(3);
    for (const campo of campos) expect(campo).toContain("disabled");
  });

  it("sin tiempo registrado, los campos se pueden editar y no hay aviso", () => {
    const html = renderToStaticMarkup(createElement(LogTimeModal, BASE));
    expect(html).not.toContain("Ya quedaron registrados");
    const campos = html.match(/<(input|textarea)[^>]*>/g) ?? [];
    expect(campos).toHaveLength(3);
    for (const campo of campos) expect(campo).not.toContain("disabled");
  });
});

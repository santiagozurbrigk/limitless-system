/**
 * SCRUM-503 (revisión 4, MENOR-1): el modal de tiempo no se cierra mientras
 * guarda. Este test conecta lo que el de `modal-de-tiempo.test.ts` prueba por
 * separado: que el `onOpenChange` del Dialog (Escape, el overlay, la X) mire
 * si se está guardando, y que el botón Cancelar quede deshabilitado.
 *
 * Sin DOM, los hooks del modal se reemplazan por unos mínimos que guardan el
 * estado entre renders, y el Dialog y los botones mockeados guardan sus
 * handlers para llamarlos como lo haría el navegador.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => {
  let celdas: unknown[] = [];
  let i = 0;
  return {
    reiniciar() {
      celdas = [];
      i = 0;
    },
    empezarRender() {
      i = 0;
    },
    useState(inicial: unknown) {
      const k = i++;
      if (!(k in celdas)) celdas[k] = typeof inicial === "function" ? (inicial as () => unknown)() : inicial;
      return [
        celdas[k],
        (v: unknown) => {
          celdas[k] = typeof v === "function" ? (v as (x: unknown) => unknown)(celdas[k]) : v;
        },
      ];
    },
    onOpenChange: null as null | ((abierto: boolean) => void),
    botones: {} as Record<string, { onClick?: () => void; disabled?: boolean }>,
  };
});

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: sim.useState,
  useEffect: () => {},
  useMemo: (f: () => unknown) => f(),
}));

vi.mock("@ai-coo/ui", async () => {
  const { createElement: h, Fragment } = await vi.importActual<typeof import("react")>("react");
  const pasa = ({ children }: { children?: unknown }) => h(Fragment, null, children as never);
  return {
    Dialog: (props: { onOpenChange: (abierto: boolean) => void; children?: unknown }) => {
      sim.onOpenChange = props.onOpenChange;
      return h(Fragment, null, props.children as never);
    },
    DialogContent: pasa,
    DialogDescription: pasa,
    DialogFooter: pasa,
    DialogHeader: pasa,
    DialogTitle: pasa,
    Label: pasa,
    Button: (props: { children?: unknown; onClick?: () => void; disabled?: boolean }) => {
      sim.botones[String(props.children)] = { onClick: props.onClick, disabled: props.disabled };
      return h("button", { disabled: props.disabled }, props.children as never);
    },
    Input: (props: Record<string, unknown>) => h("input", props),
    Textarea: (props: Record<string, unknown>) => h("textarea", props),
    cn: (...clases: unknown[]) => clases.filter(Boolean).join(" "),
  };
});

import { LogTimeModal } from "../log-time-modal";

function pendiente() {
  let resolver: (v: boolean) => void = () => {};
  const promesa = new Promise<boolean>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

const esperar = () => new Promise((r) => setTimeout(r, 0));

function dibujar(props: Record<string, unknown>): string {
  sim.empezarRender();
  sim.botones = {};
  return renderToStaticMarkup(createElement(LogTimeModal, props as never));
}

beforeEach(() => {
  sim.reiniciar();
  sim.onOpenChange = null;
});

describe("LogTimeModal · no se cierra mientras guarda", () => {
  it.each([
    ["sin tiempo registrado", null, "Registrar tiempo", "Registrando…"],
    ["con el tiempo ya registrado", 30, "Completar tarea", "Completando…"],
  ] as const)(
    "⭐ %s: Escape/overlay/X no cancelan mientras guarda, Cancelar queda deshabilitado, y después sí cancelan",
    async (_caso, minutosYaRegistrados, boton, guardando) => {
      const confirmacion = pendiente();
      const onCancel = vi.fn(async () => undefined);
      const props = {
        taskId: "t1",
        taskTitle: "Llamar",
        open: true,
        minutosYaRegistrados,
        onConfirm: () => confirmacion.promesa,
        onSkip: async () => undefined,
        onCancel,
      };

      dibujar(props);
      sim.botones[boton].onClick?.();

      const mientras = dibujar(props);
      expect(mientras).toContain(guardando);
      expect(sim.botones.Cancelar.disabled).toBe(true);
      sim.onOpenChange?.(false);
      expect(onCancel).not.toHaveBeenCalled();

      confirmacion.resolver(false);
      await esperar();

      dibujar(props);
      expect(sim.botones.Cancelar.disabled).toBe(false);
      sim.onOpenChange?.(false);
      expect(onCancel).toHaveBeenCalledTimes(1);
    }
  );
});

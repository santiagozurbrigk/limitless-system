/**
 * SCRUM-503: lo que hacen las pantallas del Tablero cuando una acción rechaza.
 * El provider ya avisó el motivo; acá se prueba que la pantalla no siga como si
 * hubiera salido: el selector del detalle vuelve a lo que había, el modal de
 * tiempo no muestra "listo" y el formulario de alta queda abierto.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/workboard/actions", () => ({}));
vi.mock("@/app/workboard/task-link-actions", () => ({}));

import { cambiarConReversion } from "../workboard-task-detail-dialog";
import { confirmarTiempo } from "../log-time-modal";
import { altaDeTarea } from "../workboard-shell";
import type { WorkboardTask } from "@/types/workboard";

describe("cambiarConReversion (selectores de sprint y lanzamiento del detalle)", () => {
  it("⭐ si la acción rechaza, el selector vuelve al valor anterior", async () => {
    const valores: string[] = [];
    await cambiarConReversion({
      anterior: "s1",
      siguiente: "s2",
      setValor: (v) => valores.push(v),
      asignar: async () => false,
    });
    expect(valores).toEqual(["s2", "s1"]);
  });

  it("si sale, queda el valor nuevo", async () => {
    const valores: string[] = [];
    await cambiarConReversion({
      anterior: "",
      siguiente: "l1",
      setValor: (v) => valores.push(v),
      asignar: async () => true,
    });
    expect(valores).toEqual(["l1"]);
  });
});

describe("confirmarTiempo (modal de tiempo)", () => {
  it("⭐ si no se guardó, no muestra «listo»", async () => {
    const onConfirm = vi.fn(async () => false);
    await expect(confirmarTiempo(onConfirm, 30, "nota")).resolves.toBe(false);
    expect(onConfirm).toHaveBeenCalledWith(30, "nota");
  });

  it("si se guardó (o quien llama no dice nada), muestra «listo»", async () => {
    await expect(confirmarTiempo(async () => true, 30)).resolves.toBe(true);
    await expect(confirmarTiempo(async () => undefined, 30)).resolves.toBe(true);
  });
});

describe("altaDeTarea (formulario de alta)", () => {
  const TAREA = { id: "t1" } as WorkboardTask;

  it("⭐ si la acción rechaza, el formulario queda abierto y no se aplican recursos", async () => {
    const aplicarRecursos = vi.fn(async () => null);
    const recargar = vi.fn(async () => undefined);
    const avisar = vi.fn();
    await expect(
      altaDeTarea({ crear: async () => null, aplicarRecursos, recargar, avisar })
    ).resolves.toBe(false);
    expect(aplicarRecursos).not.toHaveBeenCalled();
    expect(recargar).not.toHaveBeenCalled();
    expect(avisar).not.toHaveBeenCalled();
  });

  it("si se creó, aplica los recursos, la recarga y cierra", async () => {
    const aplicarRecursos = vi.fn(async () => null);
    const recargar = vi.fn(async () => undefined);
    const avisar = vi.fn();
    await expect(
      altaDeTarea({ crear: async () => TAREA, aplicarRecursos, recargar, avisar })
    ).resolves.toBe(true);
    expect(aplicarRecursos).toHaveBeenCalledWith("t1");
    expect(recargar).toHaveBeenCalledWith("t1");
    expect(avisar).not.toHaveBeenCalled();
  });

  it("si un recurso no se pudo aplicar, avisa el motivo y cierra igual (la tarea ya existe)", async () => {
    const avisar = vi.fn();
    await expect(
      altaDeTarea({
        crear: async () => TAREA,
        aplicarRecursos: async () => "Documento no encontrado",
        recargar: async () => undefined,
        avisar,
      })
    ).resolves.toBe(true);
    expect(avisar).toHaveBeenCalledWith({
      title: "Tarea creada con advertencias",
      description: "Documento no encontrado",
    });
  });
});

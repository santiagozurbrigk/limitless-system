import { describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";
import {
  MODULOS_DE_LAS_LECTURAS_DEL_MARCO,
  leerDelMarco,
  puedeLeerDelMarco,
  type LecturaDelMarco,
} from "@/lib/auth/lecturas-del-marco";
import type { RechazoPorModulo } from "@/lib/auth/regla-de-modulo";

/**
 * SCRUM-540 · Las lecturas del marco de la plataforma: qué módulos abre cada
 * una y cómo las pide un provider del cliente (`leerDelMarco`).
 */

function member(modulos: Partial<UserPermissions["modules"]>): UserPermissions {
  return {
    role: "member",
    isFounder: false,
    modules: { ...emptyPermissions(), ...modulos },
    hasRoleConfigured: true,
    enabledAddOns: [],
  };
}
const sinNada = member({ team: "full", settings: "view" });
const founder: UserPermissions = { ...member({}), role: "founder", isFounder: true };
const sinRol: UserPermissions = { ...member({}), hasRoleConfigured: false };
const RECHAZO: RechazoPorModulo = {
  success: false,
  error: "No tenés acceso a Clientes.",
  motivo: "sin-acceso",
  moduleId: "clients",
};

describe("puedeLeerDelMarco", () => {
  it("⭐ cada lectura se abre con cualquiera de sus módulos y con ningún otro", () => {
    const todos = Object.keys(emptyPermissions()) as Array<keyof UserPermissions["modules"]>;
    for (const [lectura, modulos] of Object.entries(MODULOS_DE_LAS_LECTURAS_DEL_MARCO)) {
      for (const moduleId of todos) {
        const abre = (modulos as readonly string[]).includes(moduleId);
        expect(
          puedeLeerDelMarco(member({ [moduleId]: "view" }), lectura as LecturaDelMarco),
          `${lectura} con ${moduleId}`
        ).toBe(abre);
      }
    }
  });

  it("⭐ la tabla de mínimo privilegio: cada módulo abre sólo lo que sus pantallas muestran", () => {
    expect(MODULOS_DE_LAS_LECTURAS_DEL_MARCO).toEqual({
      clientes: ["clients", "sales", "finance"],
      llamadasDeCierre: ["sales", "finance"],
      conversaciones: ["sales"],
      detalleDeFinanzas: ["finance"],
      plataformasDePago: ["finance", "sales", "settings"],
      resumenFinanciero: ["finance", "sales"],
      cobros: ["finance"],
      metricasImportadas: ["finance", "sales"],
      instagram: ["marketing", "integrations"],
      reportesEjecutivos: ["operations"],
      llamadasPendientes: ["clients"],
    });
    // El Panel no abre ninguna: sus totales los calcula su página en el servidor.
    for (const modulos of Object.values(MODULOS_DE_LAS_LECTURAS_DEL_MARCO)) {
      expect(modulos as readonly string[]).not.toContain("dashboard");
    }
  });

  it("el founder y alguien sin rol leen todo; sin ningún módulo de datos, nada", () => {
    for (const lectura of Object.keys(MODULOS_DE_LAS_LECTURAS_DEL_MARCO) as LecturaDelMarco[]) {
      expect(puedeLeerDelMarco(founder, lectura)).toBe(true);
      expect(puedeLeerDelMarco(sinRol, lectura)).toBe(true);
      expect(puedeLeerDelMarco(sinNada, lectura), lectura).toBe(
        lectura === "plataformasDePago" // Ajustes (sólo ver) abre las plataformas de cobro
      );
    }
  });
});

describe("leerDelMarco", () => {
  it("⭐ sin el módulo no llama a la action y devuelve el vacío", async () => {
    const leer = vi.fn(async () => ["dato"]);
    await expect(leerDelMarco(sinNada, "clientes", leer, [] as string[])).resolves.toEqual([]);
    expect(leer).not.toHaveBeenCalled();
  });

  it("con el módulo devuelve lo que devuelve la action", async () => {
    const leer = vi.fn(async () => ["dato"]);
    await expect(leerDelMarco(member({ sales: "view" }), "clientes", leer, [] as string[])).resolves.toEqual(["dato"]);
    expect(leer).toHaveBeenCalledTimes(1);
  });

  it("si el servidor rechaza igual (permisos que cambiaron), el vacío, sin error", async () => {
    const leer = async (): Promise<string[] | RechazoPorModulo> => RECHAZO;
    await expect(leerDelMarco(member({ sales: "view" }), "clientes", leer, [] as string[])).resolves.toEqual([]);
  });

  it("una falla de la lectura sigue su camino como antes", async () => {
    const leer = async (): Promise<string[]> => {
      throw new Error("fetch failed");
    };
    await expect(leerDelMarco(founder, "clientes", leer, [] as string[])).rejects.toThrow("fetch failed");
  });
});

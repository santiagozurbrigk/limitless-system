import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FathomMeetingRecord } from "@/lib/fathom/api";
import { registrarFallasDeSync } from "@/lib/fathom/fallas-de-sync";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * SCRUM-36 · registro de fallas de la sync de Fathom: si la tabla no se puede
 * leer o escribir, la reunión que falló queda sin registro (frena el cursor y
 * no se descarta). Ante la duda se reintenta.
 */

type Admin = ReturnType<typeof createAdminClient>;

function reunion(id: string): FathomMeetingRecord {
  return { id, recording_id: id, title: id, calendar_invitees: [], created_at: "2026-10-05T07:00:00Z" };
}

const AHORA = new Date("2026-10-05T09:00:00Z");
const CONEXION = { organizationId: "org-1", userId: null };

/** Un admin cuyas operaciones devuelven el error indicado. */
function adminQueFalla(falla: { lectura?: boolean; escritura?: boolean; filas?: unknown[] }): Admin {
  const builder = (op: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "in", "lt", "update", "delete"]) b[m] = () => b;
    b.then = (resolve: (v: unknown) => void) => {
      if (op === "select") {
        resolve(falla.lectura ? { data: null, error: { message: "sin tabla" } } : { data: falla.filas ?? [], error: null });
      } else {
        resolve({ error: falla.escritura ? { message: "no se pudo escribir" } : null });
      }
    };
    return b;
  };
  return {
    from: () => ({
      select: () => builder("select"),
      update: () => builder("update"),
      delete: () => builder("delete"),
      insert: () => builder("insert"),
    }),
  } as unknown as Admin;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("registrarFallasDeSync", () => {
  it("la tabla no se puede leer: devuelve los resultados sin registro de fallas", async () => {
    const resultados = [{ meeting: reunion("1"), guardada: false }];
    const salida = await registrarFallasDeSync(adminQueFalla({ lectura: true }), CONEXION, resultados, AHORA);
    expect(salida).toEqual(resultados);
    expect(salida[0].falla).toBeUndefined();
  });

  it("no se puede abrir el registro: la reunión queda sin falla (frena, no se descarta)", async () => {
    const salida = await registrarFallasDeSync(
      adminQueFalla({ escritura: true }),
      CONEXION,
      [{ meeting: reunion("1"), guardada: false }],
      AHORA
    );
    expect(salida[0].falla).toBeUndefined();
  });

  it("no se puede sumar el intento: tampoco devuelve la cuenta vieja", async () => {
    const filas = [{ id: "f1", fathom_call_id: "1", primera_falla_at: "2026-10-01T00:00:00Z", intentos: 9, descartada_at: null }];
    const salida = await registrarFallasDeSync(
      adminQueFalla({ escritura: true, filas }),
      CONEXION,
      [{ meeting: reunion("1"), guardada: false }],
      AHORA
    );
    expect(salida[0].falla).toBeUndefined();
  });

  it("suma el intento a un registro abierto y conserva la primera falla", async () => {
    const filas = [{ id: "f1", fathom_call_id: "1", primera_falla_at: "2026-10-01T00:00:00Z", intentos: 2, descartada_at: null }];
    const salida = await registrarFallasDeSync(adminQueFalla({ filas }), CONEXION, [{ meeting: reunion("1"), guardada: false }], AHORA);
    expect(salida[0].falla).toEqual({ primeraFallaAt: "2026-10-01T00:00:00Z", intentos: 3 });
  });

  it("⭐ una descartada que vuelve sigue descartada: no suma intentos ni escribe", async () => {
    const filas = [{ id: "f1", fathom_call_id: "1", primera_falla_at: "2026-10-01T00:00:00Z", intentos: 6, descartada_at: "2026-10-02T00:00:00Z" }];
    // Si intentara escribir, este admin devolvería error y la reunión quedaría sin `falla`.
    const salida = await registrarFallasDeSync(
      adminQueFalla({ filas, escritura: true }),
      CONEXION,
      [{ meeting: reunion("1"), guardada: false }],
      AHORA
    );
    expect(salida[0].falla).toEqual({ primeraFallaAt: "2026-10-01T00:00:00Z", intentos: 6, descartada: true });
  });

  it("sin resultados sólo limpia las filas viejas de la conexión", async () => {
    const tablas: string[] = [];
    const ops: string[] = [];
    const b: Record<string, unknown> = {};
    for (const m of ["eq", "is", "lt"]) b[m] = () => b;
    b.then = (resolve: (v: unknown) => void) => resolve({ error: null });
    const admin = {
      from: (t: string) => {
        tablas.push(t);
        return { delete: () => (ops.push("delete"), b) };
      },
    } as unknown as Admin;
    expect(await registrarFallasDeSync(admin, CONEXION, [], AHORA)).toEqual([]);
    expect(tablas).toEqual(["fathom_sync_fallas"]);
    expect(ops).toEqual(["delete"]);
  });
});

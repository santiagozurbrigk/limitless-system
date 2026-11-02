import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * SCRUM-523 · fix-pack 1 de A1 (AR, BLQ-ALTO-1): la lista `EXPERIENCIAS` de la
 * app y el CHECK `organizations_experience_check` de la base tienen los mismos
 * valores.
 *
 * El test lee las migraciones de `supabase/migrations` en orden de versión,
 * sin comentarios (`-- ...` y `/* ... *\/`), y sigue cada `drop constraint` y
 * `add constraint ... check (experience in (...))` de
 * `organizations_experience_check`. El CHECK que vale es el que queda después
 * de la última migración. Falla si:
 *   - ninguna migración lo define, o la última que lo nombra lo borra sin
 *     volver a agregarlo;
 *   - un `add constraint` de ese nombre no tiene la forma
 *     `check (experience in ('a', 'b', ...))` (no se puede leer: no se adivina);
 *   - los valores no son exactamente los de `EXPERIENCIAS` (sobra o falta uno,
 *     sin importar el orden).
 *
 * Lo que no ve: SQL armado en tiempo de ejecución (`execute format(...)`), un
 * CHECK cambiado a mano en una base sin pasar por una migración, ni una base
 * local que aplicó una versión vieja de una migración editada (la CLI no la
 * vuelve a correr: ver `docs/operacion/testing.md`). El test de RLS 97
 * compara además la definición del CHECK en la base armada desde cero.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/bootstrap", () => ({
  SIN_ORGANIZACION_VINCULADA: "",
  requireOrganizationId: async () => "org-1",
}));

const { EXPERIENCIAS } = await import("../experience");

const RAIZ = join(__dirname, "..", "..", "..", "..", "..");
const MIGRACIONES = join(RAIZ, "supabase", "migrations");
const RESTRICCION = "organizations_experience_check";

function sinComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

type Estado = { archivo: string; valores: string[] | null };

/** Los valores del CHECK que queda después de aplicar todas las migraciones. */
function checkFinal(): Estado | null {
  const archivos = readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let estado: Estado | null = null;
  for (const archivo of archivos) {
    const sql = sinComentarios(readFileSync(join(MIGRACIONES, archivo), "utf8"));
    if (!sql.includes(RESTRICCION)) continue;
    // Cada sentencia por separado, en el orden del archivo.
    for (const sentencia of sql.split(";")) {
      if (!sentencia.includes(RESTRICCION)) continue;
      if (/drop\s+constraint/i.test(sentencia)) {
        estado = { archivo, valores: null };
        continue;
      }
      if (/add\s+constraint/i.test(sentencia)) {
        const m = sentencia.match(/check\s*\(\s*experience\s+in\s*\(([^)]*)\)\s*\)/i);
        if (!m) throw new Error(`${archivo}: el CHECK ${RESTRICCION} no tiene la forma check (experience in (...))`);
        const partes = m[1].split(",").map((p) => p.trim());
        const valores = partes.map((p) => {
          const literal = p.match(/^'([a-z_]+)'$/);
          if (!literal) throw new Error(`${archivo}: valor del CHECK que no es un literal simple: ${p}`);
          return literal[1];
        });
        estado = { archivo, valores };
      }
    }
  }
  return estado;
}

describe("EXPERIENCIAS y el CHECK de organizations.experience", () => {
  it("alguna migración define el CHECK y la última que lo nombra lo deja puesto", () => {
    const estado = checkFinal();
    expect(estado, "ninguna migración nombra organizations_experience_check").not.toBeNull();
    expect(estado!.valores, `${estado!.archivo} borra el CHECK sin volver a agregarlo`).not.toBeNull();
  });

  it("los valores del CHECK son exactamente los de EXPERIENCIAS", () => {
    const estado = checkFinal();
    const deLaBase = [...(estado?.valores ?? [])].sort();
    const deLaApp = [...EXPERIENCIAS].sort();
    expect(deLaBase, `CHECK de ${estado?.archivo} distinto de EXPERIENCIAS`).toEqual(deLaApp);
  });

  it("el CHECK no repite valores", () => {
    const valores = checkFinal()?.valores ?? [];
    expect(new Set(valores).size).toBe(valores.length);
  });
});

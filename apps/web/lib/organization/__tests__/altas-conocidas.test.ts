import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SCRUM-523 · el inventario de las altas de organizaciones.
 *
 * Toda organización nueva nace en Limitless Webinars por el default de la
 * base, salvo el negocio que un holding crea dentro de su cuenta, que hereda
 * la experiencia del holding. Cada alta está probada con la experiencia que
 * deja. Este test lee el código de la app y falla si aparece un insert o un
 * upsert en `organizations` que no está en la lista: un alta nueva tiene que
 * decidir qué experiencia le corresponde y sumar su test.
 */

const WEB = join(__dirname, "..", "..", "..");
const CARPETAS = ["app", "lib", "components", "server", "api"];

const ALTAS_CONOCIDAS: Record<string, number> = {
  // createFounderAccountAction, createOrganizationFromHoldingAction y
  // createHoldingOrgAction: nacen en webinar (app/super-admin/__tests__).
  "app/super-admin/actions.ts": 3,
  // addBusinessToMyHoldingAction: hereda la del holding.
  "app/(platform)/holding/actions.ts": 1,
  // completeHoldingOnboardingAction: hereda la del holding.
  "app/(platform)/onboarding/holding/actions.ts": 1,
  // ensureUserBootstrap: nace en webinar.
  "lib/auth/bootstrap.ts": 1,
};

function archivos(dir: string): string[] {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entradas.flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) {
      return e.name === "__tests__" || e.name === "node_modules" ? [] : archivos(ruta);
    }
    return /\.(ts|tsx)$/.test(e.name) ? [ruta] : [];
  });
}

const ALTA = /\.from\(\s*["'`]organizations["'`]\s*\)\s*\.(insert|upsert)\s*\(/g;

function altasPorArchivo(): Record<string, number> {
  const encontradas: Record<string, number> = {};
  for (const carpeta of CARPETAS) {
    for (const archivo of archivos(join(WEB, carpeta))) {
      const cantidad = readFileSync(archivo, "utf8").match(ALTA)?.length ?? 0;
      if (cantidad > 0) encontradas[relative(WEB, archivo)] = cantidad;
    }
  }
  return encontradas;
}

describe("altas de organizaciones", () => {
  it("⭐ las únicas que hay son las seis del inventario", () => {
    expect(altasPorArchivo()).toEqual(ALTAS_CONOCIDAS);
  });

  it("el patrón reconoce un alta partida en varias líneas", () => {
    const codigo = 'await admin\n  .from("organizations")\n  .insert({ name })';
    expect(codigo.match(ALTA)).toHaveLength(1);
  });
});

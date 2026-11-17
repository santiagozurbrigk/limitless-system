/**
 * SCRUM-525 · Cada proceso de fondo que arma su lista desde una integración (y
 * no desde `organizations`) aplica el filtro por experiencia. Los tests del
 * filtro no alcanzan si un llamador deja de usarlo: este test lo exige en cada
 * lugar (revisión de #153). Es un chequeo de texto: que el llamador nombre el
 * filtro, no que use bien su resultado. El de Fathom tiene además un test de
 * comportamiento (`lib/fathom/__tests__/cola-sin-webinar.test.ts`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "../../..");

const LLAMADORES: Array<{ archivo: string; funcion: string }> = [
  { archivo: "app/api/cron/daily-signals/route.ts", funcion: "filtrarOrganizacionesConProcesosDeFondo(" },
  { archivo: "app/api/cron/sync-content-metrics/route.ts", funcion: "filtrarOrganizacionesConProcesosDeFondo(" },
  { archivo: "lib/marketing/sync-content-metrics.ts", funcion: "filtrarOrganizacionesConProcesosDeFondo(" },
  { archivo: "lib/fathom/process-call.ts", funcion: "FILTRO_SIN_PROCESOS_DE_FONDO)" },
];

describe("⭐ los procesos de fondo filtran las cuentas webinar", () => {
  it.each(LLAMADORES)("$archivo llama a $funcion", ({ archivo, funcion }) => {
    const codigo = readFileSync(join(RAIZ, archivo), "utf8");
    const sinImports = codigo.replace(/^import[\s\S]*?;$/gm, "");
    expect(sinImports).toContain(funcion);
  });
});

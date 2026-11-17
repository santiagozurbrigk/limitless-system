/**
 * SCRUM-525 · Cada proceso de fondo que arma su lista desde una integración (y
 * no desde `organizations`) aplica el filtro por experiencia. Los tests del
 * filtro no alcanzan si un llamador deja de usarlo: este test lo exige en cada
 * lugar (revisión de #153).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "../../..");

const LLAMADORES: Array<{ archivo: string; funcion: string }> = [
  { archivo: "app/api/cron/daily-signals/route.ts", funcion: "filtrarOrganizacionesConProcesosDeFondo(" },
  { archivo: "app/api/cron/sync-content-metrics/route.ts", funcion: "filtrarOrganizacionesConProcesosDeFondo(" },
  { archivo: "lib/marketing/sync-content-metrics.ts", funcion: "filtrarOrganizacionesConProcesosDeFondo(" },
  { archivo: "lib/fathom/process-call.ts", funcion: "organizacionesSinProcesosDeFondo(" },
];

describe("⭐ los procesos de fondo filtran las cuentas webinar", () => {
  it.each(LLAMADORES)("$archivo llama a $funcion", ({ archivo, funcion }) => {
    const codigo = readFileSync(join(RAIZ, archivo), "utf8");
    const sinImports = codigo.replace(/^import[\s\S]*?;$/gm, "");
    expect(sinImports).toContain(funcion);
  });
});

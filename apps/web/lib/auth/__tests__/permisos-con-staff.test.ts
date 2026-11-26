/**
 * SCRUM-551 · `esStaff` en los permisos de la plataforma (revisión de #153:
 * no tenía test).
 */
import { describe, expect, it, vi } from "vitest";
import { permisosConStaff } from "../permisos-con-staff";

const PERMISOS = { isFounder: true, modules: {} };

describe("⭐ permisosConStaff", () => {
  it("en limitless suma esStaff con lo que diga la lista", async () => {
    await expect(permisosConStaff("limitless", PERMISOS, async () => true)).resolves.toEqual({ ...PERMISOS, esStaff: true });
    await expect(permisosConStaff("limitless", PERMISOS, async () => false)).resolves.toEqual({ ...PERMISOS, esStaff: false });
  });

  it("en webinar y full no consulta la lista ni suma esStaff", async () => {
    for (const experiencia of ["webinar", "full"] as const) {
      const esStaff = vi.fn(async () => true);
      const r = await permisosConStaff(experiencia, PERMISOS, esStaff);
      expect(r).toBe(PERMISOS);
      expect(esStaff).not.toHaveBeenCalled();
    }
  });
});

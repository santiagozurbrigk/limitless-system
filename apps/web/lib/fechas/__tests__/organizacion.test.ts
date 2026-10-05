/**
 * SCRUM-493: el "hoy" del servidor sale de la zona de la organización
 * (`organizations.timezone`), con una sola consulta filtrada por su id, y cae a
 * la zona por defecto si la columna está en null, la zona no existe o la
 * consulta falla.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fechaVencida } from "../calendario";
import {
  fechaDeHoyDeLaOrganizacion,
  leerZonaHorariaDeLaOrganizacion,
} from "../organizacion";
import { conZona, restaurarZona } from "./zona";

/** 1-oct-2026, 22:00 en Buenos Aires = 2-oct, 01:00 UTC. */
const LAS_22_EN_ARGENTINA = new Date("2026-10-02T01:00:00Z");

type Respuesta = { data: { timezone: string | null } | null; error: { message: string } | null };

/** Un cliente de Supabase de mentira que registra qué se le pidió. */
function supabaseFalso(respuesta: Respuesta) {
  const llamadas: { tabla?: string; columnas?: string; filtros: [string, unknown][] } = {
    filtros: [],
  };
  const consulta = {
    select(columnas: string) {
      llamadas.columnas = columnas;
      return consulta;
    },
    eq(columna: string, valor: unknown) {
      llamadas.filtros.push([columna, valor]);
      return consulta;
    },
    maybeSingle: vi.fn(async () => respuesta),
  };
  const cliente = {
    from(tabla: string) {
      llamadas.tabla = tabla;
      return consulta;
    },
  };
  return { cliente: cliente as unknown as SupabaseClient, llamadas, consulta };
}

afterEach(() => {
  restaurarZona();
  vi.restoreAllMocks();
});

describe("leerZonaHorariaDeLaOrganizacion", () => {
  it("lee sólo la zona, de la organización pedida, en una consulta", async () => {
    const { cliente, llamadas, consulta } = supabaseFalso({
      data: { timezone: "Europe/Madrid" },
      error: null,
    });
    expect(await leerZonaHorariaDeLaOrganizacion(cliente, "org-1")).toBe("Europe/Madrid");
    expect(llamadas.tabla).toBe("organizations");
    expect(llamadas.columnas).toBe("timezone");
    expect(llamadas.filtros).toEqual([["id", "org-1"]]);
    expect(consulta.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("si la consulta falla devuelve null (y se usa la zona por defecto)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { cliente } = supabaseFalso({ data: null, error: { message: "boom" } });
    expect(await leerZonaHorariaDeLaOrganizacion(cliente, "org-1")).toBeNull();
  });
});

describe("⭐ fechaDeHoyDeLaOrganizacion, con el servidor en UTC a las 22:00 de Argentina", () => {
  it("una organización de Argentina sigue en el mismo día", async () => {
    conZona("UTC");
    const { cliente } = supabaseFalso({
      data: { timezone: "America/Argentina/Buenos_Aires" },
      error: null,
    });
    const hoy = await fechaDeHoyDeLaOrganizacion(cliente, "org-1", LAS_22_EN_ARGENTINA);
    expect(hoy).toBe("2026-10-01");
    // Lo que vence hoy no venció; lo de ayer sí (isOverdue de las tareas usa esta misma regla).
    expect(fechaVencida("2026-10-01", hoy)).toBe(false);
    expect(fechaVencida("2026-09-30", hoy)).toBe(true);
  });

  it("una organización de Madrid ya está en el día siguiente", async () => {
    conZona("UTC");
    const { cliente } = supabaseFalso({ data: { timezone: "Europe/Madrid" }, error: null });
    expect(await fechaDeHoyDeLaOrganizacion(cliente, "org-1", LAS_22_EN_ARGENTINA)).toBe(
      "2026-10-02"
    );
  });

  it("zona en null, inexistente o sin fila: la zona por defecto (Argentina)", async () => {
    conZona("UTC");
    for (const data of [{ timezone: null }, { timezone: "Marte/Olimpo" }, null]) {
      const { cliente } = supabaseFalso({ data, error: null });
      expect(await fechaDeHoyDeLaOrganizacion(cliente, "org-1", LAS_22_EN_ARGENTINA)).toBe(
        "2026-10-01"
      );
    }
  });
});

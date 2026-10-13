import { describe, expect, it } from "vitest";
import { esTablaAusente } from "../tabla-ausente";

/**
 * SCRUM-516, AR pasada 2: la tabla ausente se decide por código. Un PGRST002
 * dice "schema cache" en el texto y es una caída de PostgREST.
 */
describe("esTablaAusente", () => {
  it.each([
    ["PGRST205", "Could not find the table 'public.x' in the schema cache"],
    ["42P01", 'relation "public.x" does not exist'],
  ])("⭐ %s es una tabla ausente", (code, message) => {
    expect(esTablaAusente({ code, message } as { code: string })).toBe(true);
  });

  it.each([
    [{ code: "PGRST002", message: "Could not query the database for the schema cache. Retrying." }],
    [{ code: "XX000", message: "relation x does not exist" }],
    [{ code: "42703", message: 'column "x" does not exist' }],
    [{ message: "Could not find the table 'public.x' in the schema cache" }],
    [{ code: null }],
    [null],
    [undefined],
  ])("⭐ %j no lo es", (error) => {
    expect(esTablaAusente(error as { code?: string | null } | null | undefined)).toBe(false);
  });
});

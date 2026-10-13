/**
 * ¿El error de supabase-js dice que la tabla no existe (antes de su
 * migración)? Se decide por el código, no por el texto (SCRUM-516, AR pasada 2).
 *
 *   - `PGRST205`: PostgREST no encuentra la tabla en su caché de esquema
 *     ("Could not find the table 'public.x' in the schema cache").
 *   - `42P01`: Postgres, `undefined_table` ("relation \"x\" does not exist").
 *
 * `isMissingTableError` (`lib/auth/bootstrap.ts`) busca textos, entre ellos
 * "schema cache", y por eso también toma como tabla ausente un `PGRST002`
 * ("Could not query the database for the schema cache. Retrying."), que es un
 * 503 de PostgREST cuando no puede armar la caché: una caída, no una tabla que
 * falta. Una lectura que valida una escritura y toma esa caída como "vacío"
 * escribe con datos que no leyó (editar un win le borraba las columnas).
 *
 * Códigos: referencia de errores de PostgREST (`docs/references/errors.rst`) y
 * `src/backend/utils/errcodes.txt` de Postgres.
 */
export const CODIGOS_DE_TABLA_AUSENTE = ["PGRST205", "42P01"] as const;

export function esTablaAusente(error: { code?: string | null } | null | undefined): boolean {
  return (CODIGOS_DE_TABLA_AUSENTE as readonly string[]).includes(error?.code ?? "");
}

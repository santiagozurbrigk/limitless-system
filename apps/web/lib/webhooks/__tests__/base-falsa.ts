/**
 * Base en memoria para los tests de SCRUM-6. Imita lo justo del cliente de
 * Supabase que usan la ingesta de webhooks y el reproceso: insert con índice
 * único, update/select con filtros, upsert, y fallas inyectadas por tabla.
 */

type Fila = Record<string, unknown>;
type ErrorPg = { code?: string; message: string };
type Filtro = (fila: Fila) => boolean;

export function crearBaseFalsa() {
  const tablas: Record<string, Fila[]> = {};
  /** `tabla:operacion` → error que devuelve esa operación. */
  const fallas: Record<string, ErrorPg> = {};
  /** Columnas con índice único por tabla (como en las migraciones). */
  const unicos: Record<string, string[]> = {
    payment_webhook_events: ["provider", "external_event_id"],
    ghl_webhook_events: ["external_event_id"],
  };
  let secuencia = 0;

  const filas = (t: string) => (tablas[t] ??= []);

  function builder(tabla: string) {
    const filtros: Filtro[] = [];
    let op: "select" | "insert" | "update" | "upsert" = "select";
    let valores: Fila = {};
    let devolver = false;
    let limite = Infinity;

    const ejecutar = (): { data: unknown; error: ErrorPg | null } => {
      const falla = fallas[`${tabla}:${op}`];
      if (falla) return { data: null, error: falla };

      if (op === "insert") {
        const claves = unicos[tabla];
        if (
          claves &&
          claves.every((c) => valores[c] != null) &&
          filas(tabla).some((f) => claves.every((c) => f[c] === valores[c]))
        ) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        const fila = {
          id: `id-${++secuencia}`,
          status: "pending",
          received_at: "2026-09-30T10:00:00.000Z",
          ...valores,
        };
        filas(tabla).push(fila);
        return { data: [fila], error: null };
      }
      if (op === "upsert") {
        filas(tabla).push({ ...valores });
        return { data: null, error: null };
      }
      const coinciden = filas(tabla).filter((f) => filtros.every((fn) => fn(f))).slice(0, limite);
      if (op === "update") coinciden.forEach((f) => Object.assign(f, valores));
      return { data: op === "update" && !devolver ? null : coinciden, error: null };
    };

    const q = {
      insert: (v: Fila) => ((op = "insert"), (valores = v), q),
      update: (v: Fila) => ((op = "update"), (valores = v), q),
      upsert: (v: Fila) => ((op = "upsert"), (valores = v), q),
      select: () => ((devolver = true), q),
      eq: (c: string, v: unknown) => (filtros.push((f) => f[c] === v), q),
      is: (c: string, v: unknown) => (filtros.push((f) => (f[c] ?? null) === v), q),
      in: (c: string, v: unknown[]) => (filtros.push((f) => v.includes(f[c])), q),
      lt: (c: string, v: string) => (filtros.push((f) => typeof f[c] === "string" && (f[c] as string) < v), q),
      order: () => q,
      limit: (n: number) => ((limite = n), q),
      maybeSingle: async () => {
        const r = ejecutar();
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
      },
      then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve(ejecutar()).then(ok, ko),
    };
    return q;
  }

  return { cliente: { from: builder }, tablas, fallas, filas };
}

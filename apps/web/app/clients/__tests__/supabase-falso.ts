import { expect } from "vitest";

/**
 * Una base falsa para los tests de errores como valor de Clientes (SCRUM-516).
 *
 * Aplica de verdad los filtros (`eq`, `is`, `in`, `not ... is null`) sobre
 * filas en memoria: si una acción deja de filtrar por organización, toca la
 * fila de la otra org y el test lo ve. Un error se configura por tabla o por
 * `tabla:operación` y vuelve como lo devuelve supabase-js (`{ data: null,
 * error }`); `lanza` hace que `from()` lance, como un bug o la red.
 */

export type Fila = Record<string, unknown>;
export type ErrorDeLaBase = { message: string; code?: string };
type Op = "select" | "insert" | "update" | "delete" | "upsert";
type Filtro = (fila: Fila) => boolean;
export type Operacion = {
  tabla: string;
  op: Op;
  valores?: unknown;
  filtros: Array<[string, unknown]>;
};

export const ORG = "11111111-1111-4111-8111-111111111111";
export const OTRA_ORG = "99999999-9999-4999-8999-999999999999";
export const TEXTO_FIJO = "Ocurrió un error inesperado. Intentá de nuevo.";

export const base = {
  tablas: {} as Record<string, Fila[]>,
  /** `tabla` o `tabla:op` → error de supabase-js. */
  errores: {} as Record<string, ErrorDeLaBase>,
  /** Si está, `from()` lanza esto. */
  lanza: null as unknown,
  operaciones: [] as Operacion[],
  storage: {
    error: null as { message: string } | null,
    borrados: [] as string[],
  },
  sesion: true,
  addOn: true,
  perfil: { id: "yo", role: "founder" } as { id: string; role: string } | null,
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
  secuencia: 0,

  reiniciar() {
    this.tablas = {};
    this.errores = {};
    this.lanza = null;
    this.operaciones = [];
    this.storage = { error: null, borrados: [] };
    this.sesion = true;
    this.addOn = true;
    this.perfil = { id: "yo", role: "founder" };
    this.reportes = [];
    this.secuencia = 0;
  },

  /** Las operaciones de escritura, en orden. */
  escrituras() {
    return this.operaciones.filter((o) => o.op !== "select");
  },

  cliente() {
    return clienteFalso();
  },
};

function errorDe(tabla: string, op: Op): ErrorDeLaBase | null {
  return base.errores[`${tabla}:${op}`] ?? base.errores[tabla] ?? null;
}

function clienteFalso() {
  return {
    from(tabla: string) {
      if (base.lanza) throw base.lanza;
      const operacion: Operacion = { tabla, op: "select", filtros: [] };
      const filtros: Filtro[] = [];
      let registrada = false;

      const ejecutar = () => {
        if (!registrada) {
          base.operaciones.push(operacion);
          registrada = true;
        }
        const error = errorDe(tabla, operacion.op);
        if (error) return { data: null, error, count: null };
        const filas = (base.tablas[tabla] ??= []);
        const coincide = (f: Fila) => filtros.every((filtro) => filtro(f));

        if (operacion.op === "insert" || operacion.op === "upsert") {
          const lista = (Array.isArray(operacion.valores) ? operacion.valores : [operacion.valores]) as Fila[];
          const nuevas = lista.map((valores) => ({
            id: `nuevo-${++base.secuencia}`,
            created_at: "2026-10-12T00:00:00Z",
            ...valores,
          }));
          filas.push(...nuevas);
          return { data: nuevas, error: null, count: nuevas.length };
        }
        const coincidentes = filas.filter(coincide);
        if (operacion.op === "update") {
          coincidentes.forEach((f) => Object.assign(f, operacion.valores));
        }
        if (operacion.op === "delete") {
          base.tablas[tabla] = filas.filter((f) => !coincide(f));
        }
        return { data: coincidentes, error: null, count: coincidentes.length };
      };

      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        insert(valores: unknown) {
          operacion.op = "insert";
          operacion.valores = valores;
          return builder;
        },
        upsert(valores: unknown) {
          operacion.op = "upsert";
          operacion.valores = valores;
          return builder;
        },
        update(valores: unknown) {
          operacion.op = "update";
          operacion.valores = valores;
          return builder;
        },
        delete() {
          operacion.op = "delete";
          return builder;
        },
        eq(columna: string, valor: unknown) {
          operacion.filtros.push([columna, valor]);
          filtros.push((f) => f[columna] === valor);
          return builder;
        },
        is(columna: string, valor: unknown) {
          operacion.filtros.push([`is:${columna}`, valor]);
          filtros.push((f) => (f[columna] ?? null) === valor);
          return builder;
        },
        in(columna: string, valores: unknown[]) {
          operacion.filtros.push([`in:${columna}`, valores]);
          filtros.push((f) => valores.includes(f[columna]));
          return builder;
        },
        not(columna: string, operador: string, valor: unknown) {
          expect(operador).toBe("is");
          operacion.filtros.push([`not:${columna}`, valor]);
          filtros.push((f) => (f[columna] ?? null) !== valor);
          return builder;
        },
        maybeSingle: async () => {
          const { data, error } = ejecutar();
          return { data: data?.[0] ?? null, error };
        },
        single: async () => {
          const { data, error } = ejecutar();
          if (error) return { data: null, error };
          const fila = data?.[0];
          if (!fila) {
            return {
              data: null,
              error: { code: "PGRST116", message: "Cannot coerce the result to a single JSON object" },
            };
          }
          return { data: fila, error: null };
        },
        then(resolver: (r: unknown) => void, rechazar?: (e: unknown) => void) {
          try {
            resolver(ejecutar());
          } catch (e) {
            rechazar?.(e);
          }
        },
      };
      return builder;
    },
    storage: {
      from: () => ({
        createSignedUploadUrl: async (ruta: string) =>
          base.storage.error
            ? { data: null, error: base.storage.error }
            : { data: { signedUrl: `https://storage/subir/${ruta}` }, error: null },
        remove: async (rutas: string[]) => {
          if (base.storage.error) return { data: null, error: base.storage.error };
          base.storage.borrados.push(...rutas);
          return { data: [], error: null };
        },
        createSignedUrls: async (rutas: string[]) =>
          base.storage.error
            ? { data: null, error: base.storage.error }
            : {
                data: rutas.map((ruta) => ({ path: ruta, signedUrl: `https://storage/ver/${ruta}` })),
                error: null,
              },
      }),
    },
  };
}

/** Lo que devuelve `isMissingTableError` de `lib/auth/bootstrap.ts` para estos textos. */
export function esTablaFaltante(mensaje: string): boolean {
  return (
    mensaje.includes("Could not find the table") ||
    mensaje.includes("does not exist") ||
    mensaje.includes("schema cache")
  );
}

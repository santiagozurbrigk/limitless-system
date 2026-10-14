import { expect } from "vitest";

/**
 * Una base falsa para los tests de errores como valor de Marketing
 * (SCRUM-519), copia de la de Clientes (`app/clients/__tests__/supabase-falso.ts`)
 * con lo que usan estas acciones: `gte`, `lte`, `like` y el `count` de una
 * consulta `head`.
 *
 * Aplica de verdad los filtros sobre filas en memoria: si una acción deja de
 * filtrar por organización, toca o lee la fila de la otra org y el test lo ve.
 * Un error se configura por tabla o por `tabla:operación` y vuelve como lo
 * devuelve supabase-js (`{ data: null, error }`); `lanza` hace que `from()`
 * lance, como un bug o la red.
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
  /** Una consulta `head` (sólo el `count`), como los conteos. */
  head?: boolean;
};

export const ORG = "11111111-1111-4111-8111-111111111111";
export const OTRA_ORG = "99999999-9999-4999-8999-999999999999";
export const TEXTO_FIJO = "Ocurrió un error inesperado. Intentá de nuevo.";
/**
 * El 503 de PostgREST cuando no puede armar su caché de esquema. Su texto dice
 * "schema cache" pero es una caída, no una tabla ausente (SCRUM-516, AR pasada 2).
 */
export const CACHE_CAIDA = {
  code: "PGRST002",
  message: "Could not query the database for the schema cache. Retrying.",
};

export const base = {
  tablas: {} as Record<string, Fila[]>,
  /** `tabla` o `tabla:op` → error de supabase-js. */
  errores: {} as Record<string, ErrorDeLaBase>,
  /**
   * `tabla:op` → número de llamada (1, 2...) desde la que esa operación devuelve
   * el error: para simular que falla el segundo lote de un import.
   */
  erroresDesdeLaLlamada: {} as Record<string, { desde: number; error: ErrorDeLaBase }>,
  llamadas: {} as Record<string, number>,
  /** Si está, `from()` lanza esto. */
  lanza: null as unknown,
  operaciones: [] as Operacion[],
  storage: {
    error: null as { message: string } | null,
    borrados: [] as string[],
  },
  sesion: true,
  /** Si está, `requireOrganizationId` lanza esto (un error interno de Next, por ejemplo). */
  lanzaEnSesion: null as unknown,
  addOn: true,
  perfil: { id: "yo", role: "founder" } as { id: string; role: string } | null,
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
  secuencia: 0,

  reiniciar() {
    this.tablas = {};
    this.errores = {};
    this.erroresDesdeLaLlamada = {};
    this.llamadas = {};
    this.lanza = null;
    this.operaciones = [];
    this.storage = { error: null, borrados: [] };
    this.sesion = true;
    this.lanzaEnSesion = null;
    this.addOn = true;
    this.perfil = { id: "yo", role: "founder" };
    this.reportes = [];
    this.secuencia = 0;
  },

  /**
   * Los filtros de la n-ésima operación `op` sobre `tabla` (0 = la primera).
   * Para probar que una consulta lleva el filtro de la organización aunque una
   * fila ajena no cambie el resultado (SCRUM-516, AR pasada 2).
   */
  filtrosDe(tabla: string, op: Op, n = 0) {
    const encontrada = this.operaciones.filter((o) => o.tabla === tabla && o.op === op)[n];
    if (!encontrada) throw new Error(`no hubo ${op} n.º ${n} sobre ${tabla}`);
    return encontrada.filtros;
  },

  /** Las operaciones de escritura, en orden. */
  escrituras() {
    return this.operaciones.filter((o) => o.op !== "select");
  },

  cliente() {
    return clienteFalso();
  },
};

function errorDe(tabla: string, op: Op, head = false): ErrorDeLaBase | null {
  // `tabla:select:head` apunta sólo a los conteos y `tabla:select:filas`, sólo
  // a las lecturas que no son conteos.
  const porTipo = base.errores[`${tabla}:${op}:${head ? "head" : "filas"}`];
  if (porTipo) return porTipo;
  const clave = `${tabla}:${op}`;
  base.llamadas[clave] = (base.llamadas[clave] ?? 0) + 1;
  const desde = base.erroresDesdeLaLlamada[clave];
  if (desde && base.llamadas[clave] >= desde.desde) return desde.error;
  return base.errores[clave] ?? base.errores[tabla] ?? null;
}

function clienteFalso() {
  return {
    // La sesión del usuario "yo" (el perfil se lee de la tabla `profiles`).
    auth: {
      getUser: async () => ({ data: { user: base.sesion ? { id: "yo" } : null }, error: null }),
    },
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
        const error = errorDe(tabla, operacion.op, operacion.head);
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
        select(_columnas?: string, opciones?: { head?: boolean }) {
          if (opciones?.head) operacion.head = true;
          return builder;
        },
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
        gte(columna: string, valor: unknown) {
          operacion.filtros.push([`gte:${columna}`, valor]);
          filtros.push((f) => String(f[columna] ?? "") >= String(valor));
          return builder;
        },
        lte(columna: string, valor: unknown) {
          operacion.filtros.push([`lte:${columna}`, valor]);
          filtros.push((f) => String(f[columna] ?? "") <= String(valor));
          return builder;
        },
        like(columna: string, patron: string) {
          operacion.filtros.push([`like:${columna}`, patron]);
          const prefijo = patron.replace(/%$/, "");
          filtros.push((f) => String(f[columna] ?? "").startsWith(prefijo));
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
        // Como el builder de supabase-js: `then` devuelve una promesa, así que
        // `.then(fn)` encadenado devuelve lo que devuelve `fn` (o su rechazo).
        then(resolver?: (r: unknown) => unknown, rechazar?: (e: unknown) => unknown) {
          return new Promise((ok) => ok(ejecutar())).then(resolver, rechazar);
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

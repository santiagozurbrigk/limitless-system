/**
 * Supabase falso en memoria para los tests de las claves de ingesta
 * (SCRUM-527). Modela lo que usan `lib/webinar/claves-de-ingesta.ts` y
 * `app/webinar/claves-de-ingesta-actions.ts`: select, insert y update con
 * filtros `eq` e `is`, `order`, `single` y `maybeSingle`. Los filtros se
 * aplican de verdad: si una consulta pierde el de `organization_id`, devuelve o
 * toca filas de otra organización y el test lo ve.
 */

export type Fila = Record<string, unknown>;

export type Consulta = {
  tabla: string;
  op: "select" | "insert" | "update";
  columnas?: string;
  valores?: unknown;
  filtros: Array<[string, "eq" | "is", unknown]>;
};

export type BaseFalsa = {
  tablas: Record<string, Fila[]>;
  consultas: Consulta[];
  /** `tabla:op` (o `tabla`) -> error que devuelve supabase-js como valor. */
  errores: Record<string, { message: string; code?: string }>;
  /** `tabla:op` -> excepción que lanza la consulta (p. ej. la red caída). */
  lanza: Record<string, unknown>;
  cliente: () => unknown;
};

let secuencia = 0;

export function crearBaseFalsa(tablas: Record<string, Fila[]> = {}): BaseFalsa {
  const base: BaseFalsa = {
    tablas,
    consultas: [],
    errores: {},
    lanza: {},
    cliente: () => ({ from: (tabla: string) => consulta(base, tabla) }),
  };
  return base;
}

function consulta(base: BaseFalsa, tabla: string) {
  const c: Consulta = { tabla, op: "select", filtros: [] };
  base.consultas.push(c);

  const coincide = (fila: Fila) =>
    c.filtros.every(([columna, tipo, valor]) =>
      tipo === "is" ? (fila[columna] ?? null) === valor : fila[columna] === valor,
    );

  const proyectar = (fila: Fila): Fila => {
    if (!c.columnas || c.columnas.trim() === "*") return { ...fila };
    const salida: Fila = {};
    for (const col of c.columnas.split(",").map((s) => s.trim())) {
      salida[col] = fila[col] ?? null;
    }
    return salida;
  };

  const ejecutar = (modo: "lista" | "una" | "quizas") => {
    const clave = `${tabla}:${c.op}`;
    if (clave in base.lanza) throw base.lanza[clave];
    const error = base.errores[clave] ?? base.errores[tabla];
    if (error) return { data: null, error };

    const filasDeLaTabla = (base.tablas[tabla] ??= []);
    let filas: Fila[];
    if (c.op === "insert") {
      secuencia += 1;
      const nueva: Fila = {
        id: `00000000-0000-4000-8000-${String(secuencia).padStart(12, "0")}`,
        created_at: "2026-10-16T12:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
        ...(c.valores as Fila),
      };
      filasDeLaTabla.push(nueva);
      filas = [nueva];
    } else if (c.op === "update") {
      filas = filasDeLaTabla.filter(coincide);
      for (const fila of filas) Object.assign(fila, c.valores as Fila);
    } else {
      filas = filasDeLaTabla.filter(coincide);
    }

    const proyectadas = filas.map(proyectar);
    if (modo === "lista") return { data: proyectadas, error: null };
    if (modo === "quizas") {
      if (proyectadas.length > 1) {
        return { data: null, error: { code: "PGRST116", message: "multiple rows" } };
      }
      return { data: proyectadas[0] ?? null, error: null };
    }
    if (proyectadas.length !== 1) {
      return { data: null, error: { code: "PGRST116", message: "Cannot coerce the result to a single JSON object" } };
    }
    return { data: proyectadas[0], error: null };
  };

  const builder = {
    select(columnas?: string) {
      // En un insert o update, `select` elige qué devolver; la operación sigue.
      c.columnas = columnas;
      return builder;
    },
    insert(valores: unknown) {
      c.op = "insert";
      c.valores = valores;
      return builder;
    },
    update(valores: unknown) {
      c.op = "update";
      c.valores = valores;
      return builder;
    },
    eq(columna: string, valor: unknown) {
      c.filtros.push([columna, "eq", valor]);
      return builder;
    },
    is(columna: string, valor: unknown) {
      c.filtros.push([columna, "is", valor]);
      return builder;
    },
    order: () => builder,
    single: async () => ejecutar("una"),
    maybeSingle: async () => ejecutar("quizas"),
    then<R1, R2>(
      resolver: (valor: { data: unknown; error: unknown }) => R1,
      rechazar?: (motivo: unknown) => R2,
    ) {
      return Promise.resolve()
        .then(() => ejecutar("lista"))
        .then(resolver, rechazar);
    },
  };
  return builder;
}

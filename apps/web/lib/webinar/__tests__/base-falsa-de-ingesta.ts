/**
 * Supabase falso en memoria para los tests de la ingesta de la landing
 * (SCRUM-528). Modela lo que usan `lib/webinar/ingesta-landing.ts`,
 * `reprocesar-landing.ts`, `endpoint-de-ingesta.ts` y la verificación de la
 * clave: select, insert, upsert (con `ignoreDuplicates`) y update; filtros
 * `eq`, `is`, `lt`, `not like`; `order`, `limit`, `single` y `maybeSingle`.
 *
 * Los filtros se aplican de verdad y las llaves únicas son las de la
 * migración de SCRUM-526 (un insert repetido devuelve 23505): si una consulta
 * pierde el filtro de `organization_id` o una escritura deja de ser
 * idempotente, el test lo ve. Cada consulta queda anotada en `consultas`
 * para el barrido de filtros por organización.
 */

export type Fila = Record<string, unknown>;

type Operador = "eq" | "is" | "lt" | "not_like";

export type Consulta = {
  tabla: string;
  op: "select" | "insert" | "upsert" | "update";
  valores?: Fila;
  filtros: Array<[string, Operador, unknown]>;
};

export type ErrorPg = { message: string; code?: string };

/** Llaves únicas de la migración 20261016120000_webinars_modelo_de_datos.sql. */
export const LLAVES_UNICAS: Record<string, string[][]> = {
  webinar_launches: [["public_id"]],
  leads: [["organization_id", "email_normalized"]],
  launch_registrations: [
    ["organization_id", "client_registration_id"],
    ["launch_id", "lead_id"],
  ],
  landing_visits: [["launch_id", "visitor_id", "day"]],
  lead_events: [["organization_id", "source", "source_ref", "kind"]],
  ingest_keys: [["key_hash"]],
};

export type BaseFalsa = {
  tablas: Record<string, Fila[]>;
  consultas: Consulta[];
  /**
   * `tabla:op` -> error que devuelve supabase-js como valor. Con `veces`, sólo
   * esa cantidad de consultas (después la base "se recupera").
   */
  errores: Record<string, ErrorPg & { veces?: number }>;
  /** `tabla:op` -> excepción que lanza la consulta (la red caída). */
  lanza: Record<string, unknown>;
  cliente: () => unknown;
  filas: (tabla: string) => Fila[];
};

let secuencia = 0;

export function nuevoId(): string {
  secuencia += 1;
  return `00000000-0000-4000-8000-${String(secuencia).padStart(12, "0")}`;
}

/** `%texto%` de SQL a una expresión regular. */
function patronLike(patron: string): RegExp {
  const escapado = patron.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${escapado}$`, "s");
}

export function crearBaseFalsa(tablas: Record<string, Fila[]> = {}): BaseFalsa {
  const base: BaseFalsa = {
    tablas,
    consultas: [],
    errores: {},
    lanza: {},
    cliente: () => ({ from: (tabla: string) => consulta(base, tabla) }),
    filas: (tabla) => (base.tablas[tabla] ??= []),
  };
  return base;
}

function violaUnica(base: BaseFalsa, tabla: string, nueva: Fila): boolean {
  return (LLAVES_UNICAS[tabla] ?? []).some((llave) =>
    base
      .filas(tabla)
      .some((fila) => llave.every((c) => nueva[c] != null && fila[c] === nueva[c])),
  );
}

function consulta(base: BaseFalsa, tabla: string) {
  const c: Consulta = { tabla, op: "select", filtros: [] };
  base.consultas.push(c);
  let columnas: string | undefined;
  let devolver = false;
  let ignorarDuplicados = false;
  let limite = Infinity;
  let orden: { columna: string; ascendente: boolean } | null = null;

  const coincide = (fila: Fila) =>
    c.filtros.every(([columna, op, valor]) => {
      const actual = fila[columna] ?? null;
      if (op === "eq") return actual === valor;
      if (op === "is") return actual === valor;
      if (op === "lt") return typeof actual === "string" && actual < (valor as string);
      // `not like`: como en SQL, un null no cumple ni `like` ni `not like`.
      return typeof actual === "string" && !patronLike(valor as string).test(actual);
    });

  const proyectar = (fila: Fila): Fila => {
    if (!columnas || columnas.trim() === "*") return { ...fila };
    const salida: Fila = {};
    for (const col of columnas.split(",").map((s) => s.trim())) salida[col] = fila[col] ?? null;
    return salida;
  };

  const ejecutar = (): { data: Fila[] | null; error: ErrorPg | null } => {
    const clave = `${tabla}:${c.op}`;
    if (clave in base.lanza) throw base.lanza[clave];
    const error = base.errores[clave];
    if (error) {
      if (error.veces !== undefined) {
        error.veces -= 1;
        if (error.veces <= 0) delete base.errores[clave];
      }
      return { data: null, error: { message: error.message, code: error.code } };
    }

    const filas = base.filas(tabla);
    if (c.op === "insert" || c.op === "upsert") {
      const nueva: Fila = {
        id: nuevoId(),
        created_at: "2026-10-16T12:00:00.000Z",
        ...(tabla === "landing_events"
          ? { received_at: new Date().toISOString(), error_message: null, processed_at: null }
          : {}),
        ...c.valores,
      };
      if (violaUnica(base, tabla, nueva)) {
        if (c.op === "upsert" && ignorarDuplicados) return { data: [], error: null };
        return {
          data: null,
          error: { code: "23505", message: `duplicate key value violates unique constraint on ${tabla}` },
        };
      }
      filas.push(nueva);
      return { data: [nueva].map(proyectar), error: null };
    }
    let encontradas = filas.filter(coincide);
    if (orden) {
      const { columna, ascendente } = orden;
      encontradas = [...encontradas].sort((a, b) => {
        const x = String(a[columna] ?? "");
        const y = String(b[columna] ?? "");
        return (x < y ? -1 : x > y ? 1 : 0) * (ascendente ? 1 : -1);
      });
    }
    encontradas = encontradas.slice(0, limite);
    if (c.op === "update") {
      for (const fila of encontradas) Object.assign(fila, c.valores);
      return { data: devolver ? encontradas.map(proyectar) : null, error: null };
    }
    return { data: encontradas.map(proyectar), error: null };
  };

  const builder = {
    select(cols?: string) {
      columnas = cols;
      devolver = true;
      return builder;
    },
    insert(valores: Fila) {
      c.op = "insert";
      c.valores = valores;
      return builder;
    },
    upsert(valores: Fila, opciones?: { ignoreDuplicates?: boolean }) {
      c.op = "upsert";
      c.valores = valores;
      ignorarDuplicados = Boolean(opciones?.ignoreDuplicates);
      return builder;
    },
    update(valores: Fila) {
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
    lt(columna: string, valor: unknown) {
      c.filtros.push([columna, "lt", valor]);
      return builder;
    },
    not(columna: string, operador: string, valor: unknown) {
      if (operador !== "like") throw new Error(`not ${operador} no está modelado`);
      c.filtros.push([columna, "not_like", valor]);
      return builder;
    },
    order(columna: string, opciones?: { ascending?: boolean }) {
      orden = { columna, ascendente: opciones?.ascending ?? true };
      return builder;
    },
    limit(n: number) {
      limite = n;
      return builder;
    },
    single: async () => {
      const r = ejecutar();
      if (r.error) return { data: null, error: r.error };
      if (!r.data || r.data.length !== 1) {
        return { data: null, error: { code: "PGRST116", message: "Cannot coerce the result to a single JSON object" } };
      }
      return { data: r.data[0], error: null };
    },
    maybeSingle: async () => {
      const r = ejecutar();
      if (r.error) return { data: null, error: r.error };
      if (r.data && r.data.length > 1) {
        return { data: null, error: { code: "PGRST116", message: "multiple rows" } };
      }
      return { data: r.data?.[0] ?? null, error: null };
    },
    then<R1, R2>(
      resolver: (valor: { data: unknown; error: unknown }) => R1,
      rechazar?: (motivo: unknown) => R2,
    ) {
      return Promise.resolve()
        .then(() => ejecutar())
        .then(resolver, rechazar);
    },
  };
  return builder;
}

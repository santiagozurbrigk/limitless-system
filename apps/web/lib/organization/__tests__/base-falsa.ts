/**
 * Base falsa para los tests de las altas de organizaciones (SCRUM-523).
 *
 * Imita lo justo de supabase-js para recorrer las seis altas: inserts con
 * `.select().single()`, lecturas por id, borrados, el upsert del portfolio y
 * `auth.admin`. Un insert en `organizations` sin `experience` toma
 * `DEFAULT_DE_LA_BASE`, como la columna real; el test que falla si el default
 * de la base cambia es `supabase/ci/tests/97_experiencia_de_la_organizacion.sql`.
 */

export const DEFAULT_DE_LA_BASE = "webinar";

export type Fila = Record<string, unknown>;

export type EstadoDeLaBase = {
  tablas: Record<string, Fila[]>;
  /** Inserts en `organizations` tal cual los mandó la app. */
  insertsDeOrganizaciones: Fila[];
  /** Si es true, leer `experience` de `organizations` devuelve un error. */
  fallaLecturaDeExperiencia: boolean;
  usuariosCreados: number;
};

export function estadoInicial(tablas: Record<string, Fila[]> = {}): EstadoDeLaBase {
  return {
    tablas: { organizations: [], profiles: [], ...tablas },
    insertsDeOrganizaciones: [],
    fallaLecturaDeExperiencia: false,
    usuariosCreados: 0,
  };
}

type Resultado = { data: unknown; error: { message: string; code?: string } | null };

class Consulta {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private columnas = "*";
  private filas: Fila[] = [];
  private filtros: Array<(f: Fila) => boolean> = [];

  constructor(
    private readonly estado: EstadoDeLaBase,
    private readonly tabla: string
  ) {}

  select(columnas = "*") {
    if (this.op === "select") this.columnas = columnas;
    return this;
  }
  insert(fila: Fila | Fila[]) {
    this.op = "insert";
    this.filas = Array.isArray(fila) ? fila : [fila];
    return this;
  }
  upsert(fila: Fila | Fila[]) {
    this.op = "upsert";
    this.filas = Array.isArray(fila) ? fila : [fila];
    return this;
  }
  update(fila: Fila) {
    this.op = "update";
    this.filas = [fila];
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(columna: string, valor: unknown) {
    this.filtros.push((f) => f[columna] === valor);
    return this;
  }
  in(columna: string, valores: unknown[]) {
    this.filtros.push((f) => valores.includes(f[columna]));
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }

  private ejecutar(): Resultado {
    const tabla = (this.estado.tablas[this.tabla] ??= []);
    if (this.op === "insert" || this.op === "upsert") {
      const nuevas = this.filas.map((f, i) => {
        const fila: Fila = { id: `${this.tabla}-${tabla.length + i + 1}`, ...f };
        if (this.tabla === "organizations") {
          this.estado.insertsDeOrganizaciones.push({ ...f });
          fila.experience = f.experience ?? DEFAULT_DE_LA_BASE;
        }
        return fila;
      });
      tabla.push(...nuevas);
      return { data: nuevas, error: null };
    }
    const coinciden = tabla.filter((f) => this.filtros.every((filtro) => filtro(f)));
    if (this.op === "delete") {
      this.estado.tablas[this.tabla] = tabla.filter((f) => !coinciden.includes(f));
      return { data: null, error: null };
    }
    if (this.op === "update") {
      for (const f of coinciden) Object.assign(f, this.filas[0]);
      return { data: null, error: null };
    }
    if (
      this.tabla === "organizations" &&
      this.estado.fallaLecturaDeExperiencia &&
      this.columnas.includes("experience")
    ) {
      return { data: null, error: { message: "fetch failed" } };
    }
    return { data: coinciden, error: null };
  }

  async single(): Promise<Resultado> {
    const r = this.ejecutar();
    if (r.error) return r;
    const filas = (r.data as Fila[] | null) ?? [];
    return filas.length === 1
      ? { data: filas[0], error: null }
      : { data: null, error: { message: "Cannot coerce the result to a single JSON object", code: "PGRST116" } };
  }

  async maybeSingle(): Promise<Resultado> {
    const r = this.ejecutar();
    if (r.error) return r;
    const filas = (r.data as Fila[] | null) ?? [];
    return { data: filas[0] ?? null, error: null };
  }

  then<T>(resolver: (r: Resultado) => T, rechazar?: (e: unknown) => T) {
    return Promise.resolve(this.ejecutar()).then(resolver, rechazar);
  }
}

export function crearBaseFalsa(estado: EstadoDeLaBase) {
  return {
    from: (tabla: string) => new Consulta(estado, tabla),
    rpc: async () => ({ data: null, error: null }),
    auth: {
      getUser: async () => ({ data: { user: { id: "usuario-holding" } }, error: null }),
      admin: {
        createUser: async () => {
          estado.usuariosCreados += 1;
          return { data: { user: { id: `usuario-${estado.usuariosCreados}` } }, error: null };
        },
        deleteUser: async () => ({ data: null, error: null }),
      },
    },
  };
}

/** La experiencia con la que quedó guardada una organización, por nombre. */
export function experienciaGuardada(estado: EstadoDeLaBase, nombre: string): unknown {
  return estado.tablas.organizations.find((o) => o.name === nombre)?.experience;
}

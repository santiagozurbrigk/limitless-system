import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearBaseFalsa, type BaseFalsa } from "@/lib/webinar/__tests__/base-falsa-de-claves";

/**
 * SCRUM-527: acciones de las claves de ingesta (crear, listar, revocar).
 * `ingest_keys` no tiene policies: las acciones usan el cliente admin, así que
 * el permiso (founder o admin) y el filtro por organización los ponen ellas.
 * La base falsa aplica los filtros de verdad: si una acción pierde el de
 * `organization_id`, estos tests ven filas de la otra organización.
 */

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTRA_ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID_PROPIA = "11111111-1111-4111-8111-111111111111";
const ID_AJENA = "22222222-2222-4222-8222-222222222222";
const ID_REVOCADA = "33333333-3333-4333-8333-333333333333";
const NO_EXISTE = "44444444-4444-4444-8444-444444444444";

const ERROR_INESPERADO = "Ocurrió un error inesperado. Intentá de nuevo.";
const NO_DISPONIBLE = "Las claves de ingesta todavía no están disponibles.";
const SIN_PERMISO = "Sólo el founder o un admin pueden ver, crear o revocar las claves de ingesta.";
const CLAVE_INEXISTENTE = "No encontramos esa clave o ya estaba revocada.";
const FALLO_AL_LEER =
  "No se pudieron leer las claves de ingesta. Recargá la página para intentar de nuevo.";

const sim = vi.hoisted(() => ({
  escondido: { ingestaLanding: false },
  sesion: true,
  rol: "founder" as string,
  rpc: [] as Array<{ nombre: string; args: unknown }>,
  rpcError: null as null | { message: string; code?: string },
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
  base: null as unknown,
}));

// Parte del objeto real; `ingestaLanding` con getter para que cada test la
// cambie (la fábrica del mock corre una sola vez).
vi.mock("@/lib/release/escondido", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/release/escondido")>();
  return {
    ESCONDIDO: {
      ...real.ESCONDIDO,
      get ingestaLanding() {
        return sim.escondido.ingestaLanding;
      },
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));
vi.mock("@/lib/auth/bootstrap", async () => {
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (!sim.sesion) throw new ErrorEsperable("Sesión no válida");
      return "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    },
  };
});
// `requireOrgRole` corre de verdad contra una RPC simulada: la respuesta de
// `current_user_has_org_role` sale del rol del usuario. La función SQL (y el
// founder de un holding) se prueban en `supabase/ci/tests/30_roles_equipo_y_config.sql`.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (nombre: string, args: { roles: string[] }) => {
      sim.rpc.push({ nombre, args });
      if (sim.rpcError) return { data: null, error: sim.rpcError };
      return { data: args.roles.includes(sim.rol), error: null };
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => (sim.base as BaseFalsa).cliente(),
}));

const { crearClaveDeIngestaAction, listarClavesDeIngestaAction, revocarClaveDeIngestaAction } =
  await import("@/app/webinar/claves-de-ingesta-actions");
const { verificarClaveDeIngesta } = await import("@/lib/webinar/claves-de-ingesta");

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

let base: BaseFalsa;
let errores: ReturnType<typeof vi.spyOn>;
let avisos: ReturnType<typeof vi.spyOn>;

function filasIniciales() {
  return [
    {
      id: ID_PROPIA,
      organization_id: ORG,
      key_hash: sha256("propia"),
      label: "Landing de noviembre",
      created_at: "2026-10-10T00:00:00.000Z",
      last_used_at: "2026-10-15T00:00:00.000Z",
      revoked_at: null,
    },
    {
      id: ID_REVOCADA,
      organization_id: ORG,
      key_hash: sha256("revocada"),
      label: "Landing vieja",
      created_at: "2026-09-01T00:00:00.000Z",
      last_used_at: null,
      revoked_at: "2026-09-30T00:00:00.000Z",
    },
    {
      id: ID_AJENA,
      organization_id: OTRA_ORG,
      key_hash: sha256("ajena"),
      label: "Landing de otro negocio",
      created_at: "2026-10-11T00:00:00.000Z",
      last_used_at: null,
      revoked_at: null,
    },
  ];
}

/** Todo lo que salió por consola o a Sentry, en un texto. */
function todoLoRegistrado(): string {
  return JSON.stringify([
    errores.mock.calls.map((c) => c.map(String)),
    avisos.mock.calls.map((c) => c.map(String)),
    sim.reportes.map((r) => [String((r.error as Error)?.message), r.contexto]),
  ]);
}

function escrituras() {
  return base.consultas.filter((c) => c.op !== "select");
}

beforeEach(() => {
  sim.escondido.ingestaLanding = false;
  sim.sesion = true;
  sim.rol = "founder";
  sim.rpc = [];
  sim.rpcError = null;
  sim.reportes = [];
  base = crearBaseFalsa({ ingest_keys: filasIniciales() });
  sim.base = base;
  errores = vi.spyOn(console, "error").mockImplementation(() => {});
  avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("con la bandera ESCONDIDO.ingestaLanding en true", () => {
  beforeEach(() => {
    sim.escondido.ingestaLanding = true;
  });

  it("ninguna acción es usable: responden que no está disponible y no tocan nada", async () => {
    expect(await listarClavesDeIngestaAction()).toEqual({ success: false, error: NO_DISPONIBLE });
    expect(await crearClaveDeIngestaAction("Landing")).toEqual({ success: false, error: NO_DISPONIBLE });
    expect(await revocarClaveDeIngestaAction(ID_PROPIA)).toEqual({
      success: false,
      error: NO_DISPONIBLE,
    });
    expect(base.consultas).toHaveLength(0);
    expect(sim.rpc).toHaveLength(0);
    expect(base.tablas.ingest_keys).toEqual(filasIniciales());
    expect(sim.reportes).toHaveLength(0);
  });
});

describe("permiso: founder o admin de la organización activa", () => {
  it("pide current_user_has_org_role con founder y admin", async () => {
    await listarClavesDeIngestaAction();
    expect(sim.rpc).toEqual([
      { nombre: "current_user_has_org_role", args: { roles: ["founder", "admin"] } },
    ]);
  });

  it.each(["founder", "admin"])("%s puede listar, crear y revocar", async (rol) => {
    sim.rol = rol;
    expect((await listarClavesDeIngestaAction()).success).toBe(true);
    expect((await crearClaveDeIngestaAction("Landing")).success).toBe(true);
    expect((await revocarClaveDeIngestaAction(ID_PROPIA)).success).toBe(true);
  });

  it.each(["closer", "setter", "member"])(
    "%s no puede listar, crear ni revocar, y no se toca la tabla",
    async (rol) => {
      sim.rol = rol;
      expect(await listarClavesDeIngestaAction()).toEqual({ success: false, error: SIN_PERMISO });
      expect(await crearClaveDeIngestaAction("Landing")).toEqual({ success: false, error: SIN_PERMISO });
      expect(await revocarClaveDeIngestaAction(ID_PROPIA)).toEqual({
        success: false,
        error: SIN_PERMISO,
      });
      expect(base.consultas).toHaveLength(0);
      expect(sim.reportes).toHaveLength(0);
    },
  );

  it("sin sesión vuelve el motivo y no se toca la tabla", async () => {
    sim.sesion = false;
    for (const resultado of [
      await listarClavesDeIngestaAction(),
      await crearClaveDeIngestaAction("Landing"),
      await revocarClaveDeIngestaAction(ID_PROPIA),
    ]) {
      expect(resultado).toEqual({ success: false, error: "Sesión no válida" });
    }
    expect(base.consultas).toHaveLength(0);
    expect(sim.reportes).toHaveLength(0);
  });

  it("si no se puede verificar el permiso, no se deja hacer nada y se registra", async () => {
    sim.rpcError = { message: "TypeError: fetch failed" };
    expect(await crearClaveDeIngestaAction("Landing")).toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
    expect(await listarClavesDeIngestaAction()).toEqual({ success: false, error: FALLO_AL_LEER });
    expect(base.consultas).toHaveLength(0);
    expect(sim.reportes.map((r) => r.contexto)).toEqual([
      { accion: "[crearClaveDeIngesta]" },
      { accion: "[listarClavesDeIngesta]" },
    ]);
  });
});

describe("listarClavesDeIngestaAction", () => {
  it("devuelve sólo las claves de la organización activa, sin el hash", async () => {
    const resultado = await listarClavesDeIngestaAction();
    expect(resultado).toEqual({
      success: true,
      data: [
        {
          id: ID_PROPIA,
          label: "Landing de noviembre",
          createdAt: "2026-10-10T00:00:00.000Z",
          lastUsedAt: "2026-10-15T00:00:00.000Z",
          revokedAt: null,
        },
        {
          id: ID_REVOCADA,
          label: "Landing vieja",
          createdAt: "2026-09-01T00:00:00.000Z",
          lastUsedAt: null,
          revokedAt: "2026-09-30T00:00:00.000Z",
        },
      ],
    });
    expect(base.consultas[0].filtros).toEqual([["organization_id", "eq", ORG]]);
    expect(base.consultas[0].columnas).not.toContain("key_hash");
    expect(JSON.stringify(resultado)).not.toContain(sha256("propia"));
  });

  it("la más nueva primero (AR pasada 1)", async () => {
    base.tablas.ingest_keys.push({
      id: "55555555-5555-4555-8555-555555555555",
      organization_id: ORG,
      key_hash: sha256("nueva"),
      label: "Landing de diciembre",
      created_at: "2026-10-12T00:00:00.000Z",
      last_used_at: null,
      revoked_at: null,
    });
    const resultado = await listarClavesDeIngestaAction();
    if (!resultado.success) throw new Error(resultado.error);
    expect(resultado.data.map((c) => c.label)).toEqual([
      "Landing de diciembre",
      "Landing de noviembre",
      "Landing vieja",
    ]);
  });

  it("una falla de la base como valor vuelve con el texto fijo y se registra", async () => {
    base.errores["ingest_keys:select"] = { message: "TypeError: fetch failed" };
    expect(await listarClavesDeIngestaAction()).toEqual({ success: false, error: FALLO_AL_LEER });
    expect(errores).toHaveBeenCalledWith("[listarClavesDeIngesta]", expect.anything());
    expect(sim.reportes).toHaveLength(1);
    expect(sim.reportes[0].contexto).toEqual({ accion: "[listarClavesDeIngesta]" });
  });

  it("una excepción (la red) vuelve con el texto fijo y se registra", async () => {
    base.lanza["ingest_keys:select"] = new TypeError("fetch failed");
    expect(await listarClavesDeIngestaAction()).toEqual({ success: false, error: FALLO_AL_LEER });
    expect(sim.reportes).toHaveLength(1);
    expect(sim.reportes[0].error).toBeInstanceOf(TypeError);
  });
});

describe("crearClaveDeIngestaAction", () => {
  it("devuelve la clave una vez y en la base guarda sólo su hash", async () => {
    const resultado = await crearClaveDeIngestaAction("  Landing de diciembre  ");
    if (!resultado.success) throw new Error(resultado.error);
    const { clave, resumen } = resultado.data;

    expect(clave).toMatch(/^lmt_ing_[A-Za-z0-9_-]{43}$/);
    expect(resumen).toEqual({
      id: expect.any(String),
      label: "Landing de diciembre",
      createdAt: expect.any(String),
      lastUsedAt: null,
      revokedAt: null,
    });

    const guardada = base.tablas.ingest_keys.find((f) => f.id === resumen.id);
    expect(guardada).toMatchObject({
      organization_id: ORG,
      key_hash: sha256(clave),
      label: "Landing de diciembre",
    });
    // La clave en texto no queda en la base (criterio de aceptación).
    expect(JSON.stringify(base.tablas)).not.toContain(clave);
    expect(JSON.stringify(base.tablas)).not.toContain(clave.slice("lmt_ing_".length));
    // Ni el hash vuelve al navegador.
    expect(JSON.stringify(resultado)).not.toContain(sha256(clave));
    // Ni nada se registró.
    expect(errores).not.toHaveBeenCalled();
    expect(avisos).not.toHaveBeenCalled();
    expect(sim.reportes).toHaveLength(0);
  });

  it("la clave creada autentica para su organización", async () => {
    const resultado = await crearClaveDeIngestaAction("Landing");
    if (!resultado.success) throw new Error(resultado.error);
    expect(
      await verificarClaveDeIngesta(resultado.data.clave, {
        cliente: base.cliente() as SupabaseClient,
        enSegundoPlano: () => {},
      }),
    ).toEqual({ organizationId: ORG, claveId: resultado.data.resumen.id });
  });

  it.each([
    ["", "Poné un nombre para la clave, por ejemplo el de la landing que la va a usar."],
    ["    ", "Poné un nombre para la clave, por ejemplo el de la landing que la va a usar."],
    ["x".repeat(101), "El nombre de la clave puede tener hasta 100 caracteres."],
    ["🚀".repeat(101), "El nombre de la clave puede tener hasta 100 caracteres."],
  ])("rechaza el nombre %j como valor, sin escribir", async (nombre, mensaje) => {
    expect(await crearClaveDeIngestaAction(nombre)).toEqual({ success: false, error: mensaje });
    expect(escrituras()).toHaveLength(0);
    expect(sim.reportes).toHaveLength(0);
  });

  it.each(["a\u0000b", "Landing\nde noviembre", "Landing\tB", "\u0000", "borrar\u007f", "x\u001fy"])(
    "rechaza el nombre con caracteres de control %j como valor, sin escribir (AR pasada 1)",
    async (nombre) => {
      expect(await crearClaveDeIngestaAction(nombre)).toEqual({
        success: false,
        error: "El nombre de la clave no puede tener saltos de línea, tabulaciones ni otros caracteres invisibles.",
      });
      expect(escrituras()).toHaveLength(0);
      expect(sim.reportes).toHaveLength(0);
    },
  );

  it("acepta acentos, ñ y emojis en el nombre", async () => {
    expect((await crearClaveDeIngestaAction("Señal, lanzamiento 🚀")).success).toBe(true);
  });

  it("acepta 100 caracteres aunque sean de más de una unidad UTF-16", async () => {
    expect((await crearClaveDeIngestaAction("🚀".repeat(100))).success).toBe(true);
  });

  it("una falla de la base vuelve con el texto fijo y no registra la clave ni el hash", async () => {
    // Un error que trae el hash en el texto (como el detalle de un 23505).
    let hashIntentado = "";
    base.errores["ingest_keys:insert"] = { message: "", code: "23505" };
    const original = base.cliente;
    base.cliente = () => {
      const c = original() as { from: (t: string) => { insert: (v: { key_hash: string }) => unknown } };
      return {
        from: (t: string) => {
          const b = c.from(t);
          const insertar = b.insert.bind(b);
          b.insert = (v: { key_hash: string }) => {
            hashIntentado = v.key_hash;
            base.errores["ingest_keys:insert"] = {
              message: `duplicate key value violates unique constraint (key_hash)=(${v.key_hash})`,
              code: "23505",
            };
            return insertar(v);
          };
          return b;
        },
      };
    };

    const resultado = await crearClaveDeIngestaAction("Landing");
    expect(resultado).toEqual({ success: false, error: ERROR_INESPERADO });
    expect(hashIntentado).toMatch(/^[0-9a-f]{64}$/);
    expect(sim.reportes).toHaveLength(1);
    expect((sim.reportes[0].error as Error).message).toBe("No se pudo guardar la clave de ingesta.");
    expect((sim.reportes[0].error as { code?: string }).code).toBe("23505");
    expect(sim.reportes[0].contexto).toEqual({ accion: "[crearClaveDeIngesta]" });
    expect(todoLoRegistrado()).not.toContain(hashIntentado);
    expect(todoLoRegistrado()).not.toContain("lmt_ing_");
  });

  it("una excepción (la red) vuelve con el texto fijo y se registra", async () => {
    base.lanza["ingest_keys:insert"] = new TypeError("fetch failed");
    expect(await crearClaveDeIngestaAction("Landing")).toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
    expect(errores).toHaveBeenCalledWith("[crearClaveDeIngesta]", expect.any(TypeError));
    expect(sim.reportes).toHaveLength(1);
    expect(todoLoRegistrado()).not.toContain("lmt_ing_");
  });

  it("supabase-js con {error:{message:'TypeError: fetch failed'}} vuelve con el texto fijo", async () => {
    base.errores["ingest_keys:insert"] = { message: "TypeError: fetch failed" };
    expect(await crearClaveDeIngestaAction("Landing")).toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
    expect(sim.reportes).toHaveLength(1);
  });
});

describe("revocarClaveDeIngestaAction", () => {
  it("revoca una clave propia, filtrando por id, organización y no revocada", async () => {
    const resultado = await revocarClaveDeIngestaAction(ID_PROPIA);
    expect(resultado).toEqual({ success: true, data: { revokedAt: expect.any(String) } });

    const escritura = escrituras()[0];
    expect(escritura.filtros).toEqual([
      ["id", "eq", ID_PROPIA],
      ["organization_id", "eq", ORG],
      ["revoked_at", "is", null],
    ]);
    const fila = base.tablas.ingest_keys.find((f) => f.id === ID_PROPIA);
    expect(fila?.revoked_at).toBe(resultado.success ? resultado.data.revokedAt : "");
  });

  it("una clave revocada deja de autenticar (criterio de aceptación)", async () => {
    const creada = await crearClaveDeIngestaAction("Landing");
    if (!creada.success) throw new Error(creada.error);
    const cliente = base.cliente() as SupabaseClient;
    const opciones = { cliente, enSegundoPlano: () => {} };

    expect(await verificarClaveDeIngesta(creada.data.clave, opciones)).not.toBeNull();
    expect((await revocarClaveDeIngestaAction(creada.data.resumen.id)).success).toBe(true);
    expect(await verificarClaveDeIngesta(creada.data.clave, opciones)).toBeNull();
  });

  it("una clave de otra organización no se revoca y no responde éxito", async () => {
    expect(await revocarClaveDeIngestaAction(ID_AJENA)).toEqual({
      success: false,
      error: CLAVE_INEXISTENTE,
    });
    expect(base.tablas.ingest_keys.find((f) => f.id === ID_AJENA)?.revoked_at).toBeNull();
    expect(sim.reportes).toHaveLength(0);
  });

  it("una clave ya revocada no se vuelve a revocar ni cambia su fecha", async () => {
    expect(await revocarClaveDeIngestaAction(ID_REVOCADA)).toEqual({
      success: false,
      error: CLAVE_INEXISTENTE,
    });
    expect(base.tablas.ingest_keys.find((f) => f.id === ID_REVOCADA)?.revoked_at).toBe(
      "2026-09-30T00:00:00.000Z",
    );
  });

  it("una clave que no existe responde lo mismo", async () => {
    expect(await revocarClaveDeIngestaAction(NO_EXISTE)).toEqual({
      success: false,
      error: CLAVE_INEXISTENTE,
    });
  });

  it.each(["no-es-un-id", "", "' or 1=1 --"])(
    "un id inválido (%j) responde lo mismo sin consultar",
    async (id) => {
      expect(await revocarClaveDeIngestaAction(id)).toEqual({
        success: false,
        error: CLAVE_INEXISTENTE,
      });
      expect(base.consultas).toHaveLength(0);
    },
  );

  it("una falla de la base como valor vuelve con el texto fijo y se registra", async () => {
    base.errores["ingest_keys:update"] = { message: "TypeError: fetch failed" };
    expect(await revocarClaveDeIngestaAction(ID_PROPIA)).toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
    expect(sim.reportes).toHaveLength(1);
    expect(sim.reportes[0].contexto).toEqual({ accion: "[revocarClaveDeIngesta]" });
  });

  it("una excepción (la red) vuelve con el texto fijo y se registra", async () => {
    base.lanza["ingest_keys:update"] = new TypeError("fetch failed");
    expect(await revocarClaveDeIngestaAction(ID_PROPIA)).toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
    expect(errores).toHaveBeenCalledWith("[revocarClaveDeIngesta]", expect.any(TypeError));
    expect(sim.reportes).toHaveLength(1);
  });
});

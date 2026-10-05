import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-36 · [FATHOM-SYNC-CURSOR]: dos corridas de punta a punta, con Fathom
 * (fetch) y Supabase simulados. En la primera una reunión falla al guardarse y
 * otra entra; la segunda tiene que volver a pedir la que falló y guardarla.
 * Vale para la sync de la organización y para la del miembro.
 */

const ORG = "org-1";
const OTRA_ORG = "org-2";
const USER = "user-1";
const CONEXION = "2026-10-05T06:00:00.000Z";

type Fila = Record<string, unknown>;
type Consulta = { tabla: string; op: string; filtros: Record<string, unknown> };

const sim = vi.hoisted(() => ({
  tablas: {} as Record<string, Array<Record<string, unknown>>>,
  consultas: [] as Array<{ tabla: string; op: string; filtros: Record<string, unknown> }>,
  /** `fathom_call_id` cuyo insert falla. */
  fallarInsert: new Set<string>(),
  reuniones: [] as Array<{ recording_id: number; created_at: string; title: string }>,
  pedidos: [] as URL[],
  tamanoDePagina: 10,
  reasociadas: [] as string[],
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => crearAdmin(),
}));

vi.mock("@/lib/fathom/apply-call-match", () => ({
  applyClientMatchToCall: async (_admin: unknown, callId: string) => {
    sim.reasociadas.push(callId);
  },
}));

vi.mock("@/lib/fathom/member-key", () => ({
  readMemberFathomKey: () => "key-del-miembro",
}));

vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => {
    sim.reportes.push({ error, contexto });
  },
}));

function coincide(fila: Fila, filtros: Record<string, unknown>) {
  return Object.entries(filtros).every(([col, val]) => fila[col] === val);
}

/** Supabase mínimo: lo que usan la sync de la org, la del miembro y el upsert. */
function crearAdmin() {
  return {
    from(tabla: string) {
      const filtros: Record<string, unknown> = {};
      let op = "select";
      let cambios: Fila | null = null;
      const filas = () => (sim.tablas[tabla] ??= []);
      const registrar = () =>
        sim.consultas.push({ tabla, op, filtros: { ...filtros } } satisfies Consulta);

      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filtros[col] = val;
          return builder;
        },
        maybeSingle: async () => {
          registrar();
          return { data: filas().find((f) => coincide(f, filtros)) ?? null, error: null };
        },
        update: (row: Fila) => {
          op = "update";
          cambios = row;
          return builder;
        },
        insert: (row: Fila) => {
          op = "insert";
          registrar();
          const falla = sim.fallarInsert.has(String(row.fathom_call_id));
          const nueva = { id: `call-${filas().length + 1}`, processed_at: null, ...row };
          if (!falla) filas().push(nueva);
          return {
            select: () => ({
              single: async () =>
                falla
                  ? { data: null, error: { message: "insert simulado que falla" } }
                  : { data: { id: nueva.id }, error: null },
            }),
          };
        },
        // `await admin.from(...).update(...).eq(...)` resuelve acá.
        then(resolve: (v: { error: null }) => void) {
          if (op === "update" && cambios) {
            registrar();
            for (const fila of filas()) if (coincide(fila, filtros)) Object.assign(fila, cambios);
          }
          resolve({ error: null });
        },
      };
      return builder;
    },
  };
}

/** Fathom: filtra por `created_after`/`created_before`, más nuevas primero, paginado. */
function fathomFetch(input: string | URL) {
  const url = new URL(String(input));
  sim.pedidos.push(url);
  const despues = url.searchParams.get("created_after");
  const antes = url.searchParams.get("created_before");
  const items = sim.reuniones
    .filter((r) => !despues || new Date(r.created_at) > new Date(despues))
    .filter((r) => !antes || new Date(r.created_at) < new Date(antes))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const offset = Number(url.searchParams.get("cursor") ?? 0);
  const pagina = items.slice(offset, offset + sim.tamanoDePagina);
  const siguiente = offset + sim.tamanoDePagina < items.length ? String(offset + sim.tamanoDePagina) : null;
  const body = JSON.stringify({ limit: sim.tamanoDePagina, next_cursor: siguiente, items: pagina });
  return Promise.resolve(new Response(body, { status: 200 }));
}

const FALLA = { recording_id: 101, created_at: "2026-10-05T07:00:00Z", title: "Va a fallar" };
const ENTRA = { recording_id: 102, created_at: "2026-10-05T08:00:00Z", title: "Entra" };

function llamada(tabla = "fathom_calls", fathomCallId: string) {
  return (sim.tablas[tabla] ?? []).find((f) => f.fathom_call_id === fathomCallId);
}

beforeEach(() => {
  sim.tablas = {};
  sim.consultas = [];
  sim.fallarInsert = new Set();
  sim.reuniones = [FALLA, ENTRA];
  sim.pedidos = [];
  sim.tamanoDePagina = 10;
  sim.reasociadas = [];
  sim.reportes = [];
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T09:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(fathomFetch));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function filtroDeOrgEnTodo(tabla: string) {
  const deLaTabla = sim.consultas.filter((c) => c.tabla === tabla && c.op !== "insert");
  expect(deLaTabla.length).toBeGreaterThan(0);
  return deLaTabla;
}

describe("sync de la organización: dos corridas", () => {
  beforeEach(() => {
    sim.tablas.fathom_integrations = [
      { organization_id: ORG, api_key: "key-org", status: "connected", last_sync_at: null, connected_at: CONEXION },
      { organization_id: OTRA_ORG, api_key: "key-otra", status: "connected", last_sync_at: null, connected_at: CONEXION },
    ];
  });

  it("⭐ la que falló en la corrida 1 se vuelve a pedir y se guarda en la corrida 2", async () => {
    const { syncFathomMeetingsForOrganization } = await import("@/lib/fathom/sync");
    const integracion = () => sim.tablas.fathom_integrations.find((f) => f.organization_id === ORG)!;

    // Corrida 1: la 101 falla al guardarse, la 102 entra.
    sim.fallarInsert.add("101");
    expect(await syncFathomMeetingsForOrganization(ORG)).toBe(1);
    expect(llamada(undefined, "102")).toBeDefined();
    expect(llamada(undefined, "101")).toBeUndefined();

    const cursor = integracion().last_sync_at as string;
    expect(cursor).toBeTruthy();
    // El cursor nunca pasa del created_at de la reunión que no se guardó.
    expect(new Date(cursor).getTime()).toBeLessThan(new Date(FALLA.created_at).getTime());
    // La otra org no se tocó.
    expect(sim.tablas.fathom_integrations.find((f) => f.organization_id === OTRA_ORG)!.last_sync_at).toBeNull();

    // Corrida 2: la base ya no falla.
    sim.fallarInsert.clear();
    sim.pedidos = [];
    vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));
    expect(await syncFathomMeetingsForOrganization(ORG)).toBe(2);

    expect(sim.pedidos[0].searchParams.get("created_after")).toBe(cursor);
    expect(llamada(undefined, "101")).toMatchObject({ organization_id: ORG, status: "pending" });
    expect(new Date(integracion().last_sync_at as string).getTime()).toBeLessThan(
      new Date(ENTRA.created_at).getTime()
    );
    expect(new Date(integracion().last_sync_at as string).getTime()).toBeGreaterThan(
      new Date(cursor).getTime()
    );

    // Toda lectura y escritura de la integración y de las llamadas filtró por esta org.
    for (const c of filtroDeOrgEnTodo("fathom_integrations")) {
      expect(c.filtros.organization_id).toBe(ORG);
    }
    for (const c of sim.consultas.filter((c) => c.tabla === "fathom_calls" && c.op === "select")) {
      expect(c.filtros.organization_id).toBe(ORG);
    }
    expect(sim.reportes).toEqual([]);
  });

  it("⭐ el solape vuelve a traer una llamada ya procesada y no la manda de nuevo al análisis", async () => {
    const { syncFathomMeetingsForOrganization } = await import("@/lib/fathom/sync");
    await syncFathomMeetingsForOrganization(ORG);
    const procesada = llamada(undefined, "102")!;
    Object.assign(procesada, { status: "associated", processed_at: "2026-10-05T08:40:00Z" });
    sim.reasociadas = [];
    sim.pedidos = [];
    sim.consultas = [];

    vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));
    await syncFathomMeetingsForOrganization(ORG);

    // La corrida 2 la volvió a pedir (por el solape) y pasó por el guardado...
    const desde = sim.pedidos[0].searchParams.get("created_after")!;
    expect(new Date(desde).getTime()).toBeLessThan(new Date(ENTRA.created_at).getTime());
    expect(
      sim.consultas.some(
        (c) => c.tabla === "fathom_calls" && c.op === "update" && c.filtros.id === procesada.id
      )
    ).toBe(true);
    // ...pero ni el matcher ni el estado la tocaron.
    expect(sim.reasociadas).not.toContain(procesada.id);
    expect(procesada.status).toBe("associated");
  });

  it("una llamada que todavía no se procesó sí se vuelve a asociar (el título pudo cambiar)", async () => {
    const { upsertFathomCallFromMeeting } = await import("@/lib/fathom/sync");
    const { mapFathomMeeting } = await import("@/lib/fathom/api");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const meeting = mapFathomMeeting(ENTRA)!;
    const admin = createAdminClient();
    expect(await upsertFathomCallFromMeeting(admin, ORG, meeting)).toBe(true);
    expect(await upsertFathomCallFromMeeting(admin, ORG, meeting)).toBe(true);
    const fila = llamada(undefined, "102")!;
    expect(sim.reasociadas).toEqual([fila.id, fila.id]);
  });

  it("⭐ una lectura cortada por el tope (más nuevas primero) no adelanta el cursor", async () => {
    const { syncFathomMeetingsForOrganization } = await import("@/lib/fathom/sync");
    sim.tamanoDePagina = 1;
    sim.reuniones = Array.from({ length: 25 }, (_, i) => ({
      recording_id: 200 + i,
      created_at: new Date(Date.parse("2026-10-05T06:30:00Z") + i * 60_000).toISOString(),
      title: `R${i}`,
    }));

    await syncFathomMeetingsForOrganization(ORG);

    // 20 páginas de 1: quedaron 5 sin leer, las más viejas. El cursor no pasa de ellas.
    const integracion = sim.tablas.fathom_integrations.find((f) => f.organization_id === ORG)!;
    expect(sim.pedidos).toHaveLength(20);
    expect(integracion.last_sync_at).toBeNull();
    expect(sim.reportes).toHaveLength(1);
  });
});

describe("debeReasociarAlSincronizar", () => {
  it("sólo con llamadas nuevas o que todavía no se procesaron", async () => {
    const { debeReasociarAlSincronizar } = await import("@/lib/fathom/sync");
    expect(debeReasociarAlSincronizar(null)).toBe(true);
    expect(debeReasociarAlSincronizar({ status: "pending", processed_at: null })).toBe(true);
    expect(debeReasociarAlSincronizar({ status: "pending_review", processed_at: null })).toBe(true);
    expect(debeReasociarAlSincronizar({ status: "processing", processed_at: null })).toBe(false);
    expect(debeReasociarAlSincronizar({ status: "associated", processed_at: "2026-10-05T08:00:00Z" })).toBe(false);
    expect(debeReasociarAlSincronizar({ status: "unmatched", processed_at: "2026-10-05T08:00:00Z" })).toBe(false);
    // Un reanálisis pedido vuelve a `pending` con `processed_at`: no se pisa.
    expect(debeReasociarAlSincronizar({ status: "pending", processed_at: "2026-10-05T08:00:00Z" })).toBe(false);
  });
});

describe("sync del miembro: dos corridas", () => {
  beforeEach(() => {
    sim.tablas.team_member_integrations = [
      {
        organization_id: ORG,
        user_id: USER,
        integration_type: "fathom",
        last_sync_at: null,
        connected_at: CONEXION,
      },
      {
        organization_id: OTRA_ORG,
        user_id: USER,
        integration_type: "fathom",
        last_sync_at: null,
        connected_at: CONEXION,
      },
    ];
  });

  function filaMiembro() {
    return sim.tablas.team_member_integrations.find((f) => f.organization_id === ORG)!;
  }

  async function correr() {
    const { sincronizarMiembroFathom } = await import("@/lib/fathom/member-sync");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const fila = filaMiembro();
    return sincronizarMiembroFathom(createAdminClient(), {
      organization_id: ORG,
      user_id: USER,
      encrypted_api_key: "v2.cifrada",
      last_sync_at: fila.last_sync_at as string | null,
      connected_at: fila.connected_at as string | null,
    });
  }

  it("⭐ la que falló en la corrida 1 se vuelve a pedir y se guarda en la corrida 2", async () => {
    sim.fallarInsert.add("101");
    expect(await correr()).toEqual({ synced: 1, fallidas: 1 });

    const cursor = filaMiembro().last_sync_at as string;
    expect(cursor).toBeTruthy();
    expect(new Date(cursor).getTime()).toBeLessThan(new Date(FALLA.created_at).getTime());

    sim.fallarInsert.clear();
    sim.pedidos = [];
    vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));
    expect(await correr()).toEqual({ synced: 2, fallidas: 0 });

    expect(sim.pedidos[0].searchParams.get("created_after")).toBe(cursor);
    expect(llamada(undefined, "101")).toMatchObject({ organization_id: ORG, user_id: USER });
    expect(new Date(filaMiembro().last_sync_at as string).getTime()).toBeLessThan(
      new Date(ENTRA.created_at).getTime()
    );

    // La fila de la otra org no se tocó, y todo filtró por org (y por miembro).
    expect(
      sim.tablas.team_member_integrations.find((f) => f.organization_id === OTRA_ORG)!.last_sync_at
    ).toBeNull();
    for (const c of filtroDeOrgEnTodo("team_member_integrations")) {
      expect(c.filtros).toMatchObject({ organization_id: ORG, user_id: USER, integration_type: "fathom" });
    }
    for (const c of sim.consultas.filter((c) => c.tabla === "fathom_calls" && c.op === "select")) {
      expect(c.filtros.organization_id).toBe(ORG);
    }
  });

  it("⭐ una lectura cortada por el tope de 5 páginas no adelanta el cursor", async () => {
    sim.tamanoDePagina = 1;
    sim.reuniones = Array.from({ length: 8 }, (_, i) => ({
      recording_id: 300 + i,
      created_at: new Date(Date.parse("2026-10-05T06:30:00Z") + i * 60_000).toISOString(),
      title: `R${i}`,
    }));
    await correr();
    expect(sim.pedidos).toHaveLength(5);
    expect(filaMiembro().last_sync_at).toBeNull();
  });

  it("⭐ atrasado varios días: lee por tramos desde lo más viejo y avanza aunque no haya nada", async () => {
    filaMiembro().connected_at = "2026-10-01T00:00:00.000Z";
    sim.reuniones = [];
    await correr();
    // Con 5 páginas recorre 5 tramos cerrados de 6 h y deja el cursor al final del último.
    expect(sim.pedidos).toHaveLength(5);
    expect(sim.pedidos[0].searchParams.get("created_before")).toBe("2026-10-01T06:00:00.000Z");
    expect(new Date(filaMiembro().last_sync_at as string).getTime()).toBeGreaterThan(
      Date.parse("2026-10-02T00:00:00Z")
    );
  });
});

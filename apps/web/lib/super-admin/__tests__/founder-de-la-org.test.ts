import { describe, expect, it, vi } from "vitest";

/**
 * SCRUM-552 · una org puede tener varios founders (la de Limitless: todo el
 * staff). La ficha y el listado de organizaciones muestran siempre el mismo: el
 * más antiguo (`created_at`, y el id para desempatar).
 *
 * El mock se comporta como PostgREST: aplica `eq`, `not`, `order` y `limit`, y
 * `maybeSingle` con más de una fila devuelve error (PGRST116). Las filas se
 * cargan en un orden que no es el de antigüedad, para que tomar "la primera que
 * vuelve" no alcance.
 */

type Fila = Record<string, unknown>;

const sim = vi.hoisted(() => {
  const tablas: Record<string, Fila[]> = {};

  function consulta(filas: Fila[]) {
    let resultado = [...filas];
    let soloConteo = false;
    let tope: number | null = null;
    const ordenes: { columna: string; ascending: boolean }[] = [];

    function filasFinales(): Fila[] {
      const ordenadas = [...resultado];
      for (const { columna, ascending } of [...ordenes].reverse()) {
        ordenadas.sort((a, b) => {
          const x = String(a[columna] ?? "");
          const y = String(b[columna] ?? "");
          if (x === y) return 0;
          return (x < y ? -1 : 1) * (ascending ? 1 : -1);
        });
      }
      return tope === null ? ordenadas : ordenadas.slice(0, tope);
    }

    const builder = {
      select(_columnas?: string, opciones?: { head?: boolean }) {
        soloConteo = Boolean(opciones?.head);
        return builder;
      },
      eq(columna: string, valor: unknown) {
        resultado = resultado.filter((f) => f[columna] === valor);
        return builder;
      },
      not(columna: string, _op: string, _valor: unknown) {
        resultado = resultado.filter((f) => f[columna] !== null && f[columna] !== undefined);
        return builder;
      },
      gte: () => builder,
      lte: () => builder,
      order(columna: string, opciones?: { ascending?: boolean }) {
        ordenes.push({ columna, ascending: opciones?.ascending !== false });
        return builder;
      },
      limit(n: number) {
        tope = n;
        return builder;
      },
      async maybeSingle() {
        const fs = filasFinales();
        if (fs.length > 1) {
          return {
            data: null,
            error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
          };
        }
        return { data: fs[0] ?? null, error: null };
      },
      then(resolve: (r: { data: Fila[] | null; error: null; count: number }) => unknown) {
        const fs = filasFinales();
        return Promise.resolve(
          resolve({ data: soloConteo ? null : fs, error: null, count: fs.length })
        );
      },
    };
    return builder;
  }

  return { tablas, consulta };
});

vi.mock("@/lib/auth/require-staff", () => ({
  requireStaff: async () => ({ id: "s-1", email: "staff@limitless.com" }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { last_sign_in_at: `login-de-${id}` } },
        }),
      },
    },
    from: (tabla: string) => sim.consulta(sim.tablas[tabla] ?? []),
  }),
}));
vi.mock("@sentry/nextjs", () => ({}));

import { loadOrganizationDetail, loadOrganizationsList } from "../queries";

const ORG_L = "0c000000-0000-4000-8000-0000000000aa";
const ORG_A = "0a000000-0000-4000-8000-000000000001";

function perfil(
  id: string,
  organization_id: string,
  role: string,
  full_name: string,
  created_at: string
): Fila {
  return { id, organization_id, role, full_name, email: `${id}@test`, created_at };
}

function sembrar(perfiles: Fila[]) {
  for (const k of Object.keys(sim.tablas)) delete sim.tablas[k];
  sim.tablas.organizations = [
    { id: ORG_L, name: "Limitless", status: "active", created_at: "2026-01-01T00:00:00Z", mrr_usd: 0, timezone: null, enabled_add_ons: [] },
    { id: ORG_A, name: "Org A", status: "active", created_at: "2026-02-01T00:00:00Z", mrr_usd: 0, timezone: null, enabled_add_ons: [] },
  ];
  sim.tablas.profiles = perfiles;
}

// Org de Limitless con tres founders, cargados del más nuevo al más viejo, y
// dos con el mismo created_at (desempata el id). Org A con un solo founder.
const VARIOS_FOUNDERS = [
  perfil("f-nuevo", ORG_L, "founder", "Founder Nuevo", "2026-11-01T00:00:00Z"),
  perfil("f-viejo-b", ORG_L, "founder", "Founder Viejo B", "2026-03-01T00:00:00Z"),
  perfil("f-viejo-a", ORG_L, "founder", "Founder Viejo A", "2026-03-01T00:00:00Z"),
  perfil("m-1", ORG_L, "member", "Miembro", "2025-01-01T00:00:00Z"),
  perfil("f-solo", ORG_A, "founder", "Founder Solo", "2026-05-01T00:00:00Z"),
];

describe("founder que se muestra de una org con varios founders", () => {
  it("ficha: muestra el founder más antiguo, no '—'", async () => {
    sembrar(VARIOS_FOUNDERS);
    const ficha = await loadOrganizationDetail(ORG_L);
    expect(ficha?.founder).toEqual({
      id: "f-viejo-a",
      name: "Founder Viejo A",
      email: "f-viejo-a@test",
      lastLogin: "login-de-f-viejo-a",
    });
  });

  it("ficha: una org con un solo founder lo sigue mostrando", async () => {
    sembrar(VARIOS_FOUNDERS);
    const ficha = await loadOrganizationDetail(ORG_A);
    expect(ficha?.founder.id).toBe("f-solo");
    expect(ficha?.founder.name).toBe("Founder Solo");
  });

  it("listado: muestra el mismo founder que la ficha", async () => {
    sembrar(VARIOS_FOUNDERS);
    const filas = await loadOrganizationsList();
    const l = filas.find((f) => f.id === ORG_L);
    const a = filas.find((f) => f.id === ORG_A);
    expect(l?.founderId).toBe("f-viejo-a");
    expect(l?.founderName).toBe("Founder Viejo A");
    expect(l?.founderLastLogin).toBe("login-de-f-viejo-a");
    expect(a?.founderId).toBe("f-solo");
  });

  it("listado: el resultado no depende del orden en que vuelven las filas", async () => {
    sembrar([...VARIOS_FOUNDERS].reverse());
    const filas = await loadOrganizationsList();
    expect(filas.find((f) => f.id === ORG_L)?.founderId).toBe("f-viejo-a");
    const ficha = await loadOrganizationDetail(ORG_L);
    expect(ficha?.founder.id).toBe("f-viejo-a");
  });
});

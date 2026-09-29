/**
 * [ZERNIO-KEY-GLOBAL] La key de Zernio sale sólo de la integración activa de la
 * org. Aunque `ZERNIO_API_KEY` esté seteada (como en Vercel), una org sin
 * Zernio conectado no la hereda.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  filters: [] as Array<[string, string, unknown]>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        state.filters.push(["eq", column, value]);
        return query;
      },
      maybeSingle: async () => {
        const match = state.rows.find((row) =>
          state.filters.every(([, column, value]) => row[column] === value)
        );
        return { data: match ?? null, error: null };
      },
    };
    return { from: () => query };
  },
}));

vi.mock("@/lib/security/encryption", () => ({
  encrypt: (value: string) => `enc:${value}`,
  readStoredSecret: (value: string) => value.replace(/^enc:/, ""),
}));

import {
  getZernioApiKeyForOrganization,
  getZernioClientForOrganization,
} from "../integration";

function integration(overrides: Row = {}): Row {
  return {
    id: "int-1",
    organization_id: "org-conectada",
    zernio_profile_id: "profile-1",
    connected_accounts: [],
    api_key: "enc:sk_org_propia",
    account_name: null,
    webhook_secret: null,
    is_active: true,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("getZernioApiKeyForOrganization", () => {
  beforeEach(() => {
    state.rows = [];
    state.filters = [];
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ZERNIO_API_KEY", "sk_global_de_otra_cuenta");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("no devuelve la key global si la org no tiene integración", async () => {
    await expect(getZernioApiKeyForOrganization("org-sin-zernio")).resolves.toBeNull();
  });

  it("no devuelve la key global si la integración está inactiva", async () => {
    state.rows = [integration({ organization_id: "org-inactiva", is_active: false })];
    await expect(getZernioApiKeyForOrganization("org-inactiva")).resolves.toBeNull();
  });

  it("no devuelve la key global si la integración activa no tiene key", async () => {
    state.rows = [integration({ organization_id: "org-sin-key", api_key: null })];
    await expect(getZernioApiKeyForOrganization("org-sin-key")).resolves.toBeNull();
  });

  it("devuelve la key propia de la org cuando está conectada", async () => {
    state.rows = [integration()];
    await expect(getZernioApiKeyForOrganization("org-conectada")).resolves.toBe(
      "sk_org_propia"
    );
  });

  it("getZernioClientForOrganization tira 'no conectado' sin integración", async () => {
    await expect(getZernioClientForOrganization("org-sin-zernio")).rejects.toThrow(
      "Zernio no está conectado"
    );
  });
});

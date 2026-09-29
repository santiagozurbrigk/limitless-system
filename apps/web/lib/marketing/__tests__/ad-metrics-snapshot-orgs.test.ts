/**
 * [ZERNIO-KEY-GLOBAL] El cron `capture-ad-metrics` sólo recorre integraciones
 * de Zernio activas y con key: una integración desactivada no escribe filas en
 * `ad_metrics_daily`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  integrations: [] as Row[],
  upserts: [] as Row[][],
  keyLookups: [] as string[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "ad_metrics_daily") {
        return {
          upsert: async (rows: Row[]) => {
            state.upserts.push(rows);
            return { error: null };
          },
        };
      }
      let rows = [...state.integrations];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          rows = rows.filter((row) => row[column] === value);
          return query;
        },
        not: (column: string, operator: string, value: unknown) => {
          if (operator === "is" && value === null) {
            rows = rows.filter((row) => row[column] !== null);
          }
          return query;
        },
        then: (resolve: (result: { data: Row[]; error: null }) => unknown) =>
          resolve({ data: rows, error: null }),
      };
      return query;
    },
  }),
}));

vi.mock("@/lib/zernio/integration", () => ({
  getZernioApiKeyForOrganization: async (organizationId: string) => {
    state.keyLookups.push(organizationId);
    const row = state.integrations.find(
      (item) => item.organization_id === organizationId && item.is_active
    );
    return (row?.api_key as string | null) ?? null;
  },
}));

vi.mock("@/lib/zernio/client", () => ({
  createZernioClient: () => ({
    listAds: async () => ({
      ads: [
        {
          _id: "ad-1",
          name: "Creativo",
          platform: "META",
          status: "ACTIVE",
          metrics: { spend: 10, impressions: 100, clicks: 5 },
        },
      ],
    }),
  }),
}));

import { captureAdMetricsForAllOrganizations } from "../ad-metrics-snapshot";

describe("captureAdMetricsForAllOrganizations", () => {
  beforeEach(() => {
    state.integrations = [];
    state.upserts = [];
    state.keyLookups = [];
  });

  it("recorre sólo integraciones activas y con key", async () => {
    state.integrations = [
      { organization_id: "org-activa", is_active: true, api_key: "sk_activa" },
      { organization_id: "org-inactiva", is_active: false, api_key: "sk_inactiva" },
      { organization_id: "org-sin-key", is_active: true, api_key: null },
    ];

    const results = await captureAdMetricsForAllOrganizations(
      new Date("2026-09-28T12:00:00.000Z")
    );

    expect(results.map((r) => r.organizationId)).toEqual(["org-activa"]);
    expect(state.keyLookups).toEqual(["org-activa"]);
    const writtenOrgs = state.upserts.flat().map((row) => row.organization_id);
    expect(writtenOrgs).not.toContain("org-inactiva");
    expect(writtenOrgs).not.toContain("org-sin-key");
  });

  it("sin integraciones activas no escribe nada", async () => {
    state.integrations = [
      { organization_id: "org-inactiva", is_active: false, api_key: "sk_inactiva" },
    ];

    const results = await captureAdMetricsForAllOrganizations();

    expect(results).toEqual([]);
    expect(state.upserts).toEqual([]);
  });
});

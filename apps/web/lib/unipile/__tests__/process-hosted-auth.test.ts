/**
 * [SEG-RLS-IDENTIFICADORES-EXTERNOS] (SCRUM-82): una cuenta de Unipile
 * conectada en otra org no desconecta la cuenta actual de quien la reclama.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  escrituras: [] as string[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const filtros: Array<(r: Row) => boolean> = [];
      const query = {
        select: () => query,
        eq: (c: string, v: unknown) => (filtros.push((r) => r[c] === v), query),
        neq: (c: string, v: unknown) => (filtros.push((r) => r[c] !== v), query),
        maybeSingle: async () => ({
          data: state.rows.find((r) => filtros.every((f) => f(r))) ?? null,
          error: null,
        }),
        update: () => (state.escrituras.push("update"), query),
        upsert: async () => (state.escrituras.push("upsert"), { error: null }),
      };
      return query;
    },
  }),
}));

vi.mock("../hosted-auth", () => ({
  fetchUnipileAccount: async () => ({ displayName: "Cuenta", provider: "instagram" }),
}));

vi.mock("../integration", () => ({
  decodeUnipileHostedName: () => ({ organizationId: "org-b", provider: "instagram" }),
}));

import { processUnipileHostedAuthNotify } from "../process-hosted-auth";

const aviso = { status: "CREATION_SUCCESS", account_id: "acc-x", name: "org-b" };

describe("processUnipileHostedAuthNotify", () => {
  beforeEach(() => {
    state.rows = [];
    state.escrituras = [];
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("⭐ si la cuenta ya está conectada en otra org, no toca nada", async () => {
    state.rows = [{ organization_id: "org-a", unipile_account_id: "acc-x", status: "connected" }];
    await expect(processUnipileHostedAuthNotify(aviso)).resolves.toEqual({ ok: true, ignored: true });
    expect(state.escrituras).toEqual([]);
  });

  it("la reconexión en la misma org sigue funcionando", async () => {
    state.rows = [{ organization_id: "org-b", unipile_account_id: "acc-x", status: "connected" }];
    const r = await processUnipileHostedAuthNotify(aviso);
    expect(r.ignored).toBeUndefined();
    expect(state.escrituras).toEqual(["update", "upsert"]);
  });
});

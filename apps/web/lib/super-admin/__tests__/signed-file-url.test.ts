import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-111 (fix-pack del AR): `getSignedFileUrl` firma con el service role
 * links de los documentos del cerebro de IA, así que sólo un super admin puede
 * pedirlos, aunque alguien la llame sin pasar por el layout del panel.
 */

const sim = vi.hoisted(() => ({
  superAdmin: true,
  firmas: [] as Array<{ bucket: string; path: string; expiresIn: number }>,
}));

vi.mock("@/lib/auth/require-super-admin", () => ({
  requireSuperAdmin: async () => {
    if (!sim.superAdmin) throw new Error("Sin permisos de super admin");
    return { id: "u-1", email: "staff@limitless.com" };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, expiresIn: number) => {
          sim.firmas.push({ bucket, path, expiresIn });
          return { data: { signedUrl: `https://firmado/${path}` }, error: null };
        },
      }),
    },
  }),
}));

import { getSignedFileUrl } from "../queries";

beforeEach(() => {
  sim.superAdmin = true;
  sim.firmas = [];
});

describe("getSignedFileUrl", () => {
  it("⭐ quien no es super admin no obtiene el link: se rechaza antes de firmar", async () => {
    sim.superAdmin = false;
    await expect(getSignedFileUrl("ai-brain-documents/doc.png")).rejects.toThrow(
      "Sin permisos de super admin"
    );
    expect(sim.firmas).toEqual([]);
  });

  it("un super admin obtiene el link firmado del bucket del cerebro", async () => {
    await expect(getSignedFileUrl("ai-brain-documents/doc.png")).resolves.toBe("https://firmado/doc.png");
    expect(sim.firmas).toEqual([{ bucket: "ai-brain-documents", path: "doc.png", expiresIn: 3600 }]);
  });
});

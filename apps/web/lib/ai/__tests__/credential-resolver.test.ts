/**
 * SCRUM-7: sin clave propia, no hay IA. Aunque `ANTHROPIC_API_KEY` esté cargada,
 * ninguna organización la usa.
 */
import { randomBytes } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const query = {
      select: () => query,
      update: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: state.row, error: null }),
    };
    return { from: () => query };
  },
}));

import { encrypt } from "@/lib/security/encryption";
import {
  invalidateOrgCredentialCache,
  loadOrgCredentialState,
  resolveCredentialForOrg,
} from "../credential-resolver";

const ORG = "11111111-1111-1111-1111-111111111111";
const ORIGINAL_KEY = process.env.ENCRYPTION_MASTER_KEY;
const ORIGINAL_GLOBAL = process.env.ANTHROPIC_API_KEY;

function claveGuardada(status: string, organizationId = ORG) {
  return {
    claude_api_key_encrypted: encrypt("sk-ant-de-la-org", {
      field: "organizations.claude_api_key_encrypted",
      organizationId,
    }),
    claude_api_key_status: status,
  };
}

beforeEach(() => {
  process.env.ENCRYPTION_MASTER_KEY = randomBytes(32).toString("base64");
  // Una clave global cargada no tiene que cambiar nada.
  process.env.ANTHROPIC_API_KEY = "sk-ant-global-de-limitless";
  invalidateOrgCredentialCache(ORG);
  state.row = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_KEY === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = ORIGINAL_KEY;
  if (ORIGINAL_GLOBAL === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_GLOBAL;
});

describe("resolveCredentialForOrg", () => {
  it("usa la clave propia de la org cuando es válida", async () => {
    state.row = claveGuardada("valid");
    const r = await resolveCredentialForOrg(ORG);
    expect(r.source).toBe("api_key");
    expect(r.client).not.toBeNull();
  });

  it("sin clave propia no hay IA, aunque ANTHROPIC_API_KEY esté cargada", async () => {
    state.row = { claude_api_key_encrypted: null, claude_api_key_status: "none" };
    expect(await resolveCredentialForOrg(ORG)).toMatchObject({ client: null, source: "none" });
  });

  it("con la clave rechazada no hay IA (no cae a otra clave)", async () => {
    state.row = claveGuardada("invalid");
    expect(await resolveCredentialForOrg(ORG)).toMatchObject({ client: null, source: "none" });
  });

  it("con una clave que no se puede leer no hay IA", async () => {
    state.row = claveGuardada("valid", "otra-org");
    expect(await resolveCredentialForOrg(ORG)).toMatchObject({ client: null, source: "none" });
  });

  it("sin organización no hay IA", async () => {
    expect(await resolveCredentialForOrg(undefined)).toMatchObject({ client: null, source: "none" });
  });
});

describe("loadOrgCredentialState", () => {
  it("marca keyUnreadable si la clave guardada no se puede descifrar", async () => {
    state.row = claveGuardada("valid", "otra-org");
    expect(await loadOrgCredentialState(ORG)).toMatchObject({
      hasApiKey: true,
      apiKeyStatus: "valid",
      keyUnreadable: true,
    });
  });

  it("una clave legible no es keyUnreadable", async () => {
    state.row = claveGuardada("valid");
    expect((await loadOrgCredentialState(ORG)).keyUnreadable).toBe(false);
  });
});

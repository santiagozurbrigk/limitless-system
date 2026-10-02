import crypto, { randomBytes } from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SECRET_FIELDS, decryptWithInfo, encrypt, type SecretContext } from "../encryption";
import { SECRET_COLUMNS, contextForRow, planReencryption } from "../reencrypt";

const ORIGINAL_CURRENT = process.env.ENCRYPTION_MASTER_KEY;
const ORIGINAL_PREVIOUS = process.env.ENCRYPTION_MASTER_KEY_PREVIOUS;

const CTX: SecretContext = { field: "ghl_integrations.api_key_encrypted", organizationId: "org-a" };

function newKey(): string {
  return randomBytes(32).toString("base64");
}

function encryptV1(plaintext: string, keyB64: string): string {
  const iv = randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}

function rewritten(plan: ReturnType<typeof planReencryption>): string {
  if (plan.action !== "rewrite") throw new Error(`esperaba rewrite, vino ${plan.action}`);
  return plan.value;
}

beforeEach(() => {
  process.env.ENCRYPTION_MASTER_KEY = newKey();
  delete process.env.ENCRYPTION_MASTER_KEY_PREVIOUS;
});
afterEach(() => {
  if (ORIGINAL_CURRENT === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = ORIGINAL_CURRENT;
  if (ORIGINAL_PREVIOUS === undefined) delete process.env.ENCRYPTION_MASTER_KEY_PREVIOUS;
  else process.env.ENCRYPTION_MASTER_KEY_PREVIOUS = ORIGINAL_PREVIOUS;
});

describe("SECRET_COLUMNS", () => {
  it("cubre exactamente todas las columnas cifradas, sin repetir", () => {
    const fields = SECRET_COLUMNS.map((c) => c.field);
    expect(new Set(fields).size).toBe(fields.length);
    expect([...fields].sort()).toEqual([...SECRET_FIELDS].sort());
  });

  it("el campo coincide con tabla.columna", () => {
    for (const c of SECRET_COLUMNS) expect(c.field).toBe(`${c.table}.${c.column}`);
  });
});

describe("contextForRow", () => {
  it("arma la AAD con la org y, para los secretos por miembro, el usuario", () => {
    const member = SECRET_COLUMNS.find((c) => c.table === "team_member_integrations")!;
    expect(contextForRow(member, { id: "1", organization_id: "org-a", user_id: "u-1" })).toEqual({
      field: "team_member_integrations.encrypted_api_key",
      organizationId: "org-a",
      userId: "u-1",
    });
    expect(contextForRow(member, { id: "1", organization_id: "org-a", user_id: null })).toBeNull();

    const byok = SECRET_COLUMNS.find((c) => c.table === "organizations")!;
    expect(contextForRow(byok, { id: "org-z" })).toEqual({
      field: "organizations.claude_api_key_encrypted",
      organizationId: "org-z",
    });
  });
});

describe("planReencryption", () => {
  it("no toca lo que ya está en v2 con la clave actual", () => {
    expect(planReencryption(encrypt("k", CTX), CTX, true)).toEqual({ action: "keep" });
  });

  it("informa como falla un secreto en formato v1, sin reescribirlo", () => {
    const plan = planReencryption(encryptV1("k", process.env.ENCRYPTION_MASTER_KEY!), CTX, true);
    expect(plan).toMatchObject({ action: "fail", reason: expect.stringMatching(/v1/) });
  });

  it("rotación completa: A → (B actual, A anterior) → re-cifrado → sin A sigue andando", () => {
    const keyA = process.env.ENCRYPTION_MASTER_KEY!;
    const v2 = encrypt("k-v2", CTX);

    process.env.ENCRYPTION_MASTER_KEY = newKey();
    process.env.ENCRYPTION_MASTER_KEY_PREVIOUS = keyA;

    const fromV2 = planReencryption(v2, CTX, true);
    expect(fromV2).toMatchObject({ action: "rewrite", from: "previous_key" });

    delete process.env.ENCRYPTION_MASTER_KEY_PREVIOUS;

    expect(decryptWithInfo(rewritten(fromV2), CTX)).toEqual({ plaintext: "k-v2", key: "current" });
    expect(planReencryption(rewritten(fromV2), CTX, true)).toEqual({ action: "keep" });
  });

  it("cifra el texto plano legacy sólo en las columnas que lo aceptan", () => {
    const plan = planReencryption("fathom-key.abc", CTX, true);
    expect(plan).toMatchObject({ action: "rewrite", from: "plaintext" });
    expect(decryptWithInfo(rewritten(plan), CTX).plaintext).toBe("fathom-key.abc");

    expect(planReencryption("fathom-key.abc", CTX, false)).toMatchObject({ action: "fail" });
  });

  it("informa como falla lo que no descifra con ninguna clave, sin reescribirlo", () => {
    const stored = encrypt("k", CTX);
    process.env.ENCRYPTION_MASTER_KEY = newKey();
    expect(planReencryption(stored, CTX, true)).toMatchObject({ action: "fail" });
  });

  it("informa como falla un secreto que está en otra fila (AAD)", () => {
    const stored = encrypt("k", CTX);
    expect(planReencryption(stored, { ...CTX, organizationId: "org-b" }, true)).toMatchObject({
      action: "fail",
    });
  });
});

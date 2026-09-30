import crypto, { randomBytes } from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decrypt,
  decryptWithInfo,
  encrypt,
  looksEncrypted,
  readStoredSecret,
  type SecretContext,
} from "../encryption";

const ORIGINAL_CURRENT = process.env.ENCRYPTION_MASTER_KEY;
const ORIGINAL_PREVIOUS = process.env.ENCRYPTION_MASTER_KEY_PREVIOUS;

const CTX: SecretContext = { field: "zernio_integrations.api_key", organizationId: "org-a" };

function newKey(): string {
  return randomBytes(32).toString("base64");
}

/** Lo que guardaba la versión anterior del módulo: `iv.tag.ct`, sin AAD. */
function encryptV1(plaintext: string, keyB64: string): string {
  const iv = randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
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

describe("encrypt / decrypt (v2)", () => {
  it("cifra en formato v2 y descifra con la clave actual", () => {
    const stored = encrypt("sk_live_123", CTX);
    expect(stored.startsWith("v2.")).toBe(true);
    expect(stored.split(".")).toHaveLength(4);
    expect(looksEncrypted(stored)).toBe(true);
    expect(decryptWithInfo(stored, CTX)).toEqual({
      plaintext: "sk_live_123",
      version: 2,
      key: "current",
    });
  });

  it("descifra con la clave anterior durante una rotación", () => {
    const keyA = process.env.ENCRYPTION_MASTER_KEY!;
    const stored = encrypt("sk_live_123", CTX);

    process.env.ENCRYPTION_MASTER_KEY = newKey();
    process.env.ENCRYPTION_MASTER_KEY_PREVIOUS = keyA;

    expect(decryptWithInfo(stored, CTX)).toEqual({
      plaintext: "sk_live_123",
      version: 2,
      key: "previous",
    });
    // Lo nuevo se cifra con la actual, no con la anterior.
    expect(decryptWithInfo(encrypt("otro", CTX), CTX).key).toBe("current");
  });

  it("tira cuando se saca la clave anterior y el dato seguía con ella", () => {
    const stored = encrypt("sk_live_123", CTX);
    process.env.ENCRYPTION_MASTER_KEY = newKey();
    expect(() => decrypt(stored, CTX)).toThrow(/No se pudo descifrar/);
  });

  it("no descifra un secreto copiado a otra organización", () => {
    const stored = encrypt("sk_live_123", CTX);
    expect(() => decrypt(stored, { ...CTX, organizationId: "org-b" })).toThrow();
  });

  it("no descifra un secreto copiado a otra columna de la misma org", () => {
    const stored = encrypt("sk_live_123", CTX);
    expect(() =>
      decrypt(stored, { field: "hyros_integrations.api_key_encrypted", organizationId: "org-a" })
    ).toThrow();
  });

  it("los secretos por miembro exigen el usuario y no pasan de un miembro a otro", () => {
    const field = "team_member_integrations.encrypted_api_key" as const;
    expect(() => encrypt("k", { field, organizationId: "org-a" })).toThrow(/userId/);

    const stored = encrypt("k", { field, organizationId: "org-a", userId: "user-1" });
    expect(decrypt(stored, { field, organizationId: "org-a", userId: "user-1" })).toBe("k");
    expect(() => decrypt(stored, { field, organizationId: "org-a", userId: "user-2" })).toThrow();
  });

  it("tira si el dato fue alterado", () => {
    const stored = encrypt("sk_live_123", CTX);
    const parts = stored.split(".");
    const ct = Buffer.from(parts[3], "base64");
    ct[0] ^= 1;
    parts[3] = ct.toString("base64");
    expect(() => decrypt(parts.join("."), CTX)).toThrow();
  });
});

describe("formato v1 (legacy)", () => {
  it("sigue leyendo lo cifrado antes de v2, con la clave actual o la anterior", () => {
    const keyA = process.env.ENCRYPTION_MASTER_KEY!;
    const stored = encryptV1("sk_live_123", keyA);
    expect(looksEncrypted(stored)).toBe(true);
    expect(decryptWithInfo(stored, CTX)).toEqual({
      plaintext: "sk_live_123",
      version: 1,
      key: "current",
    });

    process.env.ENCRYPTION_MASTER_KEY = newKey();
    process.env.ENCRYPTION_MASTER_KEY_PREVIOUS = keyA;
    expect(decryptWithInfo(stored, CTX).key).toBe("previous");
  });
});

describe("validación de la clave maestra", () => {
  it("encrypt tira sin ENCRYPTION_MASTER_KEY", () => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    expect(() => encrypt("x", CTX)).toThrow(/no está configurada/);
  });

  it("rechaza una clave que no decodifica a 32 bytes", () => {
    process.env.ENCRYPTION_MASTER_KEY = randomBytes(16).toString("base64");
    expect(() => encrypt("x", CTX)).toThrow(/32 bytes/);
  });

  it("rechaza una clave con caracteres fuera de base64", () => {
    process.env.ENCRYPTION_MASTER_KEY = `${newKey().slice(0, -4)}!!!=`;
    expect(() => encrypt("x", CTX)).toThrow(/ENCRYPTION_MASTER_KEY inválida/);
  });

  it("acepta una clave en base64url, que Node siempre decodificó", () => {
    process.env.ENCRYPTION_MASTER_KEY = randomBytes(32).toString("base64url");
    const stored = encrypt("x", CTX);
    expect(decrypt(stored, CTX)).toBe("x");
  });

  it("rechaza una clave anterior inválida en vez de ignorarla", () => {
    const stored = encrypt("x", CTX);
    process.env.ENCRYPTION_MASTER_KEY_PREVIOUS = "corta";
    expect(() => decrypt(stored, CTX)).toThrow(/ENCRYPTION_MASTER_KEY_PREVIOUS inválida/);
  });
});

describe("readStoredSecret", () => {
  it("descifra lo que cifró encrypt()", () => {
    const stored = encrypt("sk_live_123", CTX);
    expect(readStoredSecret(stored, CTX)).toBe("sk_live_123");
  });

  it("devuelve tal cual un valor legacy en texto plano, incluso con puntos", () => {
    expect(looksEncrypted("sk_live_123")).toBe(false);
    expect(readStoredSecret("sk_live_123", CTX)).toBe("sk_live_123");
    expect(readStoredSecret("eyJhbGciOi.eyJzdWIiOiIx.c2lnbmF0dXJl", CTX)).toBe(
      "eyJhbGciOi.eyJzdWIiOiIx.c2lnbmF0dXJl"
    );
  });

  it("tira si el ciphertext no descifra, en vez de mandarlo como API key", () => {
    const stored = encrypt("sk_live_123", CTX);
    process.env.ENCRYPTION_MASTER_KEY = newKey();
    expect(() => readStoredSecret(stored, CTX)).toThrow();
  });
});

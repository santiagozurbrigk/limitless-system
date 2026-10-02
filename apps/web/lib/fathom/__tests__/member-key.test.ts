/**
 * SCRUM-86 (2026-10-02): el error al cifrar la key de Fathom dice el motivo real.
 * Antes decía "falta ENCRYPTION_MASTER_KEY" también cuando la clave estaba
 * cargada pero era inválida, y eso despistó en producción.
 */
import { randomBytes } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptMemberFathomKey, readMemberFathomKey } from "../member-key";

const ORIGINAL = process.env.ENCRYPTION_MASTER_KEY;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = ORIGINAL;
});

describe("encryptMemberFathomKey", () => {
  it("cifra y se lee sólo con la misma org y el mismo miembro", () => {
    process.env.ENCRYPTION_MASTER_KEY = randomBytes(32).toString("base64");
    const stored = encryptMemberFathomKey("fathom_abc", "org-a", "user-1");
    expect(readMemberFathomKey(stored, "org-a", "user-1")).toBe("fathom_abc");
    expect(() => readMemberFathomKey(stored, "org-a", "user-2")).toThrow();
  });

  it("dice que falta la clave cuando no está cargada", () => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    expect(() => encryptMemberFathomKey("fathom_abc", "org-a", "user-1")).toThrow(
      /falta la clave de cifrado/
    );
  });

  it("dice que la clave es inválida cuando está cargada mal", () => {
    process.env.ENCRYPTION_MASTER_KEY = "una-contraseña-cualquiera";
    expect(() => encryptMemberFathomKey("fathom_abc", "org-a", "user-1")).toThrow(
      /clave de cifrado del servidor es inválida/
    );
  });
});

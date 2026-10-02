import { describe, expect, it } from "vitest";
import {
  signFathomWebhook,
  verifyFathomWebhookSignature,
} from "@/lib/fathom/webhook-signature";

// Secreto de ejemplo de la doc de Fathom (`whsec_` + base64).
const SECRET = "whsec_5WbX5kEWLlfzsGNjH64I8lOOqUB6e8FH";
const BODY = JSON.stringify({ recording_id: 123, title: "Llamada" });
const NOW = 1_790_000_000;

function headers(over: Partial<{ id: string; timestamp: string; signature: string }> = {}) {
  const id = over.id ?? "msg_1";
  const timestamp = over.timestamp ?? String(NOW);
  return {
    id,
    timestamp,
    signature: over.signature ?? `v1,${signFathomWebhook(SECRET, id, timestamp, BODY)}`,
  };
}

describe("verifyFathomWebhookSignature (esquema de la doc de Fathom)", () => {
  it("acepta la firma v1 de `${id}.${timestamp}.${body}`", () => {
    expect(verifyFathomWebhookSignature(SECRET, headers(), BODY, NOW)).toBe(true);
  });

  it("acepta si una de varias firmas separadas por espacio coincide", () => {
    const buena = signFathomWebhook(SECRET, "msg_1", String(NOW), BODY);
    const h = headers({ signature: `v1,otra v1,${buena}` });
    expect(verifyFathomWebhookSignature(SECRET, h, BODY, NOW)).toBe(true);
  });

  it("rechaza un cuerpo alterado", () => {
    expect(verifyFathomWebhookSignature(SECRET, headers(), BODY + " ", NOW)).toBe(false);
  });

  it("rechaza otro secreto", () => {
    expect(
      verifyFathomWebhookSignature("whsec_b3Rybw==", headers(), BODY, NOW)
    ).toBe(false);
  });

  it("rechaza un timestamp de más de 5 minutos (reenvío)", () => {
    expect(verifyFathomWebhookSignature(SECRET, headers(), BODY, NOW + 301)).toBe(false);
  });

  it("rechaza si falta algún header", () => {
    expect(
      verifyFathomWebhookSignature(SECRET, { ...headers(), id: null }, BODY, NOW)
    ).toBe(false);
    expect(
      verifyFathomWebhookSignature(SECRET, { ...headers(), signature: null }, BODY, NOW)
    ).toBe(false);
  });

  it("rechaza el HMAC hex del cuerpo que asumía la ruta vieja", () => {
    const h = headers({ signature: "a".repeat(64) });
    expect(verifyFathomWebhookSignature(SECRET, h, BODY, NOW)).toBe(false);
  });
});

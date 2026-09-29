import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { NO_WEBHOOK_SIGNING_KEY } from "@/lib/calendly/oauth-token";
import {
  findOrganizationForSignature,
  parseCalendlySignature,
  TOLERANCIA_FIRMA_SEGUNDOS,
  verifyCalendlySignature,
} from "@/lib/calendly/webhook-signature";

const AHORA_MS = 1_790_000_000_000;
const AHORA_S = AHORA_MS / 1000;
const CUERPO = '{"event":"invitee.created","payload":{"uri":"x","name":"Ana","email":"a@b.c"}}';
const CLAVE_REAL = "6f1c2d3e4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d";

function firmar(clave: string, t: number, cuerpo = CUERPO): string {
  const v1 = crypto.createHmac("sha256", clave).update(`${t}.${cuerpo}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

describe("verifyCalendlySignature", () => {
  it("acepta una firma real dentro de la ventana", () => {
    expect(verifyCalendlySignature(CUERPO, firmar(CLAVE_REAL, AHORA_S), CLAVE_REAL, AHORA_MS)).toBe(true);
  });

  it("⭐ la clave fija de 'sin webhook' nunca vale, aunque la firma cierre", () => {
    const firma = firmar(NO_WEBHOOK_SIGNING_KEY, AHORA_S);
    expect(verifyCalendlySignature(CUERPO, firma, NO_WEBHOOK_SIGNING_KEY, AHORA_MS)).toBe(false);
  });

  it("clave vacía o nula no vale", () => {
    expect(verifyCalendlySignature(CUERPO, firmar("", AHORA_S), "", AHORA_MS)).toBe(false);
    expect(verifyCalendlySignature(CUERPO, firmar("x", AHORA_S), null, AHORA_MS)).toBe(false);
  });

  it("⭐ rechaza un evento fuera de la ventana de tiempo (reenvío)", () => {
    const viejo = AHORA_S - TOLERANCIA_FIRMA_SEGUNDOS - 1;
    const futuro = AHORA_S + TOLERANCIA_FIRMA_SEGUNDOS + 1;
    expect(verifyCalendlySignature(CUERPO, firmar(CLAVE_REAL, viejo), CLAVE_REAL, AHORA_MS)).toBe(false);
    expect(verifyCalendlySignature(CUERPO, firmar(CLAVE_REAL, futuro), CLAVE_REAL, AHORA_MS)).toBe(false);
  });

  it("acepta en el borde de la ventana", () => {
    const borde = AHORA_S - TOLERANCIA_FIRMA_SEGUNDOS;
    expect(verifyCalendlySignature(CUERPO, firmar(CLAVE_REAL, borde), CLAVE_REAL, AHORA_MS)).toBe(true);
  });

  it("rechaza si cambia el cuerpo o la clave", () => {
    const firma = firmar(CLAVE_REAL, AHORA_S);
    expect(verifyCalendlySignature(CUERPO + " ", firma, CLAVE_REAL, AHORA_MS)).toBe(false);
    expect(verifyCalendlySignature(CUERPO, firma, "otra-clave", AHORA_MS)).toBe(false);
  });

  it("rechaza cabeceras mal formadas o con t no numérico", () => {
    expect(verifyCalendlySignature(CUERPO, "basura", CLAVE_REAL, AHORA_MS)).toBe(false);
    expect(verifyCalendlySignature(CUERPO, "t=abc,v1=00", CLAVE_REAL, AHORA_MS)).toBe(false);
  });
});

describe("parseCalendlySignature", () => {
  it("lee t y v1 sin importar el orden ni los espacios", () => {
    expect(parseCalendlySignature("v1=ABC, t=123")).toEqual({ timestamp: "123", v1: "abc" });
  });

  it("devuelve null si falta alguno", () => {
    expect(parseCalendlySignature("t=123")).toBeNull();
  });
});

describe("findOrganizationForSignature", () => {
  const integraciones = [
    { organization_id: "org-sin-webhook", webhook_signing_key: NO_WEBHOOK_SIGNING_KEY },
    { organization_id: "org-real", webhook_signing_key: CLAVE_REAL },
  ];

  it("⭐ un evento firmado con la clave fija no cae en ninguna organización", () => {
    const firma = firmar(NO_WEBHOOK_SIGNING_KEY, AHORA_S);
    expect(findOrganizationForSignature(integraciones, CUERPO, firma, AHORA_MS)).toBeNull();
  });

  it("un evento firmado con la clave real cae en su organización", () => {
    const firma = firmar(CLAVE_REAL, AHORA_S);
    expect(findOrganizationForSignature(integraciones, CUERPO, firma, AHORA_MS)).toBe("org-real");
  });
});

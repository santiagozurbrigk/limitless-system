/**
 * SCRUM-7 / 69 / 211: si Anthropic rechaza la clave de la org o la cuenta no
 * tiene créditos, se marca en la org y se tira un error claro. No se reintenta
 * con ninguna otra clave.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  marcarRechazada: vi.fn(async () => {}),
  marcarSinCreditos: vi.fn(async () => {}),
  resolution: { client: null as unknown, source: "api_key" as "api_key" | "none", mode: "api_key_active" },
}));

vi.mock("@/lib/ai/credential-resolver", () => ({
  resolveCredentialForOrg: async () => mocks.resolution,
  invalidateOrgCredentialCache: () => {},
  marcarClaveDeOrgComoRechazada: mocks.marcarRechazada,
  marcarClaveDeOrgSinCreditos: mocks.marcarSinCreditos,
  getClientForOrg: async () => null,
}));
vi.mock("@/lib/track-token-usage", () => ({ trackTokenUsage: async () => {} }));

import { callClaudeText } from "../anthropic";
import { AI_KEY_REJECTED_MESSAGE } from "../anthropic-auth-errors";

function apiError(status: number, type: string, message: string) {
  return Object.assign(new Error(`${status} ${JSON.stringify({ type: "error", error: { type, message } })}`), {
    status,
    error: { type: "error", error: { type, message } },
  });
}

const req = {
  organizationId: "org-1",
  feature: "test",
  messages: [{ role: "user" as const, content: "hola" }],
};

beforeEach(() => {
  mocks.create.mockReset();
  mocks.marcarRechazada.mockClear();
  mocks.marcarSinCreditos.mockClear();
  mocks.resolution = {
    client: { messages: { create: mocks.create } },
    source: "api_key",
    mode: "api_key_active",
  };
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("llamadas de IA con la clave de la org", () => {
  it("sin clave usable no llama a nadie y devuelve null", async () => {
    mocks.resolution = { client: null, source: "none", mode: "unconfigured" };
    expect(await callClaudeText(req)).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("clave rechazada: la marca como rota y tira un error claro, sin reintentar", async () => {
    mocks.create.mockRejectedValue(apiError(401, "authentication_error", "invalid x-api-key"));
    await expect(callClaudeText(req)).rejects.toThrow(AI_KEY_REJECTED_MESSAGE);
    expect(mocks.marcarRechazada).toHaveBeenCalledWith("org-1");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("sin créditos: lo marca y tira el mensaje de créditos", async () => {
    mocks.create.mockRejectedValue(
      apiError(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API.")
    );
    await expect(callClaudeText(req)).rejects.toThrow(/créditos/);
    expect(mocks.marcarSinCreditos).toHaveBeenCalledWith("org-1");
    expect(mocks.marcarRechazada).not.toHaveBeenCalled();
  });
});

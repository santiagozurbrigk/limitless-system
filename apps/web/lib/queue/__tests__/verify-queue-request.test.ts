import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyQueueRequest } from "@/lib/queue/verify-queue-request";

const SECRETO = "secreto-de-prueba-1234";
const URL_WORKER = "https://app.test/api/queue/publish-reel-variation";

describe("verifyQueueRequest con WORKER_AUTH_SECRET", () => {
  beforeEach(() => {
    vi.stubEnv("WORKER_AUTH_SECRET", SECRETO);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("acepta el secreto en el header X-Worker-Secret", async () => {
    const req = new Request(URL_WORKER, { method: "POST", headers: { "x-worker-secret": SECRETO } });
    expect(await verifyQueueRequest(req, "{}")).toEqual({ ok: true });
  });

  it("acepta Authorization: Bearer", async () => {
    const req = new Request(URL_WORKER, { method: "POST", headers: { authorization: `Bearer ${SECRETO}` } });
    expect(await verifyQueueRequest(req, "{}")).toEqual({ ok: true });
  });

  it("ya no acepta el secreto en la URL (SCRUM-51)", async () => {
    const req = new Request(`${URL_WORKER}?workerSecret=${SECRETO}`, { method: "POST" });
    expect(await verifyQueueRequest(req, "{}")).toMatchObject({ ok: false, status: 401 });
  });

  it("un secreto inválido da 401 sin loguear ningún fragmento del secreto", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const req = new Request(URL_WORKER, { method: "POST", headers: { "x-worker-secret": "otro" } });
    expect(await verifyQueueRequest(req, "{}")).toMatchObject({ ok: false, status: 401 });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRETO.slice(0, 4));
  });
});

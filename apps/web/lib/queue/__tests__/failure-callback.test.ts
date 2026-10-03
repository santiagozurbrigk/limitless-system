import { describe, expect, it } from "vitest";
import { leerFallaDeQStash } from "@/lib/queue/failure-callback";

const b64 = (valor: unknown) => Buffer.from(JSON.stringify(valor)).toString("base64");

describe("leerFallaDeQStash (cuerpo de la doc de QStash)", () => {
  it("lee el worker, los reintentos y la org del job", () => {
    const falla = leerFallaDeQStash({
      status: 500,
      retried: 2,
      maxRetries: 2,
      dlqId: "1725323658779-0",
      sourceMessageId: "msg_1",
      url: "https://app.test/api/queue/process-cron-sync-metrics",
      sourceBody: b64({ organizationId: "org-1" }),
    });
    expect(falla).toEqual({
      worker: "/api/queue/process-cron-sync-metrics",
      status: 500,
      retried: 2,
      maxRetries: 2,
      sourceMessageId: "msg_1",
      dlqId: "1725323658779-0",
      organizationId: "org-1",
      jobId: null,
    });
  });

  it("no deja pasar el secreto de la URL ni el resto del cuerpo del job", () => {
    const falla = leerFallaDeQStash({
      url: "https://app.test/api/queue/process-reel-variations?workerSecret=SECRETO",
      sourceBody: b64({ jobId: "job-9", organizationId: "org-2", driveAccessToken: "ya29.TOKEN" }),
    });
    expect(falla?.worker).toBe("/api/queue/process-reel-variations");
    expect(falla?.jobId).toBe("job-9");
    expect(JSON.stringify(falla)).not.toContain("SECRETO");
    expect(JSON.stringify(falla)).not.toContain("ya29.TOKEN");
  });

  it("tolera un cuerpo incompleto y rechaza lo que no es un objeto", () => {
    expect(leerFallaDeQStash({})).toMatchObject({ worker: "desconocido", organizationId: null });
    expect(leerFallaDeQStash({ sourceBody: "no-es-base64-json" })?.organizationId).toBeNull();
    expect(leerFallaDeQStash(null)).toBeNull();
    expect(leerFallaDeQStash([1])).toBeNull();
  });
});

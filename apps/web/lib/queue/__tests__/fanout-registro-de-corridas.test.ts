import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-85 · los 6 crons que publican un job por org quedan con sus orgs en el
 * registro de corridas: la org con su job publicado queda encolada (no
 * terminada: el worker reporta a Sentry); la que no se pudo publicar, fallida.
 */

const sim = vi.hoisted(() => ({ rechazadas: new Set<string>() }));

vi.mock("@upstash/qstash", () => ({
  Client: class {
    async publishJSON({ body }: { body: { organizationId: string } }) {
      if (sim.rechazadas.has(body.organizationId)) throw new Error("QStash 500");
      return { messageId: `m-${body.organizationId}` };
    }
  },
}));

import { nuevasAnotaciones, correrEnCorrida } from "@/lib/observability/corrida-en-curso";
import { publishCronFanout } from "../qstash-client";

beforeEach(() => {
  sim.rechazadas = new Set();
  vi.stubEnv("QSTASH_TOKEN", "token-de-prueba");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("publishCronFanout dentro de la corrida de un cron", () => {
  it("⭐ anota cada org: publicada = encolada, no publicada = fallida", async () => {
    sim.rechazadas.add("org-b");
    const anotaciones = nuevasAnotaciones();
    const resultado = await correrEnCorrida(anotaciones, () =>
      publishCronFanout("https://app.test/api/queue/x", ["org-a", "org-b", "org-c"])
    );
    expect(resultado).toEqual({ published: 2, failed: 1 });
    expect([...anotaciones.procesadas].sort()).toEqual(["org-a", "org-b", "org-c"]);
    expect([...anotaciones.fallidas]).toEqual(["org-b"]);
    expect([...anotaciones.encoladas].sort()).toEqual(["org-a", "org-c"]);
    expect(anotaciones.fanOut).toBe(true);
  });

  it("fuera de un cron publica igual y no anota nada", async () => {
    await expect(publishCronFanout("https://app.test/api/queue/x", ["org-a"])).resolves.toEqual({
      published: 1,
      failed: 0,
    });
  });
});

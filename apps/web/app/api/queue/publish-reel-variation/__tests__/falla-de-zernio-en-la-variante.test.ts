import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-502 (AR pasada 2, MENOR-1): desde la AR pasada 1, `createPost` lanza
 * `ZernioHttpError` con el status y sin el cuerpo de la respuesta (puede
 * repetir el caption). La ruta que publica una variante de Trial Reels guarda
 * el error en `variation.error` y la tarjeta lo muestra tal cual: tiene que
 * ser un texto en voseo según el status, no "Zernio createPost: HTTP 400" ni
 * el cuerpo de Zernio. Se usa la ruta y el cliente de Zernio reales, con la
 * base falsa y un `fetch` falso; ningún pedido sale a la red.
 */

const sim = vi.hoisted(() => ({
  respuestaDelPost: { status: 200, body: "{}" },
  pedidos: [] as string[],
}));

vi.mock("@/lib/queue/verify-queue-request", () => ({
  verifyQueueRequest: async () => ({ ok: true }),
}));
vi.mock("@/lib/supabase/admin", async () => {
  const { base } = await import("@/app/marketing/content/__tests__/supabase-falso");
  return { createAdminClient: () => base.cliente() };
});
vi.mock("@/lib/email", () => ({ sendTrialReelsDoneEmail: async () => ({ ok: true }) }));
vi.mock("@/lib/queue/qstash-client", () => ({ getPublicAppUrl: () => "https://app.test" }));
vi.mock("@/lib/zernio/integration", async () => {
  const { createZernioClient } = await import("@/lib/zernio/client");
  return {
    getZernioClientForOrganization: async () => createZernioClient("clave-falsa"),
    getZernioIntegrationForOrg: async () => ({
      zernio_profile_id: "perfil-1",
      connected_accounts: [{ platform: "instagram", accountId: "cuenta-ig" }],
    }),
  };
});

import { POST } from "../route";
import { base, ORG } from "@/app/marketing/content/__tests__/supabase-falso";

const JOB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CAPTION = "mi caption privado";

function pedido() {
  return new Request("http://localhost/api/queue/publish-reel-variation", {
    method: "POST",
    body: JSON.stringify({ jobId: JOB, variationIndex: 0, organizationId: ORG }),
  });
}

function variacionGuardada() {
  const fila = base.tablas.reel_variation_jobs.find((f) => f.id === JOB)!;
  return (fila.variations as Array<Record<string, unknown>>)[0];
}

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  base.reiniciar();
  base.tablas.reel_variation_jobs = [
    {
      id: JOB,
      organization_id: ORG,
      status: "publishing",
      variations: [
        {
          type: "speed_up",
          status: "scheduled",
          included: true,
          description: CAPTION,
          hashtags: [],
          storage_path: `${ORG}/reels/v0.mp4`,
        },
      ],
    },
  ];
  sim.respuestaDelPost = { status: 200, body: JSON.stringify({ post: { id: "post-1" } }) };
  sim.pedidos = [];
  vi.stubGlobal("fetch", async (url: unknown) => {
    const u = String(url);
    sim.pedidos.push(u);
    if (u.endsWith("/media/presign")) {
      return new Response(JSON.stringify({ uploadUrl: "https://subida.test/x", fileUrl: "https://zernio.test/v.mp4" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (u.startsWith("https://storage/ver/")) return new Response("video", { status: 200 });
    if (u === "https://subida.test/x") return new Response("", { status: 200 });
    if (u.endsWith("/posts")) {
      return new Response(sim.respuestaDelPost.body, {
        status: sim.respuestaDelPost.status,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`pedido a la red no esperado: ${u}`);
  });
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/queue/publish-reel-variation: el error que ve el usuario en la variante", () => {
  it("con éxito la variante queda publicada, sin error", async () => {
    const r = await POST(pedido());
    expect(r.status).toBe(200);
    expect(variacionGuardada()).toMatchObject({ status: "published", zernio_post_id: "post-1", error: null });
    expect(sim.pedidos.filter((u) => u.endsWith("/posts"))).toHaveLength(1);
  });

  it.each([
    [400, "Zernio rechazó el contenido del post. Revisá el caption o el video y probá de nuevo."],
    [422, "Zernio rechazó el contenido del post. Revisá el caption o el video y probá de nuevo."],
    [401, "Zernio rechazó la conexión de tu organización. Volvé a conectarlo desde Integraciones."],
    [403, "Zernio rechazó la conexión de tu organización. Volvé a conectarlo desde Integraciones."],
    [429, "Zernio está limitando los pedidos. Probá de nuevo más tarde."],
    [500, "Zernio falló al crear el post. Probá de nuevo."],
    [404, "Zernio falló al crear el post. Probá de nuevo."],
  ])("⭐ createPost responde %s: la variante guarda el motivo en voseo, sin el cuerpo de Zernio", async (status, motivo) => {
    sim.respuestaDelPost = { status, body: JSON.stringify({ error: `bad content: ${CAPTION}` }) };
    await POST(pedido());
    const guardada = variacionGuardada();
    expect(guardada).toMatchObject({ status: "failed", error: motivo });
    expect(JSON.stringify(guardada.error)).not.toContain("HTTP");
    expect(JSON.stringify(base.tablas.reel_variation_jobs)).not.toContain(`bad content: ${CAPTION}`);
    expect(JSON.stringify(consola.mock.calls)).not.toContain("bad content");
  });

  it("otro error (no de Zernio) se guarda como antes", async () => {
    base.storage.error = { message: "Object not found" };
    await POST(pedido());
    expect(variacionGuardada()).toMatchObject({
      status: "failed",
      error: "No se pudo generar URL firmada para el video en Storage",
    });
  });
});

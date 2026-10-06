import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-501: un objeto plano relanzado (el error de supabase-js con
 * `throw error`) llegaba a Sentry como "[object Object]". Ahora va su
 * `message` como error y su `code` como tag, sin `details` ni `hint`.
 */

const sim = vi.hoisted(() => ({
  capturas: [] as unknown[],
  tags: {} as Record<string, string>,
}));
vi.mock("@sentry/nextjs", () => ({
  withScope: (fn: (scope: unknown) => void) =>
    fn({
      setTags: (t: Record<string, string>) => Object.assign(sim.tags, t),
      setTag: (k: string, v: string) => (sim.tags[k] = v),
      setExtras: () => {},
    }),
  captureException: (e: unknown) => sim.capturas.push(e),
}));

import { errorParaReportar, reportarFalla } from "../reportar-falla";

beforeEach(() => {
  sim.capturas = [];
  sim.tags = {};
});

describe("errorParaReportar", () => {
  it("un Error va tal cual, con su code si lo tiene", () => {
    const e = Object.assign(new Error("x"), { code: "42501" });
    expect(errorParaReportar(e)).toEqual({ error: e, codigo: "42501" });
  });

  it("⭐ un objeto plano de supabase-js va con su message y su code, sin details ni hint", () => {
    const { error, codigo } = errorParaReportar({
      message: "duplicate key value violates unique constraint",
      code: "23505",
      details: "Key (email)=(ana@ejemplo.com) already exists.",
      hint: null,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ObjetoDeError");
    expect(error.message).toBe("duplicate key value violates unique constraint");
    expect(codigo).toBe("23505");
    expect(JSON.stringify({ ...error, message: error.message })).not.toContain("ana@ejemplo.com");
  });

  it("un texto suelto va como mensaje; cualquier otra cosa, sin datos", () => {
    expect(errorParaReportar("boom").error.message).toBe("boom");
    expect(errorParaReportar(42).error.message).toBe("Error sin mensaje");
    expect(errorParaReportar({ algo: 1 }).error.message).toBe("Error sin mensaje");
  });
});

describe("reportarFalla", () => {
  it("⭐ manda el objeto plano como un Error legible con el tag error_code", () => {
    reportarFalla({ message: "TypeError: fetch failed", code: "" }, { cron: "/api/cron/x" });
    reportarFalla({ message: "permission denied", code: "42501" }, { cron: "/api/cron/y" });
    expect(sim.capturas.map((e) => (e as Error).message)).toEqual([
      "TypeError: fetch failed",
      "permission denied",
    ]);
    expect(sim.tags).toMatchObject({ proceso_de_fondo: "true", cron: "/api/cron/y", error_code: "42501" });
  });
});

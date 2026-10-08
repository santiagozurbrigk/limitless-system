import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-504: la sync de Calendly por closer distingue un rechazo de Calendly
 * (conexión vencida o revocada, límite de consultas) de una falla, para que la
 * sync manual lo devuelva con un motivo claro. La del cron no cambia: no lanza
 * y anota el mismo `reason` que antes.
 */

const sim = vi.hoisted(() => ({
  errorAlBorrar: null as { message: string } | null,
  errorAlGuardar: null as { message: string } | null,
  errorAlLeer: null as { message: string } | null,
  fila: null as unknown,
}));

vi.mock("@/lib/observability/reportar-falla", () => ({ reportarFalla: vi.fn() }));
vi.mock("@/lib/conversations/repair-links", () => ({
  repairClosingConversationLinks: async () => undefined,
}));
vi.mock("@/lib/utm/attribute-booking", () => ({ attributeBookingToUTM: async () => undefined }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    let op = "select";
    const builder = {
      select: () => builder,
      update: () => {
        op = "update";
        return builder;
      },
      delete: () => {
        op = "delete";
        return builder;
      },
      eq: () => builder,
      maybeSingle: async () => ({ data: sim.fila, error: sim.errorAlLeer }),
      then: (resolver: (r: unknown) => void) =>
        resolver({ data: null, error: op === "update" ? sim.errorAlGuardar : sim.errorAlBorrar }),
    };
    return { from: () => builder };
  },
}));

import {
  disconnectCloserCalendly,
  getCloserCalendlyIntegration,
  RechazoDeCalendly,
  sincronizarEventosDelCloser,
  syncCloserCalendlyEvents,
} from "../closer-sync";
import { FallaDeLaBase } from "@/lib/server/action-result";

const EN_UN_ANIO = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
const AYER = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function fila(tokenExpiresAt = EN_UN_ANIO) {
  return {
    user_id: "closer-1",
    organization_id: "org-1",
    last_sync_at: null,
    config: {
      access_token: "token",
      refresh_token: "refresh",
      token_expires_at: tokenExpiresAt,
      calendly_user_uri: "https://api.calendly.com/users/c1",
    },
  };
}

function responder(status: number, json: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => json }))
  );
}

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.errorAlBorrar = null;
  sim.errorAlGuardar = null;
  sim.errorAlLeer = null;
  sim.fila = null;
  process.env.CALENDLY_CLIENT_ID = "cliente";
  process.env.CALENDLY_CLIENT_SECRET = "secreto";
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consola.mockRestore();
  vi.unstubAllGlobals();
});

describe("sincronizarEventosDelCloser", () => {
  it("un refresh rechazado con 400 invalid_grant es una conexión vencida", async () => {
    responder(400, { error: "invalid_grant", error_description: "The provided authorization grant is invalid" });
    const error = await sincronizarEventosDelCloser(fila(AYER)).catch((e) => e);
    expect(error).toBeInstanceOf(RechazoDeCalendly);
    expect(error.motivo).toBe("conexion_vencida");
  });

  it("un refresh rechazado por la configuración de la app (401 invalid_client) es una falla", async () => {
    responder(401, { error: "invalid_client" });
    const error = await sincronizarEventosDelCloser(fila(AYER)).catch((e) => e);
    expect(error).not.toBeInstanceOf(RechazoDeCalendly);
    expect(error.message).toBe("No se pudo renovar el token del closer");
  });

  it.each([
    [401, "conexion_vencida"],
    [429, "limite_de_consultas"],
  ])("la API de eventos con %i es un rechazo (%s)", async (status, motivo) => {
    responder(status, { message: "rechazo de Calendly" });
    const error = await sincronizarEventosDelCloser(fila()).catch((e) => e);
    expect(error).toBeInstanceOf(RechazoDeCalendly);
    expect(error.motivo).toBe(motivo);
    expect(error.message).toBe("rechazo de Calendly");
  });

  it("⭐ la API de eventos con 403 es una falla, no \"conexión vencida\" (AR, MENOR-3)", async () => {
    responder(403, { title: "Permission Denied", message: "You do not have permission" });
    const error = await sincronizarEventosDelCloser(fila()).catch((e) => e);
    expect(error).not.toBeInstanceOf(RechazoDeCalendly);
    expect(error.status).toBe(403);
  });

  it("⭐ si no se puede guardar el token renovado es una falla de la base, no \"conexión vencida\"", async () => {
    responder(200, { access_token: "nuevo", refresh_token: "rotado", expires_in: 7200 });
    sim.errorAlGuardar = { message: "TypeError: fetch failed" };
    const error = await sincronizarEventosDelCloser(fila(AYER)).catch((e) => e);
    expect(error).toBeInstanceOf(FallaDeLaBase);
  });

  it("la API de eventos con 500 es una falla, con el status", async () => {
    responder(500, { title: "Internal Server Error" });
    const error = await sincronizarEventosDelCloser(fila()).catch((e) => e);
    expect(error).not.toBeInstanceOf(RechazoDeCalendly);
    // Un `Error` común: `runMutation` (la sync de la org) lo sigue tratando igual.
    expect(error.constructor).toBe(Error);
    expect(error.status).toBe(500);
  });
});

describe("syncCloserCalendlyEvents (cron)", () => {
  it("no lanza y anota el mismo reason que antes ante un rechazo de Calendly", async () => {
    responder(401, { title: "Unauthenticated", message: "The access token is invalid" });
    await expect(syncCloserCalendlyEvents(fila())).resolves.toEqual({
      profileId: "closer-1",
      organizationId: "org-1",
      inserted: 0,
      updated: 0,
      skippedManualStatus: 0,
      fetched: 0,
      skipped: true,
      reason: "The access token is invalid",
    });
  });

  it("no lanza ante un refresh vencido: el reason es el de siempre", async () => {
    responder(400, { error: "invalid_grant" });
    const r = await syncCloserCalendlyEvents(fila(AYER));
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("No se pudo renovar el token del closer");
  });
});

describe("disconnectCloserCalendly", () => {
  it("si el borrado falla lanza una FallaDeLaBase (la integración sigue conectada)", async () => {
    sim.errorAlBorrar = { message: "TypeError: fetch failed" };
    await expect(disconnectCloserCalendly("org-1", "closer-1")).rejects.toBeInstanceOf(FallaDeLaBase);
  });

  it("si el borrado sale bien no lanza", async () => {
    await expect(disconnectCloserCalendly("org-1", "closer-1")).resolves.toBeUndefined();
  });
});

describe("getCloserCalendlyIntegration (AR, MENOR-4)", () => {
  it("⭐ si la base falla lanza FallaDeLaBase, no \"No conectado\"", async () => {
    sim.errorAlLeer = { message: "TypeError: fetch failed" };
    await expect(getCloserCalendlyIntegration("org-1", "closer-1")).rejects.toBeInstanceOf(FallaDeLaBase);
  });

  it("sin fila, no conectado", async () => {
    await expect(getCloserCalendlyIntegration("org-1", "closer-1")).resolves.toEqual({ connected: false });
  });

  it("con token, conectado", async () => {
    sim.fila = { config: { access_token: "t", calendly_user_uri: "u" }, last_sync_at: null };
    await expect(getCloserCalendlyIntegration("org-1", "closer-1")).resolves.toEqual({
      connected: true,
      calendlyUserUri: "u",
      lastSyncAt: undefined,
    });
  });
});

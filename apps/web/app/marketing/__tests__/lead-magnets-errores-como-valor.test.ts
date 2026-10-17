import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-520: las cinco acciones de `app/marketing/lead-magnets-actions.ts`
 * devuelven sus errores esperables como valor. Antes las lecturas devolvían
 * `[]` o métricas en cero ante una falla, la creación y la edición lanzaban el
 * texto crudo de la base (en producción, el digest de Next) y el archivado no
 * miraba el resultado.
 */

const sim = vi.hoisted(() => ({ configurado: true }));

vi.mock("@/lib/observability/reportar-falla", async () => {
  const { base } = await import("./base-falsa");
  return {
    reportarFalla: (error: unknown, contexto: unknown) => base.reportes.push({ error, contexto }),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => sim.configurado }));
vi.mock("@/lib/supabase/server", async () => {
  const { base } = await import("./base-falsa");
  return { createClient: async () => base.cliente() };
});
vi.mock("@/lib/supabase/admin", async () => {
  const { base } = await import("./base-falsa");
  return { createAdminClient: () => base.cliente() };
});
vi.mock("@/lib/auth/bootstrap", async () => {
  const { base, ORG } = await import("./base-falsa");
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (base.lanzaEnSesion) throw base.lanzaEnSesion;
      if (!base.sesion) throw new ErrorEsperable("Sesión no válida");
      return ORG;
    },
  };
});

import {
  createLeadMagnetAction,
  deleteLeadMagnetAction,
  getLeadMagnetLeadsAction,
  getLeadMagnetsAction,
  updateLeadMagnetAction,
  type CreateLeadMagnetInput,
} from "../lead-magnets-actions";
import { base, ORG, OTRA_ORG, TEXTO_FIJO } from "./base-falsa";

const LM = "77777777-7777-4777-8777-777777777777";
const LM_AJENO = "88888888-8888-4888-8888-888888888888";
const CLIENTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FETCH_FAILED = { message: "TypeError: fetch failed" };
const NO_ENCONTRADO = "No encontramos ese lead magnet.";

function leadMagnet(id: string, org: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    organization_id: org,
    name: org === ORG ? "Guía propia" : "Guía ajena",
    type: "documento",
    channel: "instagram_dm",
    status: "active",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...extra,
  };
}

let consola: ReturnType<typeof vi.spyOn>;
let aviso: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  base.reiniciar();
  sim.configurado = true;
  base.tablas.lead_magnets = [
    leadMagnet(LM_AJENO, OTRA_ORG),
    leadMagnet(LM, ORG),
    leadMagnet("lm-archivado", ORG, { status: "archived" }),
  ];
  base.tablas.lead_magnet_leads = [
    { id: "lead-ajeno", organization_id: OTRA_ORG, lead_magnet_id: LM, attributed_client_id: CLIENTE },
    { id: "lead-1", organization_id: ORG, lead_magnet_id: LM, attributed_client_id: CLIENTE },
    { id: "lead-2", organization_id: ORG, lead_magnet_id: LM, attributed_client_id: null },
  ];
  base.tablas.clients = [{ id: CLIENTE, organization_id: ORG, total_amount: 1500 }];
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  consola.mockRestore();
  aviso.mockRestore();
});

function esperarFallaRegistrada(etiqueta: string) {
  expect(base.reportes).toHaveLength(1);
  expect(base.reportes[0].contexto).toEqual({ accion: etiqueta });
  expect(consola).toHaveBeenCalledWith(etiqueta, expect.anything());
}

function esperarRechazoSinRegistro() {
  expect(base.reportes).toEqual([]);
  expect(consola).not.toHaveBeenCalled();
}

function casosDeFalla(etiqueta: string, tabla: string, correr: () => Promise<unknown>) {
  it(`⭐ una falla de la base (${tabla}) vuelve con el texto fijo y se registra`, async () => {
    base.errores[tabla] = FETCH_FAILED;
    await expect(correr()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada(etiqueta);
  });

  it("si la consulta lanza (red, bug), texto fijo y se registra", async () => {
    base.lanza = new TypeError("fetch failed");
    await expect(correr()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada(etiqueta);
  });

  it("sin sesión devuelve el motivo, sin registrar", async () => {
    base.sesion = false;
    await expect(correr()).resolves.toEqual({ success: false, error: "Sesión no válida" });
    esperarRechazoSinRegistro();
  });
}

describe("getLeadMagnetsAction", () => {
  it("devuelve los lead magnets de la organización con sus métricas", async () => {
    const r = await getLeadMagnetsAction();
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.map((lm) => lm.id)).toEqual([LM]);
    expect(r.data[0]).toMatchObject({ totalLeads: 2, totalAttributedClients: 1, totalRevenue: 1500 });
    expect(base.filtrosDe("lead_magnets", "select")).toEqual([
      ["organization_id", ORG],
      ["neq:status", "archived"],
    ]);
    expect(base.filtrosDe("lead_magnet_leads", "select")).toEqual([["organization_id", ORG]]);
  });

  it("⭐ el revenue sólo suma clientes de la organización (un cliente de otra, aunque esté atribuido, no cuenta)", async () => {
    // Un `attributed_client_id` de otra org escrito a mano en un lead propio
    // (la RLS de lead_magnet_leads lo permite); la RLS de la cartera del
    // holding podría dejar leer ese cliente.
    const AJENO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    base.tablas.clients.push({ id: AJENO, organization_id: OTRA_ORG, total_amount: 9000 });
    base.tablas.lead_magnet_leads.push({
      id: "lead-3",
      organization_id: ORG,
      lead_magnet_id: LM,
      attributed_client_id: AJENO,
    });
    const r = await getLeadMagnetsAction();
    expect(r.success && r.data[0].totalRevenue).toBe(1500);
    expect(base.filtrosDe("clients", "select")).toEqual([
      ["organization_id", ORG],
      ["in:id", [CLIENTE, AJENO]],
    ]);
  });

  it("sin Supabase configurado, la lista vacía sin tocar la base (como antes)", async () => {
    sim.configurado = false;
    await expect(getLeadMagnetsAction()).resolves.toEqual({ success: true, data: [] });
    expect(base.operaciones).toEqual([]);
  });

  casosDeFalla("[getLeadMagnets]", "lead_magnets", getLeadMagnetsAction);

  it("⭐ si fallan los leads, texto fijo (antes, métricas en cero)", async () => {
    base.errores.lead_magnet_leads = FETCH_FAILED;
    await expect(getLeadMagnetsAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada("[getLeadMagnets]");
  });

  it("⭐ si fallan los clientes atribuidos, texto fijo (antes, revenue en cero)", async () => {
    base.errores.clients = FETCH_FAILED;
    await expect(getLeadMagnetsAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada("[getLeadMagnets]");
  });
});

describe("createLeadMagnetAction", () => {
  const input: CreateLeadMagnetInput = { name: "Checklist", type: "documento", channel: "manual" };

  it("crea el lead magnet en la organización de la sesión", async () => {
    const r = await createLeadMagnetAction(input);
    expect(r.success).toBe(true);
    const [insert] = base.escrituras();
    expect(insert.valores).toMatchObject({ organization_id: ORG, name: "Checklist", channel: "manual" });
    expect(r.success && r.data.id).toBe((base.tablas.lead_magnets.at(-1) as { id: string }).id);
  });

  it.each([
    ["sin nombre", { ...input, name: "   " }, "Ingresá un nombre para el lead magnet."],
    ["un tipo fuera de la lista", { ...input, type: "pdf" }, "Tipo de lead magnet inválido."],
    ["un canal fuera de la lista", { ...input, channel: "tiktok" }, "Canal de lead magnet inválido."],
  ])("⭐ %s vuelve con el motivo sin llegar a la base", async (_caso, datos, motivo) => {
    await expect(createLeadMagnetAction(datos as CreateLeadMagnetInput)).resolves.toEqual({
      success: false,
      error: motivo,
    });
    expect(base.operaciones).toEqual([]);
    esperarRechazoSinRegistro();
  });

  casosDeFalla("[createLeadMagnet]", "lead_magnets", () => createLeadMagnetAction(input));
});

describe("updateLeadMagnetAction", () => {
  it("pausa el lead magnet de la organización", async () => {
    await expect(updateLeadMagnetAction(LM, { status: "paused" })).resolves.toEqual({
      success: true,
      data: undefined,
    });
    expect(base.tablas.lead_magnets[1].status).toBe("paused");
    expect(base.filtrosDe("lead_magnets", "update")).toEqual([
      ["id", LM],
      ["organization_id", ORG],
    ]);
  });

  it("⭐ un lead magnet de otra organización no se toca y vuelve el motivo (antes, éxito)", async () => {
    await expect(updateLeadMagnetAction(LM_AJENO, { status: "paused" })).resolves.toEqual({
      success: false,
      error: NO_ENCONTRADO,
    });
    expect(base.tablas.lead_magnets[0].status).toBe("active");
    esperarRechazoSinRegistro();
  });

  it("⭐ con una fila gemela de otra organización, sólo cambia la propia", async () => {
    base.tablas.lead_magnets.push(leadMagnet(LM, OTRA_ORG));
    await updateLeadMagnetAction(LM, { status: "paused" });
    expect(base.tablas.lead_magnets[3].status).toBe("active");
  });

  it.each([
    ["un id que no es UUID", "no-es-uuid", { status: "paused" }, "ID inválido"],
    ["un estado fuera de la lista", LM, { status: "borrado" }, "Estado de lead magnet inválido."],
    ["un nombre vacío", LM, { name: "" }, "Ingresá un nombre para el lead magnet."],
    ["un tipo fuera de la lista", LM, { type: "pdf" }, "Tipo de lead magnet inválido."],
    ["un canal fuera de la lista", LM, { channel: "tiktok" }, "Canal de lead magnet inválido."],
  ])("⭐ %s vuelve con el motivo sin llegar a la base", async (_caso, id, datos, motivo) => {
    await expect(updateLeadMagnetAction(id, datos as never)).resolves.toEqual({
      success: false,
      error: motivo,
    });
    expect(base.operaciones).toEqual([]);
    esperarRechazoSinRegistro();
  });

  casosDeFalla("[updateLeadMagnet]", "lead_magnets", () => updateLeadMagnetAction(LM, { status: "paused" }));
});

describe("deleteLeadMagnetAction", () => {
  it("archiva el lead magnet de la organización", async () => {
    await expect(deleteLeadMagnetAction(LM)).resolves.toEqual({ success: true, data: undefined });
    expect(base.tablas.lead_magnets[1].status).toBe("archived");
    expect(base.filtrosDe("lead_magnets", "update")).toEqual([
      ["id", LM],
      ["organization_id", ORG],
    ]);
  });

  it("⭐ un lead magnet de otra organización no se archiva y vuelve el motivo (antes, éxito)", async () => {
    await expect(deleteLeadMagnetAction(LM_AJENO)).resolves.toEqual({
      success: false,
      error: NO_ENCONTRADO,
    });
    expect(base.tablas.lead_magnets[0].status).toBe("active");
    esperarRechazoSinRegistro();
  });

  it("⭐ con una fila gemela de otra organización, sólo archiva la propia", async () => {
    base.tablas.lead_magnets.push(leadMagnet(LM, OTRA_ORG));
    await deleteLeadMagnetAction(LM);
    expect(base.tablas.lead_magnets[3].status).toBe("active");
  });

  it("un id que no es UUID vuelve con «ID inválido» sin llegar a la base", async () => {
    await expect(deleteLeadMagnetAction("no-es-uuid")).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
    expect(base.operaciones).toEqual([]);
  });

  casosDeFalla("[deleteLeadMagnet]", "lead_magnets", () => deleteLeadMagnetAction(LM));
});

describe("getLeadMagnetLeadsAction", () => {
  it("devuelve los leads del lead magnet en la organización", async () => {
    const r = await getLeadMagnetLeadsAction(LM);
    expect(r.success && r.data.map((l) => l.id)).toEqual(["lead-1", "lead-2"]);
    expect(base.filtrosDe("lead_magnet_leads", "select")).toEqual([
      ["organization_id", ORG],
      ["lead_magnet_id", LM],
    ]);
  });

  it("un id que no es UUID vuelve con «ID inválido» sin llegar a la base", async () => {
    await expect(getLeadMagnetLeadsAction("no-es-uuid")).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
    expect(base.operaciones).toEqual([]);
  });

  it("sin Supabase configurado, la lista vacía (como antes)", async () => {
    sim.configurado = false;
    await expect(getLeadMagnetLeadsAction(LM)).resolves.toEqual({ success: true, data: [] });
  });

  casosDeFalla("[getLeadMagnetLeads]", "lead_magnet_leads", () => getLeadMagnetLeadsAction(LM));
});

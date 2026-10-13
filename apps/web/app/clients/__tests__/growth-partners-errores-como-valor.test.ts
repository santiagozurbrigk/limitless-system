import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRedirectError } from "next/dist/client/components/redirect";
import { RedirectType } from "next/dist/client/components/redirect-error";
import { DynamicServerError } from "next/dist/client/components/hooks-server-context";

/**
 * SCRUM-516: los clientes de un cliente, su onboarding y la facturación de su
 * negocio (todo detrás del add-on `growth_partners`) devuelven sus errores
 * esperables como valor. Antes, con `runMutation`, el texto crudo de la base
 * llegaba a la ficha; el add-on no habilitado era un `Error` común; y las
 * lecturas devolvían vacío ante una falla («Todavía no cargaste clientes»,
 * «sin link» con el botón de generar otro, «Sin datos todavía»).
 */

vi.mock("@/lib/observability/reportar-falla", async () => {
  const { base } = await import("./supabase-falso");
  return {
    reportarFalla: (error: unknown, contexto: unknown) => base.reportes.push({ error, contexto }),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", async () => {
  const { base } = await import("./supabase-falso");
  return { createClient: async () => base.cliente() };
});
vi.mock("@/lib/supabase/admin", async () => {
  const { base } = await import("./supabase-falso");
  return { createAdminClient: () => base.cliente() };
});
vi.mock("@/lib/auth/bootstrap", async () => {
  const { base, ORG, esTablaFaltante } = await import("./supabase-falso");
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (base.lanzaEnSesion) throw base.lanzaEnSesion;
      if (!base.sesion) throw new ErrorEsperable("Sesión no válida");
      return ORG;
    },
    getCurrentProfile: async () => base.perfil,
    isMissingTableError: esTablaFaltante,
  };
});
vi.mock("@/lib/auth/add-ons", async () => {
  const { base, ORG } = await import("./supabase-falso");
  const { expect: esperar } = await import("vitest");
  return {
    orgHasAddOn: async (organizationId: string, addOn: string) => {
      esperar(organizationId).toBe(ORG);
      esperar(addOn).toBe("growth_partners");
      return base.addOn;
    },
  };
});
vi.mock("@/lib/fechas/organizacion", () => ({
  fechaDeHoyDeLaOrganizacion: async () => "2026-10-12",
}));
vi.mock("server-only", () => ({}));

import {
  createSubClientAction,
  deleteSubClientAction,
  listSubClientsAction,
  moveLegacySectionValuesAction,
  updateSubClientAction,
  updateSubClientFieldsAction,
} from "../sub-client-actions";
import {
  assignOnboardingSubmissionAction,
  createGeneralOnboardingLinkAction,
  createOnboardingLinkAction,
  discardOnboardingSubmissionAction,
  getGeneralOnboardingAction,
  getOnboardingStatusAction,
  revokeOnboardingLinkAction,
} from "../onboarding-link-actions";
import {
  deleteClientRevenueAction,
  getRevenueByClientAction,
  listClientRevenueAction,
  saveClientRevenueAction,
} from "../revenue-actions";
import { base, CACHE_CAIDA, ORG, OTRA_ORG, TEXTO_FIJO } from "./supabase-falso";

const CLIENTE = "22222222-2222-4222-8222-222222222222";
const CLIENTE_AJENO = "33333333-3333-4333-8333-333333333333";
const SUB = "44444444-4444-4444-8444-444444444444";
const SUB_AJENO = "55555555-5555-4555-8555-555555555555";
const LINK = "66666666-6666-4666-8666-666666666666";
const ENVIO = "77777777-7777-4777-8777-777777777777";
const ENVIO_AJENO = "88888888-8888-4888-8888-888888888888";
const MES = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FETCH_FAILED = { message: "TypeError: fetch failed" };
const SIN_ADD_ON = "Esta función no está habilitada para tu organización.";

/** Una columna configurable del cliente con sección, como la guarda la base. */
function columna(id: string, org: string, key: string, label: string) {
  return {
    id,
    organization_id: org,
    entity: "client",
    key,
    label,
    description: null,
    field_type: "number",
    options: [],
    options_source: "inline",
    unit: null,
    currency: null,
    alert_days_before: null,
    is_required: false,
    section: "marketing",
    show_in_table: false,
    sort_order: 1,
    archived_at: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
}

function sembrar() {
  base.tablas.field_definitions = [
    columna("f1", ORG, "seguidores", "Seguidores"),
    columna("f-ajena", OTRA_ORG, "ajena", "Ajena"),
  ];
  base.tablas.clients = [
    { id: CLIENTE, organization_id: ORG, name: "Growth SA", custom: { seguidores: 1200 } },
    { id: CLIENTE_AJENO, organization_id: OTRA_ORG, name: "Ajeno", custom: {} },
  ];
  base.tablas.client_sub_clients = [
    { id: SUB, organization_id: ORG, client_id: CLIENTE, name: "Creadora", instagram_url: null, custom: {}, created_at: "2026-10-01" },
    { id: SUB_AJENO, organization_id: OTRA_ORG, client_id: CLIENTE_AJENO, name: "Ajena", instagram_url: null, custom: {}, created_at: "2026-10-01" },
  ];
  base.tablas.client_onboarding_links = [
    { id: LINK, organization_id: ORG, kind: "creator", sub_client_id: SUB, token: "t", created_at: "2026-10-01", revoked_at: null },
  ];
  base.tablas.client_onboarding_submissions = [
    { id: ENVIO, organization_id: ORG, client_id: null, sub_client_id: null, discarded_at: null, respondent_name: "Ana", creator_name: "Nueva", answers: { seguidores: 500 }, replaced: {}, labels: {}, created_at: "2026-10-02", assigned_at: null },
    { id: ENVIO_AJENO, organization_id: OTRA_ORG, client_id: null, sub_client_id: null, discarded_at: null, respondent_name: "X", creator_name: "Y", answers: {}, replaced: {}, labels: {}, created_at: "2026-10-02", assigned_at: null },
  ];
  base.tablas.client_revenue_entries = [
    { id: MES, organization_id: ORG, client_id: CLIENTE, amount: "1000", currency: "USD", period: "2026-09-01", note: null, created_at: "2026-10-01" },
    { id: "mes-ajeno", organization_id: OTRA_ORG, client_id: CLIENTE_AJENO, amount: "9", currency: "USD", period: "2026-09-01", note: null, created_at: "2026-10-01" },
  ];
}

let consola: ReturnType<typeof vi.spyOn>;
let aviso: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  base.reiniciar();
  sembrar();
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  consola.mockRestore();
  aviso.mockRestore();
});

// ─── Sub-clientes ───────────────────────────────────────────────────────────

describe("listSubClientsAction", () => {
  it("devuelve los de la organización y el cliente pedidos", async () => {
    const r = await listSubClientsAction(CLIENTE);
    expect(r.success && r.data.map((s) => s.id)).toEqual([SUB]);
    expect(base.operaciones[0].filtros).toEqual([
      ["organization_id", ORG],
      ["client_id", CLIENTE],
    ]);
  });

  it("sin el add-on, vacío (la tarjeta no se dibuja)", async () => {
    base.addOn = false;
    await expect(listSubClientsAction(CLIENTE)).resolves.toEqual({ success: true, data: [] });
  });

  it("⭐ una falla ya no es «Todavía no cargaste clientes»: texto fijo y se reporta", async () => {
    base.errores.client_sub_clients = FETCH_FAILED;
    await expect(listSubClientsAction(CLIENTE)).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.reportes).toHaveLength(1);
  });
});

describe("createSubClientAction", () => {
  it("crea el sub-cliente en la organización de la sesión", async () => {
    const r = await createSubClientAction({ clientId: CLIENTE, name: "Otra", instagramUrl: "@otra" });
    expect(r).toMatchObject({ success: true, data: { name: "Otra", clientId: CLIENTE } });
    expect(base.escrituras()[0].valores).toMatchObject({ organization_id: ORG, client_id: CLIENTE });
  });

  it("⭐ sin el add-on vuelve con el motivo de requireAddOn, sin escribir ni reportar", async () => {
    base.addOn = false;
    await expect(createSubClientAction({ clientId: CLIENTE, name: "Otra" })).resolves.toEqual({
      success: false,
      error: SIN_ADD_ON,
    });
    expect(base.escrituras()).toEqual([]);
    expect(base.reportes).toEqual([]);
  });

  it("⭐ colgarlo de un cliente de otra organización vuelve con el motivo", async () => {
    await expect(createSubClientAction({ clientId: CLIENTE_AJENO, name: "Otra" })).resolves.toEqual({
      success: false,
      error: "No se encontró ese cliente en tu organización.",
    });
    expect(base.escrituras()).toEqual([]);
  });

  it("un link que no se puede abrir vuelve con el motivo", async () => {
    await expect(
      createSubClientAction({ clientId: CLIENTE, name: "Otra", instagramUrl: "https://nodominio" })
    ).resolves.toEqual({ success: false, error: "Ese link no se puede abrir. Revisalo." });
  });

  it("⭐ si no se puede verificar el cliente no escribe: texto fijo (antes decía «no se encontró»)", async () => {
    base.errores["clients:select"] = FETCH_FAILED;
    await expect(createSubClientAction({ clientId: CLIENTE, name: "Otra" })).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(base.escrituras()).toEqual([]);
  });

  it("un nombre vacío vuelve con el mensaje de validación", async () => {
    await expect(createSubClientAction({ clientId: CLIENTE, name: " " })).resolves.toEqual({
      success: false,
      error: "Poné el nombre del cliente.",
    });
  });
});

describe("updateSubClientAction", () => {
  it("actualiza filtrando por id y organización", async () => {
    const r = await updateSubClientAction({ id: SUB, name: "Renombrada" });
    expect(r).toMatchObject({ success: true, data: { name: "Renombrada" } });
    expect(base.escrituras()[0].filtros).toEqual([
      ["id", SUB],
      ["organization_id", ORG],
    ]);
  });

  it("⭐ uno de otra organización vuelve como inexistente, sin tocarlo", async () => {
    await expect(updateSubClientAction({ id: SUB_AJENO, name: "Robada" })).resolves.toEqual({
      success: false,
      error: "Ese cliente ya no existe.",
    });
    expect(base.tablas.client_sub_clients.find((s) => s.id === SUB_AJENO)?.name).toBe("Ajena");
  });
});

describe("updateSubClientFieldsAction", () => {
  it("guarda los valores validados", async () => {
    const r = await updateSubClientFieldsAction({ id: SUB, values: { seguidores: "2000" } });
    expect(r).toEqual({ success: true, data: { seguidores: 2000 } });
  });

  it("⭐ un valor inválido vuelve con el motivo del campo, sin escribir", async () => {
    await expect(
      updateSubClientFieldsAction({ id: SUB, values: { seguidores: "muchos" } })
    ).resolves.toEqual({ success: false, error: '"Seguidores" tiene que ser un número.' });
    expect(base.escrituras()).toEqual([]);
  });

  it("un id inválido vuelve con el motivo en castellano (antes, el \"Invalid input\" de zod)", async () => {
    await expect(updateSubClientFieldsAction({ id: "no-es-un-id", values: {} })).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
    await expect(
      assignOnboardingSubmissionAction({ submissionId: "no-es-un-id", clientId: CLIENTE })
    ).resolves.toEqual({ success: false, error: "ID inválido" });
  });

  it("⭐ uno de otra organización vuelve como inexistente", async () => {
    await expect(updateSubClientFieldsAction({ id: SUB_AJENO, values: {} })).resolves.toEqual({
      success: false,
      error: "Ese cliente ya no existe.",
    });
  });
});

describe("columnas de los sub-clientes con la lectura de columnas caída (MAYOR-1 de la AR de SCRUM-516)", () => {
  // Antes se leían con `listFieldDefinitionsAction`, que ante una falla
  // devuelve `[]`: guardar decía "guardados" y descartaba lo editado, y pasar
  // los datos viejos respondía que no había nada para pasar.
  const CAIDA = { message: "TypeError: fetch failed" };

  it("con la lectura sana, lee las columnas del cliente de la org", async () => {
    await updateSubClientFieldsAction({ id: SUB, values: { seguidores: "2000" } });
    const lectura = base.operaciones.find((o) => o.tabla === "field_definitions");
    expect(lectura?.filtros).toEqual([
      ["organization_id", ORG],
      ["entity", "client"],
    ]);
  });

  it("⭐ guardar los campos: texto fijo, el sub-cliente queda como estaba y la falla registrada", async () => {
    base.tablas.client_sub_clients.find((s) => s.id === SUB)!.custom = { seguidores: 900 };
    base.errores.field_definitions = CAIDA;
    const r = await updateSubClientFieldsAction({ id: SUB, values: { seguidores: "2000" } });
    expect(r).toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.tablas.client_sub_clients.find((s) => s.id === SUB)?.custom).toEqual({ seguidores: 900 });
    expect(base.escrituras()).toEqual([]);
    expect(consola).toHaveBeenCalledWith(
      "[updateSubClientFields]",
      expect.objectContaining({ name: "FallaDeLaBase" })
    );
    expect(base.reportes).toEqual([
      {
        error: expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" }),
        contexto: { accion: "[updateSubClientFields]" },
      },
    ]);
    expect(JSON.stringify(base.reportes)).not.toContain("2000");
  });

  it("⭐ pasar los datos viejos: texto fijo, nada se mueve y la falla registrada", async () => {
    base.errores.field_definitions = CAIDA;
    const r = await moveLegacySectionValuesAction({ clientId: CLIENTE, subClientId: SUB });
    expect(r).toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.escrituras()).toEqual([]);
    expect(base.tablas.clients.find((c) => c.id === CLIENTE)?.custom).toEqual({ seguidores: 1200 });
    expect(base.reportes).toEqual([
      { error: expect.objectContaining({ name: "FallaDeLaBase" }), contexto: { accion: "[moveLegacySectionValues]" } },
    ]);
  });
});

describe("deleteSubClientAction", () => {
  it("borra filtrando por id y organización", async () => {
    await expect(deleteSubClientAction(SUB)).resolves.toEqual({ success: true, data: undefined });
    expect(base.tablas.client_sub_clients.map((s) => s.id)).toEqual([SUB_AJENO]);
  });

  it("⭐ uno de otra organización no se borra", async () => {
    await deleteSubClientAction(SUB_AJENO);
    expect(base.tablas.client_sub_clients.map((s) => s.id)).toContain(SUB_AJENO);
  });

  it("sin el add-on devuelve el motivo", async () => {
    base.addOn = false;
    await expect(deleteSubClientAction(SUB)).resolves.toEqual({ success: false, error: SIN_ADD_ON });
  });
});

describe("moveLegacySectionValuesAction", () => {
  it("pasa los datos del growth partner al sub-cliente", async () => {
    await expect(
      moveLegacySectionValuesAction({ clientId: CLIENTE, subClientId: SUB })
    ).resolves.toEqual({ success: true, data: { moved: 1, kept: 0 } });
  });

  it("⭐ un sub-cliente de otra organización vuelve con el motivo, sin escribir", async () => {
    await expect(
      moveLegacySectionValuesAction({ clientId: CLIENTE, subClientId: SUB_AJENO })
    ).resolves.toEqual({ success: false, error: "Ese cliente ya no existe." });
    expect(base.escrituras()).toEqual([]);
  });

  it("⭐ un cliente de otra organización vuelve con el motivo", async () => {
    await expect(
      moveLegacySectionValuesAction({ clientId: CLIENTE_AJENO, subClientId: SUB_AJENO })
    ).resolves.toEqual({ success: false, error: "No se encontró ese cliente en tu organización." });
  });
});

// ─── Onboarding ─────────────────────────────────────────────────────────────

describe("getOnboardingStatusAction", () => {
  it("devuelve el link activo y los envíos", async () => {
    const r = await getOnboardingStatusAction(SUB);
    expect(r).toMatchObject({ success: true, data: { link: { id: LINK }, submissions: [] } });
  });

  it("un id inválido o sin add-on: vacío, como antes", async () => {
    await expect(getOnboardingStatusAction("x")).resolves.toEqual({
      success: true,
      data: { link: null, submissions: [] },
    });
    base.addOn = false;
    await expect(getOnboardingStatusAction(SUB)).resolves.toEqual({
      success: true,
      data: { link: null, submissions: [] },
    });
  });

  it("sin la tabla, vacío (la migración no corrió)", async () => {
    base.errores.client_onboarding_links = { code: "42P01", message: 'relation "client_onboarding_links" does not exist' };
    await expect(getOnboardingStatusAction(SUB)).resolves.toEqual({
      success: true,
      data: { link: null, submissions: [] },
    });
  });

  it("⭐ una falla ya no es «sin link»: texto fijo y se reporta", async () => {
    base.errores.client_onboarding_submissions = FETCH_FAILED;
    await expect(getOnboardingStatusAction(SUB)).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.reportes).toHaveLength(1);
  });
});

describe("createOnboardingLinkAction", () => {
  it("si ya hay un link activo devuelve ese, sin crear otro", async () => {
    const r = await createOnboardingLinkAction(SUB);
    expect(r).toMatchObject({ success: true, data: { id: LINK } });
    expect(base.escrituras()).toEqual([]);
  });

  it("crea el link en la organización de la sesión", async () => {
    base.tablas.client_onboarding_links = [];
    const r = await createOnboardingLinkAction(SUB);
    expect(r.success).toBe(true);
    expect(base.escrituras()[0].valores).toMatchObject({ organization_id: ORG, sub_client_id: SUB });
  });

  it("⭐ si no se puede saber si hay uno activo, no crea otro", async () => {
    base.errores["client_onboarding_links:select"] = FETCH_FAILED;
    await expect(createOnboardingLinkAction(SUB)).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.escrituras()).toEqual([]);
  });

  it.each([
    ["x", "Cliente inválido."],
    [SUB_AJENO, "Ese cliente ya no existe."],
  ])("⭐ %s vuelve con su motivo", async (id, motivo) => {
    await expect(createOnboardingLinkAction(id)).resolves.toEqual({ success: false, error: motivo });
    expect(base.reportes).toEqual([]);
  });

  it("sin la tabla, el motivo de la migración", async () => {
    base.tablas.client_onboarding_links = [];
    base.errores["client_onboarding_links:insert"] = { code: "PGRST205", message: "Could not find the table 'public.client_onboarding_links' in the schema cache" };
    await expect(createOnboardingLinkAction(SUB)).resolves.toEqual({
      success: false,
      error: "Falta aplicar la migración del onboarding en la base.",
    });
  });
});

describe("revokeOnboardingLinkAction", () => {
  it("apaga el link filtrando por organización", async () => {
    await expect(revokeOnboardingLinkAction(LINK)).resolves.toEqual({ success: true, data: undefined });
    expect(base.escrituras()[0].filtros).toContainEqual(["organization_id", ORG]);
  });

  it("un id inválido vuelve con el motivo", async () => {
    await expect(revokeOnboardingLinkAction("x")).resolves.toEqual({ success: false, error: "Link inválido." });
  });
});

describe("getGeneralOnboardingAction", () => {
  it("devuelve la bandeja de la organización", async () => {
    const r = await getGeneralOnboardingAction();
    expect(r.success && r.data.pending.map((e) => e.id)).toEqual([ENVIO]);
  });

  it("⭐ una falla ya no es «sin envíos»: texto fijo y se reporta", async () => {
    base.errores.client_onboarding_submissions = FETCH_FAILED;
    await expect(getGeneralOnboardingAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.reportes).toHaveLength(1);
  });
});

describe("createGeneralOnboardingLinkAction", () => {
  it("crea el link general en la organización de la sesión", async () => {
    const r = await createGeneralOnboardingLinkAction();
    expect(r.success).toBe(true);
    expect(base.escrituras()[0].valores).toMatchObject({ organization_id: ORG, kind: "general" });
  });

  it("sin el add-on devuelve el motivo", async () => {
    base.addOn = false;
    await expect(createGeneralOnboardingLinkAction()).resolves.toEqual({ success: false, error: SIN_ADD_ON });
  });
});

describe("createGeneralOnboardingLinkAction: lectura del activo", () => {
  it("⭐ si no se puede saber si hay un link general activo, no crea otro: texto fijo y se reporta", async () => {
    base.errores["client_onboarding_links:select"] = FETCH_FAILED;
    await expect(createGeneralOnboardingLinkAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.escrituras()).toEqual([]);
    expect(base.reportes).toHaveLength(1);
  });
});

describe("discardOnboardingSubmissionAction", () => {
  it("descarta el envío", async () => {
    await expect(discardOnboardingSubmissionAction(ENVIO)).resolves.toEqual({ success: true, data: undefined });
    expect(base.tablas.client_onboarding_submissions[0].discarded_at).not.toBeNull();
  });

  it("⭐ uno de otra organización vuelve como inexistente, sin tocarlo", async () => {
    await expect(discardOnboardingSubmissionAction(ENVIO_AJENO)).resolves.toEqual({
      success: false,
      error: "Ese envío ya no existe.",
    });
    expect(base.escrituras()).toEqual([]);
  });

  it("uno ya descartado vuelve con el motivo", async () => {
    base.tablas.client_onboarding_submissions[0].discarded_at = "2026-10-03";
    await expect(discardOnboardingSubmissionAction(ENVIO)).resolves.toEqual({
      success: false,
      error: "Ese envío se descartó.",
    });
  });
});

describe("assignOnboardingSubmissionAction", () => {
  it("asigna el envío a un creador nuevo de un cliente existente", async () => {
    const r = await assignOnboardingSubmissionAction({ submissionId: ENVIO, clientId: CLIENTE });
    expect(r).toMatchObject({ success: true, data: { clientId: CLIENTE } });
  });

  it("⭐ un cliente de otra organización vuelve con el motivo, sin escribir", async () => {
    await expect(
      assignOnboardingSubmissionAction({ submissionId: ENVIO, clientId: CLIENTE_AJENO })
    ).resolves.toEqual({ success: false, error: "No se encontró ese cliente en tu organización." });
    expect(base.escrituras()).toEqual([]);
  });

  it("⭐ un creador que no es del cliente vuelve con el motivo", async () => {
    await expect(
      assignOnboardingSubmissionAction({ submissionId: ENVIO, clientId: CLIENTE, subClientId: SUB_AJENO })
    ).resolves.toEqual({ success: false, error: "Ese creador no es de Growth SA." });
  });

  it("⭐ si no se puede leer el cliente elegido: texto fijo y se reporta (no \"No se encontró ese cliente\")", async () => {
    base.errores["clients:select"] = FETCH_FAILED;
    await expect(
      assignOnboardingSubmissionAction({ submissionId: ENVIO, clientId: CLIENTE })
    ).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.escrituras()).toEqual([]);
    expect(base.reportes).toHaveLength(1);
  });

  it("con un cliente nuevo crea el cliente y el creador", async () => {
    const r = await assignOnboardingSubmissionAction({ submissionId: ENVIO, newClientName: "Nuevo SA" });
    expect(r.success).toBe(true);
    expect(base.tablas.clients.map((c) => c.name)).toContain("Nuevo SA");
    expect(base.tablas.client_sub_clients.map((c) => c.name)).toContain("Nueva");
  });

  it("⭐ sin nombre de creador no crea el cliente nuevo: motivo y nada guardado", async () => {
    base.tablas.client_onboarding_submissions[0].creator_name = null;
    base.tablas.client_onboarding_submissions[0].respondent_name = null;
    await expect(
      assignOnboardingSubmissionAction({ submissionId: ENVIO, newClientName: "Nuevo SA" })
    ).resolves.toEqual({ success: false, error: "Poné el nombre del creador." });
    expect(base.escrituras()).toEqual([]);
  });

  it.each([
    ["el alta del creador", "client_sub_clients:insert"],
    ["la asignación del envío", "client_onboarding_submissions:update"],
  ])(
    "⭐ si falla %s, se borra lo creado en esta llamada: un reintento no duplica",
    async (_n, clave) => {
      base.errores[clave] = FETCH_FAILED;
      // La base falsa numera las altas «nuevo-1», «nuevo-2»...: en la otra org
      // hay filas con esos mismos ids. Un borrado con service role sin el filtro
      // por organización se las llevaría.
      base.tablas.clients.push({ id: "nuevo-1", organization_id: OTRA_ORG, name: "Ajeno con el mismo id", custom: {} });
      base.tablas.client_sub_clients.push({ id: "nuevo-2", organization_id: OTRA_ORG, client_id: CLIENTE_AJENO, name: "Ajena con el mismo id", custom: {} });
      const antes = {
        clientes: base.tablas.clients.map((c) => c.id),
        creadores: base.tablas.client_sub_clients.map((c) => c.id),
      };
      await expect(
        assignOnboardingSubmissionAction({ submissionId: ENVIO, newClientName: "Nuevo SA" })
      ).resolves.toEqual({ success: false, error: TEXTO_FIJO });
      expect(base.tablas.clients.map((c) => c.id)).toEqual(antes.clientes);
      expect(base.tablas.client_sub_clients.map((c) => c.id)).toEqual(antes.creadores);
      const borrados = base.escrituras().filter((o) => o.op === "delete");
      const esperados = [{ tabla: "clients", op: "delete", filtros: [["id", "nuevo-1"], ["organization_id", ORG]] }];
      if (clave !== "client_sub_clients:insert") {
        esperados.unshift({ tabla: "client_sub_clients", op: "delete", filtros: [["id", "nuevo-2"], ["organization_id", ORG]] });
      }
      expect(borrados).toEqual(esperados.map((e) => expect.objectContaining(e)));
      expect(base.reportes.map((r) => (r.contexto as { accion: string }).accion)).toEqual([
        "[assignOnboardingSubmission]",
      ]);
    }
  );

  it("si deshacer el alta también falla, queda registrado aparte", async () => {
    base.errores["client_sub_clients:insert"] = FETCH_FAILED;
    base.errores["clients:delete"] = FETCH_FAILED;
    await assignOnboardingSubmissionAction({ submissionId: ENVIO, newClientName: "Nuevo SA" });
    expect(base.reportes.map((r) => (r.contexto as { accion: string }).accion)).toEqual([
      "[assignOnboardingSubmission] deshacer cliente",
      "[assignOnboardingSubmission]",
    ]);
  });

  it("con un cliente existente no se borra nada al fallar", async () => {
    base.errores["client_onboarding_submissions:update"] = FETCH_FAILED;
    await assignOnboardingSubmissionAction({ submissionId: ENVIO, clientId: CLIENTE, subClientId: SUB });
    expect(base.escrituras().filter((o) => o.op === "delete")).toEqual([]);
    expect(base.tablas.clients.map((c) => c.id)).toContain(CLIENTE);
  });

  it("un pedido inválido vuelve con el mensaje de validación", async () => {
    await expect(assignOnboardingSubmissionAction({ submissionId: ENVIO })).resolves.toEqual({
      success: false,
      error: "Elegí un cliente o poné el nombre de uno nuevo.",
    });
  });

  it("⭐ si no se puede escribir la ficha, se deshace la asignación: texto fijo y se reporta", async () => {
    base.errores["client_sub_clients:update"] = FETCH_FAILED;
    const r = await assignOnboardingSubmissionAction({
      submissionId: ENVIO,
      clientId: CLIENTE,
      subClientId: SUB,
    });
    expect(r).toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.tablas.client_onboarding_submissions[0].sub_client_id).toBeNull();
    expect(base.reportes).toHaveLength(1);
  });

  it("⭐ deshacer la asignación (service role) filtra por id y por organización", async () => {
    base.errores["client_sub_clients:update"] = FETCH_FAILED;
    await assignOnboardingSubmissionAction({ submissionId: ENVIO, clientId: CLIENTE, subClientId: SUB });
    const envios = base.escrituras().filter((o) => o.tabla === "client_onboarding_submissions");
    expect(envios.map((o) => o.filtros)).toEqual([
      [["id", ENVIO], ["organization_id", ORG], ["is:sub_client_id", null]],
      [["id", ENVIO], ["organization_id", ORG]],
    ]);
  });
});

// ─── Facturación ────────────────────────────────────────────────────────────

describe("listClientRevenueAction", () => {
  it("devuelve los meses del cliente en la organización de la sesión", async () => {
    const r = await listClientRevenueAction(CLIENTE);
    expect(r.success && r.data.map((e) => e.id)).toEqual([MES]);
    expect(base.operaciones[0].filtros).toEqual([
      ["organization_id", ORG],
      ["client_id", CLIENTE],
    ]);
  });

  it("⭐ una falla ya no es «Sin datos todavía»: texto fijo y se reporta", async () => {
    base.errores.client_revenue_entries = FETCH_FAILED;
    await expect(listClientRevenueAction(CLIENTE)).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.reportes).toHaveLength(1);
  });
});

describe("saveClientRevenueAction", () => {
  const MES_NUEVO = { clientId: CLIENTE, amount: 2000, period: "2026-10" };

  it("guarda el mes en la organización de la sesión", async () => {
    const r = await saveClientRevenueAction(MES_NUEVO);
    expect(r).toMatchObject({ success: true, data: { amount: 2000, period: "2026-10-01" } });
    expect(base.escrituras()[0].valores).toMatchObject({ organization_id: ORG, client_id: CLIENTE });
  });

  it.each([
    [{ ...MES_NUEVO, amount: -1 }, "La facturación no puede ser negativa."],
    [{ ...MES_NUEVO, period: "octubre" }, "Ese mes no se entiende. Elegilo del calendario."],
  ])("⭐ un dato inválido vuelve con su motivo, sin escribir", async (input, motivo) => {
    await expect(saveClientRevenueAction(input)).resolves.toEqual({ success: false, error: motivo });
    expect(base.escrituras()).toEqual([]);
  });

  it("⭐ un cliente de otra organización vuelve con el motivo", async () => {
    await expect(saveClientRevenueAction({ ...MES_NUEVO, clientId: CLIENTE_AJENO })).resolves.toEqual({
      success: false,
      error: "No se encontró ese cliente en tu organización.",
    });
  });

  it("sin el add-on devuelve el motivo", async () => {
    base.addOn = false;
    await expect(saveClientRevenueAction(MES_NUEVO)).resolves.toEqual({ success: false, error: SIN_ADD_ON });
  });
});

describe("deleteClientRevenueAction", () => {
  it("borra filtrando por id y organización", async () => {
    await expect(deleteClientRevenueAction(MES)).resolves.toEqual({ success: true, data: undefined });
    expect(base.tablas.client_revenue_entries.map((e) => e.id)).toEqual(["mes-ajeno"]);
  });

  it("⭐ un mes de otra organización no se borra", async () => {
    await deleteClientRevenueAction("mes-ajeno");
    expect(base.tablas.client_revenue_entries.map((e) => e.id)).toContain("mes-ajeno");
  });
});

describe("getRevenueByClientAction (la compone el tablero de Clientes)", () => {
  it("resume el último mes de cada cliente de la organización", async () => {
    const r = await getRevenueByClientAction();
    expect(Object.keys(r)).toEqual([CLIENTE]);
  });

  it("⭐ una falla sigue sin la columna, pero ahora queda registrada", async () => {
    base.errores.client_revenue_entries = FETCH_FAILED;
    await expect(getRevenueByClientAction()).resolves.toEqual({});
    expect(base.reportes).toEqual([
      {
        error: expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" }),
        contexto: { lectura: "clientes:facturacion-por-cliente" },
      },
    ]);
  });

  it("sin sesión, vacío y sin reporte (no es una falla)", async () => {
    base.sesion = false;
    await expect(getRevenueByClientAction()).resolves.toEqual({});
    expect(base.reportes).toEqual([]);
  });
});

// ─── Add-on (MENOR-1 de la AR de SCRUM-516) ─────────────────────────────────

describe("las 12 escrituras sin el add-on growth_partners (exigirAddOn de SCRUM-517)", () => {
  // Antes cada archivo tenía su copia de `exigirGrowthPartners`; ahora las tres
  // usan `exigirAddOn` (`lib/auth/exigir-add-on.ts`): misma pregunta, mismo
  // texto que `requireAddOn`, como `ErrorEsperable`.
  const escrituras = [
    ["createSubClientAction", () => createSubClientAction({ clientId: CLIENTE, name: "Otra" })],
    ["updateSubClientAction", () => updateSubClientAction({ id: SUB, name: "Otra" })],
    ["updateSubClientFieldsAction", () => updateSubClientFieldsAction({ id: SUB, values: { seguidores: "1" } })],
    ["deleteSubClientAction", () => deleteSubClientAction(SUB)],
    ["moveLegacySectionValuesAction", () => moveLegacySectionValuesAction({ clientId: CLIENTE, subClientId: SUB })],
    ["createOnboardingLinkAction", () => createOnboardingLinkAction(SUB)],
    ["revokeOnboardingLinkAction", () => revokeOnboardingLinkAction(LINK)],
    ["createGeneralOnboardingLinkAction", () => createGeneralOnboardingLinkAction()],
    ["discardOnboardingSubmissionAction", () => discardOnboardingSubmissionAction(ENVIO)],
    ["assignOnboardingSubmissionAction", () => assignOnboardingSubmissionAction({ submissionId: ENVIO, clientId: CLIENTE })],
    ["saveClientRevenueAction", () => saveClientRevenueAction({ clientId: CLIENTE, amount: 1, period: "2026-10" })],
    ["deleteClientRevenueAction", () => deleteClientRevenueAction(MES)],
  ] as const;

  it.each(escrituras)(
    "⭐ %s: el motivo de requireAddOn, sin escribir, sin leer nada más y sin reportar",
    async (_n, correr) => {
      base.addOn = false;
      await expect(correr()).resolves.toEqual({ success: false, error: SIN_ADD_ON });
      expect(base.operaciones).toEqual([]);
      expect(base.reportes).toEqual([]);
      expect(consola).not.toHaveBeenCalled();
    }
  );

  it("el texto es el de lib/auth/exigir-add-on.ts y el de requireAddOn", async () => {
    const { ADD_ON_NO_HABILITADO } = await import("@/lib/auth/exigir-add-on");
    expect(ADD_ON_NO_HABILITADO).toBe(SIN_ADD_ON);
  });
});

// ─── Lo inesperado ──────────────────────────────────────────────────────────

describe("lo inesperado (SCRUM-516)", () => {
  const casos = [
    ["listSubClientsAction", () => listSubClientsAction(CLIENTE), "[listSubClients]", "client_sub_clients"],
    ["createSubClientAction", () => createSubClientAction({ clientId: CLIENTE, name: "x" }), "[createSubClient]", "client_sub_clients"],
    ["updateSubClientAction", () => updateSubClientAction({ id: SUB, name: "x" }), "[updateSubClient]", "client_sub_clients"],
    ["updateSubClientFieldsAction", () => updateSubClientFieldsAction({ id: SUB, values: {} }), "[updateSubClientFields]", "client_sub_clients"],
    ["deleteSubClientAction", () => deleteSubClientAction(SUB), "[deleteSubClient]", "client_sub_clients"],
    ["moveLegacySectionValuesAction", () => moveLegacySectionValuesAction({ clientId: CLIENTE, subClientId: SUB }), "[moveLegacySectionValues]", "client_sub_clients"],
    ["getOnboardingStatusAction", () => getOnboardingStatusAction(SUB), "[getOnboardingStatus]", "client_onboarding_links"],
    ["createOnboardingLinkAction", () => createOnboardingLinkAction(SUB), "[createOnboardingLink]", "client_onboarding_links"],
    ["revokeOnboardingLinkAction", () => revokeOnboardingLinkAction(LINK), "[revokeOnboardingLink]", "client_onboarding_links"],
    ["getGeneralOnboardingAction", () => getGeneralOnboardingAction(), "[getGeneralOnboarding]", "client_onboarding_links"],
    ["createGeneralOnboardingLinkAction", () => createGeneralOnboardingLinkAction(), "[createGeneralOnboardingLink]", "client_onboarding_links"],
    ["discardOnboardingSubmissionAction", () => discardOnboardingSubmissionAction(ENVIO), "[discardOnboardingSubmission]", "client_onboarding_submissions"],
    ["assignOnboardingSubmissionAction", () => assignOnboardingSubmissionAction({ submissionId: ENVIO, clientId: CLIENTE }), "[assignOnboardingSubmission]", "client_onboarding_submissions"],
    ["listClientRevenueAction", () => listClientRevenueAction(CLIENTE), "[listClientRevenue]", "client_revenue_entries"],
    ["saveClientRevenueAction", () => saveClientRevenueAction({ clientId: CLIENTE, amount: 1, period: "2026-10" }), "[saveClientRevenue]", "client_revenue_entries"],
    ["deleteClientRevenueAction", () => deleteClientRevenueAction(MES), "[deleteClientRevenue]", "client_revenue_entries"],
  ] as const;

  it.each(casos)(
    "⭐ %s: una excepción de la red devuelve el texto fijo y se registra y reporta",
    async (_n, correr, etiqueta) => {
      const falla = new TypeError("fetch failed: connect ECONNREFUSED 10.0.0.5:5432");
      base.lanza = falla;
      const r = await correr();
      expect(r).toEqual({ success: false, error: TEXTO_FIJO });
      expect(JSON.stringify(r)).not.toContain("ECONNREFUSED");
      expect(consola).toHaveBeenCalledWith(etiqueta, falla);
      expect(base.reportes).toEqual([{ error: falla, contexto: { accion: etiqueta } }]);
    }
  );

  it.each(casos)(
    "⭐ %s: el error de supabase-js devuelve el texto fijo y se reporta",
    async (_n, correr, etiqueta, tabla) => {
      base.errores[tabla] = FETCH_FAILED;
      const r = await correr();
      expect(r).toEqual({ success: false, error: TEXTO_FIJO });
      expect(base.reportes).toEqual([
        {
          error: expect.objectContaining({ message: "TypeError: fetch failed" }),
          contexto: { accion: etiqueta },
        },
      ]);
    }
  );
});

describe("tabla ausente por código, y un PGRST002 no lo es (SCRUM-516, AR pasada 2)", () => {
  const AUSENTE_PG = (t: string) => ({ code: "42P01", message: `relation "public.${t}" does not exist` });
  const AUSENTE_REST = (t: string) => ({ code: "PGRST205", message: `Could not find the table 'public.${t}' in the schema cache` });

  it("⭐ guardar los campos de un sub-cliente con la lectura de columnas en PGRST002: texto fijo, sin tocar la fila", async () => {
    base.tablas.client_sub_clients.find((s) => s.id === SUB)!.custom = { seguidores: 900 };
    base.errores.field_definitions = CACHE_CAIDA;
    await expect(updateSubClientFieldsAction({ id: SUB, values: { seguidores: "2000" } })).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(base.tablas.client_sub_clients.find((s) => s.id === SUB)?.custom).toEqual({ seguidores: 900 });
    expect(base.escrituras()).toEqual([]);
    expect(base.reportes).toEqual([
      { error: expect.objectContaining({ name: "FallaDeLaBase" }), contexto: { accion: "[updateSubClientFields]" } },
    ]);
  });

  it("⭐ pasar los datos viejos con la lectura de columnas en PGRST002: texto fijo, nada se mueve", async () => {
    base.errores.field_definitions = CACHE_CAIDA;
    await expect(moveLegacySectionValuesAction({ clientId: CLIENTE, subClientId: SUB })).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(base.escrituras()).toEqual([]);
  });

  it.each([
    ["listSubClientsAction", "client_sub_clients", () => listSubClientsAction(CLIENTE), { success: true, data: [] }],
    ["getOnboardingStatusAction", "client_onboarding_links", () => getOnboardingStatusAction(SUB), { success: true, data: { link: null, submissions: [] } }],
    ["listClientRevenueAction", "client_revenue_entries", () => listClientRevenueAction(CLIENTE), { success: true, data: [] }],
    ["getRevenueByClientAction", "client_revenue_entries", () => getRevenueByClientAction(), {}],
  ] as const)("%s: con la tabla ausente (42P01 y PGRST205), vacío sin registrar; con PGRST002, se registra", async (_n, tabla, correr, vacio) => {
    for (const ausente of [AUSENTE_PG(tabla), AUSENTE_REST(tabla)]) {
      base.errores[tabla] = ausente;
      await expect(correr()).resolves.toEqual(vacio);
    }
    expect(base.reportes).toEqual([]);
    base.errores[tabla] = CACHE_CAIDA;
    const r = await correr();
    if ("success" in vacio) expect(r).toEqual({ success: false, error: TEXTO_FIJO });
    else expect(r).toEqual(vacio);
    expect(base.reportes).toHaveLength(1);
  });

  it.each([
    ["createSubClientAction", "client_sub_clients:insert", () => createSubClientAction({ clientId: CLIENTE, name: "Otra" }), "La tabla de clientes todavía no existe en la base. Falta aplicar la migración."],
    ["createOnboardingLinkAction", "client_onboarding_links:insert", () => createOnboardingLinkAction(SUB), "Falta aplicar la migración del onboarding en la base."],
  ] as const)("%s: la tabla ausente da el motivo de la migración; un PGRST002, el texto fijo", async (_n, clave, correr, motivo) => {
    base.tablas.client_onboarding_links = [];
    base.errores[clave] = AUSENTE_PG(clave.split(":")[0]);
    await expect(correr()).resolves.toEqual({ success: false, error: motivo });
    base.errores[clave] = CACHE_CAIDA;
    await expect(correr()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.reportes).toHaveLength(1);
  });
});


// ─── Filtro por organización (MAYOR-2 de la AR pasada 2) ────────────────────

describe("⭐ descartar y asignar con service role no tocan filas de otra org con el mismo id", () => {
  it("descartar: la fila ajena con el mismo id queda sin descartar", async () => {
    base.tablas.client_onboarding_submissions.unshift({
      ...base.tablas.client_onboarding_submissions[0],
      id: ENVIO,
      organization_id: OTRA_ORG,
      respondent_name: "Ajena con el mismo id",
    });
    await expect(discardOnboardingSubmissionAction(ENVIO)).resolves.toEqual({ success: true, data: undefined });
    const [ajena, propia] = base.tablas.client_onboarding_submissions;
    expect(ajena).toMatchObject({ organization_id: OTRA_ORG, discarded_at: null });
    expect(propia).toMatchObject({ organization_id: ORG, discarded_at: expect.any(String) });
    expect(base.filtrosDe("client_onboarding_submissions", "update")).toEqual([
      ["id", ENVIO],
      ["organization_id", ORG],
    ]);
  });

  it("asignar a un creador existente: lee y escribe el de la org, no el ajeno con el mismo id", async () => {
    base.tablas.client_sub_clients.unshift({
      id: SUB,
      organization_id: OTRA_ORG,
      client_id: CLIENTE,
      name: "Ajena con el mismo id",
      instagram_url: null,
      custom: { seguidores: 1 },
      created_at: "2026-10-01",
    });
    const r = await assignOnboardingSubmissionAction({ submissionId: ENVIO, clientId: CLIENTE, subClientId: SUB });
    expect(r).toEqual({ success: true, data: { clientId: CLIENTE, subClientId: SUB } });
    const [ajena, propia] = base.tablas.client_sub_clients;
    expect(ajena.custom).toEqual({ seguidores: 1 });
    expect(propia.custom).toEqual({ seguidores: 500 });
    expect(base.tablas.client_timeline_entries?.[0]?.title).toBe("Onboarding completado: Creadora");
  });
});

describe("⭐ cada consulta lleva el filtro de la organización de la sesión", () => {
  const CASOS: Array<[string, () => Promise<unknown>, string, "select" | "update" | "delete", number]> = [
    ["estado del onboarding: link activo", () => getOnboardingStatusAction(SUB), "client_onboarding_links", "select", 0],
    ["estado del onboarding: envíos", () => getOnboardingStatusAction(SUB), "client_onboarding_submissions", "select", 0],
    ["crear link: el activo", () => createOnboardingLinkAction(SUB), "client_onboarding_links", "select", 0],
    ["bandeja: link general", () => getGeneralOnboardingAction(), "client_onboarding_links", "select", 0],
    ["crear link general: el activo", () => createGeneralOnboardingLinkAction(), "client_onboarding_links", "select", 0],
    ["descartar un envío", () => discardOnboardingSubmissionAction(ENVIO), "client_onboarding_submissions", "update", 0],
    ["asignar: el creador existente", () => assignOnboardingSubmissionAction({ submissionId: ENVIO, clientId: CLIENTE, subClientId: SUB }), "client_sub_clients", "select", 0],
    ["asignar: la ficha del creador", () => assignOnboardingSubmissionAction({ submissionId: ENVIO, clientId: CLIENTE, subClientId: SUB }), "client_sub_clients", "update", 0],
    ["guardar los campos de un sub-cliente", () => updateSubClientFieldsAction({ id: SUB, values: { seguidores: "2000" } }), "client_sub_clients", "update", 0],
    ["pasar datos viejos: el sub-cliente", () => moveLegacySectionValuesAction({ clientId: CLIENTE, subClientId: SUB }), "client_sub_clients", "select", 0],
    ["pasar datos viejos: escribir el sub-cliente", () => moveLegacySectionValuesAction({ clientId: CLIENTE, subClientId: SUB }), "client_sub_clients", "update", 0],
    ["pasar datos viejos: escribir el growth partner", () => moveLegacySectionValuesAction({ clientId: CLIENTE, subClientId: SUB }), "clients", "update", 0],
    ["corregir el mes: borrar el reemplazado", () => saveClientRevenueAction({ clientId: CLIENTE, amount: 2000, period: "2026-10", replacesEntryId: MES }), "client_revenue_entries", "delete", 0],
  ];

  it.each(CASOS)("%s", async (_n, correr, tabla, op, n) => {
    const r = (await correr()) as { success: boolean };
    expect(r.success).toBe(true);
    expect(base.filtrosDe(tabla, op, n)).toContainEqual(["organization_id", ORG]);
  });
});

describe("lecturas con el add-on (MENOR-1 de la AR pasada 2)", () => {
  it.each([
    ["getGeneralOnboardingAction", () => getGeneralOnboardingAction(), { success: true, data: { link: null, pending: [] } }, ["client_onboarding_links", "client_onboarding_submissions"]],
    ["listClientRevenueAction", () => listClientRevenueAction(CLIENTE), { success: true, data: [] }, ["client_revenue_entries"]],
    ["getRevenueByClientAction", () => getRevenueByClientAction(), {}, ["client_revenue_entries"]],
  ] as const)("⭐ %s sin el add-on: vacío, sin leer la tabla", async (_n, correr, vacio, tablas) => {
    base.addOn = false;
    await expect(correr()).resolves.toEqual(vacio);
    expect(base.operaciones.filter((o) => (tablas as readonly string[]).includes(o.tabla))).toEqual([]);
    expect(base.reportes).toEqual([]);
  });
});

describe("getRevenueByClientAction, una lectura que no rechaza: lo interno de Next (MENOR-2 de la AR pasada 2)", () => {
  const erroresDeNext = [
    ["redirect", () => getRedirectError("/login", RedirectType.replace)],
    ["ruta dinámica", () => new DynamicServerError("Route usó `cookies`")],
  ] as const;

  it.each(erroresDeNext)("⭐ el error de Next (%s) se relanza y no se registra", async (_e, crear) => {
    const error = crear();
    base.lanzaEnSesion = error;
    await expect(getRevenueByClientAction()).rejects.toBe(error);
    expect(base.reportes).toEqual([]);
  });
});

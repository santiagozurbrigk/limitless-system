import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/app/clients/custom-field-actions", () => ({
  listFieldDefinitionsAction: async () => [
    {
      id: "f1",
      organizationId: "org",
      entity: "client",
      key: "seguidores",
      label: "Seguidores",
      description: null,
      fieldType: "number",
      options: [],
      optionsSource: "static",
      unit: null,
      currency: null,
      alertDaysBefore: null,
      isRequired: false,
      section: "marketing",
      onboarding: null,
      showInTable: false,
      sortOrder: 1,
      archivedAt: null,
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    },
  ],
}));

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
import { base, ORG, OTRA_ORG, TEXTO_FIJO } from "./supabase-falso";

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

function sembrar() {
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

  it("⭐ uno de otra organización vuelve como inexistente", async () => {
    await expect(updateSubClientFieldsAction({ id: SUB_AJENO, values: {} })).resolves.toEqual({
      success: false,
      error: "Ese cliente ya no existe.",
    });
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
    base.errores.client_onboarding_links = { message: 'relation "client_onboarding_links" does not exist' };
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
    base.errores["client_onboarding_links:insert"] = { message: "Could not find the table in the schema cache" };
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

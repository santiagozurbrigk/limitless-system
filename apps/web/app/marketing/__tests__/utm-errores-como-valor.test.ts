import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-520: las ocho acciones de `app/marketing/utm-actions.ts` devuelven sus
 * errores esperables como valor. Antes la URL del sitio y la lista de UTMs
 * escondían la falla (`null`, `[]`), las demás devolvían el texto crudo de la
 * base con `runMutation`, la creación y la edición armaban el link con la URL
 * por defecto si la lectura de la org fallaba, y el borrado respondía éxito
 * aunque el id fuera de otra organización.
 */

vi.mock("@/lib/observability/reportar-falla", async () => {
  const { base } = await import("./base-falsa");
  return {
    reportarFalla: (error: unknown, contexto: unknown) => base.reportes.push({ error, contexto }),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
  createUTMLinkAction,
  deleteUTMLinkAction,
  getOrganizationWebsiteAction,
  getUTMFunnelAction,
  getUTMLeadsAction,
  getUTMLinksAction,
  getUtmBaseUrlAction,
  updateUTMLinkAction,
} from "../utm-actions";
import { base, ORG, OTRA_ORG, TEXTO_FIJO } from "./base-falsa";

const LINK = "44444444-4444-4444-8444-444444444444";
const LINK_AJENO = "55555555-5555-4555-8555-555555555555";
const VIDEO = "66666666-6666-4666-8666-666666666666";
const FETCH_FAILED = { message: "TypeError: fetch failed" };

function link(id: string, org: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    organization_id: org,
    utm_campaign: org === ORG ? "lanzamiento" : "ajena",
    utm_content: null,
    full_url: "https://ejemplo.com",
    instagram_username: null,
    manychat_page_id: null,
    youtube_video_id: null,
    youtube_video_title: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...extra,
  };
}

let consola: ReturnType<typeof vi.spyOn>;
let aviso: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  base.reiniciar();
  base.tablas.organizations = [
    { id: OTRA_ORG, website_url: "https://ajena.com" },
    { id: ORG, website_url: "https://propia.com/" },
  ];
  base.tablas.utm_links = [link(LINK_AJENO, OTRA_ORG), link(LINK, ORG)];
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

/** Los tres casos de una falla inesperada, iguales para todas las acciones. */
function casosDeFalla(
  etiqueta: string,
  tabla: string,
  correr: () => Promise<unknown>
) {
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

describe("getOrganizationWebsiteAction", () => {
  it("devuelve la URL del sitio de la organización de la sesión", async () => {
    await expect(getOrganizationWebsiteAction()).resolves.toEqual({
      success: true,
      data: "https://propia.com/",
    });
    expect(base.filtrosDe("organizations", "select")).toEqual([["id", ORG]]);
  });

  it("sin URL cargada devuelve null (no es un error)", async () => {
    base.tablas.organizations = [{ id: ORG, website_url: null }];
    await expect(getOrganizationWebsiteAction()).resolves.toEqual({ success: true, data: null });
  });

  casosDeFalla("[getOrganizationWebsite]", "organizations", getOrganizationWebsiteAction);
});

describe("getUtmBaseUrlAction", () => {
  it("devuelve la URL del sitio sin la barra final", async () => {
    await expect(getUtmBaseUrlAction()).resolves.toEqual({ success: true, data: "https://propia.com" });
    expect(base.filtrosDe("organizations", "select")).toEqual([["id", ORG]]);
  });

  casosDeFalla("[getUtmBaseUrl]", "organizations", getUtmBaseUrlAction);
});

describe("getUTMLinksAction", () => {
  it("devuelve sólo los UTMs de la organización de la sesión", async () => {
    const r = await getUTMLinksAction();
    expect(r.success && r.data.map((l) => l.id)).toEqual([LINK]);
    expect(base.filtrosDe("utm_links", "select")).toEqual([["organization_id", ORG]]);
  });

  casosDeFalla("[getUTMLinks]", "utm_links", getUTMLinksAction);
});

describe("getUTMLeadsAction", () => {
  beforeEach(() => {
    base.tablas.utm_lead_captures = [
      { id: "l-ajeno", organization_id: OTRA_ORG, utm_link_id: LINK, captured_at: "2026-10-02T00:00:00Z" },
      { id: "l-propio", organization_id: ORG, utm_link_id: LINK, captured_at: "2026-10-02T00:00:00Z" },
    ];
  });

  it("devuelve los leads del UTM de la organización", async () => {
    const r = await getUTMLeadsAction(LINK);
    expect(r.success && r.data.map((l) => l.id)).toEqual(["l-propio"]);
    expect(base.filtrosDe("utm_lead_captures", "select")).toEqual([
      ["organization_id", ORG],
      ["utm_link_id", LINK],
    ]);
  });

  it("un id que no es UUID vuelve con «ID inválido» sin llegar a la base", async () => {
    await expect(getUTMLeadsAction("no-es-uuid")).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
    expect(base.operaciones).toEqual([]);
    esperarRechazoSinRegistro();
  });

  casosDeFalla("[getUTMLeads]", "utm_lead_captures", () => getUTMLeadsAction(LINK));
});

describe("getUTMFunnelAction", () => {
  beforeEach(() => {
    base.tablas.utm_lead_captures = [
      { id: "l-ajeno", organization_id: OTRA_ORG, utm_link_id: LINK, captured_at: "2026-10-02T00:00:00Z" },
      { id: "l-propio", organization_id: ORG, utm_link_id: LINK, captured_at: "2026-10-02T00:00:00Z" },
    ];
    base.tablas.utm_booking_attributions = [
      { id: "b-ajeno", organization_id: OTRA_ORG, utm_link_id: LINK, booked_at: "2026-10-03T00:00:00Z" },
      { id: "b-propio", organization_id: ORG, utm_link_id: LINK, booked_at: "2026-10-03T00:00:00Z" },
    ];
    base.tablas.utm_sale_attributions = [
      { id: "s-ajeno", organization_id: OTRA_ORG, utm_link_id: LINK, revenue: 5000, sold_at: "2026-10-04" },
      { id: "s-propio", organization_id: ORG, utm_link_id: LINK, revenue: 300, sold_at: "2026-10-04" },
    ];
  });

  it("junta leads, bookings y ventas del UTM de la organización", async () => {
    const r = await getUTMFunnelAction(LINK);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.leads.map((l) => l.id)).toEqual(["l-propio"]);
    expect(r.data.bookings.map((b) => b.id)).toEqual(["b-propio"]);
    expect(r.data.sales.map((s) => s.id)).toEqual(["s-propio"]);
    expect(r.data.totalRevenue).toBe(300);
    for (const tabla of ["utm_lead_captures", "utm_booking_attributions", "utm_sale_attributions"]) {
      expect(base.filtrosDe(tabla, "select")).toEqual([
        ["organization_id", ORG],
        ["utm_link_id", LINK],
      ]);
    }
  });

  it("un id que no es UUID vuelve con «ID inválido» sin llegar a la base", async () => {
    await expect(getUTMFunnelAction("no-es-uuid")).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
    expect(base.operaciones).toEqual([]);
  });

  casosDeFalla("[getUTMFunnel]", "utm_lead_captures", () => getUTMFunnelAction(LINK));

  it.each(["utm_booking_attributions", "utm_sale_attributions"])(
    "⭐ si falla %s, texto fijo y se registra (antes, el texto crudo de la base)",
    async (tabla) => {
      base.errores[tabla] = { message: "relation does not exist", code: "42P01" };
      await expect(getUTMFunnelAction(LINK)).resolves.toEqual({ success: false, error: TEXTO_FIJO });
      esperarFallaRegistrada("[getUTMFunnel]");
      // Como `FallaDeLaBase`, con el código: Sentry dice qué pasó.
      expect(base.reportes[0].error).toMatchObject({ name: "FallaDeLaBase", code: "42P01" });
    }
  );
});

describe("createUTMLinkAction", () => {
  const datos = { utm_campaign: "nueva", youtube_video_title: "Video nuevo" };

  it("crea el UTM en la organización con la URL de su sitio", async () => {
    const r = await createUTMLinkAction(datos);
    expect(r).toMatchObject({
      success: true,
      data: { organization_id: ORG, utm_campaign: "nueva" },
    });
    const [insert] = base.escrituras();
    expect(insert.valores).toMatchObject({
      organization_id: ORG,
      full_url: "https://propia.com?utm_source=youtube&utm_medium=video&utm_campaign=nueva",
    });
    expect(base.filtrosDe("organizations", "select")).toEqual([["id", ORG]]);
  });

  it("⭐ con el UUID de un video guarda su id de YouTube, leído en la organización", async () => {
    base.tablas.content_assets = [
      { id: VIDEO, organization_id: OTRA_ORG, platform: "youtube", external_id: "yt-ajeno" },
      { id: VIDEO, organization_id: ORG, platform: "youtube", external_id: "yt-propio" },
    ];
    await createUTMLinkAction({ ...datos, youtube_video_id: VIDEO });
    expect(base.escrituras()[0].valores).toMatchObject({ youtube_video_id: "yt-propio" });
    expect(base.filtrosDe("content_assets", "select")).toEqual([
      ["organization_id", ORG],
      ["id", VIDEO],
      ["platform", "youtube"],
    ]);
  });

  it("⭐ si falla la lectura del video, no guarda el UUID como id: texto fijo y se registra", async () => {
    base.errores.content_assets = FETCH_FAILED;
    await expect(createUTMLinkAction({ ...datos, youtube_video_id: VIDEO })).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(base.escrituras()).toEqual([]);
    esperarFallaRegistrada("[createUTMLink]");
  });

  it("⭐ si falla la lectura de la URL del sitio, no crea el link con la URL por defecto", async () => {
    base.errores.organizations = FETCH_FAILED;
    await expect(createUTMLinkAction(datos)).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.escrituras()).toEqual([]);
    esperarFallaRegistrada("[createUTMLink]");
  });

  it("sin campaña ni título vuelve el motivo, sin escribir", async () => {
    await expect(createUTMLinkAction({ utm_campaign: "  " })).resolves.toEqual({
      success: false,
      error: "La campaña UTM es obligatoria.",
    });
    expect(base.escrituras()).toEqual([]);
    esperarRechazoSinRegistro();
  });

  it("⭐ una campaña repetida (23505) vuelve con su motivo, sin registrar", async () => {
    base.errores["utm_links:insert"] = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "utm_links_org_campaign_idx"',
    };
    await expect(createUTMLinkAction(datos)).resolves.toEqual({
      success: false,
      error: "Ya existe un UTM con esa campaña.",
    });
    esperarRechazoSinRegistro();
  });

  casosDeFalla("[createUTMLink]", "utm_links", () => createUTMLinkAction(datos));
});

describe("updateUTMLinkAction", () => {
  it("edita el UTM de la organización y rearma la URL con su sitio", async () => {
    const r = await updateUTMLinkAction(LINK, { utm_campaign: "otra" });
    expect(r).toMatchObject({ success: true, data: { id: LINK, utm_campaign: "otra" } });
    expect(base.filtrosDe("utm_links", "select")).toEqual([
      ["id", LINK],
      ["organization_id", ORG],
    ]);
    expect(base.filtrosDe("utm_links", "update")).toEqual([
      ["id", LINK],
      ["organization_id", ORG],
    ]);
    expect(base.tablas.utm_links[1].full_url).toBe(
      "https://propia.com?utm_source=youtube&utm_medium=video&utm_campaign=otra"
    );
  });

  it("⭐ un UTM de otra organización no se toca y vuelve «UTM no encontrado.»", async () => {
    await expect(updateUTMLinkAction(LINK_AJENO, { utm_campaign: "pisada" })).resolves.toEqual({
      success: false,
      error: "UTM no encontrado.",
    });
    expect(base.tablas.utm_links[0].utm_campaign).toBe("ajena");
    expect(base.escrituras()).toEqual([]);
    esperarRechazoSinRegistro();
  });

  it("⭐ con una fila gemela de otra organización, sólo edita la propia", async () => {
    base.tablas.utm_links.push(link(LINK, OTRA_ORG));
    await updateUTMLinkAction(LINK, { utm_campaign: "otra" });
    expect(base.tablas.utm_links[2].utm_campaign).toBe("ajena");
  });

  it("⭐ si falla la lectura del UTM, texto fijo y se registra (antes, «UTM no encontrado.»)", async () => {
    base.errores["utm_links:select"] = FETCH_FAILED;
    await expect(updateUTMLinkAction(LINK, { utm_campaign: "otra" })).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    esperarFallaRegistrada("[updateUTMLink]");
  });

  it("⭐ si falla la lectura de la URL del sitio, no escribe", async () => {
    base.errores.organizations = FETCH_FAILED;
    await expect(updateUTMLinkAction(LINK, { utm_campaign: "otra" })).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(base.escrituras()).toEqual([]);
    esperarFallaRegistrada("[updateUTMLink]");
  });

  it("⭐ si el UTM desaparece entre la lectura y la escritura (PGRST116), «UTM no encontrado.»", async () => {
    base.errores["utm_links:update"] = {
      code: "PGRST116",
      message: "Cannot coerce the result to a single JSON object",
    };
    await expect(updateUTMLinkAction(LINK, { utm_campaign: "otra" })).resolves.toEqual({
      success: false,
      error: "UTM no encontrado.",
    });
    esperarRechazoSinRegistro();
  });

  it("una campaña repetida (23505) vuelve con su motivo", async () => {
    base.errores["utm_links:update"] = { code: "23505", message: "duplicate key value" };
    await expect(updateUTMLinkAction(LINK, { utm_campaign: "repetida" })).resolves.toEqual({
      success: false,
      error: "Ya existe un UTM con esa campaña.",
    });
    esperarRechazoSinRegistro();
  });

  it("⭐ si falla la escritura, texto fijo y se registra (antes, el texto crudo)", async () => {
    base.errores["utm_links:update"] = FETCH_FAILED;
    await expect(updateUTMLinkAction(LINK, { utm_campaign: "otra" })).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    esperarFallaRegistrada("[updateUTMLink]");
  });

  it("un id que no es UUID vuelve con «ID inválido» sin llegar a la base", async () => {
    await expect(updateUTMLinkAction("no-es-uuid", {})).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
    expect(base.operaciones).toEqual([]);
  });

  casosDeFalla("[updateUTMLink]", "utm_links", () => updateUTMLinkAction(LINK, { utm_campaign: "otra" }));
});

describe("deleteUTMLinkAction", () => {
  it("borra el UTM de la organización", async () => {
    await expect(deleteUTMLinkAction(LINK)).resolves.toEqual({ success: true, data: undefined });
    expect(base.tablas.utm_links.map((l) => l.id)).toEqual([LINK_AJENO]);
    expect(base.filtrosDe("utm_links", "delete")).toEqual([
      ["id", LINK],
      ["organization_id", ORG],
    ]);
  });

  it("⭐ un UTM de otra organización no se borra y vuelve el motivo (antes, éxito)", async () => {
    await expect(deleteUTMLinkAction(LINK_AJENO)).resolves.toEqual({
      success: false,
      error: "UTM no encontrado.",
    });
    expect(base.tablas.utm_links.map((l) => l.id)).toEqual([LINK_AJENO, LINK]);
    esperarRechazoSinRegistro();
  });

  it("⭐ con una fila gemela de otra organización, sólo borra la propia", async () => {
    base.tablas.utm_links.push(link(LINK, OTRA_ORG));
    await deleteUTMLinkAction(LINK);
    expect(base.tablas.utm_links.map((l) => [l.id, l.organization_id])).toEqual([
      [LINK_AJENO, OTRA_ORG],
      [LINK, OTRA_ORG],
    ]);
  });

  it("un id que no es UUID vuelve con «ID inválido» sin llegar a la base", async () => {
    await expect(deleteUTMLinkAction("no-es-uuid")).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
    expect(base.operaciones).toEqual([]);
  });

  casosDeFalla("[deleteUTMLink]", "utm_links", () => deleteUTMLinkAction(LINK));
});

describe("un error interno de Next no se convierte en valor", () => {
  it("un redirect de la sesión se relanza", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    base.lanzaEnSesion = redirect;
    await expect(getUTMLinksAction()).rejects.toBe(redirect);
    expect(base.reportes).toEqual([]);
  });
});

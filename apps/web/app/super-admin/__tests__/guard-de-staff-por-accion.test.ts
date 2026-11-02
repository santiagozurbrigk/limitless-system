import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-552 · AC-1 / AC-2 / CD-3: cada acción del panel interno está guardada
 * por la lista de staff.
 *
 * Se invoca cada export real de los módulos del panel (y las dos rutas OAuth)
 * con Supabase simulado: el guard (`requireStaff`) NO se simula. En cada
 * escenario de rechazo la acción tiene que rechazar en la forma que usa hoy y
 * sin ninguna operación con service role más allá de la consulta del propio
 * guard; un staff de la lista tiene que pasar el guard con los mismos
 * argumentos (si no, el rechazo no probaría nada).
 *
 * La tabla `CASOS` es literal: el inventario del disco (archivos del panel y
 * exports de cada uno) se compara contra ella, y un archivo o un export nuevo
 * sin caso hace fallar el test.
 *
 * Mocks: sólo infraestructura (`next/cache`, `next/headers`, `next/navigation`,
 * `server-only`, `@sentry/nextjs`, `reportarFalla`) y la capa de Supabase
 * (`server`, `admin`, `env`). Ningún módulo de `lib/auth`, `lib/super-admin` ni
 * `lib/ai`.
 */

type Usuario = { id: string; email: string };
type Perfil = { is_active: boolean; organization_id: string | null; role: string };

const sim = vi.hoisted(() => ({
  usuario: null as { id: string; email: string } | null,
  lista: [] as string[],
  perfil: null as { is_active: boolean; organization_id: string | null; role: string } | null,
  getUser: 0,
  fetches: 0,
  operaciones: [] as string[],
  cookies: {} as Record<string, string>,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/navigation", () => ({
  unstable_rethrow: () => {},
  redirect: (destino: string) => {
    throw new Error(`NEXT_REDIRECT ${destino}`);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nombre: string) => (nombre in sim.cookies ? { name: nombre, value: sim.cookies[nombre] } : undefined),
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers(),
}));
vi.mock("@sentry/nextjs", () => ({
  captureCheckIn: () => "check-in",
  flush: async () => true,
  withScope: (fn: (scope: unknown) => void) =>
    fn({ setTags: () => {}, setTag: () => {}, setExtras: () => {}, setContext: () => {} }),
  captureException: () => {},
  captureMessage: () => {},
}));
vi.mock("@/lib/observability/reportar-falla", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/observability/reportar-falla")>()),
  reportarFalla: () => {},
}));

/**
 * Una cadena de supabase-js que acepta cualquier método y, al `await`,
 * devuelve `{ data: null, error: null }`. Los símbolos (iteradores) no
 * existen, para que un `for await` no quede en un ciclo.
 */
function cadena(): unknown {
  const destino = function () {};
  return new Proxy(destino, {
    get(_t, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "then") {
        return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null, count: 0 }).then(ok, ko);
      }
      return cadena();
    },
    apply() {
      return cadena();
    },
  });
}

vi.mock("@/lib/supabase/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/env")>()),
  isSupabaseConfigured: () => true,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (typeof prop === "symbol") return undefined;
          if (prop === "then") return undefined;
          if (prop === "auth") {
            return new Proxy(
              {},
              {
                get(_a, metodo) {
                  if (metodo === "getUser") {
                    return async () => {
                      sim.getUser += 1;
                      return { data: { user: sim.usuario }, error: null };
                    };
                  }
                  if (typeof metodo === "symbol" || metodo === "then") return undefined;
                  return cadena();
                },
              }
            );
          }
          return cadena();
        },
      }
    ),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (typeof prop === "symbol") return undefined;
          if (prop === "then") return undefined;
          if (prop === "from") {
            return (tabla: string) => {
              sim.operaciones.push(`from:${tabla}`);
              if (tabla === "super_admin_users") {
                let email = "";
                const lista = {
                  select: () => lista,
                  eq: (_c: string, v: string) => {
                    email = v;
                    return lista;
                  },
                  maybeSingle: async () => ({
                    data: sim.lista.includes(email) ? { id: "sa-1" } : null,
                    error: null,
                  }),
                };
                return lista;
              }
              if (tabla === "profiles") {
                // La lectura del guard es `select("is_active")`; cualquier otra
                // lectura de profiles (de la acción) va por la cadena genérica.
                return new Proxy(
                  {},
                  {
                    get(_p, metodo) {
                      if (metodo === "select") {
                        return (columnas: string) => {
                          if (columnas !== "is_active") return cadena();
                          const perfil = {
                            eq: () => perfil,
                            maybeSingle: async () => ({ data: sim.perfil, error: null }),
                          };
                          return perfil;
                        };
                      }
                      if (typeof metodo === "symbol" || metodo === "then") return undefined;
                      return cadena();
                    },
                  }
                );
              }
              return cadena();
            };
          }
          sim.operaciones.push(String(prop));
          return cadena();
        },
      }
    ),
}));

import { CUENTA_DESACTIVADA_MESSAGE } from "@/lib/auth/cuenta-desactivada";
import { MENSAJES_DE_RECHAZO_DEL_STAFF } from "@/lib/auth/require-staff";

// ─── Inventario ─────────────────────────────────────────────────────────────

const WEB = process.cwd();
const APP_PANEL = join(WEB, "app", "super-admin");
const LIB_PANEL = join(WEB, "lib", "super-admin");
const RUTAS_DIR = join(WEB, "app", "api", "integrations", "super-admin-google");

/** Los especificadores de import/export/import()/require() de un archivo. */
function especificadores(texto: string): string[] {
  const salida: string[] = [];
  const patron = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*(["'])([^"'\n]+)\1/g;
  for (const m of texto.matchAll(patron)) salida.push(m[2]);
  return salida;
}

/** ¿El archivo importa el guard del staff (o su alias), en cualquier forma? */
function importaElGuard(texto: string): boolean {
  return especificadores(texto).some((e) =>
    /(?:^|\/)(?:require-staff|require-super-admin)(?:\.[cm]?[jt]sx?)?$/.test(e)
  );
}

function archivosTs(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && statSync(join(dir, f)).isFile())
    .sort();
}

function rutasDe(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...rutasDe(ruta));
    else if (entrada === "route.ts") salida.push(relative(RUTAS_DIR, ruta));
  }
  return salida.sort();
}

function moduloDelPanelEnDisco(): string[] {
  const app = archivosTs(APP_PANEL).map((f) => `app/super-admin/${f}`);
  const lib = archivosTs(LIB_PANEL)
    .filter((f) => importaElGuard(readFileSync(join(LIB_PANEL, f), "utf8")))
    .map((f) => `lib/super-admin/${f}`);
  return [...app, ...lib].sort();
}

// ─── Tabla literal ──────────────────────────────────────────────────────────

type Forma = "valor-success" | "valor-ok" | "excepcion" | "redirect-error";
type Modulo = Record<string, (...args: unknown[]) => Promise<unknown>>;
type Caso = { invocar: (m: Modulo) => Promise<unknown>; forma: Forma };

const ORG_LIMITLESS = "11111111-1111-4111-8111-11111111c0de";
const ORG_A = "22222222-2222-4222-8222-222222222222";
const USUARIO_X = "33333333-3333-4333-8333-333333333333";
const DOC = "44444444-4444-4444-8444-444444444444";

const STAFF: Usuario = { id: "55555555-5555-4555-8555-555555555555", email: "staff@limitless.test" };
const MIEMBRO: Usuario = { id: "66666666-6666-4666-8666-666666666666", email: "miembro@limitless.test" };

const CARGAR: Record<string, () => Promise<unknown>> = {
  "app/super-admin/actions.ts": () => import("@/app/super-admin/actions"),
  "app/super-admin/delete-actions.ts": () => import("@/app/super-admin/delete-actions"),
  "app/super-admin/drive-actions.ts": () => import("@/app/super-admin/drive-actions"),
  "app/super-admin/platform-ai-actions.ts": () => import("@/app/super-admin/platform-ai-actions"),
  "lib/super-admin/queries.ts": () => import("@/lib/super-admin/queries"),
  "lib/super-admin/org-health.ts": () => import("@/lib/super-admin/org-health"),
  "lib/super-admin/waitlist-queries.ts": () => import("@/lib/super-admin/waitlist-queries"),
  "lib/super-admin/client-health.ts": () => import("@/lib/super-admin/client-health"),
  "lib/super-admin/onboarding-progress.ts": () => import("@/lib/super-admin/onboarding-progress"),
  "lib/super-admin/holding-queries.ts": () => import("@/lib/super-admin/holding-queries"),
  "lib/super-admin/holdings-admin.ts": () => import("@/lib/super-admin/holdings-admin"),
};

const CASOS: Record<string, Record<string, Caso>> = {
  "app/super-admin/actions.ts": {
    getOrganizationDetailAction: { invocar: (m) => m.getOrganizationDetailAction(ORG_A), forma: "excepcion" },
    getAllUsersAction: { invocar: (m) => m.getAllUsersAction(), forma: "excepcion" },
    getAICostsAction: { invocar: (m) => m.getAICostsAction(), forma: "excepcion" },
    getClientHealthAction: { invocar: (m) => m.getClientHealthAction(), forma: "excepcion" },
    createFounderAccountAction: {
      invocar: (m) =>
        m.createFounderAccountAction({ organizationName: "Org nueva", founderName: "Ana", email: "ana@cliente.test" }),
      forma: "valor-success",
    },
    createOrganizationFromHoldingAction: {
      invocar: (m) =>
        m.createOrganizationFromHoldingAction({ name: "Negocio", founderEmail: "b@cliente.test", plan: "basic" }),
      forma: "valor-success",
    },
    setOrganizationStatusAction: { invocar: (m) => m.setOrganizationStatusAction(ORG_A, true), forma: "valor-success" },
    updateOrganizationMrrAction: { invocar: (m) => m.updateOrganizationMrrAction(ORG_A, 100), forma: "valor-success" },
    addOrganizationNoteAction: { invocar: (m) => m.addOrganizationNoteAction(ORG_A, "Una nota"), forma: "valor-success" },
    deactivateUserAction: { invocar: (m) => m.deactivateUserAction(USUARIO_X), forma: "valor-success" },
    prepareAiBrainFileUploadAction: {
      invocar: (m) =>
        m.prepareAiBrainFileUploadAction({ fileName: "guia.pdf", fileSize: 1000, mimeType: "application/pdf" }),
      forma: "valor-success",
    },
    createAiBrainDocumentAction: {
      invocar: (m) =>
        m.createAiBrainDocumentAction({
          title: "Guía",
          contentType: "document",
          category: "general",
          storagePath: "x-guia.pdf",
          fileName: "guia.pdf",
        }),
      forma: "valor-success",
    },
    archiveAiBrainDocumentAction: { invocar: (m) => m.archiveAiBrainDocumentAction(DOC), forma: "valor-success" },
    deleteAiBrainDocumentAction: { invocar: (m) => m.deleteAiBrainDocumentAction(DOC), forma: "valor-success" },
    getAiBrainSignedUrlAction: {
      invocar: (m) => m.getAiBrainSignedUrlAction("ai-brain-documents/x-guia.pdf"),
      forma: "valor-success",
    },
    processAiBrainDocumentAction: { invocar: (m) => m.processAiBrainDocumentAction(DOC), forma: "valor-success" },
    importDriveFileForBrainAction: {
      invocar: (m) =>
        m.importDriveFileForBrainAction({ fileId: "f-1", fileName: "guia.pdf", mimeType: "application/pdf", fileSize: 1000 }),
      forma: "excepcion",
    },
    createHoldingOrgAction: {
      invocar: (m) => m.createHoldingOrgAction({ name: "Holding", founderEmail: "h@cliente.test" }),
      forma: "valor-success",
    },
    regenerateTempPasswordAction: { invocar: (m) => m.regenerateTempPasswordAction(USUARIO_X), forma: "valor-success" },
    submitBrainSummaryBatchAction: { invocar: (m) => m.submitBrainSummaryBatchAction(), forma: "valor-success" },
    syncBrainBatchResultsAction: { invocar: (m) => m.syncBrainBatchResultsAction("batch-1"), forma: "valor-success" },
    updateOrgAddOnsAction: { invocar: (m) => m.updateOrgAddOnsAction(ORG_A, []), forma: "valor-success" },
  },
  "app/super-admin/delete-actions.ts": {
    previewOrganizationDeletionAction: {
      invocar: (m) => m.previewOrganizationDeletionAction(ORG_A),
      forma: "valor-success",
    },
    deleteOrganizationAction: {
      invocar: (m) => m.deleteOrganizationAction({ organizationId: ORG_A, confirmacion: "Org A" }),
      forma: "valor-success",
    },
    previewUserDeletionAction: { invocar: (m) => m.previewUserDeletionAction(USUARIO_X), forma: "valor-success" },
    deleteUserAction: {
      invocar: (m) => m.deleteUserAction({ profileId: USUARIO_X, confirmacion: "x@cliente.test" }),
      forma: "valor-success",
    },
  },
  "app/super-admin/drive-actions.ts": {
    listDriveFilesForSuperAdminSafeAction: {
      invocar: (m) => m.listDriveFilesForSuperAdminSafeAction({ query: "guia" }),
      forma: "valor-ok",
    },
  },
  "app/super-admin/platform-ai-actions.ts": {
    getPlatformClaudeKeyStatusAction: { invocar: (m) => m.getPlatformClaudeKeyStatusAction(), forma: "excepcion" },
    savePlatformClaudeKeyAction: {
      invocar: (m) => m.savePlatformClaudeKeyAction(`sk-ant-api03-${"a".repeat(80)}`),
      forma: "valor-success",
    },
    removePlatformClaudeKeyAction: { invocar: (m) => m.removePlatformClaudeKeyAction(), forma: "valor-success" },
  },
  "lib/super-admin/queries.ts": {
    loadAICostsSummary: { invocar: (m) => m.loadAICostsSummary(), forma: "excepcion" },
    loadAiCostDashboard: { invocar: (m) => m.loadAiCostDashboard(), forma: "excepcion" },
    loadOrganizationsList: { invocar: (m) => m.loadOrganizationsList(), forma: "excepcion" },
    loadOrganizationDetail: { invocar: (m) => m.loadOrganizationDetail(ORG_A), forma: "excepcion" },
    loadAdminUsers: { invocar: (m) => m.loadAdminUsers(), forma: "excepcion" },
    loadProfitabilityData: { invocar: (m) => m.loadProfitabilityData(), forma: "excepcion" },
    loadTokenUsageBreakdown: { invocar: (m) => m.loadTokenUsageBreakdown("month", ORG_A), forma: "excepcion" },
    loadTokenCostDailyByOrg: { invocar: (m) => m.loadTokenCostDailyByOrg(30), forma: "excepcion" },
    loadInfrastructureStats: { invocar: (m) => m.loadInfrastructureStats(), forma: "excepcion" },
    loadUltimasCorridas: { invocar: (m) => m.loadUltimasCorridas(), forma: "excepcion" },
    loadAiBrainDashboard: { invocar: (m) => m.loadAiBrainDashboard(), forma: "excepcion" },
    loadAiBrainDocuments: { invocar: (m) => m.loadAiBrainDocuments({ search: "guia" }), forma: "excepcion" },
    loadAiBrainDocument: { invocar: (m) => m.loadAiBrainDocument(DOC), forma: "excepcion" },
    getSignedFileUrl: { invocar: (m) => m.getSignedFileUrl("ai-brain-documents/x-guia.pdf"), forma: "excepcion" },
  },
  "lib/super-admin/org-health.ts": {
    loadOrgHealthScores: { invocar: (m) => m.loadOrgHealthScores(), forma: "excepcion" },
  },
  "lib/super-admin/waitlist-queries.ts": {
    loadWaitlistLeads: { invocar: (m) => m.loadWaitlistLeads(), forma: "excepcion" },
    loadTrialLeads: { invocar: (m) => m.loadTrialLeads(), forma: "excepcion" },
  },
  "lib/super-admin/client-health.ts": {
    loadClientHealthOverview: { invocar: (m) => m.loadClientHealthOverview(), forma: "excepcion" },
    loadOrgClientProblems: { invocar: (m) => m.loadOrgClientProblems(ORG_A), forma: "excepcion" },
    loadOrgClientHealthTimeline: { invocar: (m) => m.loadOrgClientHealthTimeline(ORG_A), forma: "excepcion" },
  },
  "lib/super-admin/onboarding-progress.ts": {
    loadOnboardingProgress: { invocar: (m) => m.loadOnboardingProgress(), forma: "excepcion" },
  },
  "lib/super-admin/holding-queries.ts": {
    getHoldingPortfolio: { invocar: (m) => m.getHoldingPortfolio(), forma: "excepcion" },
    getHoldingKPIs: { invocar: (m) => m.getHoldingKPIs(), forma: "excepcion" },
  },
  "lib/super-admin/holdings-admin.ts": {
    loadHoldingsForAdmin: { invocar: (m) => m.loadHoldingsForAdmin(), forma: "excepcion" },
    loadAvailableBusinessOrgs: { invocar: (m) => m.loadAvailableBusinessOrgs(), forma: "excepcion" },
  },
};

/** Exports sin guard a propósito, con el motivo. */
const EXENTAS: Record<string, Record<string, string>> = {
  "lib/super-admin/queries.ts": {
    formatUsd: "formateador puro de montos (re-export de org-metrics), no lee nada",
    formatUsdPrecise: "formateador puro de montos (re-export de org-metrics), no lee nada",
  },
};

const COOKIE_OAUTH = "super_admin_google_oauth";
const ESTADO_OAUTH = "estado-de-prueba-1234";

const RUTAS: Record<string, { cargar: () => Promise<unknown>; invocar: (m: Modulo) => Promise<unknown>; forma: Forma }> = {
  "oauth/start/route.ts": {
    cargar: () => import("@/app/api/integrations/super-admin-google/oauth/start/route"),
    invocar: (m) => m.GET(new NextRequest("https://app.test/api/integrations/super-admin-google/oauth/start")),
    forma: "excepcion",
  },
  "oauth/callback/route.ts": {
    cargar: () => import("@/app/api/integrations/super-admin-google/oauth/callback/route"),
    invocar: (m) =>
      m.GET(
        new NextRequest(
          `https://app.test/api/integrations/super-admin-google/oauth/callback?code=codigo-1&state=${ESTADO_OAUTH}`
        )
      ),
    forma: "redirect-error",
  },
};

// ─── Escenarios ─────────────────────────────────────────────────────────────

type Escenario = {
  nombre: string;
  usuario: Usuario | null;
  perfil: Perfil | null;
  mensaje: string | null; // null = aceptado
  /** Operaciones del admin que se permiten (las del guard). */
  permitidas: string[];
};

const ESCENARIOS: Escenario[] = [
  { nombre: "sin sesión", usuario: null, perfil: null, mensaje: "No autenticado", permitidas: [] },
  {
    nombre: "miembro común de Limitless fuera de la lista",
    usuario: MIEMBRO,
    perfil: { is_active: true, organization_id: ORG_LIMITLESS, role: "member" },
    mensaje: "Sin permisos de super admin",
    permitidas: ["from:super_admin_users"],
  },
  {
    nombre: "founder de Limitless fuera de la lista",
    usuario: MIEMBRO,
    perfil: { is_active: true, organization_id: ORG_LIMITLESS, role: "founder" },
    mensaje: "Sin permisos de super admin",
    permitidas: ["from:super_admin_users"],
  },
  {
    nombre: "staff desactivado",
    usuario: STAFF,
    perfil: { is_active: false, organization_id: ORG_LIMITLESS, role: "founder" },
    mensaje: CUENTA_DESACTIVADA_MESSAGE,
    permitidas: ["from:super_admin_users", "from:profiles"],
  },
  {
    nombre: "staff de la lista",
    usuario: STAFF,
    perfil: { is_active: true, organization_id: ORG_LIMITLESS, role: "founder" },
    mensaje: null,
    permitidas: [],
  },
];

type Resultado = { tipo: "valor"; valor: unknown } | { tipo: "excepcion"; error: unknown };

async function correr(fn: () => Promise<unknown>): Promise<Resultado> {
  try {
    return { tipo: "valor", valor: await fn() };
  } catch (error) {
    return { tipo: "excepcion", error };
  }
}

function textoDelRechazo(r: Resultado): string | null {
  if (r.tipo === "excepcion") return r.error instanceof Error ? r.error.message : String(r.error);
  const v = r.valor as Record<string, unknown> | null;
  if (v && typeof v === "object") {
    if (typeof v.error === "string") return v.error;
    if (typeof v.message === "string") return v.message;
  }
  return null;
}

function esRechazoDelGuard(r: Resultado): boolean {
  const texto = textoDelRechazo(r);
  return texto !== null && MENSAJES_DE_RECHAZO_DEL_STAFF.includes(texto);
}

function esperarRechazo(r: Resultado, forma: Forma, mensaje: string) {
  if (forma === "valor-success") {
    expect(r).toEqual({ tipo: "valor", valor: { success: false, error: mensaje } });
  } else if (forma === "valor-ok") {
    expect(r).toEqual({ tipo: "valor", valor: { ok: false, errorCode: "OTHER", message: mensaje } });
  } else if (forma === "excepcion") {
    expect(r.tipo).toBe("excepcion");
    expect(textoDelRechazo(r)).toBe(mensaje);
  } else {
    expect(r.tipo).toBe("valor");
    const respuesta = (r as { valor: Response }).valor;
    expect(respuesta).toBeInstanceOf(Response);
    expect(respuesta.status).toBe(307);
    expect(respuesta.headers.get("location")).toContain("google_drive=error");
    // El rechazo del guard se traga en la ruta: lo que prueba que cortó ahí es
    // que no intercambió el código con Google.
    expect(sim.fetches).toBe(0);
  }
}

function prepararEscenario(e: Escenario) {
  sim.usuario = e.usuario;
  sim.perfil = e.perfil;
  sim.lista = [STAFF.email];
  sim.cookies = {
    [COOKIE_OAUTH]: JSON.stringify({ userId: e.usuario?.id ?? "nadie", state: ESTADO_OAUTH, codeVerifier: "v" }),
  };
}

beforeEach(() => {
  sim.usuario = null;
  sim.lista = [];
  sim.perfil = null;
  sim.getUser = 0;
  sim.fetches = 0;
  sim.operaciones = [];
  sim.cookies = {};
  vi.stubEnv("GOOGLE_CLIENT_ID", "cliente-google");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secreto-google");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test");
  vi.stubGlobal("fetch", async () => {
    sim.fetches += 1;
    throw new TypeError("fetch bloqueado en el test");
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── El detector de imports del guard (CD-23) ───────────────────────────────

describe("detector de imports del guard", () => {
  it.each([
    ['import { requireStaff } from "@/lib/auth/require-staff";'],
    ["import { requireStaff } from '@/lib/auth/require-staff';"],
    ['import { requireSuperAdmin } from "@/lib/auth/require-super-admin";'],
    ['import { requireStaff } from "../auth/require-staff";'],
    ['import { requireStaff } from "../../lib/auth/require-staff.ts";'],
    ['import { requireStaff } from "./require-staff.js";'],
    ['export { requireStaff } from "@/lib/auth/require-staff";'],
    ['export * from "@/lib/auth/require-super-admin";'],
    ['const g = await import("@/lib/auth/require-staff");'],
    ["const g = await import ( '@/lib/auth/require-super-admin' );"],
    ['const g = require("@/lib/auth/require-staff");'],
    ['import "@/lib/auth/require-staff";'],
    ['import {\n  requireStaff,\n} from "@/lib/auth/require-staff";'],
  ])("detecta %s", (texto) => {
    expect(importaElGuard(texto)).toBe(true);
  });

  it.each([
    ['import { requireAuth } from "@/lib/auth/require-auth";'],
    ['import { x } from "@/lib/auth/require-staff-helpers";'],
    ['import { x } from "@/lib/auth/no-require-staff/otro";'],
    ['const texto = "require-staff";'],
  ])("no detecta %s", (texto) => {
    expect(importaElGuard(texto)).toBe(false);
  });
});

// ─── Inventario contra la tabla ─────────────────────────────────────────────

describe("inventario del panel interno", () => {
  it("Test 1: los módulos del disco son los de la tabla", () => {
    expect(moduloDelPanelEnDisco()).toEqual(Object.keys(CASOS).sort());
    expect(Object.keys(CARGAR).sort()).toEqual(Object.keys(CASOS).sort());
  });

  it("las rutas OAuth del disco son las de la tabla", () => {
    expect(rutasDe(RUTAS_DIR)).toEqual(Object.keys(RUTAS).sort());
  });

  it.each(Object.keys(CASOS))("Test 2: cada export de %s tiene caso o está exento", async (modulo) => {
    const mod = (await CARGAR[modulo]()) as Record<string, unknown>;
    const funciones = Object.entries(mod)
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k)
      .sort();
    const declaradas = [...Object.keys(CASOS[modulo]), ...Object.keys(EXENTAS[modulo] ?? {})].sort();
    expect(funciones, `exports de ${modulo} sin caso (o casos huérfanos)`).toEqual(declaradas);
  });

  it.each(Object.keys(RUTAS))("cada ruta OAuth sólo exporta GET (%s)", async (ruta) => {
    const mod = (await RUTAS[ruta].cargar()) as Record<string, unknown>;
    const funciones = Object.entries(mod)
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k)
      .sort();
    expect(funciones).toEqual(["GET"]);
  });

  it("los totales de la tabla son los esperados", () => {
    const conCaso = Object.values(CASOS).reduce((n, c) => n + Object.keys(c).length, 0);
    const exentas = Object.values(EXENTAS).reduce((n, c) => n + Object.keys(c).length, 0);
    expect({ conCaso, exentas, rutas: Object.keys(RUTAS).length }).toEqual({ conCaso: 55, exentas: 2, rutas: 2 });
  });
});

// ─── Cada acción, cada escenario ────────────────────────────────────────────

const TODOS: { id: string; cargar: () => Promise<unknown>; caso: Caso }[] = [
  ...Object.entries(CASOS).flatMap(([modulo, casos]) =>
    Object.entries(casos).map(([nombre, caso]) => ({ id: `${modulo}#${nombre}`, cargar: CARGAR[modulo], caso }))
  ),
  ...Object.entries(RUTAS).map(([ruta, r]) => ({
    id: `app/api/integrations/super-admin-google/${ruta}#GET`,
    cargar: r.cargar,
    caso: { invocar: r.invocar, forma: r.forma },
  })),
];

// Bucles con nombres explícitos: `$id` en it.each trunca el nombre a 40
// caracteres y el rojo no diría qué acción quedó sin guard.
for (const escenario of ESCENARIOS) describe(`escenario: ${escenario.nombre}`, () => {
  for (const { id, cargar, caso } of TODOS) it(id, async () => {
    const mod = (await cargar()) as Modulo;
    prepararEscenario(escenario);

    const r = await correr(() => caso.invocar(mod));

    if (escenario.mensaje === null) {
      expect(esRechazoDelGuard(r), `el staff de la lista fue rechazado: ${textoDelRechazo(r)}`).toBe(false);
      expect(sim.getUser).toBeGreaterThan(0);
      // Pasó el guard y siguió: tocó la base (o la red) más allá del guard.
      const masAllaDelGuard = sim.operaciones.filter((o) => o !== "from:super_admin_users").length;
      expect(masAllaDelGuard + sim.fetches, "la acción no hizo nada después del guard").toBeGreaterThan(0);
      return;
    }

    esperarRechazo(r, caso.forma, escenario.mensaje);
    expect(sim.getUser, "el guard no fue consultado").toBeGreaterThan(0);
    const fuera = sim.operaciones.filter((o) => !escenario.permitidas.includes(o));
    expect(fuera, "operaciones con service role antes del rechazo").toEqual([]);
    expect(sim.fetches).toBe(0);
  });
});

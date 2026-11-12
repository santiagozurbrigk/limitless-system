/**
 * SCRUM-541 (corte B) · Los 4 componentes de cliente que recargan con las
 * lecturas de Operaciones dibujan `SinAcceso` cuando una vuelve rechazada.
 *
 * Pasa si los permisos cambian con la pantalla abierta: la recarga vuelve a
 * mirarlos. El componente no muestra los datos que tenía, no lanza, y en el
 * creador de SOP desde video se corta el sondeo del trabajo (intervalo y canal
 * en vivo).
 *
 * Con datos, cada uno se comporta como antes: recarga los inputs y el estado,
 * dibuja el historial, lista los frameworks y sigue sondeando el video.
 *
 * Sin DOM no hay React que guarde el estado entre renders, así que los hooks se
 * reemplazan por unos mínimos que sí lo guardan (como
 * `providers/__tests__/workboard-provider-confirmacion.test.ts`): un "render"
 * es llamar al componente y pasar lo que devuelve por `renderToStaticMarkup`, y
 * después corren los efectos cuyas deps cambiaron, con la limpieza anterior
 * primero. Los hijos se reemplazan por marcas, así el render no ejecuta hooks
 * de otros.
 */

import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SinAcceso } from "@/components/platform/sin-acceso";
import { mapWeeklyInputRowsToTeamInputs } from "@/lib/operations/weekly-input-mapper";
import type { WeeklyInputRow } from "@/types/operations";

// ─── Arnés de hooks ──────────────────────────────────────────────────────────

const hooks = vi.hoisted(() => {
  type Efecto = { deps: unknown[] | undefined; limpiar: unknown };
  let celdas: unknown[] = [];
  let i = 0;
  let porCorrer: Array<() => void> = [];
  const mismasDeps = (a: unknown[] | undefined, b: unknown[] | undefined) =>
    a !== undefined &&
    b !== undefined &&
    a.length === b.length &&
    a.every((d, j) => Object.is(d, b[j]));
  const api = {
    /** Lo que se lanzó con `startTransition`: se espera entre pasos. */
    pendientes: [] as Promise<unknown>[],
    reiniciar() {
      celdas = [];
      i = 0;
      porCorrer = [];
      api.pendientes = [];
    },
    empezarRender() {
      i = 0;
      porCorrer = [];
    },
    /** Como React después de pintar: limpieza anterior y efecto, por orden. */
    correrEfectos() {
      const lista = porCorrer;
      porCorrer = [];
      for (const correr of lista) correr();
    },
    useState(inicial: unknown) {
      const k = i++;
      if (!(k in celdas)) {
        celdas[k] = typeof inicial === "function" ? (inicial as () => unknown)() : inicial;
      }
      const set = (v: unknown) => {
        celdas[k] = typeof v === "function" ? (v as (x: unknown) => unknown)(celdas[k]) : v;
      };
      return [celdas[k], set];
    },
    useRef(inicial: unknown) {
      const k = i++;
      if (!(k in celdas)) celdas[k] = { current: inicial };
      return celdas[k];
    },
    // Devuelve el valor guardado mientras las deps no cambien (Object.is una por una).
    useMemo(calcular: () => unknown, deps: unknown[]) {
      const k = i++;
      const guardado = celdas[k] as { valor: unknown; deps: unknown[] } | undefined;
      if (guardado && mismasDeps(guardado.deps, deps)) return guardado.valor;
      const valor = calcular();
      celdas[k] = { valor, deps };
      return valor;
    },
    useEffect(efecto: () => unknown, deps?: unknown[]) {
      const k = i++;
      const previo = celdas[k] as Efecto | undefined;
      if (previo && mismasDeps(previo.deps, deps)) return;
      celdas[k] = { deps, limpiar: previo?.limpiar };
      porCorrer.push(() => {
        const actual = celdas[k] as Efecto;
        if (typeof actual.limpiar === "function") (actual.limpiar as () => void)();
        actual.limpiar = efecto();
      });
    },
    useTransition() {
      return [
        false,
        (cb: () => unknown) => {
          api.pendientes.push(Promise.resolve(cb()));
        },
      ];
    },
  };
  return api;
});

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: hooks.useState,
  useRef: hooks.useRef,
  useMemo: hooks.useMemo,
  useCallback: (f: unknown, deps: unknown[]) => hooks.useMemo(() => f, deps),
  useEffect: hooks.useEffect,
  useTransition: hooks.useTransition,
}));

// ─── Simulación ──────────────────────────────────────────────────────────────

const sim = vi.hoisted(() => ({
  acciones: {} as Record<string, (...args: unknown[]) => Promise<unknown>>,
  llamadas: {} as Record<string, number>,
  props: {} as Record<string, Record<string, unknown>>,
  botones: {} as Record<string, () => unknown>,
  avisos: [] as Array<{ title: string; description?: string }>,
  // Estable entre renders, como el `push` real (useCallback en toast-provider).
  push: (aviso: { title: string; description?: string }) => sim.avisos.push(aviso),
  canales: { abiertos: 0, cerrados: 0 },
}));

function acciones(nombres: string[]) {
  return Object.fromEntries(
    nombres.map((n) => [
      n,
      (...args: unknown[]) => {
        sim.llamadas[n] = (sim.llamadas[n] ?? 0) + 1;
        return sim.acciones[n]!(...args);
      },
    ])
  );
}
vi.mock("@/app/operations/actions", () =>
  acciones([
    "generateWeeklyReportAction",
    "getWeeklyCompletionStatus",
    "getWeeklyInputsAction",
    "getWeeklyInputsForWeekAction",
    "getWeeklyInputsHistoryAction",
  ])
);
vi.mock("@/app/product/actions", () =>
  acciones(["deleteSalesFrameworkAction", "getSalesFrameworksAction", "saveSalesFrameworkAction"])
);
vi.mock("@/app/sops/video-actions", () =>
  acciones([
    "createSopVideoJobAction",
    "getSopVideoJobAction",
    "prepareSopVideoUploadAction",
    "retrySopVideoJobAction",
  ])
);

vi.mock("@/providers/toast-provider", () => ({
  useToast: () => ({ push: sim.push }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
// Con Supabase configurado: si no, `handleSaved` sale antes de llamar a las actions.
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const canal = {
      on: () => canal,
      subscribe: () => {
        sim.canales.abiertos += 1;
        return canal;
      },
    };
    return {
      channel: () => canal,
      removeChannel: async () => {
        sim.canales.cerrados += 1;
      },
    };
  },
}));

vi.mock("@ai-coo/ui", async () => {
  const { createElement: h, Fragment } = await vi.importActual<typeof import("react")>("react");
  const pasa = ({ children }: { children?: unknown }) => h(Fragment, null, children as never);
  return {
    Dialog: pasa,
    DialogContent: pasa,
    DialogFooter: pasa,
    DialogHeader: pasa,
    DialogTitle: pasa,
    FormField: pasa,
    Label: pasa,
    GlassPanel: ({ children }: { children?: unknown }) =>
      h("div", { "data-componente": "GlassPanel" }, children as never),
    Button: (props: { children?: unknown; onClick?: () => unknown; disabled?: boolean }) => {
      if (props.onClick) sim.botones[String(props.children)] = props.onClick;
      return h("button", { disabled: props.disabled }, props.children as never);
    },
    Input: (props: Record<string, unknown>) => h("input", { value: props.value as string, readOnly: true }),
    Textarea: (props: Record<string, unknown>) =>
      h("textarea", { value: props.value as string, readOnly: true }),
    cn: (...clases: unknown[]) => clases.filter(Boolean).join(" "),
  };
});

function marca(nombre: string) {
  function Marca(props: Record<string, unknown>) {
    sim.props[nombre] = props;
    return createElement("div", { "data-componente": nombre });
  }
  return Marca;
}
vi.mock("@/components/operations/weekly-input-form", () => ({
  WeeklyInputForm: marca("WeeklyInputForm"),
}));
vi.mock("@/components/operations/weekly-inputs-list", () => ({
  WeeklyInputsList: marca("WeeklyInputsList"),
}));
vi.mock("@/components/operations/weekly-inputs-history", () => ({
  WeeklyInputsHistory: marca("WeeklyInputsHistory"),
}));
vi.mock("@/components/shared/panel", () => ({
  Panel: function MarcaDePanel(props: { title?: string; children?: unknown }) {
    sim.props.Panel = props;
    return createElement("section", { "data-componente": "Panel" }, props.children as never);
  },
}));

import { WeeklyInputsPageContent } from "../weekly-inputs-page-content";
import { SalesFrameworksSection } from "@/components/product/sales-frameworks-section";
import { SopVideoCreator } from "@/components/sops/sop-video-creator";

// El de verdad: `WeeklyInputsPageContent` lo dibuja como marca.
const { WeeklyInputsHistory } = await vi.importActual<
  typeof import("../weekly-inputs-history")
>("../weekly-inputs-history");

// ─── Render ──────────────────────────────────────────────────────────────────

let ultimo: ReactNode = null;

function dibujar<P>(Componente: (props: P) => ReactNode, props: P): string {
  hooks.empezarRender();
  ultimo = Componente(props);
  const html = renderToStaticMarkup(createElement("div", null, ultimo));
  hooks.correrEfectos();
  // Sin el `div` de afuera, para comparar con el render de `SinAcceso` solo.
  return html.slice("<div>".length, -"</div>".length);
}

/** Espera lo lanzado con `startTransition` y vacía la cola de microtareas. */
async function vaciar(): Promise<void> {
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    await Promise.all(hooks.pendientes.splice(0));
    for (let tick = 0; tick < 10; tick++) await Promise.resolve();
  }
}

/** Monta y deja correr efectos y recargas hasta que el estado se asienta. */
async function asentar<P>(Componente: (props: P) => ReactNode, props: P): Promise<string> {
  let html = dibujar(Componente, props);
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    await vaciar();
    html = dibujar(Componente, props);
  }
  return html;
}

/** El primer elemento nativo del último render que cumple `cumple`. */
function buscar(
  nodo: ReactNode,
  cumple: (elemento: ReactElement<Record<string, unknown>>) => boolean
): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) {
      const encontrado = buscar(hijo as ReactNode, cumple);
      if (encontrado) return encontrado;
    }
    return null;
  }
  if (!isValidElement(nodo)) return null;
  const elemento = nodo as ReactElement<Record<string, unknown>>;
  if (cumple(elemento)) return elemento;
  return buscar(elemento.props.children as ReactNode, cumple);
}

// ─── Datos ───────────────────────────────────────────────────────────────────

const RECHAZO = {
  success: false,
  error: "No tenés acceso a Operaciones.",
  motivo: "sin-acceso",
  moduleId: "operations",
};
const rechazada = async () => RECHAZO;

const SOLO_SIN_ACCESO = renderToStaticMarkup(
  createElement(SinAcceso, { moduleLabel: "Operaciones" })
);

const SEMANA = "2026-11-09";

function fila(id: string, department: string, weekStart = SEMANA): WeeklyInputRow {
  return {
    id,
    organization_id: "org-1",
    week_start: weekStart,
    department,
    type: "text",
    content: `Input ${id}`,
    rating: null,
    submitted_by: "u-1",
    created_at: "2026-11-10T10:00:00Z",
    updated_at: "2026-11-10T10:00:00Z",
    profiles: { full_name: "Ana", avatar_url: null },
  };
}

const FILAS_INICIALES = [fila("in-0", "marketing")];
const FILAS = [fila("in-1", "ventas"), fila("in-2", "delivery")];
const ESTADO = { completed: ["sales", "delivery"], total: 5 };

const FRAMEWORKS = [
  { id: "fw-1", name: "Script de cierre", description: null, content: "Hola", type: "script", is_active: true },
  { id: "fw-2", name: "Objeciones de precio", description: "Las 5", content: "Caro", type: null, is_active: true },
];

const JOB = {
  id: "job-1",
  status: "generating",
  title: "Pago manual",
  department: null,
  transcript: null,
  transcriptSeconds: null,
  generatedMarkdown: null,
  openQuestions: [],
  error: null,
  createdAt: "2026-11-12T07:00:00Z",
};

const ok = async () => ({ success: true, data: undefined });

beforeEach(() => {
  hooks.reiniciar();
  ultimo = null;
  sim.llamadas = {};
  sim.props = {};
  sim.botones = {};
  sim.avisos = [];
  sim.canales = { abiertos: 0, cerrados: 0 };
  sim.acciones = {
    getWeeklyInputsAction: async () => FILAS,
    getWeeklyCompletionStatus: async () => ESTADO,
    getWeeklyInputsHistoryAction: async () => [SEMANA, "2026-11-02"],
    getWeeklyInputsForWeekAction: async () => FILAS,
    getSalesFrameworksAction: async () => FRAMEWORKS,
    saveSalesFrameworkAction: ok,
    deleteSalesFrameworkAction: ok,
    prepareSopVideoUploadAction: async () => ({
      success: true,
      data: { signedUrl: "https://subida.invalid/v", videoPath: "org-1/v.mp4" },
    }),
    createSopVideoJobAction: async () => ({ success: true, data: JOB }),
    getSopVideoJobAction: async () => JOB,
  };
});

// ─── WeeklyInputsPageContent ─────────────────────────────────────────────────

const PROPS_DE_LA_PAGINA = {
  initialInputs: FILAS_INICIALES,
  initialCompleted: [],
  initialInputCount: 0,
  weekStart: SEMANA,
};

describe("WeeklyInputsPageContent, al recargar después de guardar", () => {
  it.each([["getWeeklyInputsAction"], ["getWeeklyCompletionStatus"]])(
    "⭐ con %s rechazada dibuja solo «No tenés acceso a Operaciones», sin lanzar",
    async (accion) => {
      await asentar(WeeklyInputsPageContent, PROPS_DE_LA_PAGINA);
      sim.acciones[accion] = rechazada;
      (sim.props.WeeklyInputForm!.onSaved as () => void)();
      await vaciar();
      expect(dibujar(WeeklyInputsPageContent, PROPS_DE_LA_PAGINA)).toBe(SOLO_SIN_ACCESO);
    }
  );

  it("con datos, la lista recibe los inputs de las actions y el progreso se actualiza", async () => {
    await asentar(WeeklyInputsPageContent, PROPS_DE_LA_PAGINA);
    expect(sim.props.WeeklyInputsList!.inputs).toEqual(
      mapWeeklyInputRowsToTeamInputs(FILAS_INICIALES)
    );
    (sim.props.WeeklyInputForm!.onSaved as () => void)();
    await vaciar();
    const html = dibujar(WeeklyInputsPageContent, PROPS_DE_LA_PAGINA);
    expect(sim.props.WeeklyInputsList!.inputs).toEqual(mapWeeklyInputRowsToTeamInputs(FILAS));
    expect(sim.props.WeeklyInputForm!.completedDepartments).toEqual(["sales", "delivery"]);
    expect(html).toContain('<span class="">2/5 departamentos</span>');
    expect(html).not.toContain("No tenés acceso");
    expect(sim.llamadas).toEqual({ getWeeklyInputsAction: 1, getWeeklyCompletionStatus: 1 });
  });
});

// ─── WeeklyInputsHistory ─────────────────────────────────────────────────────

const PROPS_DEL_HISTORIAL = { currentWeekStart: SEMANA };

describe("WeeklyInputsHistory", () => {
  it("⭐ con el historial de semanas rechazado dibuja solo «No tenés acceso a Operaciones»", async () => {
    sim.acciones.getWeeklyInputsHistoryAction = rechazada;
    expect(await asentar(WeeklyInputsHistory, PROPS_DEL_HISTORIAL)).toBe(SOLO_SIN_ACCESO);
  });

  it("⭐ con los inputs de la semana rechazados dibuja solo «No tenés acceso a Operaciones»", async () => {
    sim.acciones.getWeeklyInputsForWeekAction = rechazada;
    expect(await asentar(WeeklyInputsHistory, PROPS_DEL_HISTORIAL)).toBe(SOLO_SIN_ACCESO);
  });

  it("⭐ con la recarga de onChanged rechazada dibuja solo «No tenés acceso a Operaciones»", async () => {
    await asentar(WeeklyInputsHistory, PROPS_DEL_HISTORIAL);
    sim.acciones.getWeeklyInputsForWeekAction = rechazada;
    (sim.props.WeeklyInputsList!.onChanged as () => void)();
    await vaciar();
    expect(dibujar(WeeklyInputsHistory, PROPS_DEL_HISTORIAL)).toBe(SOLO_SIN_ACCESO);
  });

  it("⭐ con las 2 lecturas rechazadas al montar (remontaje) dibuja solo «No tenés acceso a Operaciones»", async () => {
    sim.acciones.getWeeklyInputsHistoryAction = rechazada;
    sim.acciones.getWeeklyInputsForWeekAction = rechazada;
    expect(await asentar(WeeklyInputsHistory, PROPS_DEL_HISTORIAL)).toBe(SOLO_SIN_ACCESO);
  });

  it("con datos dibuja el panel con las semanas y los inputs de la elegida", async () => {
    const html = await asentar(WeeklyInputsHistory, PROPS_DEL_HISTORIAL);
    expect(sim.props.Panel!.title).toBe("Historial de inputs");
    expect(html).toContain('<option value="2026-11-09" selected="">');
    expect(html).toContain('<option value="2026-11-02">');
    expect(sim.props.WeeklyInputsList!.inputs).toEqual(mapWeeklyInputRowsToTeamInputs(FILAS));
    expect(html).not.toContain("No tenés acceso");
  });
});

// ─── SalesFrameworksSection ──────────────────────────────────────────────────

const PROPS_DE_FRAMEWORKS = { canEdit: true };

describe("SalesFrameworksSection", () => {
  it("⭐ con la carga rechazada dibuja solo «No tenés acceso a Operaciones»", async () => {
    sim.acciones.getSalesFrameworksAction = rechazada;
    expect(await asentar(SalesFrameworksSection, PROPS_DE_FRAMEWORKS)).toBe(SOLO_SIN_ACCESO);
  });

  it("⭐ guardar con la recarga rechazada dibuja solo «No tenés acceso a Operaciones» y avisa lo guardado", async () => {
    await asentar(SalesFrameworksSection, PROPS_DE_FRAMEWORKS);
    sim.acciones.getSalesFrameworksAction = rechazada;
    sim.botones["Guardar"]!();
    await vaciar();
    expect(dibujar(SalesFrameworksSection, PROPS_DE_FRAMEWORKS)).toBe(SOLO_SIN_ACCESO);
    expect(sim.avisos.map((a) => a.title)).toContain("Framework guardado");
  });

  it("⭐ archivar con la recarga rechazada dibuja solo «No tenés acceso a Operaciones» y avisa lo archivado", async () => {
    await asentar(SalesFrameworksSection, PROPS_DE_FRAMEWORKS);
    sim.acciones.getSalesFrameworksAction = rechazada;
    sim.botones["Archivar"]!();
    await vaciar();
    expect(dibujar(SalesFrameworksSection, PROPS_DE_FRAMEWORKS)).toBe(SOLO_SIN_ACCESO);
    expect(sim.avisos.map((a) => a.title)).toContain("Framework archivado");
  });

  it("con datos lista los frameworks", async () => {
    const html = await asentar(SalesFrameworksSection, PROPS_DE_FRAMEWORKS);
    expect(html).toContain('<p class="font-medium text-foreground">Script de cierre</p>');
    expect(html).toContain('<p class="font-medium text-foreground">Objeciones de precio</p>');
    expect(html).not.toContain("No tenés acceso");
  });

  it("sin frameworks dice que todavía no hay", async () => {
    sim.acciones.getSalesFrameworksAction = async () => [];
    const html = await asentar(SalesFrameworksSection, PROPS_DE_FRAMEWORKS);
    expect(html).toContain(
      "Todavía no hay frameworks. Creá uno manualmente o usá la sugerencia RAG."
    );
  });
});

// ─── SopVideoCreator ─────────────────────────────────────────────────────────

/** El XHR de la subida: responde 200 apenas se manda. */
class XhrFalso {
  status = 200;
  responseText = "";
  upload = { addEventListener: () => {} };
  private alCargar: () => void = () => {};
  open() {}
  setRequestHeader() {}
  addEventListener(evento: string, escuchar: () => void) {
    if (evento === "load") this.alCargar = escuchar;
  }
  send() {
    this.alCargar();
  }
}

describe("SopVideoCreator, con un trabajo de video en curso", () => {
  const generados: Array<[string, string | null]> = [];
  const props = {
    onGenerated: (markdown: string, title: string | null) => {
      generados.push([markdown, title]);
    },
  };

  beforeEach(() => {
    generados.length = 0;
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    (globalThis as Record<string, unknown>).XMLHttpRequest = XhrFalso;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).XMLHttpRequest;
  });

  /** Elige el archivo y aprieta «Generar el SOP desde el video», como la persona. */
  async function empezarUnTrabajo(): Promise<void> {
    dibujar(SopVideoCreator, props);
    const archivo = buscar(ultimo, (e) => e.type === "input" && e.props.type === "file");
    (archivo!.props.onChange as (evento: unknown) => void)({
      target: { files: [{ name: "pago.mp4", size: 1000, type: "video/mp4" }] },
    });
    dibujar(SopVideoCreator, props);
    await sim.botones["Generar el SOP desde el video"]!();
    await vaciar();
    dibujar(SopVideoCreator, props);
    expect(sim.canales.abiertos).toBe(1);
  }

  it("⭐ con el sondeo rechazado dibuja solo «No tenés acceso a Operaciones» y deja de sondear", async () => {
    await empezarUnTrabajo();
    sim.acciones.getSopVideoJobAction = rechazada;
    await vi.advanceTimersByTimeAsync(10_000);
    await vaciar();
    expect(dibujar(SopVideoCreator, props)).toBe(SOLO_SIN_ACCESO);
    expect(sim.llamadas.getSopVideoJobAction).toBe(1);
    expect(sim.canales.cerrados).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    await vaciar();
    expect(sim.llamadas.getSopVideoJobAction).toBe(1);
  });

  it("con datos sigue sondeando cada 10 s y entrega el markdown cuando queda listo", async () => {
    await empezarUnTrabajo();
    await vi.advanceTimersByTimeAsync(10_000);
    await vaciar();
    const html = dibujar(SopVideoCreator, props);
    expect(sim.llamadas.getSopVideoJobAction).toBe(1);
    expect(html).toContain('<span class="text-sm font-medium">Escribiendo el SOP…</span>');
    sim.acciones.getSopVideoJobAction = async () => ({
      ...JOB,
      status: "ready",
      generatedMarkdown: "# Pago manual",
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await vaciar();
    dibujar(SopVideoCreator, props);
    expect(sim.llamadas.getSopVideoJobAction).toBe(2);
    expect(generados).toEqual([["# Pago manual", "Pago manual"]]);
    expect(sim.canales.cerrados).toBe(0);
  });
});

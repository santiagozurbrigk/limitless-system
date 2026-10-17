import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPlatformNavigation } from "@/lib/navigation/build-platform-navigation";
import { modulesWithChildren } from "@/lib/navigation/sidebar-modules";
import { LISTED_INTEGRATIONS } from "@/lib/integrations/registry";
import { canalesDeLeadMagnetVisibles } from "@/lib/marketing/lead-magnet-canales";
import { paths } from "@/routes/paths";
import { analizarFuente, revisarMocksDeEscondido } from "./mocks-de-escondido";

const WEB = fileURLToPath(new URL("../../../", import.meta.url));

/** Los archivos que hoy mockean ESCONDIDO (uno de `lib/` y cuatro de `app/`). */
const MOCKS_CONOCIDOS = [
  "app/(platform)/integrations/__tests__/pagina-integraciones-landing.test.ts",
  "app/integrations/__tests__/panorama-con-landing.test.ts",
  "app/marketing/__tests__/llamadores-errores-como-valor.test.ts",
  "app/webinar/__tests__/claves-de-ingesta-errores-como-valor.test.ts",
  "lib/webinar/__tests__/landing-en-integraciones.test.ts",
];

/**
 * SCRUM-490: lo escondido para el release no aparece en ningún lado — ni en el
 * menú ni en el buscador ⌘K ni en el catálogo de integraciones.
 */
describe("escondido para el release", () => {
  const todosLosHrefs = buildPlatformNavigation().flatMap((item) => [
    item.href,
    ...(item.children ?? []).map((c) => c.href),
  ]);

  it("el ⌘K no lista ninguna pantalla escondida del menú", () => {
    const escondidos = Object.values(modulesWithChildren)
      .flatMap((m) => m.children)
      .filter((c) => c.hidden)
      .map((c) => c.href);

    expect(escondidos.length).toBeGreaterThan(0);
    for (const href of escondidos) expect(todosLosHrefs).not.toContain(href);
  });

  it("el ⌘K no lleva al Overview de Marketing; Marketing entra por Contenido", () => {
    expect(todosLosHrefs).not.toContain(paths.platform.marketing.overview);
    const marketing = buildPlatformNavigation().find((i) => i.label === "Marketing");
    expect(marketing?.href).toBe(paths.platform.marketing.content);
  });

  it("el catálogo de integraciones no ofrece ManyChat", () => {
    expect(LISTED_INTEGRATIONS.map((d) => d.provider)).not.toContain("manychat");
  });

  it("todo mock de ESCONDIDO parte del objeto real (SCRUM-527)", () => {
    // Un mock con sólo las banderas que el test conoce deja las demás en
    // `undefined`, que se lee como visible: la Landing corría en el test de
    // Marketing sin que nadie lo supiera. Qué cuenta como mock y qué se exige:
    // `mocks-de-escondido.ts` (AST de TypeScript); los casos del bloque de abajo
    // prueban que lo detecta.
    const { archivos, mocks, problemas } = revisarMocksDeEscondido(WEB);
    expect(problemas).toEqual([]);
    // Testigo del recorrido (AR pasada 3): si queda ciego (no encuentra tests,
    // saltea una carpeta o los helpers de __tests__), esto falla.
    expect(mocks).toEqual(expect.arrayContaining(MOCKS_CONOCIDOS));
    expect(archivos).toEqual(
      expect.arrayContaining([
        "lib/webinar/__tests__/base-falsa-de-claves.ts",
        "lib/release/__tests__/mocks-de-escondido.ts",
      ]),
    );
  });

  it("el catálogo de integraciones no ofrece la Landing de Webinars (SCRUM-527)", () => {
    expect(LISTED_INTEGRATIONS.map((d) => d.provider)).not.toContain("landing");
  });

  it("Lead Magnets ofrece sólo los canales que no prometen una captura falsa", () => {
    const canales = ["manychat", "instagram_dm", "typeform", "google_forms", "landing", "manual"].map(
      (value) => ({ value })
    );
    expect(canalesDeLeadMagnetVisibles(canales).map((c) => c.value)).toEqual([
      "instagram_dm",
      "manual",
    ]);
    expect(canalesDeLeadMagnetVisibles(canales, false)).toHaveLength(6);
  });
});

/**
 * El control de los mocks de ESCONDIDO contra fuentes armadas acá (AR pasadas
 * 2 y 3): tiene que encontrar el mock parcial en todas sus formas y aceptar el
 * que parte del real. Las fuentes son textos: el AST del recorrido no las toma
 * por llamadas.
 */
describe("el control de los mocks de ESCONDIDO", () => {
  const ARCHIVO = join(WEB, "lib/algo/__tests__/x.test.ts");
  const PARCIAL = "() => ({ ESCONDIDO: { marketingOverview: false } })";
  const revisar = (fuente: string, archivo = ARCHIVO) => analizarFuente(fuente, archivo, WEB);
  const unProblema = (fuente: string) => {
    const resultados = revisar(fuente);
    expect(resultados).toHaveLength(1);
    expect(resultados[0].ok).toBe(false);
    return resultados[0];
  };

  // Las 7 evasiones de la pasada 2.
  it.each([
    ["comillas dobles", `vi.mock("@/lib/release/escondido", ${PARCIAL});`],
    ["comillas simples", `vi.mock('@/lib/release/escondido', ${PARCIAL});`],
    ["backticks", "vi.mock(`@/lib/release/escondido`, " + PARCIAL + ");"],
    ["ruta relativa", `vi.mock("../../release/escondido", ${PARCIAL});`],
    ["ruta relativa con extensión", `vi.mock('../../release/escondido.ts', ${PARCIAL});`],
    ["import()", `vi.mock(import("@/lib/release/escondido"), ${PARCIAL});`],
    ["vi.doMock en varias líneas", "vi\n  .doMock(\n    `@/lib/release/escondido`,\n    " + PARCIAL + ",\n  );"],
  ])("detecta el mock parcial con %s", (_caso, fuente) => {
    unProblema(fuente);
  });

  it("nombrar la forma correcta en un comentario no alcanza", () => {
    unProblema(
      `vi.mock("@/lib/release/escondido", () => ({\n` +
        `  // async (importOriginal) => { const real = await importOriginal(); ...real.ESCONDIDO }\n` +
        `  ESCONDIDO: { marketingOverview: false },\n}));`,
    );
  });

  it("F1: detecta el mock sobre un alias de vi (import { vi as v }, namespace, const)", () => {
    unProblema(`import { it, vi as v } from "vitest";\nv.mock("@/lib/release/escondido", ${PARCIAL});`);
    unProblema(`import * as V from "vitest";\nV.vi.mock("@/lib/release/escondido", ${PARCIAL});`);
    unProblema(`import { vi } from "vitest";\nconst w = vi;\nw.doMock("@/lib/release/escondido", ${PARCIAL});`);
    unProblema(`vi["mock"]("@/lib/release/escondido", ${PARCIAL});`);
  });

  it("F2: un regex literal con comillas antes del mock no lo tapa", () => {
    unProblema(`const APOSTROFE = /'/;\nconst COMILLAS = /"/g;\nvi.mock("@/lib/release/escondido", ${PARCIAL});`);
  });

  it("F3: no alcanza con usar importOriginal y ...real.ESCONDIDO en otro lado de la fábrica", () => {
    const r = unProblema(
      `vi.mock("@/lib/release/escondido", async (importOriginal) => {\n` +
        `  const real = await importOriginal<typeof import("@/lib/release/escondido")>();\n` +
        `  const anterior = { ...real.ESCONDIDO };\n` +
        `  void anterior;\n` +
        `  return { ESCONDIDO: { marketingOverview: false } };\n});`,
    );
    expect(r.problema).toBe("el ESCONDIDO devuelto no parte de ...real.ESCONDIDO");
  });

  it("F3: tampoco si una de las salidas de la fábrica devuelve un ESCONDIDO parcial", () => {
    unProblema(
      `vi.mock("@/lib/release/escondido", async (importOriginal) => {\n` +
        `  const real = await importOriginal();\n` +
        `  if (Math.random() > 2) return { ESCONDIDO: { marketingOverview: false } };\n` +
        `  return { ESCONDIDO: { ...real.ESCONDIDO } };\n});`,
    );
  });

  it("F4: el recorrido incluye los helpers de __tests__, no sólo los *.test.ts", () => {
    const helper = join(WEB, "lib/algo/__tests__/ayuda.ts");
    expect(revisar(`import { vi } from "vitest";\nvi.mock("@/lib/release/escondido", ${PARCIAL});`, helper)[0]?.ok).toBe(false);
    // y el recorrido real los lista (ver el testigo del test de arriba)
  });

  it("F5: un primer argumento que no es un texto fijo es problema siempre, diga o no escondido", () => {
    const r = unProblema(
      `const m = vi.hoisted(() => ({ ruta: "@/lib/release/escondido" }));\nvi.mock(m.ruta, ${PARCIAL});`,
    );
    expect(r.problema).toBe("no se puede resolver a qué módulo apunta");
    unProblema("vi.mock(`@/lib/release/${'escondido'}`, " + PARCIAL + ");");
    unProblema(`const otro = "@/lib/otra/cosa";\nvi.mock(otro, () => ({}));`);
  });

  it("F6: un archivo con regex de comillas sueltas, como share-link.test.ts", () => {
    unProblema(
      `const limpiar = (s: string) => s.replace(/"/g, "").replace(/'/g, "");\n` +
        `void limpiar;\nvi.mock("@/lib/release/escondido", ${PARCIAL});`,
    );
  });

  it("sin fábrica, o con una fábrica que no recibe importOriginal, es problema", () => {
    unProblema(`vi.mock("@/lib/release/escondido");`);
    unProblema(`vi.mock("@/lib/release/escondido", async () => ({ ESCONDIDO: {} }));`);
  });

  it("acepta el mock que parte del real: getter, comillas simples, ruta relativa o el módulo entero", () => {
    const real =
      `async (importOriginal) => {\n` +
      `  const real = await importOriginal<typeof import("@/lib/release/escondido")>();\n` +
      `  return { ESCONDIDO: { ...real.ESCONDIDO, get ingestaLanding() { return false; } } };\n}`;
    expect(revisar(`vi.mock('@/lib/release/escondido', ${real});`)).toEqual([
      { especificador: "@/lib/release/escondido", ok: true, problema: "" },
    ]);
    expect(revisar(`vi.doMock("../../release/escondido", ${real});`)[0]?.ok).toBe(true);
    expect(
      revisar(
        `vi.mock("@/lib/release/escondido", async (importOriginal) => {\n` +
          `  const real = await importOriginal();\n  return { ...real };\n});`,
      )[0]?.ok,
    ).toBe(true);
  });

  it("ignora los mocks de otros módulos, las rutas que no llegan y lo que no es mock", () => {
    expect(revisar(`vi.mock("@/lib/release/otro", ${PARCIAL});`)).toEqual([]);
    expect(revisar(`vi.mock("../escondido", ${PARCIAL});`)).toEqual([]);
    expect(revisar(`vi.mocked(algo); vi.doUnmock("@/lib/release/escondido"); otro.mock("@/lib/release/escondido");`)).toEqual([]);
    expect(revisar(`const texto = 'vi.mock("@/lib/release/escondido", () => ({}))';`)).toEqual([]);
  });
});

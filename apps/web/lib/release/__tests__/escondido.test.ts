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
    // `mocks-de-escondido.ts`; los casos de abajo prueban que lo detecta.
    const { problemas } = revisarMocksDeEscondido(WEB);
    expect(problemas).toEqual([]);
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
 * El control de los mocks de ESCONDIDO, contra fuentes armadas acá (AR pasada
 * 2): tiene que encontrar el mock parcial en todas sus formas. Las fuentes se
 * arman concatenando, así el recorrido del repo no las toma por mocks reales.
 */
describe("el control de los mocks de ESCONDIDO", () => {
  const VI = "vi";
  const BT = String.fromCharCode(96);
  const ARCHIVO = join(WEB, "lib/algo/__tests__/x.test.ts");
  const parcial = (especificador: string, llamada = "mock") =>
    `${VI}.${llamada}(${especificador}, () => ({ ESCONDIDO: { marketingOverview: false } }));`;
  const desdeElReal = (especificador: string) =>
    `${VI}.mock(${especificador}, async (importOriginal) => {\n` +
    `  const real = await importOriginal<typeof import("@/lib/release/escondido")>();\n` +
    `  return { ESCONDIDO: { ...real.ESCONDIDO, marketingOverview: false } };\n});`;
  const revisar = (fuente: string, archivo = ARCHIVO) => analizarFuente(fuente, archivo, WEB);

  it.each([
    ["comillas dobles", '"@/lib/release/escondido"'],
    ["comillas simples", "'@/lib/release/escondido'"],
    ["backticks", `${BT}@/lib/release/escondido${BT}`],
    ["ruta relativa", '"../../release/escondido"'],
    ["ruta relativa con extensión", "'../../release/escondido.ts'"],
    ["import()", 'import("@/lib/release/escondido")'],
  ])("detecta el mock parcial con %s", (_caso, especificador) => {
    const [r] = revisar(parcial(especificador));
    expect(r?.ok).toBe(false);
  });

  it("detecta vi.doMock y una llamada partida en varias líneas", () => {
    expect(revisar(parcial("'@/lib/release/escondido'", "doMock"))[0]?.ok).toBe(false);
    expect(revisar(`${VI}\n  .mock(\n  '@/lib/release/escondido',\n  () => ({ ESCONDIDO: {} }),\n);`)[0]?.ok).toBe(false);
  });

  it("nombrar importOriginal y ...real.ESCONDIDO en un comentario no alcanza", () => {
    const fuente =
      `${VI}.mock("@/lib/release/escondido", () => ({\n` +
      `  // async (importOriginal) => { const real = await importOriginal(); ...real.ESCONDIDO }\n` +
      `  ESCONDIDO: { marketingOverview: false },\n}));`;
    expect(revisar(fuente)[0]?.ok).toBe(false);
  });

  it("un especificador que no es un texto fijo cuenta como problema", () => {
    expect(revisar(`${VI}.mock(${BT}@/lib/release/\${"escondido"}${BT}, () => ({}));`)[0]?.ok).toBe(false);
  });

  it("acepta el mock que parte del real, con comillas simples o ruta relativa", () => {
    expect(revisar(desdeElReal("'@/lib/release/escondido'"))[0]?.ok).toBe(true);
    expect(revisar(desdeElReal('"../../release/escondido"'))[0]?.ok).toBe(true);
  });

  it("ignora los mocks de otros módulos y las rutas relativas que no llegan al módulo", () => {
    expect(revisar(parcial('"@/lib/release/otro"'))).toEqual([]);
    expect(revisar(parcial('"../escondido"'))).toEqual([]);
    expect(revisar(`${VI}.mocked(algo); ${VI}.doUnmock("@/lib/release/escondido");`)).toEqual([]);
  });
});

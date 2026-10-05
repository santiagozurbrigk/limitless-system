import { afterEach, describe, expect, it } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import { aFechaDeInput, fechaAInstanteLocal } from "@/lib/fechas/calendario";
import {
  BUILT_IN_CATALOG,
  DIAS_HASTA_EL_PROXIMO_PASO,
  fechaPropuestaDelProximoPaso,
  buildFollowUpCatalog,
  closesThread,
  closingActionSlugs,
  findOption,
  needsDate,
  optionLabel,
  selectableOptions,
  slugifyOptionLabel,
  type FollowUpOption,
} from "@/lib/sales/follow-up-options";

function custom(over: Partial<FollowUpOption> = {}): FollowUpOption {
  return {
    id: "opt-1",
    kind: "next_action",
    slug: "esperando_pago",
    label: "Esperando pago",
    color: "amber",
    behavior: "needs_date",
    sortOrder: 0,
    builtIn: false,
    archived: false,
    ...over,
  };
}

describe("el catálogo junta lo de fábrica con lo propio", () => {
  it("los valores de fábrica están sin que la organización cargue nada", () => {
    const catalog = buildFollowUpCatalog([]);
    expect(catalog.nextActions.map((o) => o.slug)).toEqual([
      "reschedule",
      "follow_up",
      "waiting_lead",
      "lost",
    ]);
    expect(catalog.qualifications).toHaveLength(4);
  });

  it("los propios van después de los de fábrica, en su orden", () => {
    const catalog = buildFollowUpCatalog([
      custom({ slug: "b", label: "B", sortOrder: 1 }),
      custom({ slug: "a", label: "A", sortOrder: 0 }),
    ]);
    expect(catalog.nextActions.slice(-2).map((o) => o.slug)).toEqual(["a", "b"]);
  });

  it("un valor propio no puede pisar a uno de fábrica", () => {
    // Si pudiera, alguien podría hacer que `lost` deje de cerrar el hilo y los
    // leads perdidos volverían a la cola para siempre.
    const catalog = buildFollowUpCatalog([
      custom({ slug: "lost", label: "Perdido mío", behavior: "needs_date" }),
    ]);
    const lost = findOption(catalog.nextActions, "lost");
    expect(lost?.builtIn).toBe(true);
    expect(lost?.behavior).toBe("closes_thread");
    expect(catalog.nextActions.filter((o) => o.slug === "lost")).toHaveLength(1);
  });

  it("una calificación propia no se mezcla con los próximos pasos", () => {
    const catalog = buildFollowUpCatalog([
      custom({ kind: "qualification", slug: "vip", label: "VIP", behavior: "neutral" }),
    ]);
    expect(catalog.nextActions.some((o) => o.slug === "vip")).toBe(false);
    expect(catalog.qualifications.some((o) => o.slug === "vip")).toBe(true);
  });
});

describe("el comportamiento es lo que importa, no el nombre", () => {
  it("un valor propio puede cerrar el hilo igual que `lost`", () => {
    const catalog = buildFollowUpCatalog([
      custom({ slug: "derivado", label: "Derivado a socio", behavior: "closes_thread" }),
    ]);
    expect(closesThread(catalog.nextActions, "derivado")).toBe(true);
    expect(needsDate(catalog.nextActions, "derivado")).toBe(false);
    expect(closingActionSlugs(catalog.nextActions).sort()).toEqual(["derivado", "lost"]);
  });

  it("un valor propio que pide fecha se comporta como `follow_up`", () => {
    const catalog = buildFollowUpCatalog([custom()]);
    expect(needsDate(catalog.nextActions, "esperando_pago")).toBe(true);
    expect(closesThread(catalog.nextActions, "esperando_pago")).toBe(false);
  });

  it("un slug desconocido pide fecha: es la respuesta prudente", () => {
    // Si el valor se archivó o se perdió, exigir la fecha mantiene al lead en la
    // cola en vez de dejarlo caer sin que nadie se entere.
    expect(needsDate(BUILT_IN_CATALOG.nextActions, "fantasma")).toBe(true);
    expect(closesThread(BUILT_IN_CATALOG.nextActions, "fantasma")).toBe(false);
  });

  it("sin valor no hay fecha que pedir", () => {
    expect(needsDate(BUILT_IN_CATALOG.nextActions, null)).toBe(false);
  });
});

describe("nada se borra ni se blanquea", () => {
  it("un valor archivado no se puede elegir pero sigue teniendo etiqueta", () => {
    const catalog = buildFollowUpCatalog([custom({ archived: true })]);
    expect(
      selectableOptions(catalog.nextActions).some((o) => o.slug === "esperando_pago")
    ).toBe(false);
    expect(optionLabel(catalog.nextActions, "esperando_pago")).toBe("Esperando pago");
  });

  it("un slug que ya no está en el catálogo se muestra tal cual, no vacío", () => {
    expect(optionLabel(BUILT_IN_CATALOG.nextActions, "valor_viejo")).toBe("valor_viejo");
  });

  it("sin slug no hay etiqueta", () => {
    expect(optionLabel(BUILT_IN_CATALOG.nextActions, null)).toBeNull();
  });
});

describe("el slug que sale de lo que escribe el usuario", () => {
  it("normaliza acentos, espacios y mayúsculas", () => {
    expect(slugifyOptionLabel("Esperando Señal del líder")).toBe(
      "esperando_senal_del_lider"
    );
  });

  it("una etiqueta sin caracteres usables no genera un slug vacío", () => {
    const slug = slugifyOptionLabel("🔥");
    expect(slug).not.toBe("");
    expect(slug.startsWith("valor_")).toBe(true);
  });
});

/**
 * SCRUM-493: la fecha que proponen el modal de resultado de la llamada, el
 * seguimiento del lead y la tabla de leads. A las 22:00 de Argentina UTC ya es
 * el día siguiente: con `toISOString()` la propuesta salía un día corrida.
 */
describe("⭐ fecha propuesta del próximo paso", () => {
  /** 1-oct-2026, 22:00 en Buenos Aires = 2-oct, 01:00 UTC. */
  const lasVeintidos = new Date("2026-10-02T01:00:00Z");

  afterEach(restaurarZona);

  it("a las 22:00 de Argentina es ese día más los días del paso", () => {
    conZona("America/Argentina/Buenos_Aires");
    expect(DIAS_HASTA_EL_PROXIMO_PASO).toBe(2);
    expect(fechaPropuestaDelProximoPaso(lasVeintidos)).toBe("2026-10-03");
  });

  it("cruza fin de mes y de año", () => {
    conZona("America/Argentina/Buenos_Aires");
    // 30-dic 22:00 en Buenos Aires = 31-dic 01:00 UTC.
    expect(fechaPropuestaDelProximoPaso(new Date("2026-12-31T01:00:00Z"))).toBe("2027-01-01");
    // 30-sep 23:30 en Buenos Aires = 1-oct 02:30 UTC.
    expect(fechaPropuestaDelProximoPaso(new Date("2026-10-01T02:30:00Z"))).toBe("2026-10-02");
  });

  it("guardada como timestamptz, la tabla de leads la muestra igual", () => {
    conZona("America/Argentina/Buenos_Aires");
    const propuesta = fechaPropuestaDelProximoPaso(lasVeintidos);
    expect(aFechaDeInput(fechaAInstanteLocal(propuesta))).toBe(propuesta);
  });
});

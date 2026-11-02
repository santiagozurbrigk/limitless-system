/**
 * SCRUM-542: las seis vistas armadas con el escenario de ejemplo. El contrato
 * es estable (las claves de cada vista), el escenario cubre los cinco estados y
 * los números son coherentes entre sí.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  calcularConfiguracionDelLanzamiento,
  calcularDetalleDelLanzamiento,
  calcularFichaDelLead,
  calcularInicio,
  calcularLeads,
  calcularListaDeLanzamientos,
} from "../calcular";
import { ESTADOS_DEL_DATO, type Dato, type EstadoDelDato } from "../dato";
import { FILTROS_DE_LEADS, LEADS_POR_PAGINA, type PasoDelEmbudoId } from "../contratos";
import { escenarioDeEjemplo } from "../escenario-de-ejemplo";

const AHORA = new Date("2026-11-01T15:30:00Z");
const filas = escenarioDeEjemplo(AHORA);
const [ACTIVO, CERRADO] = filas.lanzamientos;

const inicio = calcularInicio(filas, AHORA, true, null);
const lista = calcularListaDeLanzamientos(filas, AHORA, true);
const detalle = calcularDetalleDelLanzamiento(filas, ACTIVO.id, AHORA, true)!;
const leads = calcularLeads(filas, {}, AHORA, true);
const conLlamada = filas.estadosDeVenta.find(
  (s) => s.launch_id === ACTIVO.id && s.stage === "purchased"
)!;
const ficha = calcularFichaDelLead(filas, conLlamada.lead_id, null, AHORA, true)!;
const configuracion = calcularConfiguracionDelLanzamiento(filas, ACTIVO.id, true)!;
const VISTAS = { inicio, lista, detalle, leads, ficha, configuracion };

function esDato(x: unknown): x is Dato<unknown> {
  return (
    typeof x === "object" &&
    x !== null &&
    "state" in x &&
    "value" in x &&
    "source" in x &&
    "reason" in x &&
    "measuredAt" in x &&
    (ESTADOS_DEL_DATO as readonly unknown[]).includes((x as { state: unknown }).state)
  );
}

/** Todos los `Dato` de una vista, incluidos los que están dentro del valor de otro. */
function datos(x: unknown, encontrados: Dato<unknown>[] = []): Dato<unknown>[] {
  if (Array.isArray(x)) x.forEach((y) => datos(y, encontrados));
  else if (typeof x === "object" && x !== null) {
    if (esDato(x)) encontrados.push(x);
    Object.values(x).forEach((y) => datos(y, encontrados));
  }
  return encontrados;
}

function paso(embudo: { paso: PasoDelEmbudoId; personas: Dato<number> }[], id: PasoDelEmbudoId) {
  return embudo.find((p) => p.paso === id)!.personas;
}

describe("contrato estable", () => {
  // Si cambia una clave, cambian las pantallas: que sea a propósito y con el doc.
  it("las claves de cada vista", () => {
    const claves = (o: object) => Object.keys(o).sort();
    expect(claves(inicio)).toEqual(["activo", "esEjemplo"]);
    expect(claves(inicio.activo.value!)).toEqual(
      [
        "anuncios",
        "diasParaElCierre",
        "embudo",
        "fuentes",
        "lanzamiento",
        "pendientesDelEquipo",
        "proximaSesion",
        "registrados",
        "registradosUltimas24h",
        "sesiones",
        "tasas",
        "ventas",
      ].sort()
    );
    expect(claves(lista)).toEqual(["esEjemplo", "lanzamientos"]);
    expect(claves(lista.lanzamientos.value![0])).toEqual(
      ["asistieron", "ingresos", "lanzamiento", "registrados", "ventas"].sort()
    );
    expect(claves(detalle)).toEqual(
      ["anuncios", "embudo", "esEjemplo", "fuentes", "lanzamiento", "origenes", "sesiones", "tasas", "ventas"].sort()
    );
    expect(claves(leads)).toEqual(
      ["busqueda", "esEjemplo", "filas", "filtroElegido", "filtros", "lanzamientoElegido", "lanzamientos", "siguienteCursor", "total"].sort()
    );
    expect(claves(leads.filas.value![0])).toEqual(
      ["email", "etapa", "leadId", "nombre", "origen", "registradoAt", "responsable", "telefono", "ultimoContactoAt"].sort()
    );
    expect(claves(ficha)).toEqual(
      ["avisosDeFuentes", "compras", "equipo", "esEjemplo", "estadoDeVenta", "lanzamientoElegido", "lead", "lineaDeTiempo", "notas", "registros", "whatsappUrl"].sort()
    );
    expect(claves(configuracion)).toEqual(
      ["campanas", "esEjemplo", "faltantes", "fuentes", "lanzamiento", "productos", "sesiones"].sort()
    );
    expect(claves(detalle.lanzamiento)).toEqual(
      ["cerradoAt", "cierraEl", "captaDesde", "estado", "id", "moneda", "nombre", "precioDeLaOferta", "variante"].sort()
    );
  });

  it("todas las vistas del escenario dicen que son de ejemplo", () => {
    for (const vista of Object.values(VISTAS)) expect(vista.esEjemplo).toBe(true);
  });

  it("todo Dato tiene motivo si no está medido, y valor sólo si se midió", () => {
    for (const d of Object.values(VISTAS).flatMap((v) => datos(v))) {
      if (d.state === "medido") expect(d.reason).toBeNull();
      else expect(typeof d.reason === "string" && d.reason.length > 0).toBe(true);
      if (d.state === "medido" || d.state === "desactualizado") {
        expect(d.measuredAt).not.toBeNull();
      } else {
        expect(d.value).toBeNull();
      }
    }
  });

  it("las vistas son JSON serializable (viajan de Server a Client Components)", () => {
    for (const vista of Object.values(VISTAS)) {
      expect(JSON.parse(JSON.stringify(vista))).toEqual(vista);
    }
  });
});

describe("el escenario cubre los cinco estados", () => {
  it("entre las seis vistas aparecen los cinco", () => {
    const estados = new Set<EstadoDelDato>(Object.values(VISTAS).flatMap((v) => datos(v).map((d) => d.state)));
    expect([...estados].sort()).toEqual([...ESTADOS_DEL_DATO].sort());
  });

  it("y cada uno en el número que corresponde", () => {
    const activo = inicio.activo.value!;
    expect(paso(activo.embudo, "registrados").state).toBe("medido");
    expect(paso(activo.embudo, "asistieron").state).toBe("medido");
    expect(activo.ventas.ventas.state).toBe("medido");
    // GoHighLevel sin conectar.
    expect(paso(activo.embudo, "confirmaron_el_email")).toMatchObject({ state: "sin_fuente", source: "ghl" });
    // La sesión 2 no tiene minuto de la oferta: ella y el total.
    expect(activo.sesiones[1].seQuedaronALaOferta?.state).toBe("falta_configurar");
    expect(activo.sesiones[0].seQuedaronALaOferta?.state).toBe("medido");
    expect(paso(activo.embudo, "se_quedaron_a_la_oferta").state).toBe("falta_configurar");
    // Meta Ads leído hace 3 días: la inversión y lo que sale de ella.
    expect(activo.anuncios!.inversion).toMatchObject({ state: "desactualizado", source: "meta_ads" });
    expect(activo.anuncios!.inversion.value).toBeGreaterThan(0);
    expect(activo.anuncios!.costoPorRegistro.state).toBe("desactualizado");
    expect(activo.anuncios!.roas.state).toBe("desactualizado");
    // Commas falló.
    expect(activo.ventas.ventasVip).toMatchObject({ state: "error", source: "commas", value: null });
  });

  it("la ficha avisa las fuentes que no están al día", () => {
    expect(ficha.avisosDeFuentes.map((f) => [f.fuente, f.state])).toEqual([
      ["ghl", "sin_fuente"],
      ["commas", "error"],
    ]);
  });
});

describe("coherencia de los números", () => {
  it("el embudo medido no crece de un paso al siguiente (salvo compraron, ver abajo)", () => {
    for (const embudo of [inicio.activo.value!.embudo, calcularDetalleDelLanzamiento(filas, CERRADO.id, AHORA, true)!.embudo]) {
      const medidos = embudo
        .filter((p) => p.paso !== "compraron" && p.personas.state === "medido")
        .map((p) => p.personas.value as number);
      expect(medidos.length).toBeGreaterThanOrEqual(6);
      for (let i = 1; i < medidos.length; i += 1) expect(medidos[i]).toBeLessThanOrEqual(medidos[i - 1]);
      // Compraron incluye a quien compró en la oferta sin llamada: puede
      // superar a "asistieron a la llamada", nunca a los asistentes.
      expect(paso(embudo, "compraron").value as number).toBeLessThanOrEqual(paso(embudo, "asistieron").value as number);
    }
  });

  it("no hay más compradores que asistentes ni asistentes que registrados", () => {
    for (const fila of lista.lanzamientos.value!) {
      expect(fila.ventas.value!).toBeLessThanOrEqual(fila.asistieron.value!);
      expect(fila.asistieron.value!).toBeLessThanOrEqual(fila.registrados.value!);
    }
  });

  it("sin nadie que repita sesión, la asistencia total coincide con la suma de las sesiones", () => {
    const activo = inicio.activo.value!;
    const suma = activo.sesiones.reduce((t, s) => t + (s.asistieron?.value ?? 0), 0);
    expect(paso(activo.embudo, "asistieron").value).toBe(suma);
  });

  it("quien asiste a dos sesiones cuenta una vez en Asistieron (personas distintas)", () => {
    const [s1, s2] = filas.sesiones;
    const repite = filas.eventos.find((e) => e.kind === "attended" && e.data.session_id === s1.id)!;
    const conRepetido = {
      ...filas,
      eventos: [
        ...filas.eventos,
        { ...repite, id: "repite-sesion-2", occurred_at: s2.starts_at, data: { session_id: s2.id } },
      ],
    };
    const v = calcularDetalleDelLanzamiento(conRepetido, ACTIVO.id, AHORA, false)!;
    // La sesión 2 suma a quien vino otra vez; el total de personas no cambia.
    expect(v.sesiones[1].asistieron!.value).toBe((detalle.sesiones[1].asistieron!.value as number) + 1);
    expect(paso(v.embudo, "asistieron")).toEqual(paso(detalle.embudo, "asistieron"));
    const l = calcularLeads(conRepetido, {}, AHORA, false);
    const n = (f: string) => l.filtros.find((x) => x.filtro === f)!.personas.value as number;
    expect(n("registrado_sin_asistir") + (paso(v.embudo, "asistieron").value as number)).toBe(n("todos"));
    expect(v.tasas.asistencia.value as number).toBeLessThanOrEqual(1);
  });

  it("los ingresos son las ventas por el precio, menos los reembolsos", () => {
    for (const fila of lista.lanzamientos.value!) {
      const precio = fila.lanzamiento.precioDeLaOferta!;
      const reembolsos = filas.eventos.filter(
        (e) => e.launch_id === fila.lanzamiento.id && e.kind === "refunded"
      ).length;
      expect(fila.ingresos.value).toBe((fila.ventas.value! - reembolsos) * precio);
    }
  });

  it("las tasas salen de los conteos", () => {
    const { tasas, embudo } = inicio.activo.value!;
    expect(tasas.asistencia.value).toBeCloseTo(
      (paso(embudo, "asistieron").value as number) / (paso(embudo, "registrados").value as number)
    );
  });

  it("inicio, lista y detalle dicen lo mismo del lanzamiento activo", () => {
    const fila = lista.lanzamientos.value!.find((f) => f.lanzamiento.id === ACTIVO.id)!;
    expect(fila.registrados).toEqual(paso(detalle.embudo, "registrados"));
    expect(fila.ventas).toEqual(detalle.ventas.ventas);
    expect(inicio.activo.value!.embudo).toEqual(detalle.embudo);
  });

  it("los registros por origen suman los registrados", () => {
    const total = detalle.origenes.value!.reduce((t, o) => t + o.registros, 0);
    expect(total).toBe(paso(detalle.embudo, "registrados").value);
  });

  it("el activo cierra en 3 días y su próxima sesión no existe (las dos ya ocurrieron)", () => {
    expect(inicio.activo.value!.diasParaElCierre).toBe(3);
    expect(inicio.activo.value!.proximaSesion).toBeNull();
    expect(inicio.activo.value!.registradosUltimas24h.value).toBeGreaterThan(0);
  });

  it("los días al cierre se cuentan desde el hoy de la zona de la organización", () => {
    // 15:30 UTC del 1-nov: en Buenos Aires es 1-nov; en Auckland, ya 2-nov.
    expect(calcularInicio(filas, AHORA, true, "America/Argentina/Buenos_Aires").activo.value!.diasParaElCierre).toBe(3);
    expect(calcularInicio(filas, AHORA, true, "Pacific/Auckland").activo.value!.diasParaElCierre).toBe(2);
  });

  it("el escenario arma sus fechas en la zona de la org: cierra en 3 días a cualquier hora", () => {
    // 01:30 UTC del 2-nov = 22:30 del 1-nov en Buenos Aires.
    const t = new Date("2026-11-02T01:30:00Z");
    for (const zona of ["America/Argentina/Buenos_Aires", "Pacific/Kiritimati", "Pacific/Honolulu", "Pacific/Auckland"]) {
      expect(calcularInicio(escenarioDeEjemplo(t, zona), t, true, zona).activo.value!.diasParaElCierre).toBe(3);
    }
  });

  it("la lista pone el activo primero", () => {
    expect(lista.lanzamientos.value!.map((f) => f.lanzamiento.estado)).toEqual(["active", "closed"]);
  });
});

describe("Leads", () => {
  it("por defecto, el lanzamiento activo y el filtro todos", () => {
    expect(leads.lanzamientoElegido?.id).toBe(ACTIVO.id);
    expect(leads.filtroElegido).toBe("todos");
    expect(leads.filtros.map((f) => f.filtro)).toEqual([...FILTROS_DE_LEADS]);
  });

  it("los conteos de los filtros cuadran con el embudo", () => {
    const n = (f: string) => leads.filtros.find((x) => x.filtro === f)!.personas.value as number;
    const embudo = detalle.embudo;
    expect(n("todos")).toBe(paso(embudo, "registrados").value);
    expect(n("registrado_sin_asistir") + (paso(embudo, "asistieron").value as number)).toBe(n("todos"));
    expect(n("levanto_la_mano_sin_contactar")).toBe(
      (paso(embudo, "levantaron_la_mano").value as number) - (paso(embudo, "contactados").value as number)
    );
    expect(n("levanto_la_mano_sin_contactar")).toBeGreaterThan(0);
  });

  it("la paginación recorre todos sin repetir, de a 50 y del más nuevo al más viejo", () => {
    const vistos: string[] = [];
    let cursor: string | null = null;
    let paginas = 0;
    do {
      const pagina = calcularLeads(filas, { cursor }, AHORA, true);
      expect(pagina.filas.value!.length).toBeLessThanOrEqual(LEADS_POR_PAGINA);
      vistos.push(...pagina.filas.value!.map((f) => f.registradoAt + f.leadId));
      cursor = pagina.siguienteCursor;
      paginas += 1;
    } while (cursor && paginas < 20);
    expect(vistos).toHaveLength(leads.total.value as number);
    expect(new Set(vistos).size).toBe(vistos.length);
    const fechas = vistos.map((v) => v.slice(0, 24));
    expect([...fechas].sort().reverse()).toEqual(fechas);
    expect(paginas).toBe(Math.ceil(vistos.length / LEADS_POR_PAGINA));
  });

  it("filtro y búsqueda", () => {
    const sinContactar = calcularLeads(filas, { filtro: "levanto_la_mano_sin_contactar" }, AHORA, true);
    expect(sinContactar.filas.value!.every((f) => f.etapa === "raised_hand")).toBe(true);
    expect(sinContactar.total.value).toBe(sinContactar.filas.value!.length);

    const unLead = filas.leads.find((l) => l.name)!;
    const buscado = calcularLeads(filas, { busqueda: unLead.email.toUpperCase() }, AHORA, true);
    expect(buscado.filas.value!.map((f) => f.leadId)).toEqual([unLead.id]);
    expect(buscado.busqueda).toBe(unLead.email.toUpperCase());
  });

  it("un filtro o cursor que no existe no rompe: todos, desde el principio", () => {
    const raro = calcularLeads(
      filas,
      { filtro: "cualquiera", cursor: "basura", launchId: "otro" },
      AHORA,
      true
    );
    expect(raro.filtroElegido).toBe("todos");
    expect(raro.lanzamientoElegido?.id).toBe(ACTIVO.id);
    expect(raro.filas).toEqual(leads.filas);
  });

  it("el lanzamiento cerrado se elige por URL", () => {
    expect(calcularLeads(filas, { launchId: CERRADO.id }, AHORA, true).total.value).toBe(120);
  });
});

describe("Ficha del lead", () => {
  it("trae el recorrido, el estado de venta y el botón de WhatsApp", () => {
    expect(ficha.lineaDeTiempo.value!.map((e) => e.tipo)).toContain("purchased");
    expect(ficha.estadoDeVenta.value!.etapa).toBe("purchased");
    expect(ficha.compras.value!.length).toBeGreaterThan(0);
    if (ficha.lead.telefono) {
      expect(ficha.whatsappUrl).toBe(`https://wa.me/${ficha.lead.telefono.slice(1)}`);
    } else {
      expect(ficha.whatsappUrl).toBeNull();
    }
    const contacto = ficha.lineaDeTiempo.value!.find((e) => e.tipo === "contacted")!;
    expect(contacto.cargadoPor?.nombre).toMatch(/setter de ejemplo/);
  });

  it("un lead en los dos lanzamientos elige el pedido o el más nuevo", () => {
    const enLosDos = filas.leads.find(
      (l) => filas.registros.filter((r) => r.lead_id === l.id).length === 2
    )!;
    const porDefecto = calcularFichaDelLead(filas, enLosDos.id, null, AHORA, true)!;
    expect(porDefecto.lanzamientoElegido.id).toBe(ACTIVO.id);
    expect(porDefecto.registros).toHaveLength(2);
    const pedido = calcularFichaDelLead(filas, enLosDos.id, CERRADO.id, AHORA, true)!;
    expect(pedido.lanzamientoElegido.id).toBe(CERRADO.id);
  });

  it("sin teléfono no hay WhatsApp", () => {
    const sinTelefono = filas.leads.find((l) => !l.phone_e164)!;
    expect(calcularFichaDelLead(filas, sinTelefono.id, null, AHORA, true)!.whatsappUrl).toBeNull();
  });

  it("un lead que no existe es null", () => {
    expect(calcularFichaDelLead(filas, "00000000-0000-4000-8000-000000000000", null, AHORA, true)).toBeNull();
  });
});

describe("Configuración del lanzamiento", () => {
  it("lista lo que falta cargar: el minuto de la oferta de la sesión 2", () => {
    expect(configuracion.faltantes).toEqual([
      {
        campo: "segundo_de_la_oferta",
        sesionId: filas.sesiones[1].id,
        reason: "Cargá el minuto de la oferta de la sesión 2 para saber quién se quedó hasta la oferta.",
      },
    ]);
    expect(configuracion.productos.map((p) => p.rol)).toEqual(["main", "vip"]);
    expect(configuracion.campanas).toHaveLength(1);
  });

  it("cada faltante dice lo mismo que el número que no se puede medir por él", () => {
    const faltante = (f: typeof filas, campo: string) =>
      calcularConfiguracionDelLanzamiento(f, ACTIVO.id, false)!.faltantes.find((x) => x.campo === campo)!.reason;
    const v = (f: typeof filas) => calcularDetalleDelLanzamiento(f, ACTIVO.id, AHORA, false)!;

    expect(detalle.sesiones[1].seQuedaronALaOferta!.reason).toBe(faltante(filas, "segundo_de_la_oferta"));
    const sinZoom = { ...filas, sesiones: filas.sesiones.map((s) => ({ ...s, zoom_webinar_id: null })) };
    expect(v(sinZoom).sesiones[0].asistieron!.reason).toBe(faltante(sinZoom, "zoom_webinar_id"));
    const sinProducto = { ...filas, productos: [] };
    expect(v(sinProducto).ventas.ventas.reason).toBe(faltante(sinProducto, "producto_principal"));
    const sinCampanas = { ...filas, campanas: [] };
    expect(v(sinCampanas).anuncios!.inversion.reason).toBe(faltante(sinCampanas, "campanas"));
    const sinSesiones = { ...filas, sesiones: [] };
    expect(paso(v(sinSesiones).embudo, "asistieron").reason).toBe(faltante(sinSesiones, "sesiones"));
  });

  it("un lanzamiento que no existe es null en detalle y configuración", () => {
    expect(calcularDetalleDelLanzamiento(filas, "x", AHORA, true)).toBeNull();
    expect(calcularConfiguracionDelLanzamiento(filas, "x", true)).toBeNull();
  });
});

describe("las funciones no leen la hora del sistema", () => {
  it("con otro reloj, las seis vistas son las mismas", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2031-06-15T03:00:00Z"));
      expect({
        inicio: calcularInicio(filas, AHORA, true, null),
        lista: calcularListaDeLanzamientos(filas, AHORA, true),
        detalle: calcularDetalleDelLanzamiento(filas, ACTIVO.id, AHORA, true),
        leads: calcularLeads(filas, {}, AHORA, true),
        ficha: calcularFichaDelLead(filas, conLlamada.lead_id, null, AHORA, true),
        configuracion: calcularConfiguracionDelLanzamiento(filas, ACTIVO.id, true),
      }).toEqual(VISTAS);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("reglas de estado sin el escenario", () => {
  const vacio = { ...filas, eventos: [], registros: [], leads: [], visitas: [], estadosDeVenta: [], notas: [] };

  it("sin lanzamiento activo, Inicio dice medido null (no hay activo)", () => {
    const soloCerrado = { ...vacio, lanzamientos: [CERRADO] };
    expect(calcularInicio(soloCerrado, AHORA, false, null).activo).toMatchObject({ state: "medido", value: null });
  });

  it("sin producto principal, las ventas quedan en falta configurar", () => {
    const sinProducto = { ...filas, productos: [] };
    const v = calcularDetalleDelLanzamiento(sinProducto, ACTIVO.id, AHORA, false)!;
    expect(v.ventas.ventas.state).toBe("falta_configurar");
    expect(v.ventas.ventasVip).toBeNull();
    expect(v.tasas.conversionDeAsistentes.state).toBe("falta_configurar");
  });

  it("sin campañas, la inversión queda en falta configurar; en orgánica no hay anuncios", () => {
    const sinCampanas = { ...filas, campanas: [] };
    expect(calcularDetalleDelLanzamiento(sinCampanas, ACTIVO.id, AHORA, false)!.anuncios!.inversion.state).toBe(
      "falta_configurar"
    );
    expect(calcularDetalleDelLanzamiento(filas, CERRADO.id, AHORA, false)!.anuncios).toBeNull();
  });

  it("Zoom sin conectar deja la asistencia sin fuente y el filtro de asistencia también", () => {
    const sinZoom = { ...filas, fuentes: filas.fuentes.filter((f) => f.fuente !== "zoom") };
    const v = calcularLeads(sinZoom, { filtro: "registrado_sin_asistir" }, AHORA, false);
    expect(v.total.state).toBe("sin_fuente");
    expect(v.filas).toMatchObject({ state: "sin_fuente", value: null });
    expect(v.siguienteCursor).toBeNull();
    // El filtro que no depende de Zoom sigue medido.
    expect(v.filtros.find((f) => f.filtro === "levanto_la_mano_sin_contactar")!.personas.state).toBe("medido");
  });

  it("un reporte de Zoom con error deja esa sesión y el total en error", () => {
    const conFalla = {
      ...filas,
      sesiones: filas.sesiones.map((s, i) => (i === 0 ? { ...s, report_status: "error" as const } : s)),
    };
    const v = calcularDetalleDelLanzamiento(conFalla, ACTIVO.id, AHORA, false)!;
    expect(v.sesiones[0].asistieron?.state).toBe("error");
    expect(paso(v.embudo, "asistieron").state).toBe("error");
  });

  it("una sesión ocurrida sin reporte de Zoom deja esa sesión y el total sin valor, con el motivo de la sesión", () => {
    const sinReporte = {
      ...filas,
      sesiones: filas.sesiones.map((s, i) => (i === 0 ? { ...s, report_status: null } : s)),
    };
    const v = calcularDetalleDelLanzamiento(sinReporte, ACTIVO.id, AHORA, false)!;
    const motivo = "Zoom todavía no entregó el reporte de la sesión 1 (puede tardar hasta 24 h).";
    expect(v.sesiones[0].asistieron).toMatchObject({ state: "sin_fuente", value: null, reason: motivo });
    expect(paso(v.embudo, "asistieron")).toMatchObject({ state: "sin_fuente", value: null, reason: motivo });
  });

  it("sin sesiones ocurridas, la asistencia es cero con Zoom conectado y sin fuente sin Zoom", () => {
    const soloFuturas = {
      ...filas,
      sesiones: filas.sesiones.map((s) => ({ ...s, starts_at: "2026-11-05T15:00:00.000Z", report_status: null })),
    };
    const conZoom = calcularDetalleDelLanzamiento(soloFuturas, ACTIVO.id, AHORA, false)!;
    expect(paso(conZoom.embudo, "asistieron")).toMatchObject({ state: "medido", value: 0 });
    const sinZoom = { ...soloFuturas, fuentes: filas.fuentes.filter((f) => f.fuente !== "zoom") };
    expect(paso(calcularDetalleDelLanzamiento(sinZoom, ACTIVO.id, AHORA, false)!.embudo, "asistieron").state).toBe(
      "sin_fuente"
    );
  });

  it("sin sesiones cargadas, la asistencia queda en falta configurar", () => {
    const sinSesiones = { ...filas, sesiones: [] };
    const v = calcularDetalleDelLanzamiento(sinSesiones, ACTIVO.id, AHORA, false)!;
    expect(paso(v.embudo, "asistieron").state).toBe("falta_configurar");
    expect(calcularConfiguracionDelLanzamiento(sinSesiones, ACTIVO.id, false)!.faltantes[0].campo).toBe("sesiones");
  });

  it("una sesión futura no tiene asistencia todavía (null), y no cuenta en el total", () => {
    const futura = {
      ...filas,
      sesiones: [
        ...filas.sesiones,
        { ...filas.sesiones[0], id: "futura", starts_at: "2026-11-03T15:00:00.000Z", report_status: null },
      ],
    };
    const v = calcularInicio(futura, AHORA, false, null).activo.value!;
    expect(v.sesiones.at(-1)!.asistieron).toBeNull();
    expect(v.proximaSesion?.id).toBe("futura");
    expect(paso(v.embudo, "asistieron")).toEqual(paso(inicio.activo.value!.embudo, "asistieron"));
  });

  describe("reembolsos: cada uno se asocia a una compra concreta", () => {
    const yaReembolsados = new Set(filas.eventos.filter((e) => e.kind === "refunded").map((e) => e.lead_id));
    const compra = filas.eventos.find(
      (e) => e.kind === "purchased" && e.launch_id === ACTIVO.id && !yaReembolsados.has(e.lead_id)
    )!;
    const despues = (horas: number) => new Date(Date.parse(compra.occurred_at) + horas * 3_600_000).toISOString();
    const comprasDeLaFicha = (f: typeof filas) =>
      calcularFichaDelLead(f, compra.lead_id, ACTIVO.id, AHORA, false)!.compras.value!.map((c) => [c.producto, c.estado]);

    it("dos compras y un reembolso: una queda cobrada y los ingresos restan una sola vez", () => {
      const conDos = {
        ...filas,
        eventos: [
          ...filas.eventos,
          { ...compra, id: "segunda-compra", occurred_at: despues(1) },
          { ...compra, id: "reembolso-de-una", kind: "refunded" as const, occurred_at: despues(2) },
        ],
      };
      expect(comprasDeLaFicha(conDos)).toEqual([
        [compra.data.product, "reembolsada"],
        [compra.data.product, "cobrada"],
      ]);
      const v = calcularDetalleDelLanzamiento(conDos, ACTIVO.id, AHORA, false)!;
      expect(v.ventas.ingresos.value).toBe(detalle.ventas.ingresos.value);
      expect(v.ventas.reembolsos.value).toBe((detalle.ventas.reembolsos.value as number) + 1);
    });

    it("un reembolso del VIP no toca las ventas, los ingresos ni los reembolsos de la oferta principal", () => {
      const vip = { product: "VIP de ejemplo", amount: 47, currency: "USD" };
      const conVip = {
        ...filas,
        eventos: [
          ...filas.eventos,
          { ...compra, id: "compra-vip", kind: "vip_purchased" as const, source: "commas" as const, occurred_at: despues(1), data: vip },
          { ...compra, id: "reembolso-vip", kind: "refunded" as const, source: "commas" as const, occurred_at: despues(2), data: vip },
        ],
      };
      const v = calcularDetalleDelLanzamiento(conVip, ACTIVO.id, AHORA, false)!;
      expect(v.ventas.ingresos).toEqual(detalle.ventas.ingresos);
      expect(v.ventas.reembolsos).toEqual(detalle.ventas.reembolsos);
      expect(v.ventas.ventas).toEqual(detalle.ventas.ventas);
      expect(comprasDeLaFicha(conVip)).toEqual([
        [compra.data.product, "cobrada"],
        ["VIP de ejemplo", "reembolsada"],
      ]);
    });

    it("un reembolso de un producto que no aparece en ninguna compra del lanzamiento deja los ingresos en error", () => {
      const huerfano = {
        ...filas,
        eventos: [
          ...filas.eventos,
          { ...compra, id: "reembolso-huerfano", kind: "refunded" as const, occurred_at: despues(1), data: { ...compra.data, product: "Otro producto" } },
        ],
      };
      const v = calcularDetalleDelLanzamiento(huerfano, ACTIVO.id, AHORA, false)!;
      expect(v.ventas.ingresos.state).toBe("error");
      expect(v.ventas.ingresos.reason).toBe(
        "Hay 1 reembolso sin compra que le corresponda y por su producto no se sabe si es de la oferta principal: los ingresos no se pueden calcular."
      );
    });

    it("un reembolso de la oferta principal sin compra de ese lead deja los ingresos en error, con ese motivo", () => {
      const compradores = new Set(filas.eventos.filter((e) => e.kind === "purchased").map((e) => e.lead_id));
      const sinCompra = filas.registros.find((r) => r.launch_id === ACTIVO.id && !compradores.has(r.lead_id))!;
      const huerfano = {
        ...filas,
        eventos: [
          ...filas.eventos,
          { ...compra, id: "reembolso-sin-compra", lead_id: sinCompra.lead_id, kind: "refunded" as const, occurred_at: despues(1) },
        ],
      };
      const v = calcularDetalleDelLanzamiento(huerfano, ACTIVO.id, AHORA, false)!;
      expect(v.ventas.ingresos.state).toBe("error");
      expect(v.ventas.ingresos.reason).toBe(
        "Hay 1 reembolso de la oferta principal que no corresponde a ninguna compra: los ingresos no se pueden calcular."
      );
    });

    it("un reembolso del VIP sin compra que le corresponda no toca los números de la oferta principal", () => {
      const vip = { product: "VIP de ejemplo", amount: 47, currency: "USD" };
      const otroLead = filas.eventos.find((e) => e.kind === "purchased" && e.launch_id === ACTIVO.id && e.lead_id !== compra.lead_id)!;
      const conVipHuerfano = {
        ...filas,
        eventos: [
          ...filas.eventos,
          { ...otroLead, id: "compra-vip-de-otro", kind: "vip_purchased" as const, source: "commas" as const, occurred_at: despues(1), data: vip },
          { ...compra, id: "reembolso-vip-huerfano", kind: "refunded" as const, source: "commas" as const, occurred_at: despues(2), data: vip },
        ],
      };
      const v = calcularDetalleDelLanzamiento(conVipHuerfano, ACTIVO.id, AHORA, false)!;
      expect(v.ventas.ingresos).toEqual(detalle.ventas.ingresos);
      expect(v.ventas.reembolsos).toEqual(detalle.ventas.reembolsos);
      expect(v.ventas.ventas).toEqual(detalle.ventas.ventas);
      expect(comprasDeLaFicha(conVipHuerfano)).toEqual([[compra.data.product, "cobrada"]]);
    });

    it("un reembolso sin compra de un producto que aparece en las dos ofertas deja los ingresos en error: no se sabe de cuál es", () => {
      const compradores = new Set(filas.eventos.filter((e) => e.kind === "purchased").map((e) => e.lead_id));
      const sinCompra = filas.registros.find((r) => r.launch_id === ACTIVO.id && !compradores.has(r.lead_id))!;
      const otroLead = filas.eventos.find((e) => e.kind === "purchased" && e.launch_id === ACTIVO.id && e.lead_id !== compra.lead_id)!;
      const enLasDos = {
        ...filas,
        eventos: [
          ...filas.eventos,
          // Un VIP con el mismo nombre de producto que la oferta principal.
          { ...otroLead, id: "vip-con-el-nombre-principal", kind: "vip_purchased" as const, source: "commas" as const, occurred_at: despues(1) },
          { ...compra, id: "reembolso-ambiguo", lead_id: sinCompra.lead_id, kind: "refunded" as const, occurred_at: despues(2) },
        ],
      };
      const v = calcularDetalleDelLanzamiento(enLasDos, ACTIVO.id, AHORA, false)!;
      expect(v.ventas.ingresos.state).toBe("error");
      expect(v.ventas.ingresos.reason).toBe(
        "Hay 1 reembolso sin compra que le corresponda y por su producto no se sabe si es de la oferta principal: los ingresos no se pueden calcular."
      );
    });

    it.each([
      ["a la misma hora que la compra y con un id menor", 0, "0000-reembolso"],
      ["un segundo antes que la compra (relojes desfasados)", -1_000, "reembolso-adelantado"],
    ])("un reembolso %s se asocia a esa compra", (_caso, ms, id) => {
      const conReembolso = {
        ...filas,
        eventos: [
          ...filas.eventos,
          { ...compra, id, kind: "refunded" as const, occurred_at: new Date(Date.parse(compra.occurred_at) + ms).toISOString() },
        ],
      };
      expect(comprasDeLaFicha(conReembolso)).toEqual([[compra.data.product, "reembolsada"]]);
      const v = calcularDetalleDelLanzamiento(conReembolso, ACTIVO.id, AHORA, false)!;
      expect(v.ventas.ingresos.state).toBe(detalle.ventas.ingresos.state);
      expect(v.ventas.ingresos.value).toBe((detalle.ventas.ingresos.value as number) - compra.data.amount!);
      expect(v.ventas.reembolsos.value).toBe((detalle.ventas.reembolsos.value as number) + 1);
    });

    it("la asociación no depende del orden de los eventos: el reembolso va a la compra más vieja", () => {
      const reembolso = { ...compra, id: "reembolso-primero", kind: "refunded" as const, occurred_at: despues(2) };
      const segunda = { ...compra, id: "segunda-compra", occurred_at: despues(1) };
      const enOrden = { ...filas, eventos: [reembolso, ...filas.eventos, segunda] };
      const invertido = { ...filas, eventos: [...enOrden.eventos].reverse() };
      const estados = (f: typeof filas) =>
        calcularFichaDelLead(f, compra.lead_id, ACTIVO.id, AHORA, false)!.compras.value!.map((c) => [c.eventoId, c.estado]);
      expect(estados(enOrden)).toEqual([
        [compra.id, "reembolsada"],
        ["segunda-compra", "cobrada"],
      ]);
      expect(estados(invertido)).toEqual(estados(enOrden));
      expect(calcularDetalleDelLanzamiento(invertido, ACTIVO.id, AHORA, false)!.ventas).toEqual(
        calcularDetalleDelLanzamiento(enOrden, ACTIVO.id, AHORA, false)!.ventas
      );
    });

    it("con dos reembolsos para una compra, la compra se queda con el más viejo en cualquier orden de entrada", () => {
      // El más viejo no tiene monto: si se asocia, los ingresos dicen eso; si
      // quedara suelto, dirían que hay un reembolso sin compra.
      const viejo = { ...compra, id: "reembolso-viejo", kind: "refunded" as const, occurred_at: despues(1), data: { ...compra.data, amount: null } };
      const nuevo = { ...compra, id: "reembolso-nuevo", kind: "refunded" as const, occurred_at: despues(2) };
      const enOrden = { ...filas, eventos: [nuevo, ...filas.eventos, viejo] };
      const invertido = { ...filas, eventos: [...enOrden.eventos].reverse() };
      for (const f of [enOrden, invertido]) {
        expect(calcularDetalleDelLanzamiento(f, ACTIVO.id, AHORA, false)!.ventas.ingresos.reason).toBe(
          "Hay 1 compra cuyo monto no se pudo leer: los ingresos no se pueden sumar."
        );
      }
    });
  });

  it("una compra sin monto deja los ingresos en error, nunca suma un cero", () => {
    const sinMonto = {
      ...filas,
      eventos: filas.eventos.map((e) =>
        e.kind === "purchased" && e.launch_id === ACTIVO.id ? { ...e, data: { ...e.data, amount: null } } : e
      ),
    };
    const v = calcularDetalleDelLanzamiento(sinMonto, ACTIVO.id, AHORA, false)!;
    expect(v.ventas.ingresos.state).toBe("error");
    expect(v.ventas.ventas.state).toBe("medido");
  });
});

import "server-only";

import { diasEntre, esFechaCalendario, fechaEnZona } from "@/lib/fechas/calendario";
import {
  conError,
  derivar,
  desactualizado,
  ETIQUETA_DE_FUENTE,
  FUENTES_DEL_DATO,
  faltaConfigurar,
  medido,
  sinFuente,
  tasa,
  cociente,
  type Dato,
  type FuenteDelDato,
} from "./dato";
import {
  ETAPAS_DEL_LEAD,
  ETIQUETA_DEL_FILTRO,
  FILTROS_DE_LEADS,
  LEADS_POR_PAGINA,
  type AnunciosDelLanzamiento,
  type CompraDelLead,
  type ConteoDeFiltro,
  type EstadoDeFuente,
  type EtapaDelLead,
  type EventoDelLead,
  type FaltanteDeConfiguracion,
  type FilaDeLanzamiento,
  type FilaDeLead,
  type FiltroDeLeads,
  type InicioDelLanzamientoActivo,
  type LanzamientoResumen,
  type OpcionDeLanzamiento,
  type OrigenDelRegistro,
  type ParametrosDeLeads,
  type PasoDelEmbudo,
  type PersonaDelEquipo,
  type SesionDelLanzamiento,
  type TasasDelLanzamiento,
  type TipoDeEvento,
  type VentasDelLanzamiento,
  type VistaConfiguracionDelLanzamiento,
  type VistaDetalleDelLanzamiento,
  type VistaFichaDelLead,
  type VistaInicio,
  type VistaLeads,
  type VistaListaDeLanzamientos,
} from "./contratos";
import type {
  FilaEvento,
  FilaLanzamiento,
  FilaRegistro,
  FilaSesion,
  FilasDelWebinar,
} from "./filas";

/**
 * ⭐ De las filas a las seis vistas (SCRUM-542). Funciones puras: no leen la
 * base ni la hora del sistema (reciben `ahora`). Las usa hoy el escenario de
 * ejemplo y en B4 la lectura real, así que las reglas de estado de cada número
 * viven acá y no en las pantallas:
 *   - un conteo toma el estado de la fuente que lo mide (`FUENTE_DEL_TIPO`);
 *   - la asistencia y "se quedó a la oferta" se miden por sesión y el total
 *     son las personas distintas de las sesiones ocurridas: una sesión sin
 *     reporte o sin el minuto de la oferta deja el total sin valor, con el
 *     motivo de esa sesión;
 *   - las ventas dependen del producto principal configurado y de su
 *     proveedor; la inversión, de las campañas asociadas y de Meta Ads;
 *   - un filtro de Leads o un número calculado hereda el peor estado de los
 *     números de los que sale (`derivar`).
 */

type Contexto = {
  filas: FilasDelWebinar;
  ahora: Date;
  ahoraIso: string;
  equipo: Map<string, PersonaDelEquipo>;
  /** Por lanzamiento: tipo de evento → leads distintos. */
  leadsPorTipo: Map<string, Map<TipoDeEvento, Set<string>>>;
};

function contexto(filas: FilasDelWebinar, ahora: Date): Contexto {
  const leadsPorTipo = new Map<string, Map<TipoDeEvento, Set<string>>>();
  for (const evento of filas.eventos) {
    let porTipo = leadsPorTipo.get(evento.launch_id);
    if (!porTipo) {
      porTipo = new Map();
      leadsPorTipo.set(evento.launch_id, porTipo);
    }
    let leads = porTipo.get(evento.kind);
    if (!leads) {
      leads = new Set();
      porTipo.set(evento.kind, leads);
    }
    leads.add(evento.lead_id);
  }
  return {
    filas,
    ahora,
    ahoraIso: ahora.toISOString(),
    equipo: new Map(filas.equipo.map((m) => [m.user_id, { userId: m.user_id, nombre: m.nombre }])),
    leadsPorTipo,
  };
}

function leadsCon(ctx: Contexto, launchId: string, tipo: TipoDeEvento): Set<string> {
  return ctx.leadsPorTipo.get(launchId)?.get(tipo) ?? new Set();
}

// ─── Fuentes ───────────────────────────────────────────────────────────────

export function estadoDeFuente(filas: FilasDelWebinar, fuente: FuenteDelDato): EstadoDeFuente {
  if (fuente === "manual" || fuente === "configuracion" || fuente === "calculado") {
    // Lo que carga el equipo y la configuración están siempre disponibles.
    return { fuente, state: "medido", reason: null, ultimaLecturaAt: null };
  }
  return (
    filas.fuentes.find((f) => f.fuente === fuente) ?? {
      fuente,
      state: "sin_fuente",
      reason: `${ETIQUETA_DE_FUENTE[fuente]} no está conectado.`,
      ultimaLecturaAt: null,
    }
  );
}

/** Un valor contado a partir de lo que trajo una fuente, con el estado de la fuente. */
function datoDeFuente<T>(
  ctx: Contexto,
  fuente: FuenteDelDato,
  valor: T,
  measuredAt?: string
): Dato<T> {
  const estado = estadoDeFuente(ctx.filas, fuente);
  const fecha = measuredAt ?? estado.ultimaLecturaAt ?? ctx.ahoraIso;
  const motivo = estado.reason ?? `${ETIQUETA_DE_FUENTE[fuente]}: sin detalle del estado.`;
  switch (estado.state) {
    case "medido":
      return medido(valor, fuente, fecha);
    case "desactualizado":
      return desactualizado(valor, fuente, fecha, motivo);
    case "sin_fuente":
      return sinFuente(fuente, motivo);
    case "falta_configurar":
      return faltaConfigurar(fuente, motivo, estado.ultimaLecturaAt);
    case "error":
      return conError(fuente, motivo, estado.ultimaLecturaAt);
  }
}

function comoFuente(proveedor: string): FuenteDelDato | null {
  return (FUENTES_DEL_DATO as readonly string[]).includes(proveedor)
    ? (proveedor as FuenteDelDato)
    : null;
}

/** De dónde sale cada tipo de evento que no depende de la configuración. */
const FUENTE_DEL_TIPO: Partial<Record<TipoDeEvento, FuenteDelDato>> = {
  registered: "landing",
  email_confirmed: "ghl",
  zoom_link_created: "zoom",
  // Llega por la landing post-webinar o lo carga el setter (pregunta 5 de las
  // fichas): la carga del equipo siempre está disponible.
  raised_hand: "manual",
  contacted: "manual",
  qualified: "manual",
  disqualified: "manual",
  call_booked: "calendly",
  call_attended: "calendly",
  call_no_show: "calendly",
};

// ─── Lo que falta configurar ───────────────────────────────────────────────

/**
 * Los motivos de lo que falta cargar en el lanzamiento: los mismos en el
 * número que no se puede medir y en la lista de Configuración.
 */
const MOTIVO_FALTA = {
  sesiones: "Cargá las sesiones del lanzamiento.",
  zoomWebinarId: (sesion: number) => `Cargá el ID del webinar de Zoom de la sesión ${sesion}.`,
  segundoDeLaOferta: (sesion: number) =>
    `Cargá el minuto de la oferta de la sesión ${sesion} para saber quién se quedó hasta la oferta.`,
  productoPrincipal: "Cargá el producto de la oferta principal para contar las ventas.",
  campanas: "Asociá las campañas de anuncios del lanzamiento para medir la inversión.",
} as const;

// ─── Lanzamiento ───────────────────────────────────────────────────────────

function resumen(l: FilaLanzamiento): LanzamientoResumen {
  return {
    id: l.id,
    nombre: l.name,
    variante: l.variant,
    estado: l.status,
    moneda: l.currency,
    precioDeLaOferta: l.offer_price,
    captaDesde: l.capture_starts_on,
    cierraEl: l.closes_on,
    cerradoAt: l.closed_at,
  };
}

function opcion(l: FilaLanzamiento): OpcionDeLanzamiento {
  return { id: l.id, nombre: l.name, estado: l.status };
}

function sesionesDe(ctx: Contexto, launchId: string): FilaSesion[] {
  return ctx.filas.sesiones
    .filter((s) => s.launch_id === launchId)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

function conteoDeTipo(ctx: Contexto, launchId: string, tipo: TipoDeEvento): Dato<number> {
  const fuente = FUENTE_DEL_TIPO[tipo];
  if (!fuente) throw new Error(`conteoDeTipo: ${tipo} se cuenta por sesión o por producto`);
  return datoDeFuente(ctx, fuente, leadsCon(ctx, launchId, tipo).size);
}

/** Leads distintos con un evento de `tipo` en alguna de las sesiones. */
function leadsDeSesiones(
  ctx: Contexto,
  launchId: string,
  sesionIds: ReadonlySet<string>,
  tipo: "attended" | "stayed_to_offer"
): number {
  const leads = new Set<string>();
  for (const e of ctx.filas.eventos) {
    if (e.launch_id === launchId && e.kind === tipo && sesionIds.has(e.data.session_id ?? "")) {
      leads.add(e.lead_id);
    }
  }
  return leads.size;
}

function datoDeSesion(
  ctx: Contexto,
  s: FilaSesion,
  numero: number,
  tipo: "attended" | "stayed_to_offer"
): Dato<number> | null {
  if (s.starts_at > ctx.ahoraIso) return null;
  const cual = `la sesión ${numero}`;
  if (!s.zoom_webinar_id) {
    return faltaConfigurar("configuracion", MOTIVO_FALTA.zoomWebinarId(numero));
  }
  const zoom = estadoDeFuente(ctx.filas, "zoom");
  if (zoom.state !== "medido" && zoom.state !== "desactualizado") {
    return datoDeFuente(ctx, "zoom", 0);
  }
  if (tipo === "stayed_to_offer" && s.offer_offset_seconds === null) {
    return faltaConfigurar("configuracion", MOTIVO_FALTA.segundoDeLaOferta(numero));
  }
  if (s.report_status === "error") {
    return conError(
      "zoom",
      `Zoom devolvió un error al pedir el reporte de ${cual}. Se vuelve a intentar solo.`,
      zoom.ultimaLecturaAt
    );
  }
  if (s.report_status === null) {
    return sinFuente("zoom", `Zoom todavía no entregó el reporte de ${cual} (puede tardar hasta 24 h).`);
  }
  return datoDeFuente(ctx, "zoom", leadsDeSesiones(ctx, s.launch_id, new Set([s.id]), tipo));
}

function sesionesDelLanzamiento(ctx: Contexto, launchId: string): SesionDelLanzamiento[] {
  return sesionesDe(ctx, launchId).map((s, i) => ({
    id: s.id,
    empiezaAt: s.starts_at,
    asistieron: datoDeSesion(ctx, s, i + 1, "attended"),
    seQuedaronALaOferta: datoDeSesion(ctx, s, i + 1, "stayed_to_offer"),
  }));
}

/**
 * El total de un lanzamiento son las **personas distintas** de las sesiones
 * que ya ocurrieron (quien vuelve a otra sesión cuenta una vez), con el peor
 * estado entre esas sesiones (`derivar`). El detalle por sesión sí cuenta a
 * cada uno en cada sesión.
 */
function totalDeSesiones(
  ctx: Contexto,
  launchId: string,
  sesiones: SesionDelLanzamiento[],
  campo: "asistieron" | "seQuedaronALaOferta",
  tipo: "attended" | "stayed_to_offer"
): Dato<number> {
  if (sesiones.length === 0) {
    return faltaConfigurar("configuracion", MOTIVO_FALTA.sesiones);
  }
  const ocurridas = sesiones.filter((s) => s[campo] !== null);
  // Ninguna sesión ocurrió todavía: nadie asistió, y eso sí es un dato (si
  // Zoom está conectado; si no, el estado de Zoom).
  if (ocurridas.length === 0) return datoDeFuente(ctx, "zoom", 0, ctx.ahoraIso);
  const ids = new Set(ocurridas.map((s) => s.id));
  return derivar(
    ocurridas.map((s) => s[campo] as Dato<number>),
    () => leadsDeSesiones(ctx, launchId, ids, tipo)
  );
}

function productoDe(ctx: Contexto, launchId: string, rol: "main" | "vip") {
  return ctx.filas.productos.find((p) => p.launch_id === launchId && p.role === rol) ?? null;
}

function sinProductoPrincipal() {
  return faltaConfigurar("configuracion", MOTIVO_FALTA.productoPrincipal);
}

function datoDeProveedor<T>(ctx: Contexto, proveedor: string, valor: T): Dato<T> {
  const fuente = comoFuente(proveedor);
  if (!fuente) {
    return sinFuente("configuracion", `Limitless no tiene integración con ${proveedor}.`);
  }
  return datoDeFuente(ctx, fuente, valor);
}

type CompraConReembolso = { compra: FilaEvento; reembolso: FilaEvento | null };

const porFechaEId = (a: FilaEvento, b: FilaEvento) =>
  a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id);

/**
 * Cada reembolso se asocia a una compra concreta: la más vieja todavía
 * cobrada del mismo lead, lanzamiento y producto (`data.product`), sin mirar
 * si es anterior o posterior al reembolso (un desfase de reloj o la misma
 * hora no lo dejan suelto). Los reembolsos se reparten por fecha y, a igual
 * fecha, por id, así que el resultado no depende del orden de entrada. Dos
 * compras con un reembolso dejan una cobrada, y un reembolso del VIP
 * (`vip_purchased`) no toca la oferta principal (`purchased`). Un reembolso
 * sin compra que le corresponda queda en `huerfanos`.
 *
 * Provisional hasta B4 (`[WEBINAR-REEMBOLSOS-POR-ORDEN]`): no asocia por id de
 * orden ni reparte reembolsos parciales.
 */
function asociarReembolsos(eventos: readonly FilaEvento[]): {
  compras: CompraConReembolso[];
  huerfanos: FilaEvento[];
} {
  const porFecha = [...eventos].sort(porFechaEId);
  const clave = (e: FilaEvento) => `${e.launch_id}|${e.lead_id}|${e.data.product ?? ""}`;
  const compras: CompraConReembolso[] = porFecha
    .filter((e) => e.kind === "purchased" || e.kind === "vip_purchased")
    .map((compra) => ({ compra, reembolso: null }));
  const huerfanos: FilaEvento[] = [];
  for (const e of porFecha) {
    if (e.kind !== "refunded") continue;
    const cobrada = compras.find((c) => c.reembolso === null && clave(c.compra) === clave(e));
    if (cobrada) cobrada.reembolso = e;
    else huerfanos.push(e);
  }
  return { compras, huerfanos };
}

/**
 * De qué oferta es un reembolso sin compra, por el nombre de su producto en
 * las compras del lanzamiento: `principal` si sólo aparece en `purchased`,
 * `vip` si sólo aparece en `vip_purchased`, `desconocido` si no aparece o
 * aparece en las dos.
 */
function ofertaDelHuerfano(
  reembolso: FilaEvento,
  compras: readonly CompraConReembolso[]
): "principal" | "vip" | "desconocido" {
  const tipos = new Set(
    compras
      .filter((c) => (c.compra.data.product ?? "") === (reembolso.data.product ?? ""))
      .map((c) => c.compra.kind)
  );
  if (tipos.size !== 1) return "desconocido";
  return tipos.has("purchased") ? "principal" : "vip";
}

const sinMontoLeido = (e: FilaEvento | null) =>
  e !== null && (e.data.amount === null || e.data.amount === undefined);

function ventasDelLanzamiento(ctx: Contexto, launchId: string): VentasDelLanzamiento {
  const principal = productoDe(ctx, launchId, "main");
  const vip = productoDe(ctx, launchId, "vip");
  const ventasVip = vip
    ? datoDeProveedor(ctx, vip.provider, leadsCon(ctx, launchId, "vip_purchased").size)
    : null;
  if (!principal) {
    return {
      ventas: sinProductoPrincipal(),
      ingresos: sinProductoPrincipal(),
      reembolsos: sinProductoPrincipal(),
      ventasVip,
    };
  }
  const { compras, huerfanos } = asociarReembolsos(
    ctx.filas.eventos.filter((e) => e.launch_id === launchId)
  );
  // La oferta principal: las compras `purchased` y sus reembolsos.
  const principales = compras.filter((c) => c.compra.kind === "purchased");
  const sinMonto =
    principales.filter((c) => sinMontoLeido(c.compra)).length +
    principales.filter((c) => sinMontoLeido(c.reembolso)).length;
  const neto = principales.reduce(
    (total, c) => total + (c.compra.data.amount ?? 0) - (c.reembolso?.data.amount ?? 0),
    0
  );
  const fuenteDeLaFalla = comoFuente(principal.provider) ?? "configuracion";
  // Un reembolso sin compra sólo afecta a la oferta principal si es de ella o
  // si no se sabe de qué oferta es; uno del VIP no la toca.
  const ofertas = huerfanos.map((h) => ofertaDelHuerfano(h, compras));
  const huerfanosPrincipales = ofertas.filter((o) => o === "principal").length;
  const huerfanosDesconocidos = ofertas.filter((o) => o === "desconocido").length;
  const ingresos: Dato<number> =
    sinMonto > 0
      ? conError(
          fuenteDeLaFalla,
          sinMonto === 1
            ? "Hay 1 compra cuyo monto no se pudo leer: los ingresos no se pueden sumar."
            : `Hay ${sinMonto} compras cuyo monto no se pudo leer: los ingresos no se pueden sumar.`
        )
      : huerfanosPrincipales > 0
        ? conError(
            fuenteDeLaFalla,
            huerfanosPrincipales === 1
              ? "Hay 1 reembolso de la oferta principal que no corresponde a ninguna compra: los ingresos no se pueden calcular."
              : `Hay ${huerfanosPrincipales} reembolsos de la oferta principal que no corresponden a ninguna compra: los ingresos no se pueden calcular.`
          )
        : huerfanosDesconocidos > 0
          ? conError(
              fuenteDeLaFalla,
              huerfanosDesconocidos === 1
                ? "Hay 1 reembolso sin compra que le corresponda y por su producto no se sabe si es de la oferta principal: los ingresos no se pueden calcular."
                : `Hay ${huerfanosDesconocidos} reembolsos sin compra que les corresponda y por su producto no se sabe si son de la oferta principal: los ingresos no se pueden calcular.`
            )
          : datoDeProveedor(ctx, principal.provider, neto);
  const reembolsados = new Set(principales.filter((c) => c.reembolso).map((c) => c.compra.lead_id));
  return {
    ventas: datoDeProveedor(ctx, principal.provider, leadsCon(ctx, launchId, "purchased").size),
    ingresos,
    reembolsos: datoDeProveedor(ctx, principal.provider, reembolsados.size),
    ventasVip,
  };
}

function anunciosDelLanzamiento(
  ctx: Contexto,
  l: FilaLanzamiento,
  registrados: Dato<number>,
  ventas: VentasDelLanzamiento
): AnunciosDelLanzamiento | null {
  if (l.variant === "organic") return null;
  const campanas = ctx.filas.campanas.filter((c) => c.launch_id === l.id);
  let inversion: Dato<number>;
  if (campanas.length === 0) {
    inversion = faltaConfigurar("configuracion", MOTIVO_FALTA.campanas);
  } else if (campanas.some((c) => c.platform !== "meta")) {
    inversion = sinFuente("meta_ads", "Por ahora sólo se lee la inversión de campañas de Meta.");
  } else {
    const fila = ctx.filas.inversiones.find((i) => i.launch_id === l.id);
    const estado = estadoDeFuente(ctx.filas, "meta_ads");
    inversion =
      !fila && (estado.state === "medido" || estado.state === "desactualizado")
        ? sinFuente("meta_ads", "Todavía no se leyó la inversión de las campañas del lanzamiento.")
        : datoDeFuente(ctx, "meta_ads", fila?.spend ?? 0, fila?.synced_at);
  }
  return {
    inversion,
    costoPorRegistro: cociente(inversion, registrados),
    costoPorVenta: cociente(inversion, ventas.ventas),
    roas: cociente(ventas.ingresos, inversion),
  };
}

type Numeros = {
  registrados: Dato<number>;
  sesiones: SesionDelLanzamiento[];
  asistieron: Dato<number>;
  seQuedaron: Dato<number>;
  levantaron: Dato<number>;
  contactados: Dato<number>;
  agendados: Dato<number>;
  asistieronALaLlamada: Dato<number>;
  ventas: VentasDelLanzamiento;
  anuncios: AnunciosDelLanzamiento | null;
  embudo: PasoDelEmbudo[];
  tasas: TasasDelLanzamiento;
};

function numerosDelLanzamiento(ctx: Contexto, l: FilaLanzamiento): Numeros {
  const visitantes = new Set(
    ctx.filas.visitas.filter((v) => v.launch_id === l.id).map((v) => v.visitor_id)
  ).size;
  const visitas = datoDeFuente(ctx, "landing", visitantes);
  const registrados = conteoDeTipo(ctx, l.id, "registered");
  const sesiones = sesionesDelLanzamiento(ctx, l.id);
  const asistieron = totalDeSesiones(ctx, l.id, sesiones, "asistieron", "attended");
  const seQuedaron = totalDeSesiones(ctx, l.id, sesiones, "seQuedaronALaOferta", "stayed_to_offer");
  const levantaron = conteoDeTipo(ctx, l.id, "raised_hand");
  const contactados = conteoDeTipo(ctx, l.id, "contacted");
  const agendados = conteoDeTipo(ctx, l.id, "call_booked");
  const asistieronALaLlamada = conteoDeTipo(ctx, l.id, "call_attended");
  const ventas = ventasDelLanzamiento(ctx, l.id);
  const anuncios = anunciosDelLanzamiento(ctx, l, registrados, ventas);
  const paso = (p: PasoDelEmbudo["paso"], etiqueta: string, personas: Dato<number>) => ({
    paso: p,
    etiqueta,
    personas,
  });
  return {
    registrados,
    sesiones,
    asistieron,
    seQuedaron,
    levantaron,
    contactados,
    agendados,
    asistieronALaLlamada,
    ventas,
    anuncios,
    embudo: [
      paso("visitas", "Visitaron la landing", visitas),
      paso("registrados", "Se registraron", registrados),
      paso("confirmaron_el_email", "Confirmaron el email", conteoDeTipo(ctx, l.id, "email_confirmed")),
      paso("asistieron", "Asistieron", asistieron),
      paso("se_quedaron_a_la_oferta", "Se quedaron a la oferta", seQuedaron),
      paso("levantaron_la_mano", "Levantaron la mano", levantaron),
      paso("contactados", "Contactados", contactados),
      paso("agendados", "Agendaron llamada", agendados),
      paso("asistieron_a_la_llamada", "Asistieron a la llamada", asistieronALaLlamada),
      paso("compraron", "Compraron", ventas.ventas),
    ],
    tasas: {
      asistencia: tasa(asistieron, registrados),
      conversionDeAsistentes: tasa(ventas.ventas, asistieron),
      conversionDeRegistrados: tasa(ventas.ventas, registrados),
    },
  };
}

function lanzamientosOrdenados(filas: FilasDelWebinar): FilaLanzamiento[] {
  const orden = { active: 0, draft: 1, closed: 2 } as const;
  return [...filas.lanzamientos].sort(
    (a, b) =>
      orden[a.status] - orden[b.status] ||
      (b.capture_starts_on ?? "").localeCompare(a.capture_starts_on ?? "") ||
      a.id.localeCompare(b.id)
  );
}


// ─── 1. Inicio ─────────────────────────────────────────────────────────────

/**
 * `zona` es la zona horaria de la organización (`organizations.timezone`;
 * `null` = la de por defecto): define qué día es hoy para los días que faltan
 * para el cierre.
 */
export function calcularInicio(
  filas: FilasDelWebinar,
  ahora: Date,
  esEjemplo: boolean,
  zona: string | null
): VistaInicio {
  const ctx = contexto(filas, ahora);
  const activo = lanzamientosOrdenados(filas).find((l) => l.status === "active");
  if (!activo) return { esEjemplo, activo: medido(null, "configuracion", ctx.ahoraIso) };

  const n = numerosDelLanzamiento(ctx, activo);
  const hace24h = new Date(ahora.getTime() - 86_400_000).toISOString();
  const recientes = filas.registros.filter(
    (r) => r.launch_id === activo.id && r.registered_at > hace24h
  ).length;
  const proxima = sesionesDe(ctx, activo.id).find((s) => s.starts_at > ctx.ahoraIso);
  const conteos = conteosDeFiltros(ctx, activo.id, n);

  const inicio: InicioDelLanzamientoActivo = {
    lanzamiento: resumen(activo),
    diasParaElCierre:
      activo.closes_on && esFechaCalendario(activo.closes_on)
        ? diasEntre(fechaEnZona(ahora, zona), activo.closes_on)
        : null,
    proximaSesion: proxima ? { id: proxima.id, empiezaAt: proxima.starts_at } : null,
    registrados: n.registrados,
    registradosUltimas24h: datoDeFuente(ctx, "landing", recientes),
    embudo: n.embudo,
    tasas: n.tasas,
    ventas: n.ventas,
    anuncios: n.anuncios,
    sesiones: n.sesiones,
    pendientesDelEquipo: {
      levantaronLaManoSinContactar: conteos.get("levanto_la_mano_sin_contactar")!.dato,
      agendadosSinCerrar: conteos.get("agendado_sin_cerrar")!.dato,
    },
    fuentes: filas.fuentes,
  };
  return { esEjemplo, activo: medido(inicio, "calculado", ctx.ahoraIso) };
}

// ─── 2. Lista de lanzamientos ──────────────────────────────────────────────

export function calcularListaDeLanzamientos(
  filas: FilasDelWebinar,
  ahora: Date,
  esEjemplo: boolean
): VistaListaDeLanzamientos {
  const ctx = contexto(filas, ahora);
  const lista: FilaDeLanzamiento[] = lanzamientosOrdenados(filas).map((l) => {
    const n = numerosDelLanzamiento(ctx, l);
    return {
      lanzamiento: resumen(l),
      registrados: n.registrados,
      asistieron: n.asistieron,
      ventas: n.ventas.ventas,
      ingresos: n.ventas.ingresos,
    };
  });
  return { esEjemplo, lanzamientos: medido(lista, "configuracion", ctx.ahoraIso) };
}

// ─── 3. Detalle del lanzamiento ────────────────────────────────────────────

export function calcularDetalleDelLanzamiento(
  filas: FilasDelWebinar,
  launchId: string,
  ahora: Date,
  esEjemplo: boolean
): VistaDetalleDelLanzamiento | null {
  const ctx = contexto(filas, ahora);
  const l = filas.lanzamientos.find((x) => x.id === launchId);
  if (!l) return null;
  const n = numerosDelLanzamiento(ctx, l);
  const porOrigen = new Map<string | null, number>();
  for (const r of filas.registros) {
    if (r.launch_id !== l.id) continue;
    porOrigen.set(r.utm_source, (porOrigen.get(r.utm_source) ?? 0) + 1);
  }
  const origenes = [...porOrigen.entries()]
    .map(([origen, registros]) => ({ origen, registros }))
    .sort((a, b) => b.registros - a.registros || (a.origen ?? "~").localeCompare(b.origen ?? "~"));
  return {
    esEjemplo,
    lanzamiento: resumen(l),
    embudo: n.embudo,
    tasas: n.tasas,
    ventas: n.ventas,
    anuncios: n.anuncios,
    sesiones: n.sesiones,
    origenes: datoDeFuente(ctx, "landing", origenes),
    fuentes: filas.fuentes,
  };
}

// ─── 4. Leads ──────────────────────────────────────────────────────────────

type ConteoInterno = { dato: Dato<number>; leads: Set<string> };

function conteosDeFiltros(
  ctx: Contexto,
  launchId: string,
  n: Numeros
): Map<FiltroDeLeads, ConteoInterno> {
  const registrados = leadsCon(ctx, launchId, "registered");
  const asistieron = leadsCon(ctx, launchId, "attended");
  const levantaron = leadsCon(ctx, launchId, "raised_hand");
  const contactados = leadsCon(ctx, launchId, "contacted");
  const agendados = leadsCon(ctx, launchId, "call_booked");
  const compraron = leadsCon(ctx, launchId, "purchased");
  const menos = (a: Set<string>, b: Set<string>) => new Set([...a].filter((x) => !b.has(x)));

  const reglas: Record<FiltroDeLeads, [Set<string>, readonly Dato<number>[]]> = {
    todos: [registrados, [n.registrados]],
    registrado_sin_asistir: [menos(registrados, asistieron), [n.registrados, n.asistieron]],
    asistio_sin_levantar_la_mano: [menos(asistieron, levantaron), [n.asistieron, n.levantaron]],
    levanto_la_mano_sin_contactar: [menos(levantaron, contactados), [n.levantaron, n.contactados]],
    agendado_sin_cerrar: [menos(agendados, compraron), [n.agendados, n.ventas.ventas]],
  };
  const conteos = new Map<FiltroDeLeads, ConteoInterno>();
  for (const filtro of FILTROS_DE_LEADS) {
    const [leads, dependeDe] = reglas[filtro];
    conteos.set(filtro, { leads, dato: derivar(dependeDe, () => leads.size) });
  }
  return conteos;
}

function origenDe(r: FilaRegistro): OrigenDelRegistro {
  return {
    utmSource: r.utm_source,
    utmMedium: r.utm_medium,
    utmCampaign: r.utm_campaign,
    utmContent: r.utm_content,
  };
}

function etapaDerivada(eventos: FilaEvento[]): EtapaDelLead {
  const etapas = eventos
    .filter((e): e is FilaEvento & { kind: EtapaDelLead } =>
      (ETAPAS_DEL_LEAD as readonly string[]).includes(e.kind)
    )
    .sort(
      (a, b) =>
        a.occurred_at.localeCompare(b.occurred_at) ||
        ETAPAS_DEL_LEAD.indexOf(a.kind) - ETAPAS_DEL_LEAD.indexOf(b.kind)
    );
  return etapas.at(-1)?.kind ?? "registered";
}

function estadoDeVentaDe(ctx: Contexto, launchId: string, leadId: string) {
  const fila = ctx.filas.estadosDeVenta.find(
    (s) => s.launch_id === launchId && s.lead_id === leadId
  );
  const eventos = ctx.filas.eventos.filter(
    (e) => e.launch_id === launchId && e.lead_id === leadId
  );
  const contactos = eventos
    .filter((e) => e.kind === "contacted")
    .map((e) => e.occurred_at)
    .sort();
  return {
    etapa: fila?.stage ?? etapaDerivada(eventos),
    responsable: fila?.owner_user_id ? (ctx.equipo.get(fila.owner_user_id) ?? null) : null,
    ultimoContactoAt: fila ? fila.last_contact_at : (contactos.at(-1) ?? null),
  };
}

function leerCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const m = /^o(\d{1,7})$/.exec(cursor);
  return m ? Number(m[1]) : 0;
}

export function calcularLeads(
  filas: FilasDelWebinar,
  parametros: ParametrosDeLeads,
  ahora: Date,
  esEjemplo: boolean
): VistaLeads {
  const ctx = contexto(filas, ahora);
  const ordenados = lanzamientosOrdenados(filas);
  const opciones = ordenados.map(opcion);
  const elegido =
    ordenados.find((l) => l.id === parametros.launchId) ??
    ordenados.find((l) => l.status === "active") ??
    ordenados[0] ??
    null;
  const filtro: FiltroDeLeads =
    parametros.filtro && (FILTROS_DE_LEADS as readonly string[]).includes(parametros.filtro)
      ? (parametros.filtro as FiltroDeLeads)
      : "todos";
  const busqueda = (parametros.busqueda ?? "").trim();

  const base = {
    esEjemplo,
    lanzamientos: medido(opciones, "configuracion", ctx.ahoraIso),
    filtroElegido: filtro,
    busqueda,
  };
  if (!elegido) {
    const vacio = medido(0, "landing", ctx.ahoraIso);
    return {
      ...base,
      lanzamientoElegido: null,
      filtros: FILTROS_DE_LEADS.map((f) => ({ filtro: f, etiqueta: ETIQUETA_DEL_FILTRO[f], personas: vacio })),
      total: vacio,
      filas: medido([], "landing", ctx.ahoraIso),
      siguienteCursor: null,
    };
  }

  const n = numerosDelLanzamiento(ctx, elegido);
  const conteos = conteosDeFiltros(ctx, elegido.id, n);
  const filtros: ConteoDeFiltro[] = FILTROS_DE_LEADS.map((f) => ({
    filtro: f,
    etiqueta: ETIQUETA_DEL_FILTRO[f],
    personas: conteos.get(f)!.dato,
  }));
  const { dato: datoDelFiltro, leads: delFiltro } = conteos.get(filtro)!;

  const leadsPorId = new Map(filas.leads.map((l) => [l.id, l]));
  const texto = busqueda.toLocaleLowerCase("es");
  const registros = filas.registros
    .filter((r) => r.launch_id === elegido.id && delFiltro.has(r.lead_id))
    .filter((r) => {
      if (!texto) return true;
      const lead = leadsPorId.get(r.lead_id);
      return (
        !!lead &&
        ((lead.name ?? "").toLocaleLowerCase("es").includes(texto) ||
          lead.email.toLocaleLowerCase("es").includes(texto))
      );
    })
    .sort((a, b) => b.registered_at.localeCompare(a.registered_at) || a.lead_id.localeCompare(b.lead_id));

  const desde = leerCursor(parametros.cursor);
  const pagina = registros.slice(desde, desde + LEADS_POR_PAGINA);
  const filasDeLeads: FilaDeLead[] = pagina.flatMap((r) => {
    const lead = leadsPorId.get(r.lead_id);
    if (!lead) return [];
    const venta = estadoDeVentaDe(ctx, elegido.id, lead.id);
    return [
      {
        leadId: lead.id,
        nombre: lead.name,
        email: lead.email,
        telefono: lead.phone_e164,
        etapa: venta.etapa,
        origen: origenDe(r),
        registradoAt: r.registered_at,
        responsable: venta.responsable,
        ultimoContactoAt: venta.ultimoContactoAt,
      },
    ];
  });
  const hayMas = desde + LEADS_POR_PAGINA < registros.length;

  return {
    ...base,
    lanzamientoElegido: opcion(elegido),
    filtros,
    total: derivar([datoDelFiltro], () => registros.length),
    filas: derivar([datoDelFiltro], () => filasDeLeads),
    siguienteCursor: hayMas && datoDelFiltro.value !== null ? `o${desde + LEADS_POR_PAGINA}` : null,
  };
}

// ─── 5. Ficha del lead ─────────────────────────────────────────────────────

/** Fuentes que no se cargan a mano y pueden faltar en la línea de tiempo. */
const FUENTES_EXTERNAS: readonly FuenteDelDato[] = [
  "landing",
  "zoom",
  "ghl",
  "calendly",
  "whop",
  "fanbasis",
  "commas",
];

export function calcularFichaDelLead(
  filas: FilasDelWebinar,
  leadId: string,
  launchId: string | null | undefined,
  ahora: Date,
  esEjemplo: boolean
): VistaFichaDelLead | null {
  const ctx = contexto(filas, ahora);
  const lead = filas.leads.find((l) => l.id === leadId);
  if (!lead) return null;
  const lanzamientos = new Map(filas.lanzamientos.map((l) => [l.id, l]));
  const registros = filas.registros
    .filter((r) => r.lead_id === lead.id && lanzamientos.has(r.launch_id))
    .sort((a, b) => b.registered_at.localeCompare(a.registered_at));
  if (registros.length === 0) return null;
  const registroElegido = registros.find((r) => r.launch_id === launchId) ?? registros[0];
  const elegido = lanzamientos.get(registroElegido.launch_id)!;

  const eventos = filas.eventos
    .filter((e) => e.lead_id === lead.id)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id));
  const lineaDeTiempo: EventoDelLead[] = eventos.map((e) => ({
    id: e.id,
    launchId: e.launch_id,
    tipo: e.kind,
    occurredAt: e.occurred_at,
    fuente: e.source,
    cargadoPor: e.actor_user_id ? (ctx.equipo.get(e.actor_user_id) ?? null) : null,
    sesionId: e.data.session_id ?? null,
  }));

  const compras: CompraDelLead[] = asociarReembolsos(eventos).compras.map(({ compra: e, reembolso }) => ({
    eventoId: e.id,
    launchId: e.launch_id,
    producto: e.data.product ?? "Producto sin nombre",
    monto: e.data.amount ?? null,
    moneda: e.data.currency ?? lanzamientos.get(e.launch_id)?.currency ?? "",
    estado: reembolso ? "reembolsada" : "cobrada",
    fuente: e.source,
    occurredAt: e.occurred_at,
  }));
  const principal = productoDe(ctx, elegido.id, "main");

  const notas = filas.notas
    .filter((x) => x.lead_id === lead.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((x) => ({
      id: x.id,
      launchId: x.launch_id,
      texto: x.body,
      autor: x.author_user_id ? (ctx.equipo.get(x.author_user_id) ?? null) : null,
      creadaAt: x.created_at,
    }));

  return {
    esEjemplo,
    lead: {
      id: lead.id,
      nombre: lead.name,
      email: lead.email,
      telefono: lead.phone_e164,
      primeraVezAt: lead.first_seen_at,
    },
    whatsappUrl: lead.phone_e164 ? `https://wa.me/${lead.phone_e164.replace(/^\+/, "")}` : null,
    registros: registros.map((r) => ({
      lanzamiento: opcion(lanzamientos.get(r.launch_id)!),
      registradoAt: r.registered_at,
      origen: origenDe(r),
      calificacion: r.qualification,
    })),
    lanzamientoElegido: opcion(elegido),
    // Los eventos los guarda Limitless: la lista siempre se puede leer. Lo que
    // una fuente no trajo se avisa en `avisosDeFuentes`.
    lineaDeTiempo: medido(lineaDeTiempo, "calculado", ctx.ahoraIso),
    avisosDeFuentes: FUENTES_EXTERNAS.map((f) => estadoDeFuente(filas, f)).filter(
      (f) => f.state !== "medido" && filas.fuentes.some((x) => x.fuente === f.fuente)
    ),
    estadoDeVenta: medido(estadoDeVentaDe(ctx, elegido.id, lead.id), "manual", ctx.ahoraIso),
    notas: medido(notas, "manual", ctx.ahoraIso),
    compras: principal ? datoDeProveedor(ctx, principal.provider, compras) : sinProductoPrincipal(),
    equipo: [...ctx.equipo.values()],
  };
}

// ─── 6. Configuración del lanzamiento ──────────────────────────────────────

export function calcularConfiguracionDelLanzamiento(
  filas: FilasDelWebinar,
  launchId: string,
  esEjemplo: boolean
): VistaConfiguracionDelLanzamiento | null {
  const l = filas.lanzamientos.find((x) => x.id === launchId);
  if (!l) return null;
  const sesiones = filas.sesiones
    .filter((s) => s.launch_id === l.id)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const campanas = filas.campanas.filter((c) => c.launch_id === l.id);
  const productos = filas.productos.filter((p) => p.launch_id === l.id);

  const faltantes: FaltanteDeConfiguracion[] = [];
  if (sesiones.length === 0) {
    faltantes.push({ campo: "sesiones", sesionId: null, reason: MOTIVO_FALTA.sesiones });
  }
  sesiones.forEach((s, i) => {
    if (!s.zoom_webinar_id) {
      faltantes.push({
        campo: "zoom_webinar_id",
        sesionId: s.id,
        reason: MOTIVO_FALTA.zoomWebinarId(i + 1),
      });
    }
    if (s.offer_offset_seconds === null) {
      faltantes.push({
        campo: "segundo_de_la_oferta",
        sesionId: s.id,
        reason: MOTIVO_FALTA.segundoDeLaOferta(i + 1),
      });
    }
  });
  if (!productos.some((p) => p.role === "main")) {
    faltantes.push({
      campo: "producto_principal",
      sesionId: null,
      reason: MOTIVO_FALTA.productoPrincipal,
    });
  }
  if (l.variant !== "organic" && campanas.length === 0) {
    faltantes.push({
      campo: "campanas",
      sesionId: null,
      reason: MOTIVO_FALTA.campanas,
    });
  }

  return {
    esEjemplo,
    lanzamiento: resumen(l),
    sesiones: sesiones.map((s) => ({
      id: s.id,
      empiezaAt: s.starts_at,
      zoomWebinarId: s.zoom_webinar_id,
      segundoDeLaOferta: s.offer_offset_seconds,
    })),
    campanas: campanas.map((c) => ({
      id: c.id,
      plataforma: c.platform,
      campaignExternalId: c.campaign_external_id,
    })),
    productos: productos.map((p) => ({
      id: p.id,
      proveedor: p.provider,
      productExternalId: p.product_external_id,
      rol: p.role,
    })),
    faltantes,
    fuentes: filas.fuentes,
  };
}

import type { Dato, EstadoDelDato, FuenteDelDato } from "./dato";

/**
 * ⭐ Contratos de vista de Limitless Webinars (SCRUM-542, plan "UI primero,
 * datos después").
 *
 * Un tipo por pantalla. Cada pantalla lee sólo de su función de lectura
 * (`leer.ts`) y recibe esto; no sabe si los datos salen del escenario de
 * ejemplo o de la base. Cuando las funciones lean la base real (B4), este
 * archivo no cambia.
 *
 * Reglas del contrato (doc: `docs/areas/webinars-contratos-de-vista.md`):
 *   - todo número es un `Dato` (valor, estado, fuente, motivo, fecha);
 *   - las listas que dependen de una fuente también son un `Dato`;
 *   - toda vista lleva `esEjemplo`: con `true` la pantalla muestra el cartel
 *     fijo "Datos de ejemplo" (`components/webinar/cartel-datos-de-ejemplo.tsx`);
 *   - las fechas son ISO 8601 en UTC (`string`); las de calendario, `AAAA-MM-DD`;
 *   - los montos van en la moneda del lanzamiento (`moneda`), sin convertir;
 *   - las tasas van entre 0 y 1; `null` es "no se puede calcular" (cero en el
 *     denominador) y se muestra "—".
 * Los nombres de dominio siguen el modelo propuesto en SCRUM-526 (variantes,
 * estados, tipos de evento); los valores en inglés son los de la base.
 */

// ─── Dominio compartido ────────────────────────────────────────────────────

export type VarianteDelLanzamiento = "organic" | "paid" | "paid_plus";
export type EstadoDelLanzamiento = "draft" | "active" | "closed";

/** Los tipos de evento del recorrido de un lead (`lead_events.kind`). */
export const TIPOS_DE_EVENTO = [
  "registered",
  "zoom_link_created",
  "email_confirmed",
  "vip_purchased",
  "attended",
  "stayed_to_offer",
  "raised_hand",
  "contacted",
  "qualified",
  "disqualified",
  "call_booked",
  "call_attended",
  "call_no_show",
  "purchased",
  "refunded",
] as const;
export type TipoDeEvento = (typeof TIPOS_DE_EVENTO)[number];

/**
 * Las etapas que se muestran en la columna "Etapa" de Leads y en el estado de
 * venta de la ficha (borrador de fichas de SCRUM-549), en el orden del
 * recorrido.
 */
export const ETAPAS_DEL_LEAD = [
  "registered",
  "attended",
  "stayed_to_offer",
  "raised_hand",
  "contacted",
  "qualified",
  "disqualified",
  "call_booked",
  "call_attended",
  "call_no_show",
  "purchased",
  "refunded",
] as const satisfies readonly TipoDeEvento[];
export type EtapaDelLead = (typeof ETAPAS_DEL_LEAD)[number];

export const ETIQUETA_DEL_EVENTO: Record<TipoDeEvento, string> = {
  registered: "Se registró",
  zoom_link_created: "Recibió el link de Zoom",
  email_confirmed: "Confirmó el email",
  vip_purchased: "Compró el VIP",
  attended: "Asistió",
  stayed_to_offer: "Se quedó a la oferta",
  raised_hand: "Levantó la mano",
  contacted: "Contactado",
  qualified: "Calificado",
  disqualified: "Descalificado",
  call_booked: "Agendó una llamada",
  call_attended: "Asistió a la llamada",
  call_no_show: "No se presentó a la llamada",
  purchased: "Compró",
  refunded: "Reembolsó",
};

/** Alguien del equipo de la organización (setter, closer, dueño). */
export type PersonaDelEquipo = { userId: string; nombre: string };

/**
 * Cómo está una fuente de datos para la organización. Usa los mismos cinco
 * estados que un número: `medido` es "conectada y al día".
 */
export type EstadoDeFuente = {
  fuente: FuenteDelDato;
  state: EstadoDelDato;
  /** Texto para el usuario; `null` si está `medido`. */
  reason: string | null;
  /** Última lectura buena de la fuente. */
  ultimaLecturaAt: string | null;
};

/** Lo que identifica a un lanzamiento en todas las pantallas. */
export type LanzamientoResumen = {
  id: string;
  nombre: string;
  variante: VarianteDelLanzamiento;
  estado: EstadoDelLanzamiento;
  /** Código ISO 4217 (USD, ARS...). */
  moneda: string;
  precioDeLaOferta: number | null;
  captaDesde: string | null;
  cierraEl: string | null;
  cerradoAt: string | null;
};

export type PasoDelEmbudoId =
  | "visitas"
  | "registrados"
  | "confirmaron_el_email"
  | "asistieron"
  | "se_quedaron_a_la_oferta"
  | "levantaron_la_mano"
  | "contactados"
  | "agendados"
  | "asistieron_a_la_llamada"
  | "compraron";

export type PasoDelEmbudo = {
  paso: PasoDelEmbudoId;
  etiqueta: string;
  /** Personas distintas (visitantes en `visitas`). */
  personas: Dato<number>;
};

export type VentasDelLanzamiento = {
  /** Personas que compraron la oferta principal. */
  ventas: Dato<number>;
  /** Cobrado por la oferta principal, neto de reembolsos. */
  ingresos: Dato<number>;
  reembolsos: Dato<number>;
  /** Personas que compraron el VIP (sólo con producto VIP configurado). */
  ventasVip: Dato<number> | null;
};

/** Sólo en las variantes pagas (`paid`, `paid_plus`); `null` en orgánica. */
export type AnunciosDelLanzamiento = {
  inversion: Dato<number>;
  costoPorRegistro: Dato<number | null>;
  costoPorVenta: Dato<number | null>;
  /** Ingresos / inversión. */
  roas: Dato<number | null>;
};

export type SesionDelLanzamiento = {
  id: string;
  empiezaAt: string;
  /** `null` mientras la sesión no ocurrió. */
  asistieron: Dato<number> | null;
  seQuedaronALaOferta: Dato<number> | null;
};

export type TasasDelLanzamiento = {
  /** Asistieron / registrados. */
  asistencia: Dato<number | null>;
  /** Compraron / asistieron. */
  conversionDeAsistentes: Dato<number | null>;
  /** Compraron / registrados. */
  conversionDeRegistrados: Dato<number | null>;
};

/** Origen de un registro (UTM de la landing). Todo `null` = directo o sin dato. */
export type OrigenDelRegistro = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
};

// ─── 1. Inicio del lanzamiento activo (SCRUM-543) ──────────────────────────

export type InicioDelLanzamientoActivo = {
  lanzamiento: LanzamientoResumen;
  /**
   * Días calendario hasta `cierraEl`, contados desde el hoy de la zona de la
   * organización (0 = cierra hoy, negativo = la fecha ya pasó y sigue activo);
   * `null` sin fecha de cierre.
   */
  diasParaElCierre: number | null;
  proximaSesion: { id: string; empiezaAt: string } | null;
  registrados: Dato<number>;
  registradosUltimas24h: Dato<number>;
  embudo: PasoDelEmbudo[];
  tasas: TasasDelLanzamiento;
  ventas: VentasDelLanzamiento;
  anuncios: AnunciosDelLanzamiento | null;
  sesiones: SesionDelLanzamiento[];
  /** Lo que el equipo tiene que mover hoy. */
  pendientesDelEquipo: {
    levantaronLaManoSinContactar: Dato<number>;
    agendadosSinCerrar: Dato<number>;
  };
  fuentes: EstadoDeFuente[];
};

export type VistaInicio = {
  esEjemplo: boolean;
  /** `medido` con `null`: la organización no tiene un lanzamiento activo. */
  activo: Dato<InicioDelLanzamientoActivo | null>;
};

// ─── 2. Lista de lanzamientos (SCRUM-544) ──────────────────────────────────

export type FilaDeLanzamiento = {
  lanzamiento: LanzamientoResumen;
  registrados: Dato<number>;
  asistieron: Dato<number>;
  ventas: Dato<number>;
  ingresos: Dato<number>;
};

export type VistaListaDeLanzamientos = {
  esEjemplo: boolean;
  /** Activos primero, después del más nuevo al más viejo. */
  lanzamientos: Dato<FilaDeLanzamiento[]>;
};

// ─── 3. Detalle del lanzamiento (SCRUM-544) ────────────────────────────────

export type OrigenConRegistros = {
  /** `utm_source`; `null` = directo o sin dato. */
  origen: string | null;
  registros: number;
};

export type VistaDetalleDelLanzamiento = {
  esEjemplo: boolean;
  lanzamiento: LanzamientoResumen;
  embudo: PasoDelEmbudo[];
  tasas: TasasDelLanzamiento;
  ventas: VentasDelLanzamiento;
  anuncios: AnunciosDelLanzamiento | null;
  sesiones: SesionDelLanzamiento[];
  /** Registros por origen, de más a menos. */
  origenes: Dato<OrigenConRegistros[]>;
  fuentes: EstadoDeFuente[];
};

// ─── 4. Leads (SCRUM-545) ──────────────────────────────────────────────────

export const FILTROS_DE_LEADS = [
  "todos",
  "registrado_sin_asistir",
  "asistio_sin_levantar_la_mano",
  "levanto_la_mano_sin_contactar",
  "agendado_sin_cerrar",
] as const;
export type FiltroDeLeads = (typeof FILTROS_DE_LEADS)[number];

export const ETIQUETA_DEL_FILTRO: Record<FiltroDeLeads, string> = {
  todos: "Todos",
  registrado_sin_asistir: "Registrado sin asistir",
  asistio_sin_levantar_la_mano: "Asistió sin levantar la mano",
  levanto_la_mano_sin_contactar: "Levantó la mano sin contactar",
  agendado_sin_cerrar: "Agendado sin cerrar",
};

/** Lo que llega de la URL de `/leads` (los filtros viven en la URL, §11.3). */
export type ParametrosDeLeads = {
  /** Sin lanzamiento: el activo; si no hay activo, el más nuevo. */
  launchId?: string | null;
  /**
   * Llega como texto de la URL (`?filtro=`): la lectura lo valida y uno que no
   * es de `FILTROS_DE_LEADS` se toma como `todos`.
   */
  filtro?: string | null;
  /** Busca por nombre o email, sin distinguir mayúsculas. */
  busqueda?: string | null;
  /** Opaco: el `siguienteCursor` de la página anterior. */
  cursor?: string | null;
};

export const LEADS_POR_PAGINA = 50;

export type OpcionDeLanzamiento = Pick<LanzamientoResumen, "id" | "nombre" | "estado">;

export type FilaDeLead = {
  leadId: string;
  /** `null` si la landing no lo pidió: la pantalla muestra el email. */
  nombre: string | null;
  email: string;
  telefono: string | null;
  etapa: EtapaDelLead;
  origen: OrigenDelRegistro;
  registradoAt: string;
  responsable: PersonaDelEquipo | null;
  /** `null` = nunca contactado. */
  ultimoContactoAt: string | null;
};

export type ConteoDeFiltro = {
  filtro: FiltroDeLeads;
  etiqueta: string;
  personas: Dato<number>;
};

export type VistaLeads = {
  esEjemplo: boolean;
  /** Para el selector. `medido` con `[]`: no hay lanzamientos (botón a crear uno). */
  lanzamientos: Dato<OpcionDeLanzamiento[]>;
  lanzamientoElegido: OpcionDeLanzamiento | null;
  filtroElegido: FiltroDeLeads;
  busqueda: string;
  /** Un conteo por filtro listo, en el orden de `FILTROS_DE_LEADS`. */
  filtros: ConteoDeFiltro[];
  /** Total del filtro y la búsqueda elegidos (todas las páginas). */
  total: Dato<number>;
  /** La página pedida: hasta `LEADS_POR_PAGINA`, del registro más nuevo al más viejo. */
  filas: Dato<FilaDeLead[]>;
  /** `null` si no hay más páginas. */
  siguienteCursor: string | null;
};

// ─── 5. Ficha del lead (SCRUM-545) ─────────────────────────────────────────

export type RegistroDelLead = {
  lanzamiento: OpcionDeLanzamiento;
  registradoAt: string;
  origen: OrigenDelRegistro;
  /** Respuesta a la pregunta de calificación de la landing. */
  calificacion: string | null;
};

export type EventoDelLead = {
  id: string;
  launchId: string;
  tipo: TipoDeEvento;
  occurredAt: string;
  fuente: FuenteDelDato;
  /** Quién lo cargó, si lo cargó el equipo. */
  cargadoPor: PersonaDelEquipo | null;
  /** La sesión, en los eventos de Zoom. */
  sesionId: string | null;
};

export type EstadoDeVenta = {
  etapa: EtapaDelLead;
  responsable: PersonaDelEquipo | null;
  ultimoContactoAt: string | null;
};

export type NotaDelLead = {
  id: string;
  launchId: string;
  texto: string;
  autor: PersonaDelEquipo | null;
  creadaAt: string;
};

export type CompraDelLead = {
  eventoId: string;
  launchId: string;
  producto: string;
  /** `null` si el monto no se pudo leer (nunca un cero inventado). */
  monto: number | null;
  moneda: string;
  estado: "cobrada" | "reembolsada";
  fuente: FuenteDelDato;
  occurredAt: string;
};

export type VistaFichaDelLead = {
  esEjemplo: boolean;
  lead: {
    id: string;
    nombre: string | null;
    email: string;
    telefono: string | null;
    primeraVezAt: string;
  };
  /** `https://wa.me/<número>`; `null` sin teléfono ("No dejó teléfono"). */
  whatsappUrl: string | null;
  /** En qué lanzamientos se registró, del más nuevo al más viejo. */
  registros: RegistroDelLead[];
  /** El lanzamiento del estado de venta (el pedido, o el registro más nuevo). */
  lanzamientoElegido: OpcionDeLanzamiento;
  /** Todos los eventos de la persona, del más viejo al más nuevo. */
  lineaDeTiempo: Dato<EventoDelLead[]>;
  /**
   * Fuentes que no están al día: la línea de tiempo puede no tener sus
   * eventos ("Zoom sin conectar: no sabemos si asistió").
   */
  avisosDeFuentes: EstadoDeFuente[];
  estadoDeVenta: Dato<EstadoDeVenta>;
  notas: Dato<NotaDelLead[]>;
  compras: Dato<CompraDelLead[]>;
  /** Para asignar responsable. */
  equipo: PersonaDelEquipo[];
};

// ─── 6. Configuración del lanzamiento ──────────────────────────────────────

export type SesionConfigurada = {
  id: string;
  empiezaAt: string;
  zoomWebinarId: string | null;
  /** Segundos desde el inicio hasta la oferta; `null` = falta cargarlo. */
  segundoDeLaOferta: number | null;
};

export type CampanaConfigurada = {
  id: string;
  plataforma: string;
  campaignExternalId: string;
};

export type ProductoConfigurado = {
  id: string;
  proveedor: string;
  productExternalId: string;
  rol: "main" | "vip";
};

/** Algo que falta cargar para que un número se pueda medir. */
export type FaltanteDeConfiguracion = {
  /** Qué parte de la configuración (para enfocar el campo). */
  campo: "sesiones" | "zoom_webinar_id" | "segundo_de_la_oferta" | "producto_principal" | "campanas";
  /** La sesión, si el faltante es de una sesión. */
  sesionId: string | null;
  reason: string;
};

export type VistaConfiguracionDelLanzamiento = {
  esEjemplo: boolean;
  lanzamiento: LanzamientoResumen;
  sesiones: SesionConfigurada[];
  campanas: CampanaConfigurada[];
  productos: ProductoConfigurado[];
  faltantes: FaltanteDeConfiguracion[];
  fuentes: EstadoDeFuente[];
};

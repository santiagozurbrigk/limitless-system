import type { EtapaDelLead, EstadoDeFuente } from "./contratos";
import { ETAPAS_DEL_LEAD } from "./contratos";
import type {
  FilaEvento,
  FilaLanzamiento,
  FilaLead,
  FilaNota,
  FilaRegistro,
  FilaSesion,
  FilaVisita,
  FilasDelWebinar,
} from "./filas";

/**
 * ⭐ Escenario de ejemplo de Limitless Webinars (SCRUM-542).
 *
 * Datos inventados, sólo para la organización de demo (`org-de-demo.ts`) y
 * siempre con el cartel "Datos de ejemplo". Determinístico: la misma `ahora`
 * da exactamente las mismas filas (generador con semilla fija, sin
 * `Math.random`). Las fechas se arman hacia atrás desde `ahora` para que el
 * lanzamiento activo se vea en curso cualquier día.
 *
 * Qué tiene:
 *   - un lanzamiento activo de variante Pago (2 sesiones de Zoom ya
 *     ocurridas, cierra en 3 días) y uno cerrado de variante Orgánica (1 sesión);
 *   - 300 leads (210 en el activo, 120 en el cerrado, 30 en los dos) con un
 *     recorrido coherente: nadie asiste a una sesión anterior a su registro,
 *     nadie compra sin haber asistido, cada etapa viene después de la anterior;
 *   - ventas por Whop, llamadas por Calendly, carga del equipo, notas;
 *   - números en los cinco estados:
 *       medido           registros, asistencia, llamadas, ventas;
 *       sin_fuente       email confirmado (GoHighLevel sin conectar);
 *       falta_configurar "se quedó a la oferta" de la sesión 2 (sin minuto de
 *                        la oferta) y por eso el total;
 *       desactualizado   inversión en Meta Ads (última lectura hace 3 días) y
 *                        lo que sale de ella (costo por registro, ROAS);
 *       error            ventas VIP (Commas rechazó la clave).
 *
 * Los contactos no son de nadie: emails `@example.com` (dominio reservado,
 * RFC 2606) y teléfonos del rango +44 7700 900000-900999, que Ofcom reserva
 * para ficción: el botón de WhatsApp nunca abre el chat de una persona real.
 */

export const SEMILLA_DEL_ESCENARIO = 542;

/** Prefijo de todos los IDs del escenario: un UUID que no sale de `gen_random_uuid()` por azar. */
export const PREFIJO_DE_IDS_DE_EJEMPLO = "e1e1e1e1-0000-4000-8";

function idDeEjemplo(tipo: number, n: number): string {
  return `${PREFIJO_DE_IDS_DE_EJEMPLO}${tipo.toString(16).padStart(3, "0")}-${n.toString(16).padStart(12, "0")}`;
}

/** mulberry32: chico, rápido y con semilla. No es criptográfico (no hace falta). */
function generador(semilla: number) {
  let a = semilla >>> 0;
  const siguiente = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    siguiente,
    /** `true` con probabilidad `p`. */
    si: (p: number) => siguiente() < p,
    entre: (min: number, max: number) => min + siguiente() * (max - min),
    uno: <T>(lista: readonly T[]): T => lista[Math.floor(siguiente() * lista.length)],
  };
}

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

const NOMBRES = [
  "Ana", "Bruno", "Camila", "Diego", "Elena", "Facundo", "Gabriela", "Hernán", "Inés", "Joaquín",
  "Karina", "Lautaro", "Martina", "Nicolás", "Olivia", "Pablo", "Renata", "Santiago", "Valentina", "Tomás",
] as const;
const APELLIDOS = [
  "Acosta", "Benítez", "Castro", "Domínguez", "Espósito", "Fernández", "Giménez", "Herrera",
  "Ibarra", "Juárez", "López", "Medina", "Navarro", "Ortiz", "Paz",
] as const;

export const EQUIPO_DE_EJEMPLO = [
  { user_id: idDeEjemplo(0x0f0, 1), nombre: "Lucía (setter de ejemplo)" },
  { user_id: idDeEjemplo(0x0f0, 2), nombre: "Julián (setter de ejemplo)" },
  { user_id: idDeEjemplo(0x0f0, 3), nombre: "Carla (closer de ejemplo)" },
] as const;
const [SETTER_1, SETTER_2, CLOSER] = EQUIPO_DE_EJEMPLO;

const NOTAS = [
  "Le interesa, pide pagar en dos cuotas.",
  "No contestó la primera vez; volver a escribir mañana.",
  "Ya hizo un programa parecido, quiere saber qué cambia.",
  "Pidió hablar con el closer antes de decidir.",
  "Tiene el presupuesto, falta que lo apruebe su socio.",
] as const;

type PlanDeLanzamiento = {
  lanzamiento: FilaLanzamiento;
  sesiones: FilaSesion[];
  capturaDesde: number;
  capturaHasta: number;
  /** Índices de los leads que se registran. */
  leads: readonly number[];
  producto: string;
  monto: number;
  origenes: readonly (readonly [string | null, string | null, string | null, string | null])[];
};

function dia(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Las filas del escenario. `ahora` se redondea a la hora: el escenario no
 * cambia entre dos pedidos de la misma hora (la paginación de Leads es
 * estable).
 */
export function escenarioDeEjemplo(ahora: Date): FilasDelWebinar {
  const t0 = Math.floor(ahora.getTime() / HORA) * HORA;
  const azar = generador(SEMILLA_DEL_ESCENARIO);

  const activoId = idDeEjemplo(0x001, 1);
  const cerradoId = idDeEjemplo(0x001, 2);

  const activo: PlanDeLanzamiento = {
    lanzamiento: {
      id: activoId,
      name: "Webinar de ejemplo: lanzamiento en curso",
      variant: "paid",
      offer_price: 997,
      currency: "USD",
      capture_starts_on: dia(t0 - 14 * DIA),
      closes_on: dia(t0 + 3 * DIA),
      status: "active",
      closed_at: null,
    },
    sesiones: [
      {
        id: idDeEjemplo(0x002, 1),
        launch_id: activoId,
        starts_at: iso(t0 - 4 * DIA),
        zoom_webinar_id: "81234567890",
        offer_offset_seconds: 3600,
        report_status: "ok",
      },
      {
        id: idDeEjemplo(0x002, 2),
        launch_id: activoId,
        starts_at: iso(t0 - 2 * DIA),
        zoom_webinar_id: "81234567891",
        // Falta el minuto de la oferta: "se quedó a la oferta" queda en
        // falta_configurar para esta sesión y para el total.
        offer_offset_seconds: null,
        report_status: "ok",
      },
    ],
    capturaDesde: t0 - 14 * DIA,
    capturaHasta: t0 - HORA,
    leads: Array.from({ length: 210 }, (_, i) => i),
    producto: "Programa de ejemplo",
    monto: 997,
    origenes: [
      ["facebook", "paid_social", "webinar-en-curso", "video-a"],
      ["facebook", "paid_social", "webinar-en-curso", "video-b"],
      ["facebook", "paid_social", "webinar-en-curso", "video-a"],
      ["instagram", "bio", null, null],
      [null, null, null, null],
    ],
  };

  const cerrado: PlanDeLanzamiento = {
    lanzamiento: {
      id: cerradoId,
      name: "Webinar de ejemplo: lanzamiento anterior",
      variant: "organic",
      offer_price: 497,
      currency: "USD",
      capture_starts_on: dia(t0 - 60 * DIA),
      closes_on: dia(t0 - 40 * DIA),
      status: "closed",
      closed_at: iso(t0 - 40 * DIA + 23 * HORA),
    },
    sesiones: [
      {
        id: idDeEjemplo(0x002, 3),
        launch_id: cerradoId,
        starts_at: iso(t0 - 45 * DIA),
        zoom_webinar_id: "81234567800",
        offer_offset_seconds: 3000,
        report_status: "ok",
      },
    ],
    capturaDesde: t0 - 60 * DIA,
    capturaHasta: t0 - 45 * DIA - 2 * HORA,
    leads: Array.from({ length: 120 }, (_, i) => 180 + i),
    producto: "Programa de ejemplo (edición anterior)",
    monto: 497,
    origenes: [
      ["instagram", "bio", null, null],
      ["youtube", "descripcion", "canal", null],
      [null, null, null, null],
    ],
  };

  const leads: FilaLead[] = Array.from({ length: 300 }, (_, i) => {
    const nombre = NOMBRES[i % NOMBRES.length];
    const apellido = APELLIDOS[Math.floor(i / NOMBRES.length) % APELLIDOS.length];
    const sinNombre = i % 23 === 7;
    const sinTelefono = i % 4 === 3;
    const usuario = `${nombre}.${apellido}`
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
    return {
      id: idDeEjemplo(0x010, i + 1),
      email: `${usuario}.${i + 1}@example.com`,
      name: sinNombre ? null : `${nombre} ${apellido}`,
      phone_e164: sinTelefono ? null : `+447700900${String(i).padStart(3, "0")}`,
      // Se completa con el primer registro.
      first_seen_at: "",
    };
  });

  const registros: FilaRegistro[] = [];
  const visitas: FilaVisita[] = [];
  const eventos: FilaEvento[] = [];
  const notas: FilaNota[] = [];
  let nEvento = 0;
  let nVisitante = 0;

  const evento = (
    plan: PlanDeLanzamiento,
    leadId: string,
    kind: FilaEvento["kind"],
    ms: number,
    source: FilaEvento["source"],
    extra: Partial<Pick<FilaEvento, "actor_user_id" | "data">> = {}
  ) => {
    nEvento += 1;
    eventos.push({
      id: idDeEjemplo(0x020, nEvento),
      lead_id: leadId,
      launch_id: plan.lanzamiento.id,
      kind,
      occurred_at: iso(ms),
      source,
      actor_user_id: extra.actor_user_id ?? null,
      data: extra.data ?? {},
    });
  };

  for (const plan of [cerrado, activo]) {
    const { lanzamiento } = plan;
    const fin = Math.min(plan.capturaHasta, t0);
    for (const indice of plan.leads) {
      const lead = leads[indice];
      const registroMs = Math.floor(azar.entre(plan.capturaDesde, fin) / MINUTO) * MINUTO;
      const [utm_source, utm_medium, utm_campaign, utm_content] = azar.uno(plan.origenes);
      registros.push({
        id: idDeEjemplo(0x011, registros.length + 1),
        launch_id: lanzamiento.id,
        lead_id: lead.id,
        registered_at: iso(registroMs),
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        qualification: azar.uno(["Ya facturo con mi negocio", "Estoy empezando", null] as const),
      });
      if (!lead.first_seen_at || iso(registroMs) < lead.first_seen_at) {
        lead.first_seen_at = iso(registroMs);
      }
      nVisitante += 1;
      visitas.push({ launch_id: lanzamiento.id, visitor_id: `v${nVisitante}`, day: dia(registroMs) });
      evento(plan, lead.id, "registered", registroMs, "landing");

      // Asistencia: sólo a una sesión posterior al registro y que ya ocurrió.
      const posibles = plan.sesiones.filter((s) => {
        const ms = Date.parse(s.starts_at);
        return ms > registroMs && ms < t0;
      });
      if (posibles.length === 0 || !azar.si(0.45)) continue;
      const sesion = posibles.length > 1 && azar.si(0.45) ? posibles[1] : posibles[0];
      const inicio = Date.parse(sesion.starts_at);
      evento(plan, lead.id, "attended", inicio + Math.floor(azar.entre(0, 20)) * MINUTO, "zoom", {
        data: { session_id: sesion.id },
      });

      const seQuedo = sesion.offer_offset_seconds !== null && azar.si(0.6);
      if (seQuedo) {
        evento(plan, lead.id, "stayed_to_offer", inicio + sesion.offer_offset_seconds! * 1000, "zoom", {
          data: { session_id: sesion.id },
        });
        // Compra directa en la oferta, sin llamada.
        if (azar.si(0.08)) {
          const compraMs = inicio + sesion.offer_offset_seconds! * 1000 + 10 * MINUTO;
          evento(plan, lead.id, "purchased", compraMs, "whop", {
            data: { product: plan.producto, amount: plan.monto, currency: lanzamiento.currency },
          });
          continue;
        }
      }

      const levantoMs = inicio + 75 * MINUTO;
      if (!azar.si(seQuedo ? 0.45 : 0.15)) continue;
      evento(plan, lead.id, "raised_hand", levantoMs, "landing");

      const setter = azar.si(0.5) ? SETTER_1 : SETTER_2;
      const contactoMs = levantoMs + Math.floor(azar.entre(1, 40)) * HORA;
      // Quien levantó la mano hace poco y todavía no fue contactado queda en
      // "Levantó la mano sin contactar".
      if (contactoMs >= t0 || !azar.si(0.85)) continue;
      evento(plan, lead.id, "contacted", contactoMs, "manual", { actor_user_id: setter.user_id });
      if (azar.si(0.5)) {
        notas.push({
          id: idDeEjemplo(0x030, notas.length + 1),
          launch_id: lanzamiento.id,
          lead_id: lead.id,
          author_user_id: setter.user_id,
          body: azar.uno(NOTAS),
          created_at: iso(contactoMs + 5 * MINUTO),
        });
      }

      const calificaMs = contactoMs + Math.floor(azar.entre(1, 6)) * HORA;
      if (calificaMs >= t0) continue;
      const r = azar.siguiente();
      if (r < 0.15) {
        evento(plan, lead.id, "disqualified", calificaMs, "manual", { actor_user_id: setter.user_id });
        continue;
      }
      if (r > 0.85) continue;
      evento(plan, lead.id, "qualified", calificaMs, "manual", { actor_user_id: setter.user_id });

      const agendaMs = calificaMs + HORA;
      if (agendaMs >= t0 || !azar.si(0.8)) continue;
      evento(plan, lead.id, "call_booked", agendaMs, "calendly");

      const llamadaMs = agendaMs + Math.floor(azar.entre(2, 48)) * HORA;
      if (llamadaMs >= t0) continue;
      if (!azar.si(0.75)) {
        evento(plan, lead.id, "call_no_show", llamadaMs, "calendly");
        continue;
      }
      evento(plan, lead.id, "call_attended", llamadaMs, "calendly");

      const compraMs = llamadaMs + HORA;
      if (compraMs >= t0 || !azar.si(0.55)) continue;
      evento(plan, lead.id, "purchased", compraMs, "whop", {
        data: { product: plan.producto, amount: plan.monto, currency: lanzamiento.currency },
      });
      const reembolsoMs = compraMs + 2 * DIA;
      if (reembolsoMs < t0 && azar.si(0.08)) {
        evento(plan, lead.id, "refunded", reembolsoMs, "whop", {
          data: { product: plan.producto, amount: plan.monto, currency: lanzamiento.currency },
        });
      }
    }
    // Visitantes que no se registraron.
    const sinRegistro = Math.round(plan.leads.length * 1.6);
    for (let i = 0; i < sinRegistro; i += 1) {
      nVisitante += 1;
      visitas.push({
        launch_id: lanzamiento.id,
        visitor_id: `v${nVisitante}`,
        day: dia(azar.entre(plan.capturaDesde, fin)),
      });
    }
  }

  return {
    lanzamientos: [activo.lanzamiento, cerrado.lanzamiento],
    sesiones: [...activo.sesiones, ...cerrado.sesiones],
    campanas: [
      {
        id: idDeEjemplo(0x003, 1),
        launch_id: activoId,
        platform: "meta",
        campaign_external_id: "120000000000000001",
      },
    ],
    productos: [
      { id: idDeEjemplo(0x004, 1), launch_id: activoId, provider: "whop", product_external_id: "prod_ejemplo_actual", role: "main" },
      { id: idDeEjemplo(0x004, 2), launch_id: activoId, provider: "commas", product_external_id: "vip_ejemplo_actual", role: "vip" },
      { id: idDeEjemplo(0x004, 3), launch_id: cerradoId, provider: "whop", product_external_id: "prod_ejemplo_anterior", role: "main" },
    ],
    leads,
    registros,
    visitas,
    eventos,
    estadosDeVenta: estadosDeVenta(eventos),
    notas,
    equipo: EQUIPO_DE_EJEMPLO.map((m) => ({ ...m })),
    inversiones: [{ launch_id: activoId, spend: 4380.5, synced_at: iso(t0 - 3 * DIA) }],
    fuentes: fuentesDeEjemplo(t0),
  };
}

function fuentesDeEjemplo(t0: number): EstadoDeFuente[] {
  const ok = (fuente: EstadoDeFuente["fuente"], hace: number): EstadoDeFuente => ({
    fuente,
    state: "medido",
    reason: null,
    ultimaLecturaAt: iso(t0 - hace),
  });
  return [
    ok("landing", 2 * MINUTO),
    ok("zoom", 6 * HORA),
    ok("calendly", 15 * MINUTO),
    ok("whop", 5 * MINUTO),
    {
      fuente: "meta_ads",
      state: "desactualizado",
      reason: "La última lectura de Meta Ads es de hace 3 días: la inversión puede estar atrasada.",
      ultimaLecturaAt: iso(t0 - 3 * DIA),
    },
    {
      fuente: "ghl",
      state: "sin_fuente",
      reason: "GoHighLevel no está conectado: no sabemos quién confirmó el email.",
      ultimaLecturaAt: null,
    },
    {
      fuente: "commas",
      state: "error",
      reason: "La última lectura de Commas falló porque rechazó la clave. Revisala en Integraciones.",
      ultimaLecturaAt: iso(t0 - 5 * DIA),
    },
  ];
}

/** El estado de venta de cada lead: su última etapa, responsable y último contacto. */
function estadosDeVenta(eventos: FilaEvento[]): FilasDelWebinar["estadosDeVenta"] {
  const porLead = new Map<string, FilaEvento[]>();
  for (const e of eventos) {
    const clave = `${e.launch_id}|${e.lead_id}`;
    const lista = porLead.get(clave) ?? [];
    lista.push(e);
    porLead.set(clave, lista);
  }
  return [...porLead.entries()].map(([clave, lista]) => {
    const [launch_id, lead_id] = clave.split("|");
    const etapas = lista
      .filter((e) => (ETAPAS_DEL_LEAD as readonly string[]).includes(e.kind))
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const contactos = lista.filter((e) => e.kind === "contacted").map((e) => e.occurred_at).sort();
    const setter = lista.find((e) => e.kind === "contacted")?.actor_user_id ?? null;
    const conLlamada = lista.some((e) => e.kind === "call_booked");
    return {
      launch_id,
      lead_id,
      stage: (etapas.at(-1)?.kind ?? "registered") as EtapaDelLead,
      owner_user_id: conLlamada ? CLOSER.user_id : setter,
      last_contact_at: contactos.at(-1) ?? null,
    };
  });
}

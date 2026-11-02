import type { FuenteDelDato } from "./dato";
import type {
  EstadoDeFuente,
  EstadoDelLanzamiento,
  EtapaDelLead,
  TipoDeEvento,
  VarianteDelLanzamiento,
} from "./contratos";

/**
 * Las filas de las que salen las vistas (SCRUM-542). Copian las columnas del
 * modelo propuesto en SCRUM-526 (PR #141, todavía sin migrar) con los nombres
 * de la base, más lo que las fichas de SCRUM-549 piden y el modelo todavía no
 * tiene (estado de venta, notas, equipo e inversión en anuncios).
 *
 * Hoy sólo las llena el escenario de ejemplo. En B4 las lee la base (o una
 * consulta agrupada que dé lo mismo) y pasan por las mismas funciones de
 * `calcular.ts`: el contrato de las pantallas no cambia. Si el modelo final
 * cambia un nombre, cambia acá y en la lectura, no en las pantallas.
 */

export type FilaLanzamiento = {
  id: string;
  name: string;
  variant: VarianteDelLanzamiento;
  offer_price: number | null;
  currency: string;
  capture_starts_on: string | null;
  closes_on: string | null;
  status: EstadoDelLanzamiento;
  closed_at: string | null;
};

/**
 * `report_status` lo define la integración de Zoom (Fase 2). Acá: `ok` (el
 * reporte llegó), `error` (falló al pedirlo) o `null` (todavía no llegó).
 */
export type FilaSesion = {
  id: string;
  launch_id: string;
  starts_at: string;
  zoom_webinar_id: string | null;
  offer_offset_seconds: number | null;
  report_status: "ok" | "error" | null;
};

export type FilaCampana = {
  id: string;
  launch_id: string;
  platform: string;
  campaign_external_id: string;
};

export type FilaProducto = {
  id: string;
  launch_id: string;
  provider: string;
  product_external_id: string;
  role: "main" | "vip";
};

export type FilaLead = {
  id: string;
  email: string;
  name: string | null;
  phone_e164: string | null;
  first_seen_at: string;
};

export type FilaRegistro = {
  id: string;
  launch_id: string;
  lead_id: string;
  registered_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  qualification: string | null;
};

export type FilaVisita = { launch_id: string; visitor_id: string; day: string };

/**
 * `data` según el tipo: `session_id` en los eventos de Zoom; `product`,
 * `amount` (o `null` si no se leyó) y `currency` en compras y reembolsos.
 */
export type FilaEvento = {
  id: string;
  lead_id: string;
  launch_id: string;
  kind: TipoDeEvento;
  occurred_at: string;
  source: FuenteDelDato;
  actor_user_id: string | null;
  data: {
    session_id?: string;
    product?: string;
    amount?: number | null;
    currency?: string;
  };
};

/** Proyección del estado de venta (`lead_sales_state`, falta en el modelo). */
export type FilaEstadoDeVenta = {
  launch_id: string;
  lead_id: string;
  stage: EtapaDelLead;
  owner_user_id: string | null;
  last_contact_at: string | null;
};

/** Notas del equipo (`lead_notes` o `lead_events` kind `note`: a definir). */
export type FilaNota = {
  id: string;
  launch_id: string;
  lead_id: string;
  author_user_id: string | null;
  body: string;
  created_at: string;
};

export type FilaMiembro = { user_id: string; nombre: string };

/** Inversión en anuncios del lanzamiento hasta `synced_at` (SCRUM-535). */
export type FilaInversion = { launch_id: string; spend: number; synced_at: string };

/** Todo lo que hace falta para armar las seis vistas de una organización. */
export type FilasDelWebinar = {
  lanzamientos: FilaLanzamiento[];
  sesiones: FilaSesion[];
  campanas: FilaCampana[];
  productos: FilaProducto[];
  leads: FilaLead[];
  registros: FilaRegistro[];
  visitas: FilaVisita[];
  eventos: FilaEvento[];
  estadosDeVenta: FilaEstadoDeVenta[];
  notas: FilaNota[];
  equipo: FilaMiembro[];
  inversiones: FilaInversion[];
  /**
   * Cómo está cada fuente para la organización. Una fuente que no figura se
   * toma como `sin_fuente`.
   */
  fuentes: EstadoDeFuente[];
};

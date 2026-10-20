/**
 * La configuración de Finanzas y las entradas del resumen, leídas en el
 * servidor sin chequear permisos (SCRUM-540). Las usan
 * `loadFinanceConfigAction`, `getResumenFinancieroAction` y el Panel, que
 * chequean antes. No es un archivo `"use server"`.
 */

import {
  rowToFixedExpense,
  rowToPaymentPlatform,
  rowToSubscription,
  rowToTeamCompensation,
  type FixedExpenseRow,
  type PaymentPlatformRow,
  type SubscriptionRow,
  type TeamCompensationRow,
} from "@/lib/expenses/mapper";
import { fechaDeHoyDeLaOrganizacion } from "@/lib/fechas/organizacion";
import { leerPagosDeLaOrganizacion } from "@/lib/sales/pagos";
import { registrarFallaDeAccion } from "@/lib/server/action-result";
import { leerClientes, leerLlamadasDeCierre } from "@/lib/marco/lecturas-de-servidor";
import type { EntradasDelResumen } from "@/lib/finance/resumen-financiero";
import type { createClient } from "@/lib/supabase/server";
import type { ClientPayment } from "@/types/clients";
import type { FixedExpense, Subscription, TeamCompensation } from "@/types/expenses";
import type { PaymentPlatformConfig } from "@/types/finance";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type FinanceConfigPayload = {
  fixedExpenses: FixedExpense[];
  subscriptions: Subscription[];
  teamCompensation: TeamCompensation[];
  paymentPlatforms: PaymentPlatformConfig[];
  /**
   * Los pagos no se pudieron leer: los totales recibidos por plataforma no
   * están al día (SCRUM-504). El resto de la configuración llega igual.
   */
  pagosSinLeer: boolean;
};

export const EMPTY_FINANCE_CONFIG: FinanceConfigPayload = {
  fixedExpenses: [],
  subscriptions: [],
  teamCompensation: [],
  paymentPlatforms: [],
  pagosSinLeer: false,
};

/**
 * Lo recibido por cada plataforma y su última transacción. Sin transacciones,
 * la última es `hoy`, el de la organización.
 */
export function paymentPlatformTotals(
  platforms: PaymentPlatformRow[],
  payments: ClientPayment[],
  hoy: string
): PaymentPlatformConfig[] {
  const byPlatform = new Map<string, { total: number; lastAt: string }>();

  for (const payment of payments) {
    const platformId = payment.paymentDestinationPlatformId;
    if (!platformId) continue;
    const at = payment.paymentDate.slice(0, 10);
    const prev = byPlatform.get(platformId) ?? { total: 0, lastAt: "" };
    byPlatform.set(platformId, {
      total: prev.total + payment.amount,
      lastAt: at > prev.lastAt ? at : prev.lastAt || at,
    });
  }

  return platforms.map((row) => {
    const totals = byPlatform.get(row.id);
    return rowToPaymentPlatform(row, {
      totalReceived: totals?.total ?? 0,
      lastTransactionAt: totals?.lastAt || hoy,
    });
  });
}

/**
 * Las plataformas sin lo cobrado (SCRUM-540): nombre, clave, moneda y
 * etiqueta, lo que muestran Ajustes y el cobro de Closing. Lo recibido y la
 * fecha del último cobro son de Finanzas: van en 0 y vacío, sin leer
 * `client_payments`.
 */
export function plataformasSinCobros(platforms: PaymentPlatformRow[]): PaymentPlatformConfig[] {
  return platforms.map((row) => rowToPaymentPlatform(row, { totalReceived: 0, lastTransactionAt: "" }));
}

async function leerPlataformas(supabase: Supabase, organizationId: string) {
  return supabase
    .from("payment_platforms")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");
}

async function leerFilasDeGastos(supabase: Supabase, organizationId: string) {
  return Promise.all([
    supabase.from("fixed_expenses").select("*").eq("organization_id", organizationId).order("name"),
    supabase
      .from("subscriptions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("team_compensation")
      .select("*")
      .eq("organization_id", organizationId)
      .order("member_name"),
  ]);
}

/**
 * ⭐ Con `detalle` (Finanzas): gastos fijos, suscripciones, sueldos y las
 * plataformas con lo cobrado, como siempre. Sin `detalle` (Ventas o Ajustes
 * sin Finanzas): sólo las plataformas sin lo cobrado; no se leen los gastos,
 * las suscripciones, los sueldos ni los cobros.
 */
export async function leerConfiguracionDeFinanzas(
  supabase: Supabase,
  organizationId: string,
  detalle: boolean
): Promise<FinanceConfigPayload> {
  if (!detalle) {
    const platRes = await leerPlataformas(supabase, organizationId);
    if (platRes.error) {
      console.error("[loadFinanceConfig]", platRes.error.message);
      return EMPTY_FINANCE_CONFIG;
    }
    return {
      ...EMPTY_FINANCE_CONFIG,
      paymentPlatforms: plataformasSinCobros((platRes.data ?? []) as PaymentPlatformRow[]),
    };
  }

  // Los pagos se leen aparte (AR de SCRUM-504, pasada 2): si fallan, se
  // registra la falla y los totales por plataforma quedan en cero con el
  // aviso, pero gastos, suscripciones, equipo y plataformas llegan igual.
  let payments: ClientPayment[] = [];
  let pagosSinLeer = false;
  try {
    payments = await leerPagosDeLaOrganizacion(supabase, organizationId);
  } catch (e) {
    registrarFallaDeAccion("[loadFinanceConfig] pagos", e);
    pagosSinLeer = true;
  }

  const [[fixedRes, subsRes, teamRes], platRes, hoy] = await Promise.all([
    leerFilasDeGastos(supabase, organizationId),
    leerPlataformas(supabase, organizationId),
    fechaDeHoyDeLaOrganizacion(supabase, organizationId),
  ]);

  const err =
    fixedRes.error?.message ??
    subsRes.error?.message ??
    teamRes.error?.message ??
    platRes.error?.message;
  if (err) {
    console.error("[loadFinanceConfig]", err);
    return EMPTY_FINANCE_CONFIG;
  }

  return {
    fixedExpenses: ((fixedRes.data ?? []) as FixedExpenseRow[]).map(rowToFixedExpense),
    subscriptions: ((subsRes.data ?? []) as SubscriptionRow[]).map(rowToSubscription),
    teamCompensation: ((teamRes.data ?? []) as TeamCompensationRow[]).map(rowToTeamCompensation),
    paymentPlatforms: paymentPlatformTotals((platRes.data ?? []) as PaymentPlatformRow[], payments, hoy),
    pagosSinLeer,
  };
}

/**
 * Todo lo que necesita el resumen financiero, leído en el servidor: las
 * mismas fuentes que juntaba el navegador (clientes, llamadas de cierre,
 * configuración con detalle y cobros). Si una falla, lo mismo que pasaba en el
 * navegador: queda vacía y se registra; `pagosSinLeer` avisa si fueron los
 * cobros, para que la pantalla lo diga.
 */
export async function leerEntradasDelResumen(
  supabase: Supabase,
  organizationId: string
): Promise<{ entradas: EntradasDelResumen; pagosSinLeer: boolean }> {
  let pagosSinLeer = false;
  const [clients, closingCalls, config, payments] = await Promise.all([
    leerClientes(supabase),
    leerLlamadasDeCierre(supabase, organizationId),
    leerConfiguracionDeFinanzas(supabase, organizationId, true),
    leerPagosDeLaOrganizacion(supabase, organizationId).catch((e: unknown) => {
      registrarFallaDeAccion("[resumenFinanciero] pagos", e);
      pagosSinLeer = true;
      return [] as ClientPayment[];
    }),
  ]);
  return {
    entradas: {
      clients,
      closingCalls,
      fixedExpenses: config.fixedExpenses,
      subscriptions: config.subscriptions,
      teamCompensation: config.teamCompensation,
      paymentPlatforms: config.paymentPlatforms,
      payments,
    },
    pagosSinLeer,
  };
}
